"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { attachPolicyEvidence } = require("../src/finance-policy-evidence");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");
const { createApprovalRequest } = require("../src/finance-approval");
const { createFinanceAuditEvent, EVENT_TYPES } = require("../src/finance-audit");

const knowledge = createPolicyKnowledge([
  { id: "policy-approval", title: "Payment Approval", text: "Payments above 1000 USD require human approval." },
  { id: "policy-vendor", title: "Vendor Blocklist", text: "Blocked vendors cannot receive payments." },
]);

test("attaches stable policy evidence identifiers to decisions", () => {
  const decision = attachPolicyEvidence(
    { decision: "requires_approval", policy: "approval_threshold" },
    knowledge,
    "human approval",
  );

  assert.deepEqual(decision.evidence, [{ id: "policy-approval", title: "Payment Approval" }]);
  assert.equal(decision.evidenceQuery, "human approval");
});

test("approval requests preserve policy evidence", () => {
  const decision = attachPolicyEvidence(
    { decision: "requires_approval", policy: "approval_threshold" },
    knowledge,
    "human approval",
  );

  const request = createApprovalRequest(
    { amount: 1500, currency: "USD", vendorId: "vendor-1" },
    decision,
  );

  assert.deepEqual(request.policy.evidence, [{ id: "policy-approval", title: "Payment Approval" }]);
});

test("audit events preserve decision evidence", () => {
  const decision = attachPolicyEvidence(
    { decision: "blocked", policy: "vendor_blocklist" },
    knowledge,
    "blocked vendors",
  );

  const event = createFinanceAuditEvent(
    EVENT_TYPES.POLICY_EVALUATED,
    { payment: { amount: 200, currency: "USD", vendorId: "blocked-1" }, decision },
    "run-42",
  );

  assert.deepEqual(event.payload.decision.evidence, [{ id: "policy-vendor", title: "Vendor Blocklist" }]);
  assert.equal(event.runId, "run-42");
});

test("rejects invalid evidence queries", () => {
  assert.throws(
    () => attachPolicyEvidence({ decision: "allowed" }, knowledge, "   "),
    /query must be a non-empty string/,
  );
});
