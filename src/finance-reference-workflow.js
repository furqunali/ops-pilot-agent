"use strict";

const { DECISIONS, evaluatePaymentPolicy } = require("./finance-policy");
const { createApprovalRequest, resolveApproval, STATUSES } = require("./finance-approval");
const { createFinanceAuditEvent, EVENT_TYPES } = require("./finance-audit");
const { recordFinanceAudit } = require("./finance-ledger");
const { createFinanceTools, invokeFinanceTool } = require("./finance-mcp-tools");
const { attachPolicyEvidence } = require("./finance-policy-evidence");

function runFinanceWorkflow({ payment, policy, knowledge, ledger, tools, runId = null, approval = null } = {}) {
  if (!ledger || typeof ledger.append !== "function") throw new TypeError("ledger must expose append()");
  if (!knowledge || typeof knowledge.search !== "function") throw new TypeError("knowledge must expose search()");
  const toolset = tools || createFinanceTools();
  const decision = evaluatePaymentPolicy(payment, policy);
  const evidencedDecision = attachPolicyEvidence(decision, knowledge, "approval threshold");
  recordFinanceAudit(ledger, createFinanceAuditEvent(EVENT_TYPES.POLICY_EVALUATED, { payment: { ...payment }, decision: evidencedDecision }, runId));

  if (decision.decision === DECISIONS.BLOCKED) {
    return Object.freeze({ status: "blocked", decision: evidencedDecision, payment: null, approval: null });
  }

  if (decision.decision === DECISIONS.REQUIRES_APPROVAL) {
    let request = createApprovalRequest(payment, evidencedDecision);
    recordFinanceAudit(ledger, createFinanceAuditEvent(EVENT_TYPES.APPROVAL_REQUESTED, { payment: { ...payment }, request: { ...request } }, runId));
    if (!approval) return Object.freeze({ status: STATUSES.PENDING, decision: evidencedDecision, payment: null, approval: request });
    request = resolveApproval(request, approval.decision, approval.reviewer);
    recordFinanceAudit(ledger, createFinanceAuditEvent(EVENT_TYPES.APPROVAL_RESOLVED, { payment: { ...payment }, approval: { ...request } }, runId));
    if (request.status === STATUSES.REJECTED) return Object.freeze({ status: "rejected", decision: evidencedDecision, payment: null, approval: request });
  }

  const prepared = invokeFinanceTool(toolset, "finance.prepare_payment", payment);
  return Object.freeze({ status: "prepared", decision: evidencedDecision, payment: prepared, approval: null });
}

module.exports = { runFinanceWorkflow };
