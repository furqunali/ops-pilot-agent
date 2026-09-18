"use strict";

const STATES = Object.freeze(["created","queued","running","succeeded","failed","cancelled","timed_out"]);
const TRANSITIONS = Object.freeze({
  created: ["queued","cancelled"],
  queued: ["running","cancelled"],
  running: ["succeeded","failed","timed_out","cancelled"],
  succeeded: [],
  failed: ["queued"],
  cancelled: [],
  timed_out: ["queued","cancelled"],
});

class TaskStateMachine {
  constructor(initialState = "created") {
    if (!STATES.includes(initialState)) throw new TypeError("invalid initial state");
    this.state = initialState;
    this.history = [{ state: initialState, timestamp: new Date(), reason: "initial" }];
  }

  canTransition(next) {
    return TRANSITIONS[this.state].includes(next);
  }

  transition(next, reason = "") {
    if (!STATES.includes(next)) throw new TypeError("invalid target state");
    if (!this.canTransition(next)) {
      throw new Error(`invalid transition: ${this.state} -> ${next}`);
    }
    this.state = next;
    this.history.push({ state: next, timestamp: new Date(), reason: String(reason) });
    return this.state;
  }

  isTerminal() {
    return TRANSITIONS[this.state].length === 0;
  }

  reset() {
    if (!["failed","timed_out"].includes(this.state)) throw new Error("only failed or timed_out tasks can reset");
    return this.transition("queued", "retry");
  }

  snapshot() {
    return {
      state: this.state,
      history: this.history.map(item => ({ ...item, timestamp: item.timestamp.toISOString() })),
    };
  }

  restore(snapshot) {
    if (!snapshot || !STATES.includes(snapshot.state) || !Array.isArray(snapshot.history)) {
      throw new TypeError("invalid state snapshot");
    }
    this.state = snapshot.state;
    this.history = snapshot.history.map(item => ({ ...item, timestamp: new Date(item.timestamp) }));
    return this;
  }
}

function validateTransitionPath(path) {
  if (!Array.isArray(path) || path.length === 0) throw new TypeError("path must be a non-empty array");
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    if (!STATES.includes(from) || !STATES.includes(to) || !TRANSITIONS[from].includes(to)) return false;
  }
  return true;
}

module.exports = { STATES, TRANSITIONS, TaskStateMachine, validateTransitionPath };
