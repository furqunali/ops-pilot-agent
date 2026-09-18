const test = require("node:test");
const assert = require("node:assert/strict");
const { ToolRegistry } = require("../src/tool-registry");

test("registers and lists validated tools", () => {
  const registry = new ToolRegistry();
  registry.register({ name: "echo", capabilities: ["read"], execute: input => input });
  assert.deepEqual(registry.list(), [{ name: "echo", capabilities: ["read"] }]);
  assert.equal(registry.get("echo").name, "echo");
});

test("rejects duplicate tool names", () => {
  const tool = { name: "echo", capabilities: ["read"], execute: () => "ok" };
  const registry = new ToolRegistry([tool]);
  assert.throws(() => registry.register(tool), /already registered/);
});
