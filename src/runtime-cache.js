"use strict";

class RuntimeCache {
  constructor(options = {}) {
    this.maxEntries = Number.isInteger(options.maxEntries) && options.maxEntries > 0 ? options.maxEntries : 500;
    this.ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : 60_000;
    this.clock = typeof options.clock === "function" ? options.clock : () => Date.now();
    this.entries = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  key(value) {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new TypeError("ttlMs must be positive");
    const normalized = String(key);
    if (this.entries.size >= this.maxEntries && !this.entries.has(normalized)) {
      this.evictExpired();
      if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    }
    this.entries.set(normalized, { value, expiresAt: this.clock() + ttlMs, createdAt: this.clock() });
    return value;
  }

  get(key) {
    const normalized = String(key);
    const entry = this.entries.get(normalized);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(normalized);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.entries.delete(String(key));
  }

  evictExpired() {
    const now = this.clock();
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear() {
    const count = this.entries.size;
    this.entries.clear();
    return count;
  }

  stats() {
    return {
      size: this.entries.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses ? this.hits / (this.hits + this.misses) : 0,
    };
  }
}

module.exports = { RuntimeCache };
