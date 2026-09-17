const test = require("node:test");
const assert = require("node:assert/strict");
const { failedResult } = require("../src/failed-result");

test("normalizes Error failures into a stable task result", () => {
  assert.deepEqual(failedResult("sync invoices", new Error("timeout")), {
    task: "sync invoices", status: "failed", output: null, error: "timeout"
  });
});
