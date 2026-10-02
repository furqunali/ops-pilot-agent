"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");
const { runFinanceReferenceTask } = require("../src/finance-runtime-adapter");

test("finance reference task produces correlated runtime and finance results", () => {
  const ledger = new ExecutionLedger();
  const run = runFinanceReferenceTask({
    task: "prepare vendor payment",
    payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    knowledge: createPolicyKnowledge([{ id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." }]),
    ledger,
    runId: "finance-runtime-1",
  });
  assert.equal(run.finance.status, "prepared");
  assert.equal(run.runId, "finance-runtime-1");
  assert.equal(run.report.runId, "finance-runtime-1");
  assert.equal(ledger.findByType("completion").at(-1).metadata.runId, "finance-runtime-1");
});
