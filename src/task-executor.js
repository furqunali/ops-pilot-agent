function executeTask(task, tool = null) {
  if (!task || typeof task !== "string" || !task.trim()) {
    throw new TypeError("task must be a non-empty string");
  }
  if (tool !== null && typeof tool !== "function") {
    throw new TypeError("tool must be a function or null");
  }
  if (tool === null) {
    return { status: "skipped", task, output: null };
  }
  return { status: "success", task, output: tool(task) };
}

module.exports = { executeTask };
