"use strict";

const { verifyResult } = require("./task-verifier");
const { runFinanceWorkflow } = require("./finance-reference-workflow");

function runFinanceAgentTask({ task, payment, policy, knowledge, ledger, tools, runId = null, approval = null } = {}) {
  if (typeof task !== "string" || !task.trim()) throw new TypeError("task must be a non-empty string");
  if (!knowledge || typeof knowledge.search !== "function") throw new TypeError("knowledge must expose search()");
  if (!ledger || typeof ledger.append !== "function") throw new TypeError("ledger must expose append()");

  const financeResult = runFinanceWorkflow({ payment, policy, knowledge, ledger, tools, runId, approval });
  const runtimeRun = financeResult.runtime || (() => {
    const result = { status: "skipped", task, output: null, reason: financeResult.status };
    return { task, result, verification: verifyResult(result), runId };
  })();

  return Object.freeze({ ...runtimeRun, finance: financeResult, task });
}

module.exports = { runFinanceAgentTask };
