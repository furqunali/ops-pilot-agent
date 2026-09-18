const { createAuditEvent } = require("./task-audit");

function buildPipelineAudit(task, result, verification) {
  if (!task || typeof task.input !== "string") throw new TypeError("task.input must be a string");
  if (!result || typeof result.status !== "string") throw new TypeError("result.status must be a string");
  if (!verification || typeof verification.valid !== "boolean") throw new TypeError("verification.valid must be boolean");
  return [
    createAuditEvent(task.input, "parse", "success"),
    createAuditEvent(task.input, "plan", "success"),
    createAuditEvent(task.input, "execute", result.status),
    createAuditEvent(task.input, "verify", verification.valid ? "success" : "failed"),
    createAuditEvent(task.input, "report", "success"),
  ];
}
module.exports = { buildPipelineAudit };
