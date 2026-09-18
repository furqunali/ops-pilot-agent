"use strict";

function createTimeoutError(timeoutMs) {
  const error = new Error(`execution timed out after ${timeoutMs}ms`);
  error.name = "ExecutionTimeoutError";
  error.code = "EXECUTION_TIMEOUT";
  error.retryable = true;
  return error;
}

async function withTimeout(operation, timeoutMs, options = {}) {
  if (typeof operation !== "function") throw new TypeError("operation must be a function");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("timeoutMs must be positive");
  const timer = options.setTimeout || setTimeout;
  const clear = options.clearTimeout || clearTimeout;

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = timer(() => reject(createTimeoutError(timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    clear(timeoutId);
  }
}

function timeoutBudget(startedAt, timeoutMs, now = Date.now()) {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) throw new TypeError("startedAt must be a valid date");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new TypeError("timeoutMs must be non-negative");
  return Math.max(0, timeoutMs - (now - start));
}

module.exports = { createTimeoutError, withTimeout, timeoutBudget };
