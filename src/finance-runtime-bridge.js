"use strict";

const { runTaskPipeline } = require("./runtime-pipeline");
const { runFinanceWorkflow } = require("./finance-reference-workflow");

function runFinanceReferenceTask(input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("input must be an object");
  }
  const { payment, policy, knowledge, ledger, tools, approval = null } = input;
  if (!ledger) throw new TypeError("ledger is required");

  const finance = runFinanceWorkflow({ payment, policy, knowledge, ledger, tools, runId: options.runId || null, approval });
  const runtime = runTaskPipeline(`finance payment for ${payment.vendorId}`, () => finance.payment, { runId: options.runId, ledger });
  return Object.freeze({ runtime, finance });
}

module.exports = { runFinanceReferenceTask };
