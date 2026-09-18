const test = require("node:test");
const assert = require("node:assert/strict");
const { dispatchExecution } = require("../src/execution-dispatcher");

test("dispatches authorized execution", async () => {
  const plan = { steps: [{ id: 3, action: "execute", status: "requires-tool" }] };
  const result = await dispatchExecution(plan, "hello", {
    name: "echo", capabilities: ["execute"], execute: input => input
  });
  assert.deepEqual(result, { status: "success", output: "hello", error: null });
});

test("returns a stable skipped result when authorization fails", async () => {
  const plan = { steps: [{ id: 3, action: "execute", status: "requires-tool" }] };
  const result = await dispatchExecution(plan, "hello", null);
  assert.deepEqual(result, { status: "skipped", output: null, error: "tool is required" });
});
