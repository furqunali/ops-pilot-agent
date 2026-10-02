"use strict";

const { createHttpConnector } = require("./http-connector");
const { redactConnectorConfig, resolveConnectorConfig } = require("./connector-config");

function createConnectorRegistry(definitions = [], { env = process.env, connectorFactory = createHttpConnector } = {}) {
  if (!Array.isArray(definitions)) throw new TypeError("definitions must be an array");
  if (typeof connectorFactory !== "function") throw new TypeError("connectorFactory must be a function");
  const byName = new Map();
  for (const definition of definitions) {
    const config = resolveConnectorConfig(definition, env);
    if (byName.has(config.name)) throw new TypeError(`duplicate connector: ${config.name}`);
    byName.set(config.name, { definition, config });
  }

  return Object.freeze({
    list() {
      return [...byName.values()].map(({ config }) => redactConnectorConfig(config));
    },
    has(name) { return byName.has(name); },
    get(name) {
      const entry = byName.get(name);
      if (!entry) throw new Error(`unknown connector: ${name}`);
      if (!entry.config.ready) throw new Error(`connector '${name}' is not configured: ${entry.config.missing.join(", ")}`);
      return connectorFactory(entry.definition, env);
    },
    health() {
      return [...byName.values()].map(({ config }) => Object.freeze({ name: config.name, ready: config.ready, missing: config.missing.slice() }));
    },
  });
}

module.exports = { createConnectorRegistry };
