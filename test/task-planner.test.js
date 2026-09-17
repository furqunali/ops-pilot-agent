const test = require("node:test");
const assert = require("node:assert/strict");
const { planTask } = require("../src/task-planner");

 test("plans a valid operations task through the five-stage loop", () => {
  const plan = planTask("compile the weekly operations report");

  assert.equal(plan.task, "compile the weekly operations report");
  assert.deepEqual(
    plan.steps.map((step) => step.action),
    ["parse", "plan", "execute", "verify", "report"],
  );
});

test("rejects an empty task", () => {
  assert.throws(() => planTask("   "), /non-empty string/);
});
