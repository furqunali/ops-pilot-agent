"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DECISIONS, evaluatePaymentPolicy } = require("../src/finance-policy");

test("allows payments below the approval threshold", () => {
  const result = evaluatePaymentPolicy({ amount: 500, currency: "USD", vendorId: "vendor-1" });
  assert.equal(result.decision, DECISIONS.ALLOWED);
});

test("requires approval at the approval threshold", () => {
  const result = evaluatePaymentPolicy(
    { amount: 1000, currency: "USD", vendorId: "vendor-1" },
    { approvalThreshold: 1000 },
  );
  assert.equal(result.decision, DECISIONS.REQUIRES_APPROVAL);
  assert.equal(result.policy, "approval_threshold");
});

test("blocks vendors on the deterministic blocklist", () => {
  const result = evaluatePaymentPolicy(
    { amount: 100, currency: "USD", vendorId: "blocked-vendor" },
    { blockedVendors: ["blocked-vendor"] },
  );
  assert.equal(result.decision, DECISIONS.BLOCKED);
  assert.equal(result.policy, "vendor_blocklist");
});

test("rejects malformed payments", () => {
  assert.throws(() => evaluatePaymentPolicy({ amount: -1, currency: "USD", vendorId: "vendor-1" }), TypeError);
});
