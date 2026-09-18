const test = require("node:test");
const assert = require("node:assert/strict");
const { runTaskPipeline } = require("../src/runtime-pipeline");

test("runs the complete auditable pipeline with a tool", () => {
  const run = runTaskPipeline("sync invoices", input => ({ synced: input }));
  assert.equal(run.result.status, "success");
  assert.equal(run.verification.valid, true);
  assert.equal(run.report.verified, true);
  assert.deepEqual(run.report.output, { synced: "sync invoices" });
  assert.deepEqual(run.audit.map(event => event.stage), ["parse", "plan", "execute", "verify", "report"]);
});

test("reports skipped execution without a tool", () => {
  const run = runTaskPipeline("review queue");
  assert.equal(run.result.status, "skipped");
  assert.equal(run.report.status, "skipped");
  assert.equal(run.report.verified, true);
  assert.equal(run.audit.find(event => event.stage === "execute").status, "skipped");
});
