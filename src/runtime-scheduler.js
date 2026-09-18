"use strict";

class RuntimeScheduler {
  constructor(options = {}) {
    this.clock = typeof options.clock === "function" ? options.clock : () => Date.now();
    this.jobs = new Map();
    this.sequence = 0;
  }

  schedule(task, runAt, metadata = {}) {
    if (!task || typeof task !== "object") throw new TypeError("task must be an object");
    const timestamp = new Date(runAt).getTime();
    if (!Number.isFinite(timestamp)) throw new TypeError("runAt must be a valid date");
    const id = `job-${++this.sequence}`;
    const job = {
      id,
      task,
      runAt: new Date(timestamp),
      metadata: { ...metadata },
      status: "scheduled",
      createdAt: new Date(this.clock()),
    };
    this.jobs.set(id, job);
    return { ...job };
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (job.status === "running") throw new Error("running jobs cannot be cancelled");
    job.status = "cancelled";
    return { ...job };
  }

  due(now = this.clock()) {
    const timestamp = new Date(now).getTime();
    return [...this.jobs.values()]
      .filter(job => job.status === "scheduled" && job.runAt.getTime() <= timestamp)
      .sort((a, b) => a.runAt - b.runAt || a.id.localeCompare(b.id));
  }

  markRunning(id) {
    const job = this.jobs.get(id);
    if (!job) throw new Error("job not found");
    if (job.status !== "scheduled") throw new Error("job is not scheduled");
    job.status = "running";
    job.startedAt = new Date(this.clock());
    return { ...job };
  }

  markComplete(id, status = "succeeded", error = null) {
    const job = this.jobs.get(id);
    if (!job) throw new Error("job not found");
    if (!["succeeded","failed"].includes(status)) throw new TypeError("invalid completion status");
    job.status = status;
    job.error = error;
    job.finishedAt = new Date(this.clock());
    return { ...job };
  }

  removeFinished() {
    let removed = 0;
    for (const [id, job] of this.jobs) {
      if (["succeeded","failed","cancelled"].includes(job.status)) {
        this.jobs.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  snapshot() {
    return [...this.jobs.values()].map(job => ({
      ...job,
      runAt: job.runAt.toISOString(),
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    }));
  }
}

module.exports = { RuntimeScheduler };
