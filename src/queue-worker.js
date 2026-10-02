"use strict";

const { validateTool } = require("./tool-contract");
const { executeWithRetry } = require("./retry-policy");
const { TaskStateMachine } = require("./task-state-machine");

// QueueWorker drains a TaskQueue and drives each entry through the task
// lifecycle: created -> queued -> running -> succeeded|failed|cancelled. The
// tool call is wrapped in `executeWithRetry`, so transient (retryable) failures
// are retried in-process with exponential backoff before the entry is marked
// failed. Every start and completion is written to an ExecutionLedger when one
// is supplied, and an optional second-level `requeueOnFailure` puts a failed
// entry back on the queue (bounded) so a later drain can try again.
//
// This module only *composes* existing building blocks; it does not
// reimplement queueing, retry, the state machine, or the tool contract.

function extractInput(entry) {
  const task = entry && entry.task;
  const input = task && typeof task === "object" ? task.input : undefined;
  if (typeof input !== "string" || input.trim().length === 0) {
    return null;
  }
  return input.trim();
}

class QueueWorker {
  constructor(options = {}) {
    if (!options || typeof options !== "object") throw new TypeError("options must be an object");
    const { queue, tool, resolveTool, ledger, retry, requeueOnFailure, maxRequeues, onProcessed } = options;

    if (!queue || typeof queue.dequeue !== "function" || typeof queue.enqueue !== "function") {
      throw new TypeError("queue must be a TaskQueue-like object");
    }
    if (resolveTool !== undefined && typeof resolveTool !== "function") {
      throw new TypeError("resolveTool must be a function");
    }
    if (tool === undefined && resolveTool === undefined) {
      throw new TypeError("either tool or resolveTool is required");
    }
    if (ledger !== undefined && (typeof ledger.recordStart !== "function" || typeof ledger.recordCompletion !== "function")) {
      throw new TypeError("ledger must expose recordStart and recordCompletion");
    }
    if (onProcessed !== undefined && typeof onProcessed !== "function") {
      throw new TypeError("onProcessed must be a function");
    }
    if (maxRequeues !== undefined && (!Number.isInteger(maxRequeues) || maxRequeues < 0)) {
      throw new TypeError("maxRequeues must be a non-negative integer");
    }

    this.queue = queue;
    this.tool = tool;
    this.resolveTool = resolveTool || (() => this.tool);
    this.ledger = ledger || null;
    this.retry = retry && typeof retry === "object" ? { ...retry } : {};
    this.requeueOnFailure = Boolean(requeueOnFailure);
    this.maxRequeues = Number.isInteger(maxRequeues) ? maxRequeues : 1;
    this.onProcessed = onProcessed || null;
    this.stats = { processed: 0, succeeded: 0, failed: 0, skipped: 0, requeued: 0 };
  }

  // Resolve the tool for an entry and validate it against the tool contract.
  // Returns { tool } on success or { error } when no tool is available / the
  // tool is malformed, so the caller can turn that into a skipped/failed record
  // instead of throwing out of the drain loop.
  _resolveValidatedTool(entry) {
    let resolved;
    try {
      resolved = this.resolveTool(entry);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    if (!resolved) return { tool: null };
    try {
      validateTool(resolved);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    return { tool: resolved };
  }

  async _runTool(tool, input) {
    const outcome = await executeWithRetry(({ attempt }) => tool.execute(input, { attempt }), this.retry);
    const attempts = outcome.attempts.length;
    if (outcome.error) {
      return { status: "failed", output: null, error: outcome.error.message, attempts };
    }
    return { status: "success", output: outcome.value, error: null, attempts };
  }

  async _requeue(entry, priority) {
    const requeues = Number(entry.metadata && entry.metadata.requeues) || 0;
    if (!this.requeueOnFailure || requeues >= this.maxRequeues || this.queue.isClosed) {
      return false;
    }
    this.queue.enqueue(entry.task, priority, { ...entry.metadata, requeues: requeues + 1 });
    this.stats.requeued += 1;
    return true;
  }

  // Process a single already-dequeued entry through the lifecycle. Returns a
  // plain, serialisable record describing what happened.
  async processEntry(entry) {
    if (!entry || typeof entry !== "object") throw new TypeError("entry must be an object");
    const machine = new TaskStateMachine();
    machine.transition("queued", "dequeued");

    const priority = Number.isFinite(entry.priority) ? entry.priority : 0;
    const input = extractInput(entry);

    let record;
    if (input === null) {
      // Malformed task: never entered running, cancel rather than crash the drain.
      machine.transition("cancelled", "invalid-input");
      record = this._finish(entry, priority, {
        status: "failed",
        output: null,
        error: "task.input must be a non-empty string",
        attempts: 0,
      }, machine, false);
      return record;
    }

    const { tool, error: toolError } = this._resolveValidatedTool(entry);

    if (toolError) {
      machine.transition("cancelled", "tool-error");
      return this._finish(entry, priority, { status: "failed", output: null, error: toolError, attempts: 0 }, machine, false);
    }
    if (!tool) {
      machine.transition("cancelled", "no-tool");
      return this._finish(entry, priority, { status: "skipped", output: null, error: null, attempts: 0 }, machine, false);
    }

    machine.transition("running", "execute");
    if (this.ledger) this.ledger.recordStart(input, { entryId: entry.id, priority });

    const outcome = await this._runTool(tool, input);

    let requeued = false;
    if (outcome.status === "success") {
      machine.transition("succeeded", "tool-success");
    } else {
      machine.transition("failed", "tool-failed");
      requeued = await this._requeue(entry, priority);
    }

    return this._finish(entry, priority, outcome, machine, requeued);
  }

  _finish(entry, priority, outcome, machine, requeued) {
    const input = extractInput(entry);
    if (this.ledger) {
      this.ledger.recordCompletion(input, { status: outcome.status, output: outcome.output, error: outcome.error }, {
        entryId: entry.id,
        priority,
        attempts: outcome.attempts,
        requeued,
      });
    }

    this.stats.processed += 1;
    if (outcome.status === "success") this.stats.succeeded += 1;
    else if (outcome.status === "skipped") this.stats.skipped += 1;
    else this.stats.failed += 1;

    const record = {
      entryId: entry.id,
      input,
      priority,
      status: outcome.status,
      output: outcome.output,
      error: outcome.error,
      attempts: outcome.attempts,
      state: machine.state,
      requeued,
    };
    if (this.onProcessed) this.onProcessed(record);
    return record;
  }

  // Dequeue and process the next entry. Returns the record, or null when the
  // queue is empty.
  async processNext() {
    const entry = this.queue.dequeue();
    if (!entry) return null;
    return this.processEntry(entry);
  }

  // Drain the queue until it is empty or `max` entries have been processed.
  // Re-enqueued failures are picked up again within the same drain, bounded by
  // `maxRequeues`, so the loop always terminates.
  async run({ max = Infinity } = {}) {
    if (!(max === Infinity || (Number.isInteger(max) && max >= 0))) {
      throw new TypeError("max must be a non-negative integer or Infinity");
    }
    const records = [];
    while (records.length < max) {
      const record = await this.processNext();
      if (record === null) break;
      records.push(record);
    }
    return records;
  }
}

module.exports = { QueueWorker };
