const test = require("node:test");
const assert = require("node:assert/strict");
const { createCircuitBreaker } = require("../src/circuit-breaker");

function clock(start = 0) { let t = start; const c = () => t; c.advance = ms => { t += ms; }; return c; }
const fail = () => Promise.reject(new Error("boom"));

test("stays closed until the failure threshold is reached", async () => {
  const cb = createCircuitBreaker({ failureThreshold: 2, clock: clock() });
  await assert.rejects(cb.execute(fail), /boom/);
  assert.equal(cb.currentState(), "closed");
  await assert.rejects(cb.execute(fail), /boom/);
  assert.equal(cb.currentState(), "open");
});

test("rejects fast with a retryable CIRCUIT_OPEN error while open", async () => {
  const cb = createCircuitBreaker({ failureThreshold: 1, clock: clock() });
  await assert.rejects(cb.execute(fail));
  let called = false;
  await assert.rejects(cb.execute(async () => { called = true; }), err => err.code === "CIRCUIT_OPEN" && err.retryable === true);
  assert.equal(called, false);
});

test("moves to half-open after the reset timeout and closes on success", async () => {
  const c = clock();
  const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000, clock: c });
  await assert.rejects(cb.execute(fail));
  c.advance(999); assert.equal(cb.currentState(), "open");
  c.advance(1); assert.equal(cb.currentState(), "half-open");
  assert.equal(await cb.execute(async () => "ok"), "ok");
  assert.equal(cb.snapshot().state, "closed");
  assert.equal(cb.snapshot().failures, 0);
});

test("a failure in half-open opens the circuit again", async () => {
  const c = clock();
  const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10, clock: c });
  await assert.rejects(cb.execute(fail));
  c.advance(10);
  await assert.rejects(cb.execute(fail), /boom/);
  assert.equal(cb.currentState(), "open");
});

test("reset closes the circuit and the operation is validated", async () => {
  const cb = createCircuitBreaker({ failureThreshold: 1, clock: clock() });
  await assert.rejects(cb.execute(fail));
  assert.equal(cb.reset().state, "closed");
  await assert.rejects(cb.execute("not a function"), TypeError);
});
