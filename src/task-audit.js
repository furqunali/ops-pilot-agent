const VALID_STAGES = new Set(["parse", "plan", "execute", "verify", "report"]);
function createAuditEvent(task, stage, status, details = null) {
  if (typeof task !== "string" || !task.trim()) throw new TypeError("task must be non-empty");
  if (!VALID_STAGES.has(stage)) throw new TypeError("stage is invalid");
  if (typeof status !== "string" || !status.trim()) throw new TypeError("status must be non-empty");
  return { task: task.trim(), stage, status, details };
}
function appendAuditEvent(events, event) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  return events.concat(event);
}
module.exports = { VALID_STAGES, createAuditEvent, appendAuditEvent };
