"use strict";

const { runTaskPipeline } = require("./runtime-pipeline");
const { runFinanceWorkflow } = require("./finance-reference-workflow");

function runFinanceReferenceTask({ task = "finance reference workflow", ...financeOptions } = {}) {
  const result = runFinanceWorkflow(financeOptions);
  const runtime = runTaskPipeline(task, () => result, { runId: financeOptions.runId || undefined, ledger: financeOptions.ledger });
  return Object.freeze({ ...runtime, finance: result });
}

module.exports = { runFinanceReferenceTask };
