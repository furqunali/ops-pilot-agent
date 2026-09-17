const test = require("node:test");
const assert = require("node:assert/strict");
const { TaskResult } = require("../src/task-result");
const { verifyResult } = require("../src/task-verifier");

test("TaskResult serializes a successful result", () => {
  const result = new TaskResult({ task: "backup reports", status: "success", output: "done" });
  assert.equal(result.isSuccessful(), true);
  assert.deepEqual(result.toJSON(), {
    task: "backup reports",
    status: "success",
    output: "done",
    error: null,
  });
});

test("verifyResult rejects incomplete results", () => {
  assert.deepEqual(verifyResult({ task: "", status: "unknown" }), {
    valid: false,
    checks: { taskPresent: false, statusValid: false },
  });
});
