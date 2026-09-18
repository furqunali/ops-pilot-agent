const test = require("node:test");
const assert = require("node:assert/strict");
const { TaskResult } = require("../src/task-result");

test("serializes a successful task result", () => {
  const result = new TaskResult({ task: "sync invoices", status: "success", output: "ok" });
  assert.deepEqual(result.toJSON(), {
    task: "sync invoices", status: "success", output: "ok", error: null
  });
});

test("rejects unsupported result status", () => {
  assert.throws(() => new TaskResult({ task: "x", status: "unknown" }), /status must be/);
});
