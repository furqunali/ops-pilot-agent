const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeExecutionError } = require("../src/runtime-errors");

test("normalizes Error instances", () => {
  assert.deepEqual(normalizeExecutionError(new Error("tool failed")), {
    name: "Error",
    message: "tool failed",
  });
});

test("normalizes non-Error failures", () => {
  assert.deepEqual(normalizeExecutionError("tool failed"), {
    name: "UnknownError",
    message: "tool failed",
  });
});
