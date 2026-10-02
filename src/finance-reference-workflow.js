"use strict";

const { DECISIONS, evaluatePaymentPolicy } = require("./finance-policy");
const { createApprovalRequest, resolveApproval, STATUSES } = require("./finance-approval");
const { createFinanceAuditEvent, EVENT_TYPES } = require("./finance-audit");
const { recordFinanceAudit } = require("./finance-ledger");
const { createFinanceTools, invokeFinanceTool } = require("./finance-mcp-tools");
const { runTaskPipeline } = require("./runtime-pipeline");
const { attachPolicyEvidence } = require("./finance-policy-evidence");

function runFinanceWorkflow({ payment, policy, knowledge, ledger, tools, runId = null, operationId = null, tenantId = null, requesterId = null, approval = null } = {}) {
  if (!ledger || typeof ledger.append !== "function") throw new TypeError("ledger must expose append()");
  if (!knowledge || typeof knowledge.search !== "function") throw new TypeError("knowledge must expose search()");
  const toolset = tools || createFinanceTools();
  if (operationId !== null && (typeof operationId !== "string" || !operationId.trim())) throw new TypeError("operationId must be null or a non-empty string");
  if (tenantId !== null && (typeof tenantId !== "string" || !tenantId.trim())) throw new TypeError("tenantId must be null or a non-empty string");
  if (requesterId !== null && (typeof requesterId !== "string" || !requesterId.trim())) throw new TypeError("requesterId must be null or a non-empty string");
  const priorCompletion = operationId ? ledger.findByType("completion").find(entry => entry.metadata?.operationId === operationId && entry.metadata?.tenantId === tenantId && entry.status === "success") : null;
  if (priorCompletion) {
    recordFinanceAudit(ledger, createFinanceAuditEvent(EVENT_TYPES.EXECUTION_REPLAYED, { operationId, tenantId, priorRunId: priorCompletion.metadata.runId, result: priorCompletion.result }, runId));
    return Object.freeze({ status: "already_prepared", decision: null, payment: priorCompletion.result?.output ?? null, approval: null, runtime: null, priorRunId: priorCompletion.metadata.runId });
  }
  const decision = evaluatePaymentPolicy(payment, policy);
  const evidencedDecision = attachPolicyEvidence(decision, knowledge, "approval threshold");
  recordFinanceAudit(ledger, createFinanceAuditEvent(EVENT_TYPES.POLICY_EVALUATED, { payment: { ...payment }, decision: evidencedDecision }, runId));

  if (decision.decision === DECISIONS.BLOCKED) {
    return Object.freeze({ status: "blocked", decision: evidencedDecision, payment: null, approval: null });
  }

  if (decision.decision === DECISIONS.REQUIRES_APPROVAL) {
    let request = createApprovalRequest(payment, evidencedDecision, requesterId);
    recordFinanceAudit(ledger, createFinanceAuditEvent(EVENT_TYPES.APPROVAL_REQUESTED, { payment: { ...payment }, request: { ...request } }, runId));
    if (!approval) return Object.freeze({ status: STATUSES.PENDING, decision: evidencedDecision, payment: null, approval: request });
    request = resolveApproval(request, approval.decision, approval.reviewer);
    recordFinanceAudit(ledger, createFinanceAuditEvent(EVENT_TYPES.APPROVAL_RESOLVED, { payment: { ...payment }, approval: { ...request } }, runId));
    if (request.status === STATUSES.REJECTED) return Object.freeze({ status: "rejected", decision: evidencedDecision, payment: null, approval: request });
  }

  const runtime = runTaskPipeline(`prepare payment for ${payment.vendorId}`, () => invokeFinanceTool(toolset, "finance.prepare_payment", payment), { runId, operationId, tenantId, ledger });
  if (runtime.result.status !== "success") return Object.freeze({ status: "failed", decision: evidencedDecision, payment: null, approval: null, runtime });
  const prepared = runtime.result.output;
  return Object.freeze({ status: "prepared", decision: evidencedDecision, payment: prepared, approval: null, runtime });
}

module.exports = { runFinanceWorkflow };
