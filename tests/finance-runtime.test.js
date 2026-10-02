"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");
const { runFinanceAgentTask } = require("../src/finance-runtime");

const knowledge = createPolicyKnowledge([
  { id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." },
]);

test("finance agent task runs finance workflow through runtime orchestration", () => {
  const ledger = new ExecutionLedger();
  const run = runFinanceAgentTask({
    task: "prepare vendor payment",
    payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    knowledge,
    ledger,
    runId: "finance-runtime-1",
  });

  assert.equal(run.runId, "finance-runtime-1");
  assert.equal(run.finance.status, "prepared");
  assert.equal(run.result.status, "success");
  assert.equal(run.verification.valid, true);
  assert.equal(run.observability.stages.every(stage => stage.metadata.runId === "finance-runtime-1"), true);
  assert.equal(ledger.findByType("finance_audit").length, 1);
  assert.equal(ledger.findByType("completion").length, 1);
  assert.equal(ledger.findByType("completion").at(-1).metadata.runId, "finance-runtime-1");
});

test("finance agent task preserves approval pause while producing a runtime run", () => {
  const ledger = new ExecutionLedger();
  const run = runFinanceAgentTask({
    task: "prepare large vendor payment",
    payment: { currency: "USD", amount: 1500, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    knowledge,
    ledger,
    runId: "finance-runtime-approval-1",
  });

  assert.equal(run.finance.status, "pending");
  assert.equal(run.finance.approval.status, "pending");
  assert.equal(run.result.status, "skipped");
  assert.equal(run.verification.valid, true);
});
