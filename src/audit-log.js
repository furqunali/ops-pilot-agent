const { buildTaskReport } = require("./task-reporting");

function createAuditEvent(task, stage, status, details = null) {
  const report = buildTaskReport(task, { status });
  return { task: report.task, stage, status, details };
}

function appendAuditEvent(events, event) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  if (!event || typeof event.task !== "string") throw new TypeError("event.task must be a string");
  return events.concat(event);
}

module.exports = { createAuditEvent, appendAuditEvent };
