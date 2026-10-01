"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EVENT_TYPES, createFinanceAuditEvent } = require("../src/finance-audit");

test("creates correlated finance audit events", () => {
  const event = createFinanceAuditEvent(EVENT_TYPES.POLICY_EVALUATED, { decision: "allowed" }, "run-42");
  assert.equal(event.type, EVENT_TYPES.POLICY_EVALUATED);
  assert.equal(event.runId, "run-42");
  assert.ok(event.timestamp instanceof Date);
  assert.deepEqual(event.payload, { decision: "allowed" });
});

test("rejects unknown event types", () => {
  assert.throws(() => createFinanceAuditEvent("finance.unknown", {}), TypeError);
});

test("rejects malformed payloads and run ids", () => {
  assert.throws(() => createFinanceAuditEvent(EVENT_TYPES.POLICY_EVALUATED, null), TypeError);
  assert.throws(() => createFinanceAuditEvent(EVENT_TYPES.POLICY_EVALUATED, {}, ""), TypeError);
});
