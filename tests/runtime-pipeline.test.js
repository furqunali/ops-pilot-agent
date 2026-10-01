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
  assert.deepEqual(run.observability.stages.map(stage => stage.stage), ["parse", "plan", "execute", "verify"]);
  assert.equal(run.observability.summary.total, 4);
  assert.equal(run.observability.summary.failed, 0);
  assert.deepEqual(run.report.observability.stages.map(stage => stage.stage), run.observability.stages.map(stage => stage.stage));
  assert.deepEqual(run.report.audit.map(event => event.stage), run.audit.map(event => event.stage));
});

test("reports skipped execution without a tool", () => {
  const run = runTaskPipeline("review queue");
  assert.equal(run.result.status, "skipped");
  assert.equal(run.report.status, "skipped");
  assert.equal(run.report.verified, true);
  assert.equal(run.audit.find(event => event.stage === "execute").status, "skipped");
});

test("retries retryable execution failures and records attempts", () => {
  let calls = 0;
  const run = runTaskPipeline("sync invoices", () => {
    calls += 1;
    if (calls < 3) {
      const error = new Error("temporary outage");
      error.code = "ETIMEDOUT";
      throw error;
    }
    return { synced: true };
  }, { maxAttempts: 3, baseDelayMs: 0 });

  assert.equal(run.result.status, "success");
  assert.equal(calls, 3);
  assert.equal(run.result.attempts.length, 3);
  assert.deepEqual(run.result.attempts.map(attempt => attempt.status), ["failed", "failed", "success"]);
  assert.equal(run.observability.stages.find(stage => stage.stage === "execute").metadata.attempts, 3);
  assert.equal(run.audit.find(event => event.stage === "execute").details.attempts, 3);
});

test("exhausted retries produce a failed, verified pipeline result", () => {
  let calls = 0;
  const run = runTaskPipeline("sync invoices", () => {
    calls += 1;
    const error = new Error("temporary outage");
    error.code = "RATE_LIMITED";
    throw error;
  }, { maxAttempts: 2, baseDelayMs: 0 });

  assert.equal(run.result.status, "failed");
  assert.equal(calls, 2);
  assert.equal(run.result.attempts.length, 2);
  assert.equal(run.result.attempts.every(attempt => attempt.status === "failed"), true);
  assert.equal(run.verification.valid, true);
  assert.equal(run.observability.summary.failed, 1);
});

test("does not retry explicitly non-retryable failures", () => {
  let calls = 0;
  const run = runTaskPipeline("sync invoices", () => {
    calls += 1;
    const error = new Error("invalid request");
    error.retryable = false;
    throw error;
  }, { maxAttempts: 3, baseDelayMs: 0 });

  assert.equal(run.result.status, "failed");
  assert.equal(calls, 1);
  assert.equal(run.result.attempts.length, 1);
  assert.equal(run.result.error.code, "RUNTIME_EXECUTION_FAILED");
});


test("rejects invalid runtime pipeline options", () => {
  assert.throws(() => runTaskPipeline("task", null, null), /retryOptions must be an object/);
  assert.throws(() => runTaskPipeline("task", null, []), /retryOptions must be an object/);
});
