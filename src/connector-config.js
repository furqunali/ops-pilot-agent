"use strict";

function validateConnectorDefinition(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) throw new TypeError("definition must be an object");
  if (typeof definition.name !== "string" || !definition.name.trim()) throw new TypeError("definition.name must be non-empty");
  if (typeof definition.baseUrl !== "string" || !definition.baseUrl.trim()) throw new TypeError("definition.baseUrl must be non-empty");
  try { new URL(definition.baseUrl); } catch { throw new TypeError("definition.baseUrl must be a valid URL"); }
  if (!Array.isArray(definition.requiredEnv)) throw new TypeError("definition.requiredEnv must be an array");
  for (const key of definition.requiredEnv) {
    if (typeof key !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(key)) throw new TypeError("definition.requiredEnv contains an invalid environment key");
  }
  return true;
}

function resolveConnectorConfig(definition, env = process.env) {
  validateConnectorDefinition(definition);
  if (!env || typeof env !== "object") throw new TypeError("env must be an object");
  const missing = definition.requiredEnv.filter(key => typeof env[key] !== "string" || !env[key].trim());
  return Object.freeze({
    name: definition.name.trim(),
    baseUrl: definition.baseUrl.trim(),
    ready: missing.length === 0,
    missing,
    auth: Object.freeze({
      configured: missing.length === 0,
      source: definition.requiredEnv.length ? "environment" : "none",
    }),
  });
}

function redactConnectorConfig(config) {
  if (!config || typeof config !== "object") throw new TypeError("config must be an object");
  return Object.freeze({
    name: config.name,
    baseUrl: config.baseUrl,
    ready: Boolean(config.ready),
    missing: Array.isArray(config.missing) ? config.missing.slice() : [],
    auth: Object.freeze({
      configured: Boolean(config.auth?.configured),
      source: config.auth?.source || "none",
    }),
  });
}

module.exports = { validateConnectorDefinition, resolveConnectorConfig, redactConnectorConfig };
