"use strict";

class EventBus {
  constructor() {
    this.handlers = new Map();
    this.history = [];
  }

  on(eventName, handler) {
    this.#validateName(eventName);
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    if (!this.handlers.has(eventName)) this.handlers.set(eventName, new Set());
    this.handlers.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  }

  once(eventName, handler) {
    const unsubscribe = this.on(eventName, payload => {
      unsubscribe();
      return handler(payload);
    });
    return unsubscribe;
  }

  off(eventName, handler) {
    const set = this.handlers.get(eventName);
    if (!set) return false;
    const removed = set.delete(handler);
    if (set.size === 0) this.handlers.delete(eventName);
    return removed;
  }

  async emit(eventName, payload = null, options = {}) {
    this.#validateName(eventName);
    const record = {
      eventName,
      payload,
      timestamp: new Date(),
      correlationId: options.correlationId || null,
    };
    this.history.push(record);
    const handlers = [...(this.handlers.get(eventName) || [])];
    const results = [];
    for (const handler of handlers) {
      results.push(await handler(payload, record));
    }
    return results;
  }

  listenerCount(eventName) {
    return this.handlers.has(eventName) ? this.handlers.get(eventName).size : 0;
  }

  eventsSince(timestamp) {
    const since = new Date(timestamp).getTime();
    return this.history.filter(item => item.timestamp.getTime() >= since);
  }

  clearHistory() {
    const count = this.history.length;
    this.history = [];
    return count;
  }

  #validateName(eventName) {
    if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("eventName must be non-empty");
  }
}

module.exports = { EventBus };
