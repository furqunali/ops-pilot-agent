"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");
const { DEFAULT_CASES, evaluateFinanceSuiteDashboard } = require("../src/finance-evaluation");

test("finance evaluation produces a dashboard from the default reference cases", () => {
  const knowledge = createPolicyKnowledge([
    { id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." },
    { id: "vendor-blocklist", title: "Vendor blocklist", text: "Blocked vendors cannot receive payments." },
  ]);
  const output = evaluateFinanceSuiteDashboard(DEFAULT_CASES, knowledge, null, {
    generatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  assert.equal(output.suite.total, 3);
  assert.equal(output.suite.passRate, 1);
  assert.equal(output.dashboard.passRate, 1);
  assert.equal(output.dashboard.dimensions.policy.passRate, 1);
  assert.equal(output.dashboard.dimensions.evidence.passRate, 1);
});
