const test = require("node:test");
const assert = require("node:assert/strict");
const { runTaskPipeline } = require("../src/runtime-pipeline");

test("runs the complete parse-plan-execute-verify-report pipeline", () => {
  const run = runTaskPipeline("sync invoices", input => ({ synced: input }));
  assert.equal(run.result.status, "success");
  assert.equal(run.verification.valid, true);
  assert.equal(run.report.task, "sync invoices");
  assert.equal(run.report.verified, true);
  assert.deepEqual(run.report.output, { synced: "sync invoices" });
});

test("reports skipped execution without a tool", () => {
  const run = runTaskPipeline("review queue");
  assert.equal(run.result.status, "skipped");
  assert.equal(run.report.status, "skipped");
  assert.equal(run.report.verified, true);
});
