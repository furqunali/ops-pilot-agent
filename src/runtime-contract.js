function validateRuntimeRun(run) {
  if (!run || typeof run !== "object") throw new TypeError("run must be an object");
  if (!run.task || typeof run.task.input !== "string" || !run.task.input.trim()) throw new TypeError("run.task.input must be non-empty");
  if (!run.result || !["success","failed","skipped"].includes(run.result.status)) throw new TypeError("run.result.status is invalid");
  if (!run.verification || typeof run.verification.valid !== "boolean") throw new TypeError("run.verification.valid must be boolean");
  if (!Array.isArray(run.audit)) throw new TypeError("run.audit must be an array");
  return true;
}
module.exports = { validateRuntimeRun };
