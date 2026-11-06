"use strict";

// Idempotency keys for execute/prepare paths.
//
// A request carrying an idempotency key is executed at most once per key (and
// scope) within the retention window. A repeat with the same key and the same
// payload returns the original stored result without executing again; the same
// key with a different payload is rejected with a conflict error. Records live
// in the existing state store (memory or atomic JSON files), so replay
// protection survives a process restart when the file backend is used.

const { createHash } = require("node:crypto");
const { MemoryStateStore } = require("./persistence/state-store");
const { ERROR_CODES, createRuntimeError } = require("./runtime-errors");

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const STATUSES = Object.freeze({ IN_PROGRESS: "in_progress", COMPLETED: "completed" });

// Stable JSON: object keys sorted recursively so logically equal payloads hash
// the same regardless of key order.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.keys(value).sort().reduce((out, key) => {
      if (value[key] !== undefined && typeof value[key] !== "function") out[key] = canonicalize(value[key]);
      return out;
    }, {});
  }
  return value;
}

function fingerprintPayload(payload) {
  return createHash("sha256").update(JSON.stringify(canonicalize(payload === undefined ? null : payload))).digest("hex");
}

function validateIdempotencyKey(key) {
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    throw createRuntimeError(ERROR_CODES.INVALID_INPUT, "idempotency key must be 1-200 characters of letters, digits, '.', '_', ':' or '-'", { field: "idempotencyKey" });
  }
  return key;
}

class IdempotencyStore {
  constructor({ store = new MemoryStateStore(), ttlMs = DEFAULT_TTL_MS, staleAfterMs = DEFAULT_STALE_AFTER_MS, clock = () => Date.now(), namespace = "idempotency" } = {}) {
    if (!store || typeof store.save !== "function" || typeof store.load !== "function" || typeof store.delete !== "function") {
      throw new TypeError("store must expose save(), load() and delete()");
    }
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new TypeError("ttlMs must be a positive integer");
    if (!Number.isInteger(staleAfterMs) || staleAfterMs <= 0) throw new TypeError("staleAfterMs must be a positive integer");
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    if (typeof namespace !== "string" || !namespace.trim()) throw new TypeError("namespace must be a non-empty string");
    this.store = store;
    this.ttlMs = ttlMs;
    this.staleAfterMs = staleAfterMs;
    this.clock = clock;
    this.namespace = namespace.trim();
    this.inflight = new Map();
  }

  storageKey(scope, key) {
    if (typeof scope !== "string" || !scope.trim()) throw new TypeError("scope must be a non-empty string");
    return `${this.namespace}:${scope.trim()}:${validateIdempotencyKey(key)}`;
  }

  async lookup(key, { scope = "default" } = {}) {
    const record = await this.store.load(this.storageKey(scope, key));
    if (!record) return null;
    if (record.expiresAt <= this.clock()) return null;
    return record;
  }

  // Run `operation` at most once for (scope, key). Options:
  //   scope       namespace for the key, e.g. "finance.prepare_payment"
  //   shouldStore(result) -> boolean; results it rejects are returned but not
  //               remembered (e.g. "pending approval"), so a later retry with
  //               the same key can complete the operation.
  //   serialize(result) -> the JSON-safe snapshot to remember (default: the
  //               result itself). The live result is still returned on the
  //               first call; replays return the snapshot.
  async execute(key, payload, operation, { scope = "default", shouldStore = () => true, serialize = result => result } = {}) {
    if (typeof operation !== "function") throw new TypeError("operation must be a function");
    if (typeof shouldStore !== "function") throw new TypeError("shouldStore must be a function");
    if (typeof serialize !== "function") throw new TypeError("serialize must be a function");
    const storageKey = this.storageKey(scope, key);
    const fingerprint = fingerprintPayload(payload);

    // Same-process concurrency: the in-flight entry is registered before the
    // first await, so a second caller with the same key always waits for the
    // first instead of racing it (and a different payload is a conflict).
    const inflight = this.inflight.get(storageKey);
    if (inflight) {
      if (inflight.fingerprint !== fingerprint) throw this.conflict(key, scope);
      const outcome = await inflight.promise;
      if (outcome.replayed) return outcome;
      return { ...outcome, result: outcome.stored ? outcome.snapshot : outcome.result, replayed: true };
    }

    const promise = this.attempt(storageKey, key, scope, fingerprint, operation, shouldStore, serialize);
    this.inflight.set(storageKey, { fingerprint, promise });
    try {
      return await promise;
    } finally {
      this.inflight.delete(storageKey);
    }
  }

