const { authorizeExecution } = require("./execution-policy");
const { executeWithTool } = require("./tool-executor");

async function dispatchExecution(plan, input, tool) {
  const authorization = authorizeExecution(plan, tool);
  if (!authorization.allowed) {
    return { status: "skipped", output: null, error: authorization.reason };
  }
  return executeWithTool(tool, input);
}

module.exports = { dispatchExecution };
