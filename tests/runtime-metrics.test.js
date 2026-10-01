"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ExecutionLedger } = require("../src/execution-ledger");
const { summarizeRuns, metricsFromLedger } = require("../src/runtime-metrics");

test("summarizeRuns aggregates outcomes, verification, retries, and duration", () => {
  const runs = [
    { result: { status: "success", attempts: [{}, {}] }, verification: { valid: true }, observability: { summary: { durationMs: 12 } } },
    { result: { status: "failed", attempts: [{}] }, verification: { valid: false }, observability: { summary: { durationMs: 8 } } },
    { result: { status: "skipped" }, verification: { valid: false }, observability: { summary: { durationMs: 3 } } },
  ];

  assert.deepEqual(summarizeRuns(runs), {
    total: 3,
    successful: 1,
    failed: 1,
    skipped: 1,
    verified: 1,
    unverified: 2,
    retryAttempts: 3,
    durationMs: 23,
  });
});

test("metrics aggregation does not mutate source records", () => {
  const run = {
    result: { status: "success", attempts: [{ attempt: 1 }] },
    verification: { valid: true },
    observability: { summary: { durationMs: 5 } },
  };
  const snapshot = JSON.parse(JSON.stringify(run));
  summarizeRuns([run]);
  assert.deepEqual(run, snapshot);
});

test("metricsFromLedger reads completion records", () => {
  const ledger = new ExecutionLedger();
  const success = { status: "success" };
  Object.defineProperty(success, "attempts", { value: [{}, {}], enumerable: false });
  const failed = { status: "failed" };
  Object.defineProperty(failed, "attempts", { value: [{}], enumerable: false });
  ledger.recordCompletion("a", success, { verified: true, attempts: 2, durationMs: 10 });
  ledger.recordCompletion("b", failed, { verified: false, attempts: 1, durationMs: 4 });

  assert.deepEqual(metricsFromLedger(ledger), {
    total: 2,
    successful: 1,
    failed: 1,
    skipped: 0,
    verified: 1,
    unverified: 1,
    retryAttempts: 3,
    durationMs: 14,
  });
});
