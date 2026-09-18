"use strict";

const { randomUUID } = require("node:crypto");

class RuntimeTrace {
  constructor(options = {}) {
    this.traceId = options.traceId || randomUUID();
    this.clock = typeof options.clock === "function" ? options.clock : () => new Date();
    this.spans = [];
    this.active = new Map();
  }

  startSpan(name, metadata = {}) {
    if (typeof name !== "string" || !name.trim()) throw new TypeError("span name must be non-empty");
    const spanId = randomUUID();
    const span = {
      spanId,
      traceId: this.traceId,
      name: name.trim(),
      startedAt: this.clock(),
      finishedAt: null,
      status: "running",
      metadata: { ...metadata },
      error: null,
    };
    this.active.set(spanId, span);
    return spanId;
  }

  finishSpan(spanId, status = "success", error = null) {
    const span = this.active.get(spanId);
    if (!span) throw new Error("span not found");
    if (!["success","failed","cancelled"].includes(status)) throw new TypeError("invalid span status");
    span.finishedAt = this.clock();
    span.status = status;
    span.error = error ? String(error) : null;
    this.active.delete(spanId);
    this.spans.push(Object.freeze({ ...span }));
    return this.spans[this.spans.length - 1];
  }

  failSpan(spanId, error) {
    return this.finishSpan(spanId, "failed", error);
  }

  annotate(spanId, metadata = {}) {
    const span = this.active.get(spanId);
    if (!span) throw new Error("span not found");
    Object.assign(span.metadata, metadata);
    return span;
  }

  get completedSpans() {
    return this.spans.slice();
  }

  summary() {
    const total = this.spans.length;
    const failed = this.spans.filter(span => span.status === "failed").length;
    const durations = this.spans.map(span => Math.max(0, new Date(span.finishedAt) - new Date(span.startedAt)));
    return {
      traceId: this.traceId,
      total,
      failed,
      active: this.active.size,
      successRate: total ? (total - failed) / total : 0,
      durationMs: durations.reduce((sum, value) => sum + value, 0),
    };
  }

  export() {
    return {
      traceId: this.traceId,
      spans: this.spans.map(span => ({
        ...span,
        startedAt: new Date(span.startedAt).toISOString(),
        finishedAt: span.finishedAt ? new Date(span.finishedAt).toISOString() : null,
      })),
    };
  }
}

module.exports = { RuntimeTrace };
