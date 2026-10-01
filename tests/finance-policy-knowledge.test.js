"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");

const knowledge = createPolicyKnowledge([
  { id: "policy-approval", title: "Payment Approval", text: "Payments above 1000 USD require human approval." },
  { id: "policy-vendor", title: "Vendor Blocklist", text: "Blocked vendors cannot receive payments." },
]);

test("searches finance policy knowledge deterministically", () => {
  assert.equal(knowledge.search("human approval").length, 1);
  assert.equal(knowledge.search("blocked vendors")[0].id, "policy-vendor");
});

test("returns a fresh list without exposing mutable collection state", () => {
  const first = knowledge.list();
  const second = knowledge.list();
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first[0]), true);
});

test("ignores blank search queries", () => {
  assert.deepEqual(knowledge.search("   "), []);
});
