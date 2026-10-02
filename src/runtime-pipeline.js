const { Task } = require("./task-model");
const { planTask } = require("./task-planner");
const { executeTask } = require("./task-executor");
const { verifyResult } = require("./task-verifier");
const { buildRuntimeReport } = require("./runtime-report");
const { buildPipelineAudit } = require("./runtime-pipeline-audit");
const { recordStage, summarizeStages } = require("./runtime-observability");
const { authorizeExecution } = require("./execution-policy");
const { randomUUID } = require("node:crypto");
const { ERROR_CODES, createRuntimeError, normalizeExecutionError } = require("./runtime-errors");

function runTaskPipeline(input, tool = null, retryOptions = {}) {
  if (retryOptions === null || typeof retryOptions !== "object" || Array.isArray(retryOptions)) {
    throw new TypeError("retryOptions must be an object");
  }
  const task = new Task(input);
  const runId = typeof retryOptions?.runId === "string" && retryOptions.runId.trim() ? retryOptions.runId.trim() : randomUUID();
  const executionOptions = { ...retryOptions, runId };\n  const operationId = typeof retryOptions?.operationId === "string" && retryOptions.operationId.trim() ? retryOptions.operationId.trim() : null;
  const ledger = retryOptions?.ledger || null;
  if (ledger !== null && (!ledger || typeof ledger.recordStart !== "function" || typeof ledger.recordCompletion !== "function")) {
    throw new TypeError("ledger must expose recordStart() and recordCompletion() methods");
  }
  const ledgerStart = ledger ? ledger.recordStart(task.input, { runId, operationId, authorization: "pending" }) : null;
  let stages = [];
  const parseStartedAt = new Date();
  const parseFinishedAt = new Date();
  stages = recordStage(stages, "parse", "success", parseStartedAt, parseFinishedAt, { runId });

  const planStartedAt = new Date();
  const plan = planTask(task);
  const planFinishedAt = new Date();
  stages = recordStage(stages, "plan", "success", planStartedAt, planFinishedAt, { runId });

  const authorization = authorizeExecution(plan, tool);
  if (ledgerStart) ledgerStart.metadata.authorization = authorization;
  const executeStartedAt = new Date();
  const result = authorization.allowed
    ? executeTask(task.input, tool, executionOptions)
    : { status: "skipped", task: task.input, output: null, reason: authorization.reason };
  const executeFinishedAt = new Date();
  stages = recordStage(stages, "execute", result.status === "failed" ? "failed" : "success", executeStartedAt, executeFinishedAt, { attempts: result.attempts?.length || 0, authorization, runId });

  const verifyStartedAt = new Date();
  const verification = verifyResult(result);
  const verifyFinishedAt = new Date();
  stages = recordStage(stages, "verify", verification.valid ? "success" : "failed", verifyStartedAt, verifyFinishedAt, { runId });

  const run = { task, plan, result, verification, runId };
  const audit = buildPipelineAudit(task, result, verification);
  const observability = { stages, summary: summarizeStages(stages) };
  const report = buildRuntimeReport({ ...run, audit, observability });
  if (ledger) ledger.recordCompletion(task.input, result, { runId, operationId, authorization, attempts: result.attempts?.length || 0, verified: verification.valid, durationMs: observability.summary.durationMs });

  return { ...run, report: { ...report, runId }, audit, observability };
}

module.exports = { runTaskPipeline };
