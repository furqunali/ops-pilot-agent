const test = require("node:test");
const assert = require("node:assert/strict");
const { validateAuditEvent } = require("../src/audit-validation");

test("accepts valid audit events", () => {
  assert.equal(validateAuditEvent({ task: "sync", stage: "verify", status: "success" }), true);
});

test("rejects invalid stages and statuses", () => {
  assert.throws(() => validateAuditEvent({ task: "sync", stage: "unknown", status: "success" }));
  assert.throws(() => validateAuditEvent({ task: "sync", stage: "verify", status: "unknown" }));
});
