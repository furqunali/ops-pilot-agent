"use strict";

const EVENT_TYPES = Object.freeze({
  POLICY_EVALUATED: "finance.policy_evaluated",
  APPROVAL_REQUESTED: "finance.approval_requested",
  APPROVAL_RESOLVED: "finance.approval_resolved",\n  EXECUTION_REPLAYED: "finance.execution_replayed",
});

function createFinanceAuditEvent(type, payload, runId = null) {
  if (!Object.values(EVENT_TYPES).includes(type)) throw new TypeError("type must be a known finance audit event");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("payload must be an object");
  if (runId !== null && (typeof runId !== "string" || !runId.trim())) throw new TypeError("runId must be null or a non-empty string");
  return Object.freeze({
    type,
    timestamp: new Date(),
    runId: runId ? runId.trim() : null,
    payload: { ...payload },
  });
}

module.exports = { EVENT_TYPES, createFinanceAuditEvent };
