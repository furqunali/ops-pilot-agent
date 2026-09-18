function buildRuntimeReport(run) {
  if (!run || !run.task || typeof run.task.input !== "string") throw new TypeError("run.task.input must be a string");
  if (!run.result || typeof run.result.status !== "string") throw new TypeError("run.result.status must be a string");
  if (!run.verification || typeof run.verification.valid !== "boolean") throw new TypeError("run.verification.valid must be boolean");
  const steps = Array.isArray(run.plan?.steps) ? run.plan.steps.map(step => ({ id: step.id, action: step.action, status: step.status })) : [];
  const audit = Array.isArray(run.audit) ? run.audit.map(event => ({ stage: event.stage, status: event.status, durationMs: Number(event.durationMs) || 0 })) : [];
  return { task: run.task.input, status: run.result.status, verified: run.verification.valid, output: run.result.output ?? null, error: run.result.error ?? null, steps, audit };
}
module.exports = { buildRuntimeReport };
