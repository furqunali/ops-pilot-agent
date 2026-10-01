"use strict";

const STATUSES = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

function createApprovalRequest(payment, policyDecision) {
  if (!payment || typeof payment !== "object") throw new TypeError("payment must be an object");
  if (!policyDecision || typeof policyDecision !== "object") throw new TypeError("policyDecision must be an object");
  if (policyDecision.decision !== "requires_approval") {
    throw new TypeError("approval is only valid for requires_approval decisions");
  }
  return Object.freeze({
    status: STATUSES.PENDING,
    payment: { ...payment },
    policy: { ...policyDecision },
  });
}

function resolveApproval(request, decision, reviewer) {
  if (!request || request.status !== STATUSES.PENDING) throw new TypeError("request must be pending");
  if (decision !== STATUSES.APPROVED && decision !== STATUSES.REJECTED) {
    throw new TypeError("decision must be approved or rejected");
  }
  if (typeof reviewer !== "string" || !reviewer.trim()) throw new TypeError("reviewer must be a non-empty string");
  return Object.freeze({
    ...request,
    status: decision,
    reviewer: reviewer.trim(),
    resolvedAt: new Date(),
  });
}

module.exports = { STATUSES, createApprovalRequest, resolveApproval };
