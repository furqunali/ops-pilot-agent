const VALID_CAPABILITIES = new Set(["read","write","execute"]);

function validateTool(tool) {
  if (!tool || typeof tool !== "object") throw new TypeError("tool must be an object");
  if (typeof tool.name !== "string" || !tool.name.trim()) throw new TypeError("tool.name must be non-empty");
  if (typeof tool.execute !== "function") throw new TypeError("tool.execute must be a function");
  if (!Array.isArray(tool.capabilities) || tool.capabilities.length === 0) {
    throw new TypeError("tool.capabilities must be a non-empty array");
  }
  for (const capability of tool.capabilities) {
    if (!VALID_CAPABILITIES.has(capability)) throw new TypeError("tool capability is invalid");
  }
  return true;
}

module.exports = { VALID_CAPABILITIES, validateTool };
