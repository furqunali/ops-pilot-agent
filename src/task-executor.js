"use strict";

const { executeWithRetrySync } = require("./retry-policy");

function executeTask(task, tool = null, retryOptions = {}) {
  if (!task || typeof task !== "string" || !task.trim()) {
    throw new TypeError("task must be a non-empty string");
  }
  if (tool !== null && typeof tool !== "function") {
    throw new TypeError("tool must be a function or null");
  }
  if (tool === null) {
    return { status: "skipped", task, output: null, attempts: [] };
  }

  const execution = executeWithRetrySync(() => tool(task), retryOptions);
  if (execution.error) {
    return { status: "failed", task, output: null, error: execution.error, attempts: execution.attempts };
  }
  return { status: "success", task, output: execution.value, attempts: execution.attempts };
}

module.exports = { executeTask };
