const test = require("node:test");
const assert = require("node:assert/strict");
const { validateTool } = require("../src/tool-contract");

test("accepts a valid tool contract", () => {
  assert.equal(validateTool({
    name: "reader", capabilities: ["read"], execute: () => "ok"
  }), true);
});

test("rejects unknown capabilities", () => {
  assert.throws(() => validateTool({
    name: "bad", capabilities: ["deploy"], execute: () => "no"
  }), /capability is invalid/);
});
