"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  transform,
  createTransformTool,
  registerTransformTool,
  validateSpec,
} = require("../src/tools/transform-tool");
const { ToolRegistry } = require("../src/tool-registry");
const { executeWithTool } = require("../src/tool-executor");

test("renames keys in place and leaves others untouched", () => {
  const out = transform(
    { vendor_name: "Acme", amt: 42, note: "ok" },
    { rename: { vendor_name: "vendor", amt: "amount" } }
  );
  assert.deepEqual(out, { vendor: "Acme", amount: 42, note: "ok" });
});

test("field map projects into a new record with only mapped keys", () => {
  const out = transform(
    { first: "Ada", last: "Lovelace", internal_id: 7 },
    { map: { name: "first", surname: "last" } }
  );
  assert.deepEqual(out, { name: "Ada", surname: "Lovelace" });
});

test("map reads keys produced by an earlier rename", () => {
  const out = transform(
    { vendor_name: "Acme", raw_total: 10 },
    { rename: { vendor_name: "vendor" }, map: { supplier: "vendor", total: "raw_total" } }
  );
  assert.deepEqual(out, { supplier: "Acme", total: 10 });
});

test("filters array records by an object predicate", () => {
  const out = transform(
    [
      { id: 1, status: "active" },
      { id: 2, status: "archived" },
      { id: 3, status: "active" },
    ],
    { filter: { status: "active" } }
  );
  assert.deepEqual(out, [
    { id: 1, status: "active" },
    { id: 3, status: "active" },
  ]);
});

test("filters array records by a predicate function", () => {
  const out = transform(
    [{ amount: 5 }, { amount: 50 }, { amount: 500 }],
    { filter: record => record.amount >= 50 }
  );
  assert.deepEqual(out, [{ amount: 50 }, { amount: 500 }]);
});

test("redacts sensitive fields via the data-redaction module", () => {
  const out = transform(
    { user: "ada", api_key: "sk-live-123", password: "hunter2", role: "admin" },
    { redact: true }
  );
  assert.deepEqual(out, {
    user: "ada",
    api_key: "[REDACTED]",
    password: "[REDACTED]",
    role: "admin",
  });
});

test("redact honours custom keys and replacement", () => {
  const out = transform(
    { ssn: "111-22-3333", name: "ada" },
    { redact: { keys: ["ssn"], replacement: "***" } }
  );
  assert.deepEqual(out, { ssn: "***", name: "ada" });
});

test("composes filter -> rename -> map -> redact over an array", () => {
  const out = transform(
    [
      { vendor_name: "Acme", active: true, secret: "s1", raw_total: 100 },
      { vendor_name: "Beta", active: false, secret: "s2", raw_total: 200 },
    ],
    {
      filter: { active: true },
      rename: { vendor_name: "vendor" },
      map: { vendor: "vendor", total: "raw_total", secret: "secret" },
      redact: true,
    }
  );
  assert.deepEqual(out, [{ vendor: "Acme", total: 100, secret: "[REDACTED]" }]);
});

test("single object input yields a single object output", () => {
  const out = transform({ a: 1, b: 2 }, { map: { a: "a" } });
  assert.deepEqual(out, { a: 1 });
});

test("normalizes output into a JSON-safe shape (undefined -> null)", () => {
  const out = transform({ a: 1, b: undefined }, { rename: { a: "id" } });
  assert.deepEqual(out, { id: 1, b: null });
});

test("createTransformTool returns a tool-contract compliant tool", () => {
  const tool = createTransformTool({ name: "vendor-normalize", rename: { vendor_name: "vendor" } });
  assert.equal(tool.name, "vendor-normalize");
  assert.deepEqual(tool.capabilities, ["read"]);
  assert.equal(typeof tool.execute, "function");
});

test("tool defaults its name to 'transform'", () => {
  assert.equal(createTransformTool({}).name, "transform");
});

test("tool executes a JSON string payload through the tool-executor", async () => {
  const tool = createTransformTool({ map: { name: "first" }, redact: true });
  const payload = JSON.stringify({ first: "Ada", token: "abc", extra: 1 });
  const result = await executeWithTool(tool, payload);
  assert.deepEqual(result, { status: "success", output: { name: "Ada" }, error: null });
});

test("registers into a ToolRegistry and is retrievable", () => {
  const registry = new ToolRegistry();
  const tool = registerTransformTool(registry, { name: "tidy", rename: { a: "b" } });
  assert.equal(tool.name, "tidy");
  assert.equal(registry.get("tidy").name, "tidy");
  assert.deepEqual(registry.list(), [{ name: "tidy", capabilities: ["read"] }]);
});

test("registerTransformTool rejects an invalid registry", () => {
  assert.throws(() => registerTransformTool({}, {}), /register\(tool\) method/);
});

test("validateSpec rejects malformed specs", () => {
  assert.throws(() => validateSpec(null), /spec must be an object/);
  assert.throws(() => validateSpec({ rename: { a: "" } }), /non-empty string/);
  assert.throws(() => validateSpec({ map: { a: 5 } }), /non-empty string/);
  assert.throws(() => validateSpec({ filter: 7 }), /function or an object/);
  assert.throws(() => validateSpec({ redact: "yes" }), /boolean or an options object/);
});

test("transform rejects non-object records", () => {
  assert.throws(() => transform(42, {}), /object or an array/);
  assert.throws(() => transform([1, 2], {}), /each record must be a plain object/);
});
