const test = require("node:test");
const assert = require("node:assert/strict");
const { authorizeExecution } = require("../src/execution-policy");

const plan = {
  steps: [
    { id: 1, action: "parse", status: "ready" },
    { id: 2, action: "plan", status: "ready" },
    { id: 3, action: "execute", status: "requires-tool" }
  ]
};

test("authorizes execution only when a tool is present", () => {
  assert.deepEqual(authorizeExecution(plan, { name: "echo" }), { allowed: true, reason: null });
  assert.deepEqual(authorizeExecution(plan, null), { allowed: false, reason: "tool is required" });
});

test("rejects plans without an execution step", () => {
  assert.deepEqual(authorizeExecution({ steps: [{ id: 1, action: "parse", status: "ready" }] }, {}), {
    allowed: false, reason: "execution step missing"
  });
});
