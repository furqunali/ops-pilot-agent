"use strict";

const { runFinanceWorkflow } = require("./finance-reference-workflow");
const { recordFinanceAudit } = require("./finance-ledger");
const { createFinanceAuditEvent, EVENT_TYPES } = require("./finance-audit");

function executeFinanceStage(input, { ledger, knowledge, tools, runId, policy, approval } = {}) {
  const startedAt = new Date();
  const result = runFinanceWorkflow({ payment: input.payment, policy, knowledge, tools, ledger, runId, approval });
  const finishedAt = new Date();
  if (ledger && result.status === "prepared") {
    recordFinanceAudit(ledger, createFinanceAuditEvent(EVENT_TYPES.POLICY_EVALUATED, {
      stage: "finance",
      status: result.status,
      payment: result.payment,
    }, runId));
  }
  return Object.freeze({ result, startedAt, finishedAt, durationMs: Math.max(0, finishedAt - startedAt) });
}

module.exports = { executeFinanceStage };
