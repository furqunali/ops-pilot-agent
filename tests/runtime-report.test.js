const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRuntimeReport } = require("../src/runtime-report");

test("builds a stable report from an orchestrator result", () => {
  const report = buildRuntimeReport({
    task: { input: "sync invoices" },
    result: { status: "success", output: { count: 3 }, error: null },
    verification: { valid: true },
    plan: { steps: [{ id: 1, action: "parse", status: "ready" }] },
  });
  assert.deepEqual(report, {
    task: "sync invoices",
    status: "success",
    verified: true,
    output: { count: 3 },
    error: null,
    steps: [{ id: 1, action: "parse", status: "ready" }],
  });
});

test("rejects malformed runtime results", () => {
  assert.throws(() => buildRuntimeReport(null), /run.task.input/);
  assert.throws(() => buildRuntimeReport({ task: { input: "x" } }), /run.result.status/);
});
