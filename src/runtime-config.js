"use strict";

const DEFAULTS = Object.freeze({
  maxRetries: 2,
  retryDelayMs: 100,
  executionTimeoutMs: 30_000,
  auditRetention: 1000,
  maxQueueDepth: 100,
  healthWindow: 100,
  environment: "development",
});

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toNonNegativeInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function loadRuntimeConfig(env = process.env, overrides = {}) {
  if (!env || typeof env !== "object") throw new TypeError("env must be an object");
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new TypeError("overrides must be an object");
  }

  const config = {
    maxRetries: toNonNegativeInt(overrides.maxRetries ?? env.OPS_MAX_RETRIES, DEFAULTS.maxRetries),
    retryDelayMs: toNonNegativeInt(overrides.retryDelayMs ?? env.OPS_RETRY_DELAY_MS, DEFAULTS.retryDelayMs),
    executionTimeoutMs: toPositiveInt(overrides.executionTimeoutMs ?? env.OPS_EXECUTION_TIMEOUT_MS, DEFAULTS.executionTimeoutMs),
    auditRetention: toPositiveInt(overrides.auditRetention ?? env.OPS_AUDIT_RETENTION, DEFAULTS.auditRetention),
    maxQueueDepth: toPositiveInt(overrides.maxQueueDepth ?? env.OPS_MAX_QUEUE_DEPTH, DEFAULTS.maxQueueDepth),
    healthWindow: toPositiveInt(overrides.healthWindow ?? env.OPS_HEALTH_WINDOW, DEFAULTS.healthWindow),
    environment: String(overrides.environment ?? env.NODE_ENV ?? DEFAULTS.environment).trim() || DEFAULTS.environment,
  };

  return Object.freeze(config);
}

function validateRuntimeConfig(config) {
  if (!config || typeof config !== "object") throw new TypeError("config is required");
  const integerKeys = ["maxRetries","retryDelayMs","executionTimeoutMs","auditRetention","maxQueueDepth","healthWindow"];
  for (const key of integerKeys) {
    if (!Number.isInteger(config[key]) || config[key] < 0) {
      throw new TypeError(`${key} must be a non-negative integer`);
    }
  }
  if (config.maxQueueDepth === 0 || config.auditRetention === 0 || config.healthWindow === 0) {
    throw new TypeError("capacity settings must be greater than zero");
  }
  if (typeof config.environment !== "string" || !config.environment.trim()) {
    throw new TypeError("environment must be a non-empty string");
  }
  return true;
}

function withConfig(config, patch = {}) {
  validateRuntimeConfig(config);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("patch must be an object");
  }
  return loadRuntimeConfig({}, { ...config, ...patch });
}

module.exports = { DEFAULTS, loadRuntimeConfig, validateRuntimeConfig, withConfig };
