const test = require("node:test");
const assert = require("node:assert/strict");
const { executePlannedTask } = require("../src/pipeline-execution");

test("runs a planned task through dispatch, verification, and audit", async () => {
  const run = await executePlannedTask("sync invoices", {
    name: "echo", capabilities: ["execute"], execute: input => input
  });
  assert.equal(run.result.status, "success");
  assert.equal(run.verification.valid, true);
  assert.equal(run.audit.length, 5);
});
