const { Task } = require("./task-model");
const { planTask } = require("./task-planner");
const { executeTask } = require("./task-executor");
const { verifyResult } = require("./task-verifier");
const { buildRuntimeReport } = require("./runtime-report");
const { buildPipelineAudit } = require("./runtime-pipeline-audit");
const { recordStage, summarizeStages } = require("./runtime-observability");
const { authorizeExecution } = require("./execution-policy");

function runTaskPipeline(input, tool = null, retryOptions = {}) {
  const task = new Task(input);
  const ledger = retryOptions?.ledger || null;
  if (ledger !== null && (!ledger || typeof ledger.recordStart !== "function" || typeof ledger.recordCompletion !== "function")) {
    throw new TypeError("ledger must expose recordStart() and recordCompletion() methods");
  }
  if (ledger) ledger.recordStart(task.input, { authorization: "pending" });
  let stages = [];
  const parseStartedAt = new Date();
  const parseFinishedAt = new Date();
  stages = recordStage(stages, "parse", "success", parseStartedAt, parseFinishedAt);

  const planStartedAt = new Date();
  const plan = planTask(task);
  const planFinishedAt = new Date();
  stages = recordStage(stages, "plan", "success", planStartedAt, planFinishedAt);

  const authorization = authorizeExecution(plan, tool);
  if (ledger) ledger.entries[ledger.entries.length - 1].metadata.authorization = authorization;
  const executeStartedAt = new Date();
  const result = authorization.allowed
    ? executeTask(task.input, tool, retryOptions)
    : { status: "skipped", task: task.input, output: null, reason: authorization.reason };
  const executeFinishedAt = new Date();
  stages = recordStage(stages, "execute", result.status === "failed" ? "failed" : "success", executeStartedAt, executeFinishedAt, { attempts: result.attempts?.length || 0, authorization });

  const verifyStartedAt = new Date();
  const verification = verifyResult(result);
  const verifyFinishedAt = new Date();
  stages = recordStage(stages, "verify", verification.valid ? "success" : "failed", verifyStartedAt, verifyFinishedAt);

  const run = { task, plan, result, verification };
  const audit = buildPipelineAudit(task, result, verification);
  const observability = { stages, summary: summarizeStages(stages) };
  const report = buildRuntimeReport({ ...run, audit, observability });
  if (ledger) ledger.recordCompletion(task.input, result, { authorization, attempts: result.attempts?.length || 0, verified: verification.valid });

  return { ...run, report, audit, observability };
}

module.exports = { runTaskPipeline };
