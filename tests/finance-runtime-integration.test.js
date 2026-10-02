"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");
const { runFinanceWorkflow } = require("../src/finance-reference-workflow");

test("finance prepared execution runs through the canonical runtime", () => {
  const ledger = new ExecutionLedger();
  const knowledge = createPolicyKnowledge([
    { id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." },
  ]);

  const result = runFinanceWorkflow({
    payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    knowledge,
    ledger,
    runId: "finance-runtime-1",
  });

  assert.equal(result.status, "prepared");
  assert.equal(result.runtime.runId, "finance-runtime-1");
  assert.equal(result.runtime.result.status, "success");
  assert.equal(result.runtime.verification.valid, true);
  assert.equal(result.runtime.observability.summary.total, 4);
  assert.ok(ledger.findByType("start").some(entry => entry.metadata.runId === "finance-runtime-1"));
  assert.ok(ledger.findByType("completion").some(entry => entry.metadata.runId === "finance-runtime-1"));
});
