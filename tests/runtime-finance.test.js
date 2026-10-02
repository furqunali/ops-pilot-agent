"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");
const { executeFinanceStage } = require("../src/runtime-finance");

test("finance execution stage preserves run correlation and ledger evidence", () => {
  const ledger = new ExecutionLedger();
  const knowledge = createPolicyKnowledge([
    { id: "payment-threshold", title: "Payment threshold", text: "Payments above threshold require approval." },
  ]);
  const stage = executeFinanceStage({ payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" } }, {
    ledger,
    knowledge,
    runId: "run-finance-1",
    policy: { approvalThreshold: 1000 },
  });
  assert.equal(stage.result.status, "prepared");
  assert.ok(stage.durationMs >= 0);
  const audits = ledger.findByType("finance_audit");
  assert.equal(audits.length, 2);
  assert.equal(audits.every(entry => entry.metadata.runId === "run-finance-1"), true);
});

test("finance execution stage can remain pending for human approval", () => {
  const ledger = new ExecutionLedger();
  const knowledge = createPolicyKnowledge([
    { id: "payment-threshold", title: "Payment threshold", text: "Payments above threshold require approval." },
  ]);
  const stage = executeFinanceStage({ payment: { currency: "USD", amount: 1500, vendorId: "vendor-ok" } }, {
    ledger,
    knowledge,
    runId: "run-finance-2",
    policy: { approvalThreshold: 1000 },
  });
  assert.equal(stage.result.status, "pending");
  assert.equal(stage.result.approval.status, "pending");
});
