"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_WORKFLOW_CASES, evaluateFinanceWorkflowSuite } = require("../src/finance-workflow-evaluation");

test("end-to-end finance workflow suite covers allow, block, pending, approve, and reject", () => {
  const suite = evaluateFinanceWorkflowSuite();
  assert.equal(suite.total, DEFAULT_WORKFLOW_CASES.length);
  assert.equal(suite.passed, suite.total);
  assert.equal(suite.failed, 0);
  assert.equal(suite.passRate, 1);
  assert.deepEqual(suite.results.map(result => result.actualStatus), ["prepared", "blocked", "pending", "prepared", "rejected"]);
  assert.ok(suite.results.every(result => result.auditPass && result.evidencePass && result.noUnsafePreparation));
});

test("workflow evaluation reports a failed contract rather than hiding it", () => {
  const cases = [{
    id: "wrong-expected-status",
    payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    expectedStatus: "blocked",
    expectedDecision: "allowed",
    approval: null,
  }];
  const suite = evaluateFinanceWorkflowSuite(cases);
  assert.equal(suite.failed, 1);
  assert.equal(suite.results[0].workflowPass, false);
  assert.equal(suite.results[0].passed, false);
});

test("workflow evaluation rejects malformed suite input", () => {
  assert.throws(() => evaluateFinanceWorkflowSuite(null), /testCases must be an array/);
});
