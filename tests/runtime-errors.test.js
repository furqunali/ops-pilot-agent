const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeExecutionError, withErrorContext } = require("../src/runtime-errors");

test("normalizes empty Error messages safely", () => {
  assert.deepEqual(normalizeExecutionError(new Error()), { name: "Error", message: "Unknown error" });
});

test("adds structured execution context", () => {
  assert.deepEqual(withErrorContext(new Error("timeout"), { stage: "execute", taskId: "t-1" }), {
    name: "Error", message: "timeout", context: { stage: "execute", taskId: "t-1" }
  });
});
