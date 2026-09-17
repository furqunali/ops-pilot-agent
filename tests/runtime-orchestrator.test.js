const test = require("node:test");
const assert = require("node:assert/strict");
const { runTask } = require("../src/runtime-orchestrator");

test("orchestrates a task through planning and skipped execution", () => {
  const result = runTask("sync reports");
  assert.equal(result.task.input, "sync reports");
  assert.equal(result.plan.steps.length, 5);
  assert.equal(result.result.status, "skipped");
  assert.equal(result.verification.valid, true);
});

test("orchestrates a task with a pluggable tool", () => {
  const result = runTask("sync reports", (task) => `completed: ${task}`);
  assert.equal(result.result.status, "success");
  assert.equal(result.result.output, "completed: sync reports");
  assert.equal(result.verification.valid, true);
});
