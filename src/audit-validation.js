const VALID_STAGES = new Set(["parse", "plan", "execute", "verify", "report"]);
const VALID_STATUSES = new Set(["success", "failed", "skipped"]);

function validateAuditEvent(event) {
  if (!event || typeof event !== "object") throw new TypeError("event must be an object");
  if (typeof event.task !== "string" || !event.task.trim()) throw new TypeError("event.task must be non-empty");
  if (!VALID_STAGES.has(event.stage)) throw new TypeError("event.stage is invalid");
  if (!VALID_STATUSES.has(event.status)) throw new TypeError("event.status is invalid");
  return true;
}

module.exports = { VALID_STAGES, VALID_STATUSES, validateAuditEvent };
