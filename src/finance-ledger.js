"use strict";

const { createFinanceAuditEvent } = require("./finance-audit");

function recordFinanceAudit(ledger, event) {
  if (!ledger || typeof ledger.append !== "function") {
    throw new TypeError("ledger must expose append()");
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("event must be an object");
  }
  return ledger.append({
    type: "finance_audit",
    task: event.payload?.task ?? null,
    status: "recorded",
    metadata: { runId: event.runId, eventType: event.type },
    event: {
      ...event,
      timestamp: event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp),
    },
  });
}

function recordFinancePolicyDecision(ledger, payment, decision, runId = null) {
  return recordFinanceAudit(
    ledger,
    createFinanceAuditEvent("finance.policy_evaluated", { payment: { ...payment }, decision: { ...decision } }, runId),
  );
}

module.exports = { recordFinanceAudit, recordFinancePolicyDecision };
