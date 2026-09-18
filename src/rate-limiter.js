"use strict";

class RateLimiter {
  constructor(options = {}) {
    this.capacity = Number.isInteger(options.capacity) && options.capacity > 0 ? options.capacity : 10;
    this.refillRate = Number.isFinite(options.refillRate) && options.refillRate > 0 ? options.refillRate : 1;
    this.clock = typeof options.clock === "function" ? options.clock : () => Date.now();
    this.tokens = this.capacity;
    this.lastRefill = this.clock();
  }

  refill(now = this.clock()) {
    const elapsedSeconds = Math.max(0, now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillRate);
    this.lastRefill = now;
    return this.tokens;
  }

  available(now = this.clock()) {
    return this.refill(now);
  }

  tryAcquire(count = 1, now = this.clock()) {
    if (!Number.isFinite(count) || count <= 0) throw new TypeError("count must be positive");
    this.refill(now);
    if (this.tokens < count) {
      return { allowed: false, remaining: this.tokens, retryAfterMs: Math.ceil(((count - this.tokens) / this.refillRate) * 1000) };
    }
    this.tokens -= count;
    return { allowed: true, remaining: this.tokens, retryAfterMs: 0 };
  }

  acquire(count = 1, now = this.clock()) {
    const result = this.tryAcquire(count, now);
    if (!result.allowed) {
      const error = new Error("rate limit exceeded");
      error.code = "RATE_LIMITED";
      error.retryAfterMs = result.retryAfterMs;
      throw error;
    }
    return result;
  }

  snapshot() {
    return {
      capacity: this.capacity,
      refillRate: this.refillRate,
      tokens: this.available(),
      lastRefill: this.lastRefill,
    };
  }

  reset() {
    this.tokens = this.capacity;
    this.lastRefill = this.clock();
    return this.snapshot();
  }
}

module.exports = { RateLimiter };
