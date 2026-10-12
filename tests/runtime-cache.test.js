const test = require("node:test");
const assert = require("node:assert/strict");
const { RuntimeCache } = require("../src/runtime-cache");

function clock() { let t = 0; const c = () => t; c.advance = ms => { t += ms; }; return c; }

test("returns cached values until they expire", () => {
  const c = clock();
  const cache = new RuntimeCache({ ttlMs: 100, clock: c });
  cache.set("a", 1);
  assert.equal(cache.get("a"), 1);
  c.advance(100);
  assert.equal(cache.get("a"), undefined);
  assert.deepEqual({ hits: cache.stats().hits, misses: cache.stats().misses }, { hits: 1, misses: 1 });
});

test("object keys are serialized, so different objects do not collide", () => {
  const cache = new RuntimeCache({ clock: clock() });
  cache.set({ tool: "ledger", id: 1 }, "first");
  cache.set({ tool: "ledger", id: 2 }, "second");
  assert.equal(cache.get({ tool: "ledger", id: 1 }), "first");
  assert.equal(cache.get({ tool: "ledger", id: 2 }), "second");
  assert.equal(cache.delete({ tool: "ledger", id: 1 }), true);
  assert.equal(cache.get({ tool: "ledger", id: 1 }), undefined);
});

test("evicts expired entries first, then the oldest, when full", () => {
  const c = clock();
  const cache = new RuntimeCache({ maxEntries: 2, ttlMs: 1000, clock: c });
  cache.set("old", 1, 10);
  cache.set("keep", 2);
  c.advance(10);
  cache.set("new", 3);
  assert.equal(cache.get("keep"), 2);
  assert.equal(cache.get("new"), 3);
  cache.set("newest", 4);
  assert.equal(cache.get("keep"), undefined);
  assert.equal(cache.stats().size, 2);
});

test("validates ttl and clear returns the removed count", () => {
  const cache = new RuntimeCache({ clock: clock() });
  assert.throws(() => cache.set("x", 1, 0), TypeError);
  cache.set("x", 1); cache.set("y", 2);
  assert.equal(cache.clear(), 2);
  assert.equal(cache.has("x"), false);
});
