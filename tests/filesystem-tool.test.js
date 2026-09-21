"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const {
  VALID_OPERATIONS,
  resolveWithinRoot,
  createFilesystemTool,
  registerFilesystemTool,
} = require("../src/tools/filesystem-tool");
const { validateTool } = require("../src/tool-contract");
const { ToolRegistry } = require("../src/tool-registry");
const { executeWithTool } = require("../src/tool-executor");

async function makeSandbox() {
  return fs.mkdtemp(path.join(os.tmpdir(), "fs-tool-"));
}

test("produces a tool that satisfies the tool contract", async () => {
  const root = await makeSandbox();
  const tool = createFilesystemTool({ root });
  assert.equal(validateTool(tool), true);
  assert.equal(tool.name, "filesystem");
  assert.deepEqual(tool.capabilities, ["read", "write"]);
});

test("writes then reads a file within the sandbox", async () => {
  const root = await makeSandbox();
  const tool = createFilesystemTool({ root });

  const writeResult = await tool.execute(JSON.stringify({ op: "write", path: "notes/todo.txt", content: "buy milk" }));
  assert.equal(writeResult.bytesWritten, 8);
  assert.equal(writeResult.path, path.join(root, "notes", "todo.txt"));

  const readResult = await tool.execute(JSON.stringify({ op: "read", path: "notes/todo.txt" }));
  assert.equal(readResult, "buy milk");
});

test("lists directory entries sorted with type info", async () => {
  const root = await makeSandbox();
  const tool = createFilesystemTool({ root });
  await tool.execute(JSON.stringify({ op: "write", path: "b.txt", content: "b" }));
  await tool.execute(JSON.stringify({ op: "write", path: "a.txt", content: "a" }));
  await fs.mkdir(path.join(root, "sub"));

  const listing = await tool.execute(JSON.stringify({ op: "list", path: "." }));
  assert.deepEqual(listing, [
    { name: "a.txt", type: "file" },
    { name: "b.txt", type: "file" },
    { name: "sub", type: "directory" },
  ]);
});

test("integrates with the tool executor normalization", async () => {
  const root = await makeSandbox();
  const tool = createFilesystemTool({ root });
  await tool.execute(JSON.stringify({ op: "write", path: "greet.txt", content: "hi" }));

  const result = await executeWithTool(tool, JSON.stringify({ op: "read", path: "greet.txt" }));
  assert.deepEqual(result, { status: "success", output: "hi", error: null });
});

test("registers against a ToolRegistry", async () => {
  const root = await makeSandbox();
  const registry = new ToolRegistry();
  const tool = registerFilesystemTool(registry, { root });
  assert.equal(registry.get("filesystem"), tool);
  assert.deepEqual(registry.list(), [{ name: "filesystem", capabilities: ["read", "write"] }]);
});

test("blocks parent-directory traversal", async () => {
  const root = await makeSandbox();
  const tool = createFilesystemTool({ root });
  await assert.rejects(
    tool.execute(JSON.stringify({ op: "read", path: "../../etc/passwd" })),
    /escapes sandbox root/
  );
});

test("blocks absolute-path re-rooting", async () => {
  const root = await makeSandbox();
  const tool = createFilesystemTool({ root });
  const outside = path.join(os.tmpdir(), "definitely-outside.txt");
  await assert.rejects(
    tool.execute(JSON.stringify({ op: "write", path: outside, content: "x" })),
    /escapes sandbox root/
  );
});

test("blocks null-byte injection in paths", async () => {
  const root = await makeSandbox();
  const tool = createFilesystemTool({ root });
  await assert.rejects(
    tool.execute(JSON.stringify({ op: "read", path: "ok" + String.fromCharCode(0) + ".txt" })),
    /null bytes/
  );
});

test("allows nested paths that stay inside the sandbox", () => {
  const root = path.resolve(os.tmpdir(), "sandbox-root");
  const resolved = resolveWithinRoot(root, "a/b/../c/d.txt");
  assert.equal(resolved, path.join(root, "a", "c", "d.txt"));
});

test("rejects unknown operations and malformed input", async () => {
  const root = await makeSandbox();
  const tool = createFilesystemTool({ root });
  await assert.rejects(tool.execute(JSON.stringify({ op: "delete", path: "x" })), /op must be one of/);
  await assert.rejects(tool.execute("not json"), /must be a JSON command object/);
  assert.deepEqual(VALID_OPERATIONS, ["read", "list", "write"]);
});

test("requires a sandbox root", () => {
  assert.throws(() => createFilesystemTool({}), /options.root must be a non-empty string/);
});

test("write rejects non-string content", async () => {
  const root = await makeSandbox();
  const tool = createFilesystemTool({ root });
  await assert.rejects(
    tool.execute(JSON.stringify({ op: "write", path: "f.txt", content: 42 })),
    /write requires string content/
  );
});
