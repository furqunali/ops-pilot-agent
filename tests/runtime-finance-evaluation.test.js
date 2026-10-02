"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateRuntimeFinanceRun, summarizeRuntimeFinanceEvaluations } = require("../src/runtime-finance-evaluation");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");

const knowledge = createPolicyKnowledge([
  { id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." },
  { id: "vendor-blocklist", title: "Vendor blocklist", text: "Blocked vendors cannot receive payments." },
]);

const testCase = {
  id: "allow-small-payment",
  payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
  policy: { approvalThreshold: 1000 },
  query: "approval threshold",
  expectedDecision: "allowed",
  expectedEvidence: ["payment-threshold"],
};

test("runtime finance evaluation preserves run correlation and verification", () => {
  const result = evaluateRuntimeFinanceRun({ runId: "run-42", result: { status: "success" }, verification: { valid: true } }, testCase, knowledge);
  assert.equal(result.runId, "run-42");
  assert.equal(result.runtimeStatus, "success");
  assert.equal(result.verified, true);
  assert.equal(result.passed, true);
});

test("runtime finance evaluation summarizes pass and verification rates", () => {
  const summary = summarizeRuntimeFinanceEvaluations([
    { passed: true, verified: true },
    { passed: false, verified: true },
    { passed: false, verified: false },
  ]);
  assert.deepEqual(summary, { total: 3, passed: 1, failed: 2, passRate: 1 / 3, verified: 2, verificationRate: 2 / 3 });
});

test("runtime finance evaluation rejects malformed runtime runs", () => {
  assert.throws(() => evaluateRuntimeFinanceRun(null, testCase, knowledge), /run must be an object/);
  assert.throws(() => evaluateRuntimeFinanceRun({ runId: "" }, testCase, knowledge), /run.runId must be a non-empty string/);
  assert.throws(() => evaluateRuntimeFinanceRun({ runId: "run-1" }, testCase, knowledge), /run.result must expose status/);
});
