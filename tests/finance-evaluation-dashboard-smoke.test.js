"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildEvaluationDashboard } = require("../src/finance-evaluation-dashboard");

test("dashboard smoke test", () => {
  const dashboard = buildEvaluationDashboard({ results: [] }, { generatedAt: new Date("2026-01-01T00:00:00.000Z") });
  assert.equal(dashboard.passRate, 0);
  assert.equal(dashboard.failed, 0);
});
