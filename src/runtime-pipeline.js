const { Task } = require("./task-model");
const { planTask } = require("./task-planner");
const { executeTask } = require("./task-executor");
const { verifyResult } = require("./task-verifier");
const { buildRuntimeReport } = require("./runtime-report");
const { buildPipelineAudit } = require("./runtime-pipeline-audit");
const { recordStage, summarizeStages } = require("./runtime-observability");
const { authorizeExecution, validatePlan } = require("./execution-policy");
const { randomUUID } = require("node:crypto");
const { ERROR_CODES, createRuntimeError, normalizeExecutionError } = require("./runtime-errors");

// A pre-computed plan (for example one proposed by the LLM planner) must
// satisfy the same contract as the deterministic plan and belong to this task.
// It is only a proposal: authorizeExecution below still decides.
function resolvePlan(task, proposedPlan) {
  if (proposedPlan === null || proposedPlan === undefined) return planTask(task);
  if (typeof proposedPlan !== "object" || Array.isArray(proposedPlan)) throw new TypeError("plan must be an object");
  validatePlan(proposedPlan);
  if (proposedPlan.task !== task.input) throw new TypeError("plan.task must match the task input");
  return proposedPlan;
}

function summarizePlanner(planner) {
  return { source: planner.source, provider: planner.provider ?? null, model: planner.model ?? null, fallbackReason: planner.fallbackReason ?? null };
}

// Injection screening gate. A "block" decision always stops execution; a
// "require_approval" decision stops execution unless a named human reviewer
// approved this run. The gate can only narrow what authorizeExecution allows.
function evaluateScreening(screening, approval) {
  if (!screening || screening.decision === "allow") return { allowed: true, reason: null, approval: null };
  if (screening.decision === "block") return { allowed: false, reason: `blocked: ${screening.reason}`, approval: null };
  const reviewer = approval && typeof approval.reviewer === "string" && approval.reviewer.trim() ? approval.reviewer.trim() : null;
  if (!reviewer) return { allowed: false, reason: `human approval required: ${screening.reason}`, approval: null };
  return { allowed: true, reason: null, approval: { reviewer } };
}

function recordScreening(ledger, taskInput, screening, gate, ids) {
  if (typeof ledger.append !== "function") return;
  ledger.append({
    type: "input_screening",
    task: taskInput,
    status: gate.allowed ? "approved" : screening.decision,
    metadata: {
      ...ids,
      decision: screening.decision,
      severity: screening.severity,
      reason: gate.reason || screening.reason,
      approval: gate.approval,
      findings: screening.findings.map(finding => ({ rule: finding.rule, category: finding.category, severity: finding.severity, source: finding.source, excerpt: finding.excerpt })),
    },
  });
}

function runTaskPipeline(input, tool = null, retryOptions = {}) {
  if (retryOptions === null || typeof retryOptions !== "object" || Array.isArray(retryOptions)) {
    throw new TypeError("retryOptions must be an object");
  }
  const task = new Task(input);
  const runId = typeof retryOptions?.runId === "string" && retryOptions.runId.trim() ? retryOptions.runId.trim() : randomUUID();
  const { plan: proposedPlan = null, inputGuard = null, injectionApproval = null, ...restOptions } = retryOptions;
  if (inputGuard !== null && (!inputGuard || typeof inputGuard.screenTask !== "function")) throw new TypeError("inputGuard must expose screenTask()");
  const executionOptions = { ...restOptions, runId };
  const operationId = typeof retryOptions?.operationId === "string" && retryOptions.operationId.trim() ? retryOptions.operationId.trim() : null;
  const executionAdapter = retryOptions?.executionAdapter || null;
  if (executionAdapter !== null && typeof executionAdapter !== "function") throw new TypeError("executionAdapter must be a function or null");
  const tenantId = typeof retryOptions?.tenantId === "string" && retryOptions.tenantId.trim() ? retryOptions.tenantId.trim() : null;
  const ledger = retryOptions?.ledger || null;
  if (ledger !== null && (!ledger || typeof ledger.recordStart !== "function" || typeof ledger.recordCompletion !== "function")) {
    throw new TypeError("ledger must expose recordStart() and recordCompletion() methods");
  }
  const ledgerStart = ledger ? ledger.recordStart(task.input, { runId, operationId, tenantId, authorization: "pending" }) : null;
  let stages = [];
  const timings = [];
  const parseStartedAt = new Date();
  const screening = inputGuard ? inputGuard.screenTask(task.input) : null;
  const parseFinishedAt = new Date();
  stages = recordStage(stages, "parse", "success", parseStartedAt, parseFinishedAt, screening ? { runId, screening: { decision: screening.decision, severity: screening.severity } } : { runId });
  timings.push({ stage: "parse", startedAtMs: parseStartedAt.getTime(), finishedAtMs: parseFinishedAt.getTime() });
  const screeningGate = evaluateScreening(screening, injectionApproval);
  if (ledger && screening && screening.decision !== "allow") recordScreening(ledger, task.input, screening, screeningGate, { runId, operationId, tenantId });

  const planStartedAt = new Date();
  const plan = resolvePlan(task, proposedPlan);
  const planFinishedAt = new Date();
  stages = recordStage(stages, "plan", "success", planStartedAt, planFinishedAt, { runId, planner: plan.planner || { source: "deterministic", fallbackReason: null } });
  timings.push({ stage: "plan", startedAtMs: planStartedAt.getTime(), finishedAtMs: planFinishedAt.getTime() });

  const authorization = screeningGate.allowed ? authorizeExecution(plan, tool || executionAdapter) : { allowed: false, reason: screeningGate.reason };
  if (ledgerStart) ledgerStart.metadata.authorization = authorization;
  const executeStartedAt = new Date();
  const result = authorization.allowed
    ? (executionAdapter ? executionAdapter({ task: task.input, runId, operationId, tenantId, ledger, tool, options: executionOptions }) : executeTask(task.input, tool, executionOptions))
    : { status: "skipped", task: task.input, output: null, reason: authorization.reason };
  const executeFinishedAt = new Date();
  stages = recordStage(stages, "execute", result.status === "failed" ? "failed" : "success", executeStartedAt, executeFinishedAt, { attempts: result.attempts?.length || 0, authorization, runId });
  timings.push({ stage: "execute", startedAtMs: executeStartedAt.getTime(), finishedAtMs: executeFinishedAt.getTime() });

  const verifyStartedAt = new Date();
  const verification = verifyResult(result);
  const verifyFinishedAt = new Date();
  stages = recordStage(stages, "verify", verification.valid ? "success" : "failed", verifyStartedAt, verifyFinishedAt, { runId });
  timings.push({ stage: "verify", startedAtMs: verifyStartedAt.getTime(), finishedAtMs: verifyFinishedAt.getTime() });

  const run = { task, plan, result, verification, runId };
  const audit = buildPipelineAudit(task, result, verification);
  const observability = { stages, summary: summarizeStages(stages) };
  // Wall-clock stage timings for trace export; kept beside (not inside) the
  // stage records so existing stage contracts are unchanged.
  Object.defineProperty(observability, "timings", { value: timings, enumerable: false });
  const report = buildRuntimeReport({ ...run, audit, observability });
  if (ledger) ledger.recordCompletion(task.input, result, { runId, operationId, tenantId, authorization, attempts: result.attempts?.length || 0, verified: verification.valid, durationMs: observability.summary.durationMs, ...(plan.planner ? { planner: summarizePlanner(plan.planner) } : {}) });

  return { ...run, report: { ...report, runId }, audit, observability, ...(screening ? { screening } : {}) };
}

module.exports = { runTaskPipeline };
