const test = require("node:test");
const assert = require("node:assert/strict");
const { runTaskPipeline } = require("../src/runtime-pipeline");
const { ExecutionLedger } = require("../src/execution-ledger");

test("records successful pipeline execution in an injected ledger", () => {
  const ledger = new ExecutionLedger();
  const run = runTaskPipeline("sync invoices", input => ({ synced: input }), { ledger });

  assert.equal(run.result.status, "success");
  assert.equal(ledger.findByType("start").length, 1);
  assert.equal(ledger.findByType("completion").length, 1);

  const start = ledger.findByType("start")[0];
  const completion = ledger.findByType("completion")[0];
  assert.equal(start.task, "sync invoices");
  assert.equal(start.status, "running");
  assert.equal(start.metadata.authorization.allowed, true);
  assert.equal(completion.status, "success");
  assert.equal(completion.metadata.attempts, 1);
  assert.equal(completion.metadata.verified, true);
});

test("records skipped execution and authorization outcome in the ledger", () => {
  const ledger = new ExecutionLedger();
  const run = runTaskPipeline("review queue", null, { ledger });

  assert.equal(run.result.status, "skipped");
  const start = ledger.findByType("start")[0];
  const completion = ledger.findByType("completion")[0];
  assert.equal(start.metadata.authorization.allowed, false);
  assert.equal(start.metadata.authorization.reason, "tool is required");
  assert.equal(completion.status, "skipped");
  assert.equal(completion.metadata.attempts, 0);
});

test("keeps ledger integration opt-in", () => {
  const run = runTaskPipeline("review queue");
  assert.equal(run.result.status, "skipped");
  assert.equal("ledger" in run, false);
});


test("ledger rejects malformed imported records", () => {
  const ledger = new ExecutionLedger();
  assert.throws(() => ledger.import([{ id: 1, timestamp: "not-a-date" }]), /timestamp must be valid/);
  assert.throws(() => ledger.import([{ timestamp: new Date().toISOString() }]), /id and timestamp/);
});


test("rejects duplicate ledger ids on import", () => {
  const ledger = new ExecutionLedger();
  assert.throws(() => ledger.import([
    { id: 1, timestamp: new Date().toISOString(), type: "start" },
    { id: 1, timestamp: new Date().toISOString(), type: "completion" }
  ]), /ids must be unique/);
});
\n\ntest("preserves an explicit operation id in ledger records", () => {\n  const ledger = new ExecutionLedger();\n  runTaskPipeline("sync invoices", input => ({ synced: input }), { ledger, operationId: "invoice-op-1" });\n  assert.equal(ledger.findByType("start")[0].metadata.operationId, "invoice-op-1");\n  assert.equal(ledger.findByType("completion")[0].metadata.operationId, "invoice-op-1");\n});\n