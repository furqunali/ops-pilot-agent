const test = require("node:test");
const assert = require("node:assert/strict");
const { RuntimeTrace } = require("../src/runtime-trace");

function clock() { let t = 0; return () => new Date(t += 10); }

test("records finished spans with status, metadata and duration", () => {
  const trace = new RuntimeTrace({ traceId: "t-1", clock: clock() });
  const a = trace.startSpan("parse", { step: 1 });
  trace.annotate(a, { tokens: 5 });
  const done = trace.finishSpan(a);
  assert.equal(done.status, "success");
  assert.deepEqual(done.metadata, { step: 1, tokens: 5 });
  assert.equal(Object.isFrozen(done), true);
  const s = trace.summary();
  assert.equal(s.traceId, "t-1");
  assert.equal(s.total, 1);
  assert.equal(s.durationMs, 10);
});

test("failed spans lower the success rate and keep the error text", () => {
  const trace = new RuntimeTrace({ clock: clock() });
  trace.finishSpan(trace.startSpan("ok"));
  const f = trace.failSpan(trace.startSpan("tool"), new Error("timeout"));
  assert.equal(f.error, "Error: timeout");
  assert.equal(trace.summary().successRate, 0.5);
});

test("tracks active spans and exports ISO timestamps", () => {
  const trace = new RuntimeTrace({ traceId: "t-2", clock: clock() });
  trace.startSpan("still running");
  trace.finishSpan(trace.startSpan("done"));
  assert.equal(trace.summary().active, 1);
  const out = trace.export();
  assert.equal(out.spans.length, 1);
  assert.match(out.spans[0].startedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("validates span names, ids and statuses", () => {
  const trace = new RuntimeTrace();
  assert.throws(() => trace.startSpan("  "), TypeError);
  assert.throws(() => trace.finishSpan("missing"), /span not found/);
  assert.throws(() => trace.finishSpan(trace.startSpan("x"), "weird"), TypeError);
});
