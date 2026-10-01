"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { recordFinanceAudit, recordFinancePolicyDecision } = require("../src/finance-ledger");

test("records finance audit events in the execution ledger", () => {
  const ledger = new ExecutionLedger();
  const record = recordFinancePolicyDecision(
    ledger,
    { amount: 1500, currency: "USD", vendorId: "vendor-1" },
    { decision: "requires_approval", policy: "approval_threshold" },
    "run-finance-1",
  );
  assert.equal(record.type, "finance_audit");
  assert.equal(record.metadata.runId, "run-finance-1");
  assert.equal(record.metadata.eventType, "finance.policy_evaluated");
  assert.equal(ledger.entries.length, 1);
});

test("rejects invalid ledger or event inputs", () => {
  assert.throws(() => recordFinanceAudit(null, {}), TypeError);
  assert.throws(() => recordFinanceAudit(new ExecutionLedger(), null), TypeError);
});
