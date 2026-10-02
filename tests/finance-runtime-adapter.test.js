"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");
const { createFinanceTools } = require("../src/finance-mcp-tools");
const { runFinanceTaskPipeline } = require("../src/finance-runtime-adapter");

test("finance adapter connects finance workflow to canonical runtime", () => {
  const ledger = new ExecutionLedger();
  const knowledge = createPolicyKnowledge([
    { id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." },
  ]);
  const result = runFinanceTaskPipeline({
    task: "prepare invoice payment",
    payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    knowledge,
    ledger,
    financeTools: createFinanceTools(),
    runId: "finance-runtime-1",
  });
  assert.equal(result.finance.status, "prepared");
  assert.equal(result.runtime.runId, "finance-runtime-1");
  assert.equal(result.runtime.result.status, "success");
  assert.equal(result.runtime.verification.valid, true);
  assert.ok(ledger.findByType("finance_audit").length >= 1);
});

