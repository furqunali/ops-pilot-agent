const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeExecution } = require("../src/execution-metrics");

test("summarizes audited execution outcomes", () => {
  const summary = summarizeExecution({
    task: "sync invoices",
    result: { status: "success" },
    verification: { valid: true },
    audit: [
      { status: "success" }, { status: "success" }, { status: "failed" }
    ]
  });
  assert.deepEqual(summary, {
    task: "sync invoices", status: "success", verified: true,
    auditEvents: 3, successfulStages: 2, failedStages: 1
  });
});
