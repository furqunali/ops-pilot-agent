"use strict";

class ExecutionLedger {
  constructor(options = {}) {
    const maxEntries = Number.isInteger(options.maxEntries) && options.maxEntries > 0 ? options.maxEntries : 1000;
    this.maxEntries = maxEntries;
    this.entries = [];
    this.sequence = 0;
  }

  append(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError("entry must be an object");
    const record = Object.freeze({
      id: ++this.sequence,
      timestamp: new Date(),
      ...entry,
    });
    this.entries.push(record);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    return record;
  }

  recordStart(task, metadata = {}) {
    return this.append({ type: "start", task, status: "running", metadata: { ...metadata } });
  }

  recordCompletion(task, result, metadata = {}) {
    return this.append({
      type: "completion",
      task,
      status: result && result.status ? result.status : "unknown",
      result: result ? { ...result } : null,
      metadata: { ...metadata },
    });
  }

  recordHealth(health) {
    return this.append({ type: "health", health: { ...health } });
  }

  findByTask(task) {
    return this.entries.filter(entry => entry.task === task);
  }

  findByType(type) {
    return this.entries.filter(entry => entry.type === type);
  }

  latest() {
    return this.entries[this.entries.length - 1] || null;
  }

  summarize() {
    const completions = this.findByType("completion");
    const successful = completions.filter(item => item.status === "success").length;
    const failed = completions.filter(item => item.status === "failed").length;
    const skipped = completions.filter(item => item.status === "skipped").length;
    return {
      total: completions.length,
      successful,
      failed,
      skipped,
      successRate: completions.length ? successful / completions.length : 0,
      retainedEntries: this.entries.length,
    };
  }

  export() {
    return this.entries.map(entry => ({
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    }));
  }

  import(records) {
    if (!Array.isArray(records)) throw new TypeError("records must be an array");
    this.entries = records.slice(-this.maxEntries).map(record => ({
      ...record,
      timestamp: new Date(record.timestamp),
    }));
    this.sequence = this.entries.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    return this;
  }
}

function compareLedgerEntries(a, b) {
  const left = new Date(a.timestamp).getTime();
  const right = new Date(b.timestamp).getTime();
  return left - right || Number(a.id) - Number(b.id);
}

module.exports = { ExecutionLedger, compareLedgerEntries };
