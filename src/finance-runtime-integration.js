"use strict";

const { runTaskPipeline } = require("./runtime-pipeline");
const { runFinanceWorkflow } = require("./finance-reference-workflow");

function runFinanceTask(input, dependencies = {}) {
  const { payment, policy, knowledge, ledger, tools, approval, runId } = dependencies;
  const workflow = runFinanceWorkflow({ payment, policy, knowledge, ledger, tools, approval, runId });
  const task = `prepare payment for ${payment.vendorId}`;
  const runtime = runTaskPipeline(task, workflow.status === "prepared" ? text => text : null, { runId, ledger });
  return Object.freeze({ workflow, runtime });
}

module.exports = { runFinanceTask };
