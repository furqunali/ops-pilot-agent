"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");
const { runFinanceWorkflow } = require("../src/finance-reference-workflow");

function knowledge() {
  return createPolicyKnowledge([
    { id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." },
    { id: "vendor-blocklist", title: "Vendor blocklist", text: "Blocked vendors cannot receive payments." },
  ]);
}

test("finance workflow prepares allowed payments and records policy audit", () => {
  const ledger = new ExecutionLedger();
  const result = runFinanceWorkflow({
    payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    knowledge: knowledge(),
    ledger,
    runId: "finance-allowed-1",
  });
  assert.equal(result.status, "prepared");
  assert.equal(result.payment.status, "prepared");
  assert.deepEqual(result.decision.evidence.map(item => item.id), ["payment-threshold"]);
  assert.equal(ledger.findByType("finance_audit").length, 1);
  assert.equal(ledger.latest().metadata.runId, "finance-allowed-1");
});

test("finance workflow pauses for approval and resumes after approval", () => {
  const ledger = new ExecutionLedger();
  const input = {
    payment: { currency: "USD", amount: 1500, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    knowledge: knowledge(),
    ledger,
    runId: "finance-approval-1",
  };
  const pending = runFinanceWorkflow(input);
  assert.equal(pending.status, "pending");
  assert.equal(pending.approval.status, "pending");
  const approved = runFinanceWorkflow({ ...input, approval: { decision: "approved", reviewer: "reviewer-1" } });
  assert.equal(approved.status, "prepared");
  assert.equal(approved.approval, null);
  assert.equal(ledger.findByType("finance_audit").length, 5);
  assert.equal(ledger.findByType("finance_audit").at(-1).event.type, "finance.approval_resolved");
});

test("finance workflow blocks blocked vendors before preparation", () => {
  const ledger = new ExecutionLedger();
  const result = runFinanceWorkflow({
    payment: { currency: "USD", amount: 250, vendorId: "vendor-blocked" },
    policy: { approvalThreshold: 1000, blockedVendors: ["vendor-blocked"] },
    knowledge: knowledge(),
    ledger,
    runId: "finance-blocked-1",
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.payment, null);
  assert.equal(ledger.findByType("finance_audit").length, 1);
});


test("finance workflow is idempotent for a successful operation id", () => {
  const ledger = new ExecutionLedger();
  const input = { payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" }, policy: { approvalThreshold: 1000 }, knowledge: knowledge(), ledger, operationId: "payment-op-1", runId: "finance-run-1" };
  const first = runFinanceWorkflow(input);
  const second = runFinanceWorkflow({ ...input, runId: "finance-run-2" });
  assert.equal(first.status, "prepared");
  assert.equal(second.status, "already_prepared");
  assert.equal(second.priorRunId, "finance-run-1");
  assert.equal(ledger.findByType("completion").length, 1);
  assert.equal(ledger.findByType("finance_audit").at(-1).event.type, "finance.execution_replayed");
});
