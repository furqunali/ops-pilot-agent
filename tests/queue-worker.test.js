"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { QueueWorker } = require("../src/queue-worker");
const { TaskQueue } = require("../src/task-queue");
const { ExecutionLedger } = require("../src/execution-ledger");

// Fast retry config so retryable-failure tests never sleep on the real timer.
const FAST = { maxAttempts: 3, baseDelayMs: 0 };

function echoTool(name = "echo") {
  return { name, capabilities: ["read"], execute: input => input.toUpperCase() };
}

function queueOf(...inputs) {
  const queue = new TaskQueue();
  for (const item of inputs) {
    if (typeof item === "string") queue.enqueue({ input: item });
    else queue.enqueue({ input: item.input }, item.priority || 0, item.metadata || {});
  }
  return queue;
}

test("drains a queue and reports one success record per entry", async () => {
  const queue = queueOf("sync invoices", "archive logs");
  const worker = new QueueWorker({ queue, tool: echoTool() });

  const records = await worker.run();

  assert.equal(records.length, 2);
  assert.deepEqual(records.map(r => r.status), ["success", "success"]);
  assert.deepEqual(records.map(r => r.output), ["SYNC INVOICES", "ARCHIVE LOGS"]);
  assert.deepEqual(records.map(r => r.state), ["succeeded", "succeeded"]);
  assert.equal(queue.isEmpty, true);
  assert.deepEqual(worker.stats, { processed: 2, succeeded: 2, failed: 0, skipped: 0, requeued: 0 });
});

test("processes higher-priority entries before lower-priority ones", async () => {
  const queue = new TaskQueue();
  queue.enqueue({ input: "low" }, 1);
  queue.enqueue({ input: "high" }, 10);
  const worker = new QueueWorker({ queue, tool: echoTool() });

  const records = await worker.run();
  assert.deepEqual(records.map(r => r.input), ["high", "low"]);
});

test("run({ max }) stops after the requested number of entries", async () => {
  const queue = queueOf("a", "b", "c");
  const worker = new QueueWorker({ queue, tool: echoTool() });

  const records = await worker.run({ max: 2 });
  assert.equal(records.length, 2);
  assert.equal(queue.size, 1); // the third entry is left on the queue
});

test("records start and completion for every processed entry in the ledger", async () => {
  const queue = queueOf("sync invoices");
  const ledger = new ExecutionLedger();
  const worker = new QueueWorker({ queue, tool: echoTool(), ledger });

  await worker.run();

  const starts = ledger.findByType("start");
  const completions = ledger.findByType("completion");
  assert.equal(starts.length, 1);
  assert.equal(completions.length, 1);
  assert.equal(starts[0].task, "sync invoices");
  assert.equal(completions[0].status, "success");
  assert.equal(completions[0].metadata.attempts, 1);
  assert.equal(ledger.summarize().successful, 1);
});

test("retries a retryable failure with backoff and then succeeds", async () => {
  const queue = queueOf("flaky call");
  let calls = 0;
  const tool = {
    name: "flaky",
    capabilities: ["execute"],
    execute: () => {
      calls += 1;
      if (calls < 3) {
        const error = new Error("temporary blip");
        error.retryable = true;
        throw error;
      }
      return "ok";
    },
  };
  const worker = new QueueWorker({ queue, tool, retry: FAST });

  const [record] = await worker.run();
  assert.equal(calls, 3);
  assert.equal(record.status, "success");
  assert.equal(record.output, "ok");
  assert.equal(record.attempts, 3);
  assert.equal(record.state, "succeeded");
});

test("stops retrying a non-retryable failure after one attempt", async () => {
  const queue = queueOf("hard fail");
  let calls = 0;
  const tool = {
    name: "broken",
    capabilities: ["execute"],
    execute: () => { calls += 1; throw new Error("permanent"); },
  };
  const worker = new QueueWorker({ queue, tool, retry: FAST });

  const [record] = await worker.run();
  assert.equal(calls, 1);
  assert.equal(record.status, "failed");
  assert.equal(record.error, "permanent");
  assert.equal(record.attempts, 1);
  assert.equal(record.state, "failed");
});

