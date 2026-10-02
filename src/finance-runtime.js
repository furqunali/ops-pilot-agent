"use strict";

const { runTaskPipeline } = require("./runtime-pipeline");
const { runFinanceWorkflow } = require("./finance-reference-workflow");

function runFinanceAgentTask({ task, payment, policy, knowledge, ledger, tools, runId = null, approval = null, retryOptions = {} } = {}) {
  if (typeof task !== "string" || !task.trim()) throw new TypeError("task must be a non-empty string");
  if (!knowledge || typeof knowledge.search !== "function") throw new TypeError("knowledge must expose search()");
  if (!ledger || typeof ledger.append !== "function") throw new TypeError("ledger must expose append()");

  const financeResult = runFinanceWorkflow({ payment, policy, knowledge, ledger, tools, runId, approval });
  const runtimeRun = runTaskPipeline(task, () => financeResult, { ...retryOptions, runId: runId || retryOptions.runId, ledger });
  return Object.freeze({
    ...runtimeRun,
    finance: financeResult,
  });
}

module.exports = { runFinanceAgentTask };
