"use strict";

class TaskQueue {
  constructor(options = {}) {
    const maxDepth = Number.isInteger(options.maxDepth) && options.maxDepth > 0 ? options.maxDepth : 100;
    this.maxDepth = maxDepth;
    this.items = [];
    this.closed = false;
    this.sequence = 0;
  }

  get size() { return this.items.length; }
  get isEmpty() { return this.items.length === 0; }
  get isClosed() { return this.closed; }

  enqueue(task, priority = 0, metadata = {}) {
    if (this.closed) throw new Error("queue is closed");
    if (!task || typeof task !== "object") throw new TypeError("task must be an object");
    if (this.items.length >= this.maxDepth) throw new Error("queue capacity exceeded");
    if (!Number.isFinite(priority)) throw new TypeError("priority must be numeric");
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new TypeError("metadata must be an object");
    }

    const entry = {
      id: ++this.sequence,
      task,
      priority,
      metadata: { ...metadata },
      enqueuedAt: new Date(),
    };
    this.items.push(entry);
    this.items.sort((a, b) => b.priority - a.priority || a.id - b.id);
    return entry;
  }

  dequeue() {
    return this.items.shift() || null;
  }

  peek() {
    return this.items[0] || null;
  }

  removeById(id) {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) return null;
    return this.items.splice(index, 1)[0];
  }

  clear() {
    const removed = this.items.splice(0);
    return removed;
  }

  close() {
    this.closed = true;
    return this;
  }

  reopen() {
    this.closed = false;
    return this;
  }

  snapshot() {
    return {
      size: this.size,
      maxDepth: this.maxDepth,
      closed: this.closed,
      items: this.items.map(item => ({
        id: item.id,
        priority: item.priority,
        task: item.task,
        metadata: { ...item.metadata },
        enqueuedAt: item.enqueuedAt.toISOString(),
      })),
    };
  }

  restore(snapshot) {
    if (!snapshot || typeof snapshot !== "object") throw new TypeError("snapshot is required");
    if (!Array.isArray(snapshot.items)) throw new TypeError("snapshot.items must be an array");
    if (snapshot.items.length > this.maxDepth) throw new Error("snapshot exceeds queue capacity");
    this.items = snapshot.items.map(item => ({
      ...item,
      enqueuedAt: new Date(item.enqueuedAt),
      metadata: { ...(item.metadata || {}) },
    }));
    this.closed = Boolean(snapshot.closed);
    this.sequence = this.items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    return this;
  }
}

function drainQueue(queue, handler, limit = Infinity) {
  if (!queue || typeof queue.dequeue !== "function") throw new TypeError("queue is required");
  if (typeof handler !== "function") throw new TypeError("handler must be a function");
  const results = [];
  let processed = 0;
  while (processed < limit) {
    const entry = queue.dequeue();
    if (!entry) break;
    results.push(handler(entry));
    processed += 1;
  }
  return results;
}

module.exports = { TaskQueue, drainQueue };
