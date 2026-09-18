function summarizeExecution(run) {
  if (!run || !run.result || !run.verification) throw new TypeError("run result is incomplete");
  const steps = Array.isArray(run.audit) ? run.audit : [];
  const successful = steps.filter(step => step.status === "success").length;
  return {
    task: run.task,
    status: run.result.status,
    verified: run.verification.valid,
    auditEvents: steps.length,
    successfulStages: successful,
    failedStages: steps.filter(step => step.status === "failed").length,
  };
}

module.exports = { summarizeExecution };
