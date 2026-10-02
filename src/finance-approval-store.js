"use strict";

class FinanceApprovalStore {
  constructor(records = []) {
    this.records = new Map();
    if (!Array.isArray(records)) throw new TypeError("records must be an array");
    records.forEach(record => this.save(record));
  }

  save(request) {
    if (!request || typeof request !== "object" || typeof request.id !== "string" || !request.id.trim()) {
      throw new TypeError("approval request must have a non-empty id");
    }
    if (!request.status) throw new TypeError("approval request must have a status");
    const record = Object.freeze({ ...request, id: request.id.trim() });
    this.records.set(record.id, record);
    return record;
  }

  get(id) { return this.records.get(id) || null; }

  pending() { return [...this.records.values()].filter(record => record.status === "pending"); }

  resolve(id, decision, reviewer, resolvedAt = new Date()) {
    const request = this.get(id);
    if (!request) throw new TypeError("approval request not found");
    if (request.status !== "pending") throw new TypeError("approval request must be pending");
    if (decision !== "approved" && decision !== "rejected") throw new TypeError("decision must be approved or rejected");
    if (typeof reviewer !== "string" || !reviewer.trim()) throw new TypeError("reviewer must be a non-empty string");
    if (!(resolvedAt instanceof Date) || Number.isNaN(resolvedAt.getTime())) throw new TypeError("resolvedAt must be a valid Date");
    return this.save({ ...request, status: decision, reviewer: reviewer.trim(), resolvedAt: resolvedAt.toISOString() });
  }

  export() { return [...this.records.values()]; }

  import(records) {
    if (!Array.isArray(records)) throw new TypeError("records must be an array");
    records.forEach(record => this.save(record));
    return this;
  }
}

module.exports = { FinanceApprovalStore };