  async attempt(storageKey, key, scope, fingerprint, operation, shouldStore, serialize) {
    const existing = await this.store.load(storageKey);
    if (existing && existing.expiresAt > this.clock()) {
      if (existing.fingerprint !== fingerprint) throw this.conflict(key, scope);
      if (existing.status === STATUSES.COMPLETED) {
        return { replayed: true, key, scope, result: existing.result, createdAt: existing.createdAt, expiresAt: existing.expiresAt };
      }
      // An in-progress marker left behind by another (possibly crashed)
      // process goes stale after `staleAfterMs`; until then it is refused.
      if (existing.createdAt + this.staleAfterMs > this.clock()) {
        throw createRuntimeError(ERROR_CODES.IDEMPOTENCY_IN_PROGRESS, "a request with this idempotency key is already in progress", { idempotencyKey: key, scope });
      }
    }
    return this.run(storageKey, key, scope, fingerprint, operation, shouldStore, serialize);
  }

  async run(storageKey, key, scope, fingerprint, operation, shouldStore, serialize) {
    const createdAt = this.clock();
    const base = { key, scope, fingerprint, createdAt, expiresAt: createdAt + this.ttlMs };
    await this.store.save(storageKey, { ...base, status: STATUSES.IN_PROGRESS });
    let result;
    try {
      result = await operation();
    } catch (error) {
      // Failures are not remembered: the caller may retry with the same key.
      await this.store.delete(storageKey);
      throw error;
    }
    if (!shouldStore(result)) {
      await this.store.delete(storageKey);
      return { replayed: false, key, scope, result, stored: false };
    }
    let snapshot;
    try {
      const serialized = serialize(result);
      snapshot = serialized === undefined ? null : JSON.parse(JSON.stringify(serialized));
    } catch (error) {
      await this.store.delete(storageKey);
      throw createRuntimeError(ERROR_CODES.PERSISTENCE_FAILED, "idempotent result must be JSON-serializable", { idempotencyKey: key, scope }, error);
    }
    await this.store.save(storageKey, { ...base, status: STATUSES.COMPLETED, result: snapshot });
    const outcome = { replayed: false, key, scope, result, stored: true, createdAt: base.createdAt, expiresAt: base.expiresAt };
    Object.defineProperty(outcome, "snapshot", { value: snapshot, enumerable: false });
    return outcome;
  }

  conflict(key, scope) {
    return createRuntimeError(ERROR_CODES.IDEMPOTENCY_CONFLICT, "idempotency key was already used with a different payload", { idempotencyKey: key, scope });
  }

  async purgeExpired() {
    if (typeof this.store.keys !== "function") return 0;
    const prefix = `${this.namespace}:`;
    let removed = 0;
    for (const storageKey of await this.store.keys()) {
      if (!storageKey.startsWith(prefix)) continue;
      const record = await this.store.load(storageKey);
      if (record && record.expiresAt <= this.clock() && record.status === STATUSES.COMPLETED) {
        await this.store.delete(storageKey);
        removed += 1;
      }
    }
    return removed;
  }
}

function createIdempotencyStore(options = {}) {
  return new IdempotencyStore(options);
}

module.exports = {
  DEFAULT_TTL_MS,
  DEFAULT_STALE_AFTER_MS,
  STATUSES,
  IdempotencyStore,
  createIdempotencyStore,
  fingerprintPayload,
  validateIdempotencyKey,
};