test("re-enqueues a failed entry when requeueOnFailure is set, bounded by maxRequeues", async () => {
  const queue = queueOf("always fails");
  const tool = {
    name: "broken",
    capabilities: ["execute"],
    execute: () => { throw new Error("nope"); },
  };
  const worker = new QueueWorker({
    queue,
    tool,
    retry: { maxAttempts: 1, baseDelayMs: 0 },
    requeueOnFailure: true,
    maxRequeues: 2,
  });

  const records = await worker.run();
  // First attempt + 2 re-enqueued attempts = 3 processed records total.
  assert.equal(records.length, 3);
  assert.deepEqual(records.map(r => r.status), ["failed", "failed", "failed"]);
  assert.deepEqual(records.map(r => r.requeued), [true, true, false]);
  assert.equal(worker.stats.requeued, 2);
  assert.equal(queue.isEmpty, true);
});

test("skips an entry when its resolved tool is null (nothing to run)", async () => {
  const queue = queueOf("no handler");
  const ledger = new ExecutionLedger();
  const worker = new QueueWorker({ queue, resolveTool: () => null, ledger });

  const [record] = await worker.run();
  assert.equal(record.status, "skipped");
  assert.equal(record.state, "cancelled");
  assert.equal(record.attempts, 0);
  assert.equal(worker.stats.skipped, 1);
  // A skip is not a start: the tool never ran.
  assert.equal(ledger.findByType("start").length, 0);
  assert.equal(ledger.findByType("completion").length, 1);
});

test("routes entries to different tools via resolveTool", async () => {
  const queue = new TaskQueue();
  queue.enqueue({ input: "read this" }, 0, { kind: "read" });
  queue.enqueue({ input: "write this" }, 0, { kind: "write" });

  const tools = {
    read: { name: "reader", capabilities: ["read"], execute: i => `R:${i}` },
    write: { name: "writer", capabilities: ["write"], execute: i => `W:${i}` },
  };
  const worker = new QueueWorker({ queue, resolveTool: entry => tools[entry.metadata.kind] });

  const records = await worker.run();
  assert.deepEqual(records.map(r => r.output).sort(), ["R:read this", "W:write this"]);
});

test("marks a malformed task (missing input) as failed without crashing the drain", async () => {
  const queue = new TaskQueue();
  queue.enqueue({ notInput: "oops" });
  queue.enqueue({ input: "good one" });
  const worker = new QueueWorker({ queue, tool: echoTool() });

  const records = await worker.run();
  assert.equal(records.length, 2);
  assert.equal(records[0].status, "failed");
  assert.match(records[0].error, /non-empty string/);
  assert.equal(records[0].state, "cancelled");
  assert.equal(records[1].status, "success");
});

test("fails an entry (does not throw) when the resolved tool is malformed", async () => {
  const queue = queueOf("x");
  const worker = new QueueWorker({ queue, resolveTool: () => ({ name: "bad", capabilities: [] }) });

  const [record] = await worker.run();
  assert.equal(record.status, "failed");
  assert.equal(record.state, "cancelled");
  assert.equal(worker.stats.failed, 1);
});

test("invokes the onProcessed hook for each record", async () => {
  const queue = queueOf("one", "two");
  const seen = [];
  const worker = new QueueWorker({ queue, tool: echoTool(), onProcessed: r => seen.push(r.input) });

  await worker.run();
  assert.deepEqual(seen, ["one", "two"]);
});

test("processNext returns null on an empty queue", async () => {
  const worker = new QueueWorker({ queue: new TaskQueue(), tool: echoTool() });
  assert.equal(await worker.processNext(), null);
});

test("constructor validates its wiring", () => {
  assert.throws(() => new QueueWorker({ tool: echoTool() }), /TaskQueue-like/);
  assert.throws(() => new QueueWorker({ queue: new TaskQueue() }), /either tool or resolveTool/);
  assert.throws(() => new QueueWorker({ queue: new TaskQueue(), resolveTool: 5 }), /resolveTool must be a function/);
  assert.throws(() => new QueueWorker({ queue: new TaskQueue(), tool: echoTool(), ledger: {} }), /recordStart/);
  assert.throws(() => new QueueWorker({ queue: new TaskQueue(), tool: echoTool(), onProcessed: 1 }), /onProcessed/);
  assert.throws(() => new QueueWorker({ queue: new TaskQueue(), tool: echoTool(), maxRequeues: -1 }), /maxRequeues/);
});

test("run rejects an invalid max", async () => {
  const worker = new QueueWorker({ queue: new TaskQueue(), tool: echoTool() });
  await assert.rejects(() => worker.run({ max: -3 }), /max must be/);
  await assert.rejects(() => worker.run({ max: 1.5 }), /max must be/);
});
