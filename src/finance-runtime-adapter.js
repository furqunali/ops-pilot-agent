"use strict";

const { runTaskPipeline } = require("./runtime-pipeline");
const { runFinanceWorkflow } = require("./finance-reference-workflow");

function runFinanceTaskPipeline(input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("input must be an object");
  const { payment, policy, knowledge, ledger, financeTools, approval, runId } = input;
  if (!ledger || typeof ledger.append !== "function") throw new TypeError("ledger must expose append()");
  const adapter = ({ runId: correlatedRunId, ledger: runtimeLedger }) => {
    const finance = runFinanceWorkflow({ payment, policy, knowledge, ledger: runtimeLedger, tools: financeTools, approval, runId: correlatedRunId });
    return {
      status: finance.status === "prepared" ? "success" : finance.status === "pending" ? "skipped" : "failed",
      task: input.task || "prepare finance payment",
      output: finance,
    };
  };
  const runtime = runTaskPipeline(input.task || "prepare finance payment", null, { ...options, runId, ledger, executionAdapter: adapter });
  return Object.freeze({ finance: runtime.result.output, runtime });
}

module.exports = { runFinanceTaskPipeline };
