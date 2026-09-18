const { validateTool } = require("./tool-contract");

class ToolRegistry {
  constructor(tools = []) {
    this.tools = new Map();
    for (const tool of tools) this.register(tool);
  }

  register(tool) {
    validateTool(tool);
    if (this.tools.has(tool.name)) throw new Error("tool already registered");
    this.tools.set(tool.name, tool);
    return tool.name;
  }

  get(name) {
    return this.tools.get(name) ?? null;
  }

  list() {
    return Array.from(this.tools.values()).map(({ name, capabilities }) => ({
      name,
      capabilities: [...capabilities],
    }));
  }
}

module.exports = { ToolRegistry };
