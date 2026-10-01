"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { inspectRun, listRecoverableRuns, recoverRun } = require("../src/runtime-recovery");

test("interrupted runs are inspectable and recoverable", () => {
  const ledger = new ExecutionLedger();
  ledger.recordStart("restart service", { runId: "run-1" });

  assert.equal(inspectRun(ledger, "run-1").state, "interrupted");
  assert.equal(listRecoverableRuns(ledger).length, 1);

  let resumed = 0;
  const result = recoverRun(ledger, "run-1", {
    authorize: () => ({ allowed: true }),
    resume: task => {
      resumed += 1;
      return { status: "success", task, output: "done" };
    },
  });

  assert.equal(result.status, "recovered");
  assert.equal(resumed, 1);
  assert.equal(inspectRun(ledger, "run-1").state, "completed");
});

test("failed runs are not automatically replayed", () => {
  const ledger = new ExecutionLedger();
  ledger.recordStart("deploy", { runId: "run-2" });
  ledger.recordCompletion("deploy", { status: "failed", error: "timeout" }, { runId: "run-2" });

  let resumed = false;
  const result = recoverRun(ledger, "run-2", {
    authorize: () => ({ allowed: true }),
    resume: () => {
      resumed = true;
      return { status: "success" };
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(resumed, false);
  assert.equal(inspectRun(ledger, "run-2").state, "failed");
});

test("completed runs are never duplicated", () => {
  const ledger = new ExecutionLedger();
  ledger.recordStart("cleanup", { runId: "run-3" });
  ledger.recordCompletion("cleanup", { status: "success", output: "ok" }, { runId: "run-3" });

  const result = recoverRun(ledger, "run-3", {
    authorize: () => ({ allowed: true }),
    resume: () => {
      throw new Error("must not execute");
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(ledger.findByType("completion").length, 1);
});

test("interrupted runs require authorization before resume", () => {
  const ledger = new ExecutionLedger();
  ledger.recordStart("rotate credentials", { runId: "run-4" });

  let resumed = false;
  const result = recoverRun(ledger, "run-4", {
    authorize: () => ({ allowed: false, reason: "policy denied" }),
    resume: () => {
      resumed = true;
      return { status: "success" };
    },
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "policy denied");
  assert.equal(resumed, false);
  assert.equal(ledger.findByType("completion").length, 0);
});


test("recovery rejects invalid resume results without writing a completion", () => {
  const ledger = new ExecutionLedger();
  ledger.recordStart("resume job", { runId: "run-invalid" });
  assert.throws(() => recoverRun(ledger, "run-invalid", {
    authorize: () => ({ allowed: true }),
    resume: () => null,
  }), /resume must return a runtime result/);
  assert.equal(ledger.findByType("completion").length, 0);
});

test("recovery completion records the recovery correlation id", () => {
  const ledger = new ExecutionLedger();
  ledger.recordStart("resume job", { runId: "run-recover" });
  const result = recoverRun(ledger, "run-recover", {
    authorize: () => ({ allowed: true }),
    resume: task => ({ status: "success", task }),
  });
  assert.equal(result.status, "recovered");
  assert.equal(result.completion.metadata.recoveryRunId, "run-recover");
});


test("recovery preserves run correlation on completion", () => {
  const ledger = new ExecutionLedger();
  ledger.recordStart("resume job", { runId: "run-correlation", authorization: "pending" });
  const result = recoverRun(ledger, "run-correlation", {
    authorize: () => ({ allowed: true }),
    resume: task => ({ status: "success", task, attempts: [] }),
  });
  assert.equal(result.completion.metadata.runId, "run-correlation");
  assert.equal(result.completion.metadata.recoveryRunId, "run-correlation");
  assert.equal(inspectRun(ledger, "run-correlation").recoverable, false);
});
