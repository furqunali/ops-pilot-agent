const test = require("node:test");
const assert = require("node:assert/strict");
const { RateLimiter } = require("../src/rate-limiter");

test("allows bursts up to capacity then refuses with retryAfterMs", () => {
  const rl = new RateLimiter({ capacity: 2, refillRate: 1, clock: () => 0 });
  assert.equal(rl.tryAcquire(1, 0).allowed, true);
  assert.equal(rl.tryAcquire(1, 0).allowed, true);
  const r = rl.tryAcquire(1, 0);
  assert.equal(r.allowed, false);
  assert.equal(r.retryAfterMs, 1000);
});

test("refills over time but never above capacity", () => {
  const rl = new RateLimiter({ capacity: 3, refillRate: 2, clock: () => 0 });
  rl.tryAcquire(3, 0);
  assert.equal(rl.available(500), 1);
  assert.equal(rl.available(10_000), 3);
});

test("acquire throws RATE_LIMITED with retry information", () => {
  const rl = new RateLimiter({ capacity: 1, refillRate: 4, clock: () => 0 });
  rl.acquire(1, 0);
  assert.throws(() => rl.acquire(1, 0), err => err.code === "RATE_LIMITED" && err.retryAfterMs === 250);
});

test("rejects invalid counts and reset restores capacity", () => {
  const rl = new RateLimiter({ capacity: 2, clock: () => 0 });
  assert.throws(() => rl.tryAcquire(0), TypeError);
  rl.tryAcquire(2, 0);
  assert.equal(rl.reset().tokens, 2);
});
