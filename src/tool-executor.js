const { validateTool } = require("./tool-contract");

async function executeWithTool(tool, input) {
  validateTool(tool);
  if (typeof input !== "string" || !input.trim()) throw new TypeError("input must be non-empty");
  try {
    const output = await tool.execute(input.trim());
    return { status: "success", output, error: null };
  } catch (error) {
    return {
      status: "failed",
      output: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

module.exports = { executeWithTool };
