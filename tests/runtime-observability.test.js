const test = require("node:test");
const assert = require("node:assert/strict");
const { recordStage, summarizeStages } = require("../src/runtime-observability");

test("records deterministic stage duration", () => {
  const stages = recordStage([], "execute", "success", new Date(1000), new Date(1250), { tool: "echo" });
  assert.deepEqual(stages, [{ stage: "execute", status: "success", durationMs: 250, metadata: { tool: "echo" } }]);
});

test("summarizes stage outcomes and duration", () => {
  assert.deepEqual(summarizeStages([
    { status: "success", durationMs: 100 },
    { status: "failed", durationMs: 50 }
  ]), { total: 2, successful: 1, failed: 1, durationMs: 150 });
});


test("rejects invalid timestamps", () => {
  assert.throws(() => recordStage([], "execute", "success", new Date("bad"), new Date()), /valid Date values/);
});

test("clamps negative summary durations", () => {
  assert.equal(summarizeStages([{ status: "success", durationMs: -50 }]).durationMs, 0);
});
