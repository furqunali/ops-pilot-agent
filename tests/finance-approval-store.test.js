"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { FinanceApprovalStore } = require("../src/finance-approval-store");

test("approval store persists pending requests and resolves them", () => {
  const store = new FinanceApprovalStore();
  store.save({ id: "approval-1", status: "pending", payment: { amount: 1500 } });
  assert.equal(store.pending().length, 1);
  const resolved = store.resolve("approval-1", "approved", "reviewer-1", new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(resolved.status, "approved");
  assert.equal(store.pending().length, 0);
  assert.equal(store.get("approval-1").reviewer, "reviewer-1");
});

test("approval store exports and imports records", () => {
  const original = new FinanceApprovalStore([{ id: "approval-2", status: "pending" }]);
  const restored = new FinanceApprovalStore(original.export());
  assert.deepEqual(restored.export(), original.export());
});

test("approval store rejects duplicate resolution and malformed records", () => {
  const store = new FinanceApprovalStore([{ id: "approval-3", status: "approved" }]);
  assert.throws(() => store.resolve("approval-3", "rejected", "reviewer"), /must be pending/);
  assert.throws(() => store.save({ status: "pending" }), /non-empty id/);
  assert.throws(() => store.resolve("missing", "approved", "reviewer"), /not found/);
});
