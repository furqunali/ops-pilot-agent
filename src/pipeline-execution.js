const { planTask } = require("./task-planner");
const { dispatchExecution } = require("./execution-dispatcher");
const { verifyResult } = require("./task-verifier");
const { buildPipelineAudit } = require("./runtime-pipeline-audit");

async function executePlannedTask(input, tool = null) {
  const plan = planTask(input);
  const result = await dispatchExecution(plan, input, tool);
  const verification = verifyResult({ task: input, ...result });
  return {
    task: input.trim(),
    plan,
    result: { task: input.trim(), ...result },
    verification,
    audit: buildPipelineAudit({ input: input.trim() }, result, verification),
  };
}

module.exports = { executePlannedTask };
