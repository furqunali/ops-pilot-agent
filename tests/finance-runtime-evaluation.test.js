"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");
const { runFinanceAgentTask } = require("../src/finance-runtime");
const { evaluateFinanceAgentRun, evaluateFinanceAgentRuns } = require("../src/finance-runtime-evaluation");

const knowledge = createPolicyKnowledge([
  { id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." },
]);

function makeRun() {
  return runFinanceAgentTask({
    task: "prepare vendor payment",
    payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    knowledge,
    ledger: new ExecutionLedger(),
    runId: "finance-eval-1",
  });
}

test("evaluates a complete finance runtime run", () => {
  const result = evaluateFinanceAgentRun(makeRun());
  assert.equal(result.passed, true);
  assert.equal(result.financePass, true);
  assert.equal(result.runtimePass, true);
  assert.equal(result.verificationPass, true);
  assert.equal(result.evidencePass, true);
  assert.equal(result.runId, "finance-eval-1");
});

test("runtime evaluation exposes failed dimensions", () => {
  const result = evaluateFinanceAgentRun(makeRun(), { expectedFinanceStatus: "pending" });
  assert.equal(result.passed, false);
  assert.equal(result.financePass, false);
  assert.equal(result.runtimePass, true);
});

test("runtime evaluation aggregates multiple runs", () => {
  const suite = evaluateFinanceAgentRuns([makeRun(), makeRun()]);
  assert.equal(suite.total, 2);
  assert.equal(suite.passed, 2);
  assert.equal(suite.passRate, 1);
});
