function buildTaskReport(task, result) {
  if (!task || typeof task.name !== "string" || !task.name.trim()) {
    throw new TypeError("task.name must be a non-empty string");
  }
  if (!result || typeof result.status !== "string") {
    throw new TypeError("result.status must be a string");
  }
  return { task: task.name, status: result.status, output: result.output ?? null, error: result.error ?? null };
}

module.exports = { buildTaskReport };
