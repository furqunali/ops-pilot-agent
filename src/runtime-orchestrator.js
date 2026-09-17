const { Task } = require("./task-model");
const { planTask } = require("./task-planner");
const { executeTask } = require("./task-executor");
const { verifyResult } = require("./task-verifier");

function runTask(input, tool = null) {
  const task = new Task(input);
  const plan = planTask(task);
  const result = executeTask(task.input, tool);
  const verification = verifyResult(result);
  return { task, plan, result, verification };
}

module.exports = { runTask };
