"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createConnectorRegistry } = require("../src/connector-registry");

test("connector registry exposes redacted configuration and health", () => {
  const registry = createConnectorRegistry([
    { name: "billing", baseUrl: "https://billing.example", requiredEnv: ["BILLING_TOKEN"] },
    { name: "reporting", baseUrl: "https://reports.example", requiredEnv: ["REPORTING_TOKEN"] },
  ], { env: { BILLING_TOKEN: "secret" } });
  assert.deepEqual(registry.list(), [
    { name: "billing", baseUrl: "https://billing.example", ready: true, missing: [], auth: { configured: true, source: "environment" } },
    { name: "reporting", baseUrl: "https://reports.example", ready: false, missing: ["REPORTING_TOKEN"], auth: { configured: false, source: "environment" } },
  ]);
  assert.deepEqual(registry.health(), [
    { name: "billing", ready: true, missing: [] },
    { name: "reporting", ready: false, missing: ["REPORTING_TOKEN"] },
  ]);
});

test("connector registry constructs only configured connectors", () => {
  const calls = [];
  const registry = createConnectorRegistry([{ name: "billing", baseUrl: "https://billing.example", requiredEnv: ["TOKEN"] }], {
    env: { TOKEN: "secret" },
    connectorFactory: (definition, env) => { calls.push({ definition, env }); return { name: definition.name }; },
  });
  assert.deepEqual(registry.get("billing"), { name: "billing" });
  assert.equal(calls.length, 1);
  assert.throws(() => registry.get("missing"), /unknown connector/);
});

test("connector registry rejects duplicate definitions", () => {
  assert.throws(() => createConnectorRegistry([
    { name: "billing", baseUrl: "https://one.example", requiredEnv: [] },
    { name: "billing", baseUrl: "https://two.example", requiredEnv: [] },
  ]), /duplicate connector/);
});
