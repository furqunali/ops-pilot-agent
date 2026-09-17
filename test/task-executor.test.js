const test = require("node:test");
const assert = require("node:assert/strict");
const { executeTask } = require("../src/task-executor");

test("execution without a tool is explicitly skipped", () => {
  assert.deepEqual(executeTask("sync reports"), {
    status: "skipped",
    task: "sync reports",
    output: null,
  });
});

test("execution delegates to a supplied tool", () => {
  assert.deepEqual(executeTask("sync reports", (task) => `completed: ${task}`), {
    status: "success",
    task: "sync reports",
    output: "completed: sync reports",
  });
});
