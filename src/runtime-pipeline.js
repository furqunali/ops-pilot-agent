const { Task } = require("./task-model");
const { planTask } = require("./task-planner");
const { executeTask } = require("./task-executor");
const { verifyResult } = require("./task-verifier");
const { buildRuntimeReport } = require("./runtime-report");

function runTaskPipeline(input, tool = null) {
  const task = new Task(input);
  const plan = planTask(task);
  const result = executeTask(task.input, tool);
  const verification = verifyResult(result);
  const run = { task, plan, result, verification };
  return { ...run, report: buildRuntimeReport(run) };
}

module.exports = { runTaskPipeline };
