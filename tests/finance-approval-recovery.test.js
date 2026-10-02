"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { createApprovalRequest } = require("../src/finance-approval");
const { recoverFinanceApproval } = require("../src/finance-approval-recovery");

test("finance approval recovery resolves pending approval and audits recovery", () => {
  const ledger = new ExecutionLedger();
  const request = createApprovalRequest(
    { currency: "USD", amount: 1500, vendorId: "vendor-ok" },
    { decision: "requires_approval", reason: "threshold", policy: "approval_threshold", evidence: [{ id: "payment-threshold" }] },
  );
  const result = recoverFinanceApproval(ledger, request, "approved", "reviewer-1", "finance-recovery-1");
  assert.equal(result.status, "approved");
  assert.equal(result.recovered, true);
  assert.equal(result.approval.reviewer, "reviewer-1");
  const audit = ledger.findByType("finance_audit").at(-1);
  assert.equal(audit.metadata.runId, "finance-recovery-1");
  assert.equal(audit.event.payload.recovery, "approval_resume");
});

test("finance approval recovery preserves rejection state", () => {
  const ledger = new ExecutionLedger();
  const request = createApprovalRequest(
    { currency: "USD", amount: 1500, vendorId: "vendor-ok" },
    { decision: "requires_approval", reason: "threshold", policy: "approval_threshold" },
  );
  const result = recoverFinanceApproval(ledger, request, "rejected", "reviewer-2");
  assert.equal(result.status, "rejected");
  assert.equal(result.approval.status, "rejected");
});
