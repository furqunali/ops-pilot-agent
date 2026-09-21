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
    audit: [],
  });
});

test("includes normalized audit events when present", () => {
  const report = buildRuntimeReport({
    task: { input: "sync invoices" },
    result: { status: "success", output: null, error: null },
    verification: { valid: true },
    audit: [{ stage: "plan", status: "ok", durationMs: "12" }],
  });
  assert.deepEqual(report.audit, [{ stage: "plan", status: "ok", durationMs: 12 }]);
});

test("rejects malformed runtime results", () => {
  assert.throws(() => buildRuntimeReport(null), /run.task.input/);
  assert.throws(() => buildRuntimeReport({ task: { input: "x" } }), /run.result.status/);
});
