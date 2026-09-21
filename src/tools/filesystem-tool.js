"use strict";

const path = require("path");
const fsPromises = require("fs/promises");

const VALID_OPERATIONS = Object.freeze(["read", "list", "write"]);

// Resolve `target` against the sandbox root and guarantee the result never
// escapes it. Handles `..` traversal, absolute re-rooting and NUL injection
// on both POSIX and Windows (path.* is platform-aware).
function resolveWithinRoot(root, target) {
  if (typeof target !== "string" || !target.trim()) {
    throw new TypeError("path must be a non-empty string");
  }
  if (target.includes("\0")) throw new Error("path must not contain null bytes");

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, target);
  const relative = path.relative(resolvedRoot, resolved);

  // relative === "" means the path is the root itself, which is allowed.
  if (relative !== "" && (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative))) {
    throw new Error("path escapes sandbox root");
  }
  return resolved;
}

function parseCommand(input) {
  let command;
  try {
    command = JSON.parse(input);
  } catch {
    throw new TypeError("input must be a JSON command object");
  }
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    throw new TypeError("input must be a JSON command object");
  }
  if (!VALID_OPERATIONS.includes(command.op)) {
    throw new TypeError(`op must be one of ${VALID_OPERATIONS.join(", ")}`);
  }
  return command;
}

// Factory producing a tool that conforms to tool-contract.js. All I/O is
// confined to `root`; `fs` is injectable for testing.
function createFilesystemTool(options = {}) {
  const { root, fs = fsPromises, encoding = "utf8" } = options;
  if (typeof root !== "string" || !root.trim()) {
    throw new TypeError("options.root must be a non-empty string");
  }
  const sandboxRoot = path.resolve(root);

  async function execute(input) {
    const command = parseCommand(input);
    const targetPath = resolveWithinRoot(sandboxRoot, command.path);

    switch (command.op) {
      case "read": {
        const content = await fs.readFile(targetPath, encoding);
        return content;
      }
      case "list": {
        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        return entries
          .map(entry => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
      case "write": {
        if (typeof command.content !== "string") {
          throw new TypeError("write requires string content");
        }
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, command.content, encoding);
        return { path: targetPath, bytesWritten: Buffer.byteLength(command.content, encoding) };
      }
      default:
        // Unreachable: parseCommand already rejects unknown ops.
        throw new TypeError(`unsupported op: ${command.op}`);
    }
  }

  return {
    name: "filesystem",
    capabilities: ["read", "write"],
    root: sandboxRoot,
    execute,
  };
}

// Convenience registration against a ToolRegistry instance.
function registerFilesystemTool(registry, options) {
  if (!registry || typeof registry.register !== "function") {
    throw new TypeError("registry must expose a register(tool) method");
  }
  const tool = createFilesystemTool(options);
  registry.register(tool);
  return tool;
}

module.exports = {
  VALID_OPERATIONS,
  resolveWithinRoot,
  createFilesystemTool,
  registerFilesystemTool,
};
