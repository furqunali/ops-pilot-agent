"use strict";

const { runTaskPipeline } = require("./runtime-pipeline");
const { runFinanceWorkflow } = require("./finance-reference-workflow");

function runFinanceTaskPipeline(input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("input must be an object");
  const { payment, policy, knowledge, ledger, financeTools, approval, runId } = input;
  const finance = runFinanceWorkflow({ payment, policy, knowledge, ledger, tools: financeTools, approval, runId });
  const runtime = runTaskPipeline(
    input.task || "prepare finance payment",
    () => finance,
    { ...options, runId, ledger },
  );
  return Object.freeze({ finance, runtime });
}

module.exports = { runFinanceTaskPipeline };
