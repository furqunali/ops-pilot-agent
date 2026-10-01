const { Task } = require("./task-model");
const { planTask } = require("./task-planner");
const { executeTask } = require("./task-executor");
const { verifyResult } = require("./task-verifier");
const { buildRuntimeReport } = require("./runtime-report");
const { buildPipelineAudit } = require("./runtime-pipeline-audit");
const { recordStage, summarizeStages } = require("./runtime-observability");

function runTaskPipeline(input, tool = null) {
  const task = new Task(input);
  let stages = [];
  const parseStartedAt = new Date();
  const parseFinishedAt = new Date();
  stages = recordStage(stages, "parse", "success", parseStartedAt, parseFinishedAt);

  const planStartedAt = new Date();
  const plan = planTask(task);
  const planFinishedAt = new Date();
  stages = recordStage(stages, "plan", "success", planStartedAt, planFinishedAt);

  const executeStartedAt = new Date();
  const result = executeTask(task.input, tool);
  const executeFinishedAt = new Date();
  stages = recordStage(stages, "execute", result.status === "failed" ? "failed" : "success", executeStartedAt, executeFinishedAt);

  const verifyStartedAt = new Date();
  const verification = verifyResult(result);
  const verifyFinishedAt = new Date();
  stages = recordStage(stages, "verify", verification.valid ? "success" : "failed", verifyStartedAt, verifyFinishedAt);

  const run = { task, plan, result, verification };
  const audit = buildPipelineAudit(task, result, verification);
  const observability = { stages, summary: summarizeStages(stages) };
  const report = buildRuntimeReport({ ...run, audit, observability });

  return { ...run, report, audit, observability };
}

module.exports = { runTaskPipeline };
