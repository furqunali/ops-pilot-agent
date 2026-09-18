const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuditEvent, appendAuditEvent } = require("../src/task-audit");
test("creates deterministic audit events", () => {
  assert.deepEqual(createAuditEvent("sync invoices", "execute", "success"), {task:"sync invoices",stage:"execute",status:"success",details:null});
});
test("appends without mutating existing events", () => {
  const events = [{task:"a",stage:"parse",status:"success",details:null}];
  const next = appendAuditEvent(events, {task:"a",stage:"plan",status:"ready"});
  assert.equal(events.length, 1); assert.equal(next.length, 2);
});
