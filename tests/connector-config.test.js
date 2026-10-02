"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateConnectorDefinition, resolveConnectorConfig, redactConnectorConfig } = require("../src/connector-config");

const definition = { name: "finance-api", baseUrl: "https://finance.example.test", requiredEnv: ["FINANCE_API_KEY"] };

test("connector config validates definitions and reports missing secret references", () => {
  assert.equal(validateConnectorDefinition(definition), true);
  const config = resolveConnectorConfig(definition, {});
  assert.equal(config.ready, false);
  assert.deepEqual(config.missing, ["FINANCE_API_KEY"]);
  assert.equal(config.auth.source, "environment");
});

test("connector config resolves without exposing secret values", () => {
  const config = resolveConnectorConfig(definition, { FINANCE_API_KEY: "super-secret" });
  assert.equal(config.ready, true);
  const redacted = redactConnectorConfig(config);
  assert.equal(redacted.ready, true);
  assert.equal(JSON.stringify(redacted).includes("super-secret"), false);
  assert.equal(redacted.auth.configured, true);
});

test("connector config rejects malformed definitions", () => {
  assert.throws(() => validateConnectorDefinition(null), /definition must be an object/);
  assert.throws(() => validateConnectorDefinition({ ...definition, baseUrl: "not-url" }), /valid URL/);
  assert.throws(() => validateConnectorDefinition({ ...definition, requiredEnv: ["bad-key"] }), /invalid environment key/);
});
