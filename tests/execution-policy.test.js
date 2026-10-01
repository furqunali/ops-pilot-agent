const test = require("node:test");
const assert = require("node:assert/strict");
const { authorizeExecution } = require("../src/execution-policy");

const plan = {
  steps: [
    { id: 1, action: "parse", status: "ready" },
    { id: 2, action: "plan", status: "ready" },
    { id: 3, action: "execute", status: "requires-tool" }
  ]
};

test("authorizes execution only when a tool is present", () => {
  assert.deepEqual(authorizeExecution(plan, { name: "echo" }), { allowed: true, reason: null });
  assert.deepEqual(authorizeExecution(plan, null), { allowed: false, reason: "tool is required" });
});

test("rejects plans without an execution step", () => {
  assert.deepEqual(authorizeExecution({ steps: [{ id: 1, action: "parse", status: "ready" }] }, {}), {
    allowed: false, reason: "execution step missing"
  });
});

test("execution authorization blocks retries when no tool is provided", () => {
  const { runTaskPipeline } = require("../src/runtime-pipeline");
  const run = runTaskPipeline("blocked task", null, { maxAttempts: 3 });
  assert.equal(run.result.status, "skipped");
  assert.equal(run.result.reason, "tool is required");
  assert.equal(run.observability.stages.find(stage => stage.stage === "execute").metadata.attempts, 0);
  assert.equal(run.observability.stages.find(stage => stage.stage === "execute").metadata.authorization.allowed, false);
});

test("execution authorization permits retry-enabled execution with a tool", () => {
  const { runTaskPipeline } = require("../src/runtime-pipeline");
  let calls = 0;
  const run = runTaskPipeline("authorized task", () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error("temporary");
      error.code = "ETIMEDOUT";
      throw error;
    }
    return "ok";
  }, { maxAttempts: 2, baseDelayMs: 0 });
  assert.equal(run.result.status, "success");
  assert.equal(calls, 2);
  assert.equal(run.observability.stages.find(stage => stage.stage === "execute").metadata.authorization.allowed, true);
});
