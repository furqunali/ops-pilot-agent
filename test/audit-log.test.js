const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuditEvent, appendAuditEvent } = require("../src/audit-log");

test("creates an audit event from task execution state", () => {
  assert.deepEqual(createAuditEvent({ name: "sync reports" }, "verify", "success"), {
    task: "sync reports",
    stage: "verify",
    status: "success",
    details: null,
  });
});

test("appendAuditEvent preserves the original log", () => {
  const log = [];
  const event = createAuditEvent({ name: "sync reports" }, "execute", "skipped");
  assert.deepEqual(appendAuditEvent(log, event), [event]);
  assert.deepEqual(log, []);
});
