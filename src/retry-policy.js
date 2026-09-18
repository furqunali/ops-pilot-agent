"use strict";

const { normalizeExecutionError } = require("./runtime-errors");

function isRetryableError(error) {
  if (!error) return false;
  if (error.retryable === true) return true;
  if (error.retryable === false) return false;
  const code = String(error.code || "").toUpperCase();
  return new Set(["ETIMEDOUT","ECONNRESET","EAI_AGAIN","RATE_LIMITED","TEMPORARY_FAILURE"]).has(code);
}

function calculateBackoff(attempt, baseDelayMs = 100, maxDelayMs = 10_000) {
  if (!Number.isInteger(attempt) || attempt < 0) throw new TypeError("attempt must be a non-negative integer");
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) throw new TypeError("baseDelayMs must be non-negative");
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) throw new TypeError("maxDelayMs must be non-negative");
  return Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
}

function createRetryPolicy(options = {}) {
  const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0 ? options.maxAttempts : 3;
  const baseDelayMs = Number.isFinite(options.baseDelayMs) && options.baseDelayMs >= 0 ? options.baseDelayMs : 100;
  const maxDelayMs = Number.isFinite(options.maxDelayMs) && options.maxDelayMs >= 0 ? options.maxDelayMs : 10_000;

  return Object.freeze({
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    shouldRetry(error, attempt) {
      return attempt < maxAttempts - 1 && isRetryableError(error);
    },
    delay(attempt) {
      return calculateBackoff(attempt, baseDelayMs, maxDelayMs);
    },
  });
}

async function executeWithRetry(operation, options = {}) {
  if (typeof operation !== "function") throw new TypeError("operation must be a function");
  const policy = createRetryPolicy(options);
  const attempts = [];
  for (let attempt = 0; attempt < policy.maxAttempts; attempt += 1) {
    const startedAt = new Date();
    try {
      const value = await operation({ attempt });
      attempts.push({ attempt, status: "success", startedAt, finishedAt: new Date() });
      return { value, attempts };
    } catch (error) {
      const normalized = normalizeExecutionError(error);
      attempts.push({
        attempt,
        status: "failed",
        error: normalized,
        startedAt,
        finishedAt: new Date(),
      });
      if (!policy.shouldRetry(error, attempt)) {
        return { value: null, attempts, error: normalized };
      }
      const delayMs = policy.delay(attempt);
      if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return { value: null, attempts, error: { name: "RetryError", message: "retry policy exhausted" } };
}

module.exports = { isRetryableError, calculateBackoff, createRetryPolicy, executeWithRetry };
