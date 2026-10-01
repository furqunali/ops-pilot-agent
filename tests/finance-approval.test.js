"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { STATUSES, createApprovalRequest, resolveApproval } = require("../src/finance-approval");

const request = createApprovalRequest(
  { amount: 1500, currency: "USD", vendorId: "vendor-1" },
  { decision: "requires_approval", policy: "approval_threshold" },
);

test("creates pending approval requests", () => {
  assert.equal(request.status, STATUSES.PENDING);
  assert.equal(request.payment.amount, 1500);
});

test("resolves approval with reviewer attribution", () => {
  const resolved = resolveApproval(request, STATUSES.APPROVED, "operator-1");
  assert.equal(resolved.status, STATUSES.APPROVED);
  assert.equal(resolved.reviewer, "operator-1");
  assert.ok(resolved.resolvedAt instanceof Date);
});

test("rejects approval for non-pending requests", () => {
  const resolved = resolveApproval(request, STATUSES.REJECTED, "operator-1");
  assert.throws(() => resolveApproval(resolved, STATUSES.APPROVED, "operator-2"), TypeError);
});
