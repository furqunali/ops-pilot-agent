"use strict";

const STATES = Object.freeze(["closed","open","half-open"]);

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = Number.isInteger(options.failureThreshold) && options.failureThreshold > 0 ? options.failureThreshold : 5;
    this.resetTimeoutMs = Number.isFinite(options.resetTimeoutMs) && options.resetTimeoutMs >= 0 ? options.resetTimeoutMs : 30_000;
    this.clock = typeof options.clock === "function" ? options.clock : () => Date.now();
    this.state = "closed";
    this.failures = 0;
    this.openedAt = null;
    this.successes = 0;
  }

  currentState() {
    if (this.state === "open" && this.clock() - this.openedAt >= this.resetTimeoutMs) {
      return "half-open";
    }
    return this.state;
  }

  allowRequest() {
    return this.currentState() !== "open";
  }

  recordSuccess() {
    const state = this.currentState();
    this.successes += 1;
    this.failures = 0;
    if (state === "half-open") {
      this.state = "closed";
      this.openedAt = null;
    }
    return this.snapshot();
  }

  recordFailure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = this.clock();
    }
    return this.snapshot();
  }

  async execute(operation) {
    if (typeof operation !== "function") throw new TypeError("operation must be a function");
    if (!this.allowRequest()) {
      const error = new Error("circuit breaker is open");
      error.code = "CIRCUIT_OPEN";
      error.retryable = true;
      throw error;
    }
    try {
      const value = await operation();
      this.recordSuccess();
      return value;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  reset() {
    this.state = "closed";
    this.failures = 0;
    this.openedAt = null;
    return this.snapshot();
  }

  snapshot() {
    return {
      state: this.currentState(),
      failures: this.failures,
      failureThreshold: this.failureThreshold,
      successes: this.successes,
      openedAt: this.openedAt,
      resetTimeoutMs: this.resetTimeoutMs,
    };
  }
}

function createCircuitBreaker(options = {}) {
  return new CircuitBreaker(options);
}

module.exports = { STATES, CircuitBreaker, createCircuitBreaker };
