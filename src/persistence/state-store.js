"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function assertKey(key) {
  if (typeof key !== "string" || key.length === 0) {
    throw new TypeError("key must be a non-empty string");
  }
  return key;
}

// Round-trip through JSON so every stored value is a detached, fully
// serializable copy. This gives both backends identical semantics: callers
// can mutate what they pass in or what they get back without touching the
// persisted snapshot, and non-JSON values are rejected up front.
function toSnapshot(value) {
  if (value === undefined) {
    throw new TypeError("snapshot must be a JSON-serializable value");
  }
  return JSON.parse(JSON.stringify(value));
}

// In-process store. Useful for tests and for runs that do not need to
// survive a restart. Async signatures mirror the file backend so the two
// are interchangeable behind the same interface.
class MemoryStateStore {
  constructor() {
    this.backend = "memory";
    this._data = new Map();
  }

  async save(key, snapshot) {
    this._data.set(assertKey(key), toSnapshot(snapshot));
    return key;
  }

  async load(key) {
    assertKey(key);
    if (!this._data.has(key)) return null;
    return toSnapshot(this._data.get(key));
  }

  async has(key) {
    return this._data.has(assertKey(key));
  }

  async delete(key) {
    return this._data.delete(assertKey(key));
  }

  async keys() {
    return [...this._data.keys()].sort();
  }

  async clear() {
    this._data.clear();
  }
}

// JSON-file store with atomic writes. Each key maps to a single file inside
// `directory`; the key is URI-encoded so it is safe (and reversible) as a
// filename. Writes go to a unique temp file that is renamed into place, so a
// reader never observes a half-written snapshot and a crash mid-write leaves
// the previous snapshot intact.
class FileStateStore {
  constructor(options = {}) {
    const directory = typeof options === "string" ? options : options.directory;
    if (typeof directory !== "string" || directory.length === 0) {
      throw new TypeError("directory must be a non-empty string");
    }
    this.backend = "file";
    this.directory = directory;
    this.extension = ".json";
  }

  _fileFor(key) {
    return path.join(this.directory, encodeURIComponent(assertKey(key)) + this.extension);
  }

  async save(key, snapshot) {
    const file = this._fileFor(key);
    const payload = JSON.stringify(toSnapshot(snapshot), null, 2);
    await fs.mkdir(this.directory, { recursive: true });
    const tmp = `${file}.tmp-${crypto.randomBytes(8).toString("hex")}`;
    await fs.writeFile(tmp, payload, "utf8");
    try {
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
    return key;
  }

  async load(key) {
    let raw;
    try {
      raw = await fs.readFile(this._fileFor(key), "utf8");
    } catch (err) {
      if (err && err.code === "ENOENT") return null;
      throw err;
    }
    return JSON.parse(raw);
  }

  async has(key) {
    try {
      await fs.access(this._fileFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key) {
    try {
      await fs.rm(this._fileFor(key));
      return true;
    } catch (err) {
      if (err && err.code === "ENOENT") return false;
      throw err;
    }
  }

  async keys() {
    let names;
    try {
      names = await fs.readdir(this.directory);
    } catch (err) {
      if (err && err.code === "ENOENT") return [];
      throw err;
    }
    return names
      .filter(name => name.endsWith(this.extension))
      .map(name => decodeURIComponent(name.slice(0, -this.extension.length)))
      .sort();
  }

  async clear() {
    for (const key of await this.keys()) {
      await this.delete(key);
    }
  }
}

function createStateStore(options = {}) {
  const backend = options.backend || "memory";
  if (backend === "memory") return new MemoryStateStore();
  if (backend === "file") return new FileStateStore(options);
  throw new TypeError(`unknown state store backend: ${backend}`);
}

// Persist an execution-ledger (or anything exposing export()/import()) as a
// named snapshot. Keeping this duck-typed lets the store stay decoupled from
// the ledger module while still owning the wiring for the common case.
async function persistLedger(store, key, ledger) {
  if (!ledger || typeof ledger.export !== "function") {
    throw new TypeError("ledger must expose an export() method");
  }
  return store.save(key, ledger.export());
}

async function restoreLedger(store, key, ledger) {
  if (!ledger || typeof ledger.import !== "function") {
    throw new TypeError("ledger must expose an import() method");
  }
  const snapshot = await store.load(key);
  if (snapshot === null) return false;
  ledger.import(snapshot);
  return true;
}

module.exports = {
  MemoryStateStore,
  FileStateStore,
  createStateStore,
  persistLedger,
  restoreLedger,
};
