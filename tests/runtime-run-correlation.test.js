const test = require("node:test");
const assert = require("node:assert/strict");
const { runTaskPipeline } = require("../src/runtime-pipeline");

test("assigns a run id and correlates retry attempts", () => {
  let calls = 0;
  const run = runTaskPipeline("sync invoices", () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error("temporary outage");
      error.code = "ETIMEDOUT";
      throw error;
    }
    return { synced: true };
  }, { maxAttempts: 2, baseDelayMs: 0 });

  assert.equal(typeof run.runId, "string");
  assert.equal(run.runId.length > 0, true);
  assert.equal(run.report.runId, run.runId);
  assert.deepEqual(run.result.attempts.map(attempt => attempt.runId), [run.runId, run.runId]);
});

test("preserves an explicitly supplied run id", () => {
  const run = runTaskPipeline("review queue", null, { runId: "run-fixed-42" });
  assert.equal(run.runId, "run-fixed-42");
  assert.equal(run.report.runId, "run-fixed-42");
});


test("correlates every observability stage to the run", () => {
  const run = runTaskPipeline("audit queue", () => ({ ok: true }), { runId: "run-observe-7" });
  assert.deepEqual(run.observability.stages.map(stage => stage.metadata.runId), Array(4).fill("run-observe-7"));
});
