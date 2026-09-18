"use strict";

const ACTIONS = Object.freeze(["parse","plan","execute","verify","report","cancel","retry"]);

class PermissionPolicy {
  constructor(rules = {}) {
    this.rules = new Map();
    for (const [role, actions] of Object.entries(rules)) {
      if (!Array.isArray(actions)) throw new TypeError(`rules for ${role} must be an array`);
      this.rules.set(role, new Set(actions.map(String)));
    }
  }

  allow(role, action) {
    if (!this.rules.has(role)) return false;
    if (!ACTIONS.includes(action)) return false;
    const actions = this.rules.get(role);
    return actions.has("*") || actions.has(action);
  }

  require(role, action) {
    if (!this.allow(role, action)) throw new Error(`role ${role} is not allowed to ${action}`);
    return true;
  }

  grant(role, action) {
    if (!ACTIONS.includes(action) && action !== "*") throw new TypeError("invalid action");
    if (!this.rules.has(role)) this.rules.set(role, new Set());
    this.rules.get(role).add(action);
    return this;
  }

  revoke(role, action) {
    if (!this.rules.has(role)) return false;
    return this.rules.get(role).delete(action);
  }

  actionsFor(role) {
    return [...(this.rules.get(role) || [])].sort();
  }

  snapshot() {
    return Object.fromEntries([...this.rules.entries()].map(([role, actions]) => [role, [...actions].sort()]));
  }
}

function createDefaultPermissionPolicy() {
  return new PermissionPolicy({
    operator: ["parse","plan","execute","verify","report","retry"],
    observer: ["parse","plan","verify","report"],
    emergency: ["parse","plan","execute","verify","report","cancel"],
  });
}

module.exports = { ACTIONS, PermissionPolicy, createDefaultPermissionPolicy };
