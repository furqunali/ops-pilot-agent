const test = require("node:test");
const assert = require("node:assert/strict");
const { executeWithTool } = require("../src/tool-executor");

test("normalizes successful tool execution", async () => {
  const result = await executeWithTool(
    { name: "echo", capabilities: ["read"], execute: input => input.toUpperCase() },
    "hello"
  );
  assert.deepEqual(result, { status: "success", output: "HELLO", error: null });
});

test("normalizes execution failures", async () => {
  const result = await executeWithTool(
    { name: "broken", capabilities: ["execute"], execute: () => { throw new Error("timeout"); } },
    "hello"
  );
  assert.deepEqual(result, { status: "failed", output: null, error: "timeout" });
});
