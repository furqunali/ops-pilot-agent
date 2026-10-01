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

test("returns isolated document data", () => {
  const listed = knowledge.list();
  listed[0].title = "changed";
  assert.equal(knowledge.list()[0].title, "Payment Approval");
});

test("ignores blank search queries", () => {
  assert.deepEqual(knowledge.search("   "), []);
});
