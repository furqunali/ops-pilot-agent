class TaskResult {
  constructor({ task, status, output = null, error = null }) {
    if (!task || typeof task !== "string") {
      throw new TypeError("task must be a non-empty string");
    }
    if (!["success", "failed", "skipped"].includes(status)) {
      throw new TypeError("status must be success, failed, or skipped");
    }
    if (error !== null && typeof error !== "string") {
      throw new TypeError("error must be a string or null");
    }
    this.task = task;
    this.status = status;
    this.output = output;
    this.error = error;
  }

  isSuccessful() {
    return this.status === "success";
  }

  toJSON() {
    return {
      task: this.task,
      status: this.status,
      output: this.output,
      error: this.error,
    };
  }
}

module.exports = { TaskResult };
