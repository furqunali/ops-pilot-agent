"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildEvaluationDashboard, dashboardToJson } = require("../src/finance-evaluation-dashboard");

test("evaluation dashboard aggregates policy, evidence, evaluator, and overall rates", () => {
  const dashboard = buildEvaluationDashboard({
    results: [
      { id: "a", passed: true, policyPass: true, evidencePass: true, evaluatorPass: true },
      { id: "b", passed: false, policyPass: true, evidencePass: false, evaluatorPass: true },
    ],
  }, { generatedAt: new Date("2026-01-01T00:00:00.000Z") });

  assert.equal(dashboard.total, 2);
  assert.equal(dashboard.passed, 1);
  assert.equal(dashboard.passRate, 0.5);
  assert.equal(dashboard.dimensions.policy.passRate, 1);
  assert.equal(dashboard.dimensions.evidence.passRate, 0.5);
  assert.deepEqual(dashboard.failures.map(item => item.id), ["b"]);
  assert.equal(dashboard.generatedAt, "2026-01-01T00:00:00.000Z");
});

test("evaluation dashboard serializes to stable JSON", () => {
  const dashboard = buildEvaluationDashboard({ results: [] }, { generatedAt: new Date("2026-01-01T00:00:00.000Z") });
  const json = dashboardToJson(dashboard);
  assert.deepEqual(JSON.parse(json), dashboard);
});

test("evaluation dashboard rejects malformed suites and timestamps", () => {
  assert.throws(() => buildEvaluationDashboard(null), /suite must expose results/);
  assert.throws(() => buildEvaluationDashboard({ results: [] }, { generatedAt: "now" }), /generatedAt must be a valid Date/);
  assert.throws(() => dashboardToJson(null), /dashboard must be an object/);
});
