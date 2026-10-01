const test = require("node:test");
const assert = require("node:assert/strict");
const { ERROR_CODES, RuntimeError, createRuntimeError, normalizeExecutionError, withErrorContext } = require("../src/runtime-errors");

test("creates structured runtime errors with stable codes", () => {
  const error = createRuntimeError(ERROR_CODES.EXECUTION_FAILED, "tool failed", { runId: "run-1" });
  assert.ok(error instanceof RuntimeError);
  assert.equal(error.code, ERROR_CODES.EXECUTION_FAILED);
  assert.deepEqual(error.context, { runId: "run-1" });
});

test("rejects unknown runtime error codes", () => {
  assert.throws(() => createRuntimeError("BAD_CODE", "nope"), /known runtime error code/);
});

test("normalizes runtime and native errors consistently", () => {
  const runtime = createRuntimeError(ERROR_CODES.AUTHORIZATION_DENIED, "blocked");
  assert.equal(normalizeExecutionError(runtime).code, ERROR_CODES.AUTHORIZATION_DENIED);
  assert.deepEqual(normalizeExecutionError(new Error("boom"), { runId: "run-2" }), { name: "Error", code: "RUNTIME_UNCLASSIFIED", message: "boom", context: { runId: "run-2" } });
});

test("merges contextual metadata without mutating the original", () => {
  const error = createRuntimeError(ERROR_CODES.VERIFICATION_FAILED, "invalid output", { stage: "verify" });
  assert.deepEqual(withErrorContext(error, { runId: "run-3" }).context, { stage: "verify", runId: "run-3" });
  assert.deepEqual(error.context, { stage: "verify" });
});
