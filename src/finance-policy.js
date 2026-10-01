"use strict";

const DECISIONS = Object.freeze({
  ALLOWED: "allowed",
  REQUIRES_APPROVAL: "requires_approval",
  BLOCKED: "blocked",
});

function validatePayment(payment) {
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
    throw new TypeError("payment must be an object");
  }
  if (typeof payment.currency !== "string" || !payment.currency.trim()) {
    throw new TypeError("payment.currency must be a non-empty string");
  }
  if (!Number.isFinite(payment.amount) || payment.amount < 0) {
    throw new TypeError("payment.amount must be a non-negative number");
  }
  if (typeof payment.vendorId !== "string" || !payment.vendorId.trim()) {
    throw new TypeError("payment.vendorId must be a non-empty string");
  }
  return true;
}

function evaluatePaymentPolicy(payment, policy = {}) {
  validatePayment(payment);
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new TypeError("policy must be an object");
  }

  const approvalThreshold = Number.isFinite(policy.approvalThreshold)
    ? policy.approvalThreshold
    : 1000;
  const blockedVendors = new Set(Array.isArray(policy.blockedVendors) ? policy.blockedVendors : []);

  if (approvalThreshold < 0) throw new TypeError("policy.approvalThreshold must be non-negative");

  if (blockedVendors.has(payment.vendorId)) {
    return Object.freeze({
      decision: DECISIONS.BLOCKED,
      reason: "vendor is blocked",
      policy: "vendor_blocklist",
    });
  }

  if (payment.amount >= approvalThreshold) {
    return Object.freeze({
      decision: DECISIONS.REQUIRES_APPROVAL,
      reason: "payment meets or exceeds approval threshold",
      policy: "approval_threshold",
    });
  }

  return Object.freeze({
    decision: DECISIONS.ALLOWED,
    reason: "payment is within policy limits",
    policy: "approval_threshold",
  });
}

module.exports = { DECISIONS, validatePayment, evaluatePaymentPolicy };
