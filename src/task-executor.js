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
    const result = { status: "skipped", task, output: null };
    Object.defineProperty(result, "attempts", { value: [], enumerable: false });
    return result;
  }

  const runId = typeof retryOptions.runId === "string" && retryOptions.runId.trim() ? retryOptions.runId.trim() : null;
  const execution = executeWithRetrySync(() => tool(task), retryOptions);
  if (runId) execution.attempts = execution.attempts.map(attempt => ({ ...attempt, runId }));
  if (execution.error) {
    const result = { status: "failed", task, output: null, error: execution.error };
    Object.defineProperty(result, "attempts", { value: execution.attempts, enumerable: false });
    return result;
  }
  const result = { status: "success", task, output: execution.value };
  Object.defineProperty(result, "attempts", { value: execution.attempts, enumerable: false });
  return result;
}

module.exports = { executeTask };
