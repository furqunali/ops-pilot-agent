"use strict";

const { runTaskPipeline } = require("./runtime-pipeline");
const { runFinanceWorkflow } = require("./finance-reference-workflow");

function runFinanceReferenceTask(input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("input must be an object");
  const { payment, policy, knowledge, ledger, tools, approval = null } = input;
  if (!ledger) throw new TypeError("ledger is required");
  const runId = options.runId || undefined;
  const financeTool = () => runFinanceWorkflow({ payment, policy, knowledge, ledger, tools, runId, approval });
  const runtime = runTaskPipeline(`finance payment for ${payment.vendorId}`, financeTool, { ...options, ledger, runId });
  return Object.freeze({ runtime, finance: runtime.result.output });
}

module.exports = { runFinanceReferenceTask };
