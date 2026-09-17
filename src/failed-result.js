function failedResult(task, error) {
  if (typeof task !== "string" || !task.trim()) throw new TypeError("task must be a non-empty string");
  const message = error instanceof Error ? error.message : String(error);
  return { task: task.trim(), status: "failed", output: null, error: message };
}
module.exports = { failedResult };
