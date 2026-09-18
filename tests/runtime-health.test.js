const test = require("node:test");
const assert = require("node:assert/strict");
const { assessRuntimeHealth } = require("../src/runtime-health");

test("marks an all-success runtime healthy", () => {
  assert.deepEqual(assessRuntimeHealth({ total: 4, failed: 0 }), {
    healthy: true, total: 4, failed: 0, successRate: 1
  });
});

test("handles failed stages", () => {
  assert.deepEqual(assessRuntimeHealth({ total: 4, failed: 1 }), {
    healthy: false, total: 4, failed: 1, successRate: 0.75
  });
});
