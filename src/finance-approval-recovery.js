"use strict";

const { resolveApproval, STATUSES } = require("./finance-approval");
const { recordFinanceAudit } = require("./finance-ledger");
const { createFinanceAuditEvent, EVENT_TYPES } = require("./finance-audit");

function recoverFinanceApproval(ledger, request, decision, reviewer, runId = null) {
  if (!ledger || typeof ledger.append !== "function") throw new TypeError("ledger must expose append()");
  if (!request || request.status !== STATUSES.PENDING) throw new TypeError("request must be pending");
  const resolved = resolveApproval(request, decision, reviewer);
  recordFinanceAudit(
    ledger,
    createFinanceAuditEvent(
      EVENT_TYPES.APPROVAL_RESOLVED,
      { payment: { ...request.payment }, approval: { ...resolved }, recovery: "approval_resume" },
      runId,
    ),
  );
  return Object.freeze({
    status: resolved.status === STATUSES.APPROVED ? "approved" : "rejected",
    approval: resolved,
    runId,
    recovered: true,
  });
}

module.exports = { recoverFinanceApproval };
