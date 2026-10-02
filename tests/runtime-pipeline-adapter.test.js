"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runTaskPipeline } = require("../src/runtime-pipeline");
const { ExecutionLedger } = require("../src/execution-ledger");

test("runtime pipeline executes through an explicit adapter while preserving correlation", () => {
  const ledger = new ExecutionLedger();
  const seen = [];
  const run = runTaskPipeline("prepare finance payment", null, {
    runId: "finance-runtime-1",
    operationId: "payment-42",
    tenantId: "tenant-a",
    ledger,
    executionAdapter(context) {
      seen.push(context);
      return { status: "success", task: context.task, output: "prepared" };
    },
  });

  assert.equal(run.result.output, "prepared");
  assert.equal(run.runId, "finance-runtime-1");
  assert.equal(seen[0].operationId, "payment-42");
  assert.equal(seen[0].tenantId, "tenant-a");
  assert.equal(seen[0].ledger, ledger);
  assert.equal(ledger.findByType("completion").at(-1).metadata.runId, "finance-runtime-1");
});

test("runtime pipeline rejects malformed execution adapters", () => {
  assert.throws(() => runTaskPipeline("task", null, { executionAdapter: {} }), /executionAdapter must be a function/);
});
