"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");
const { runFinanceTask } = require("../src/finance-runtime-integration");

test("finance task integrates policy workflow with runtime correlation and ledger", () => {
  const ledger = new ExecutionLedger();
  const knowledge = createPolicyKnowledge([
    { id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." },
  ]);
  const result = runFinanceTask({ task: "ignored" }, {
    payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    knowledge,
    ledger,
    runId: "finance-runtime-1",
    tools: {},
  });
  assert.equal(result.workflow.status, "prepared");
  assert.equal(result.runtime.runId, "finance-runtime-1");
  assert.equal(result.runtime.verification.valid, true);
  assert.ok(ledger.findByType("completion").some(entry => entry.metadata.runId === "finance-runtime-1"));
});
