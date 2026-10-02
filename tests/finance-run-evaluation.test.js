"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateFinanceRun, summarizeFinanceRuns } = require("../src/finance-run-evaluation");

function run(overrides = {}) {
  return { runId: "run-1", result: { status: "success" }, verification: { valid: true }, audit: [], observability: { summary: { durationMs: 1 } }, ...overrides };
}

test("complete finance runtime run passes evaluation", () => {
  const result = evaluateFinanceRun(run());
  assert.equal(result.passed, true);
  assert.equal(result.statusPass, true);
  assert.equal(result.verificationPass, true);
});

test("run-level suite reports partial failures", () => {
  const summary = summarizeFinanceRuns([run(), run({ runId: "run-2", result: { status: "failed" } })]);
  assert.equal(summary.total, 2);
  assert.equal(summary.passed, 1);
  assert.equal(summary.passRate, 0.5);
  assert.equal(summary.results[1].statusPass, false);
});

test("run evaluation rejects incomplete runtime records", () => {
  assert.throws(() => evaluateFinanceRun({}), /run must contain runId, result, and verification/);
});
