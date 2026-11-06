"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createIdempotencyStore, fingerprintPayload, validateIdempotencyKey } = require("../src/idempotency-store");
const { runFinanceWorkflowIdempotent } = require("../src/finance-idempotency");
const { FileStateStore, MemoryStateStore } = require("../src/persistence/state-store");
const { ExecutionLedger } = require("../src/execution-ledger");
const { createPolicyKnowledge } = require("../src/finance-policy-knowledge");
const { createFinanceTools } = require("../src/finance-mcp-tools");
const { ERROR_CODES } = require("../src/runtime-errors");
const { createRuntimeHttpServer } = require("../src/runtime-http-api");

function knowledge() {
  return createPolicyKnowledge([
    { id: "threshold", title: "Approval threshold", text: "Payments at or above the approval threshold require approval." },
    { id: "blocklist", title: "Blocked vendors", text: "Blocked vendors cannot receive payments." },
  ]);
}

// Finance tools whose prepare step counts how many times it actually ran.
function countingTools() {
  const tools = createFinanceTools();
  let prepared = 0;
  const counted = Object.freeze({ ...tools, "finance.prepare_payment": payment => { prepared += 1; return tools["finance.prepare_payment"](payment); } });
  return { tools: counted, count: () => prepared };
}

const policy = { approvalThreshold: 1000, blockedVendors: ["vendor-blocked"] };

test("fingerprints are stable across key order and keys are validated", () => {
  assert.equal(fingerprintPayload({ a: 1, b: { c: 2, d: 3 } }), fingerprintPayload({ b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(fingerprintPayload({ amount: 100 }), fingerprintPayload({ amount: 101 }));
  assert.equal(validateIdempotencyKey("pay-2026-11-06:001"), "pay-2026-11-06:001");
  for (const bad of ["", "has space", "x".repeat(201), "../etc", null]) {
    assert.throws(() => validateIdempotencyKey(bad), error => error.code === ERROR_CODES.INVALID_INPUT);
  }
});

test("replays the original result without executing twice", async () => {
  const store = createIdempotencyStore();
  let calls = 0;
  const first = await store.execute("key-1", { amount: 10 }, () => ({ value: ++calls }));
  const second = await store.execute("key-1", { amount: 10 }, () => ({ value: ++calls }));
  assert.equal(calls, 1);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.result, { value: 1 });
});

test("same key with a different payload is a conflict", async () => {
  const store = createIdempotencyStore();
  await store.execute("key-2", { amount: 10 }, () => "ok");
  await assert.rejects(() => store.execute("key-2", { amount: 99 }, () => "again"), error => {
    assert.equal(error.code, ERROR_CODES.IDEMPOTENCY_CONFLICT);
    assert.match(error.message, /different payload/);
    return true;
  });
});

test("keys are isolated by scope", async () => {
  const store = createIdempotencyStore();
  await store.execute("shared", { a: 1 }, () => "first", { scope: "tenant-a" });
  const other = await store.execute("shared", { a: 2 }, () => "second", { scope: "tenant-b" });
  assert.equal(other.replayed, false);
  assert.equal(other.result, "second");
});

test("records expire after the TTL and can then execute again", async () => {
  let now = 1_000_000;
  const store = createIdempotencyStore({ ttlMs: 1000, clock: () => now });
  let calls = 0;
  await store.execute("key-3", { a: 1 }, () => ++calls);
  now += 999;
  assert.equal((await store.execute("key-3", { a: 1 }, () => ++calls)).replayed, true);
  now += 2;
  const afterExpiry = await store.execute("key-3", { a: 2 }, () => ++calls);
  assert.equal(afterExpiry.replayed, false);
  assert.equal(calls, 2);
  now += 5000;
  assert.equal(await store.lookup("key-3"), null);
  assert.equal(await store.purgeExpired(), 1);
});

test("failed operations are not remembered so the caller can retry", async () => {
  const store = createIdempotencyStore();
  await assert.rejects(() => store.execute("key-4", {}, () => { throw new Error("transient"); }), /transient/);
  const retry = await store.execute("key-4", {}, () => "recovered");
  assert.equal(retry.replayed, false);
  assert.equal(retry.result, "recovered");
});

test("concurrent duplicates execute once; in-progress markers go stale", async () => {
  const store = createIdempotencyStore();
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = store.execute("key-5", { a: 1 }, async () => { calls += 1; await gate; return { done: true }; });
  const second = store.execute("key-5", { a: 1 }, async () => { calls += 1; return { done: "twice" }; });
  await assert.rejects(() => store.execute("key-5", { a: 2 }, () => null), error => error.code === ERROR_CODES.IDEMPOTENCY_CONFLICT);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(b.result, { done: true });
  assert.equal(a.replayed, false);
  assert.equal(b.replayed, true);

  // A marker left by another (crashed) process blocks until it goes stale.
  let now = 0;
  const backing = new MemoryStateStore();
  const crashed = createIdempotencyStore({ store: backing, clock: () => now, staleAfterMs: 100 });
  await backing.save(crashed.storageKey("default", "key-6"), { key: "key-6", scope: "default", fingerprint: fingerprintPayload({}), createdAt: 0, expiresAt: 10_000, status: "in_progress" });
  await assert.rejects(() => crashed.execute("key-6", {}, () => "x"), error => error.code === ERROR_CODES.IDEMPOTENCY_IN_PROGRESS);
  now = 200;
  assert.equal((await crashed.execute("key-6", {}, () => "x")).result, "x");
});

test("finance payment preparation never prepares twice for the same key", async () => {
  const store = createIdempotencyStore();
  const ledger = new ExecutionLedger();
  const { tools, count } = countingTools();
  const request = { payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" }, policy, knowledge: knowledge(), ledger, tools, idempotencyStore: store, idempotencyKey: "pay-001" };
  const first = await runFinanceWorkflowIdempotent({ ...request, runId: "pay-run-1" });
  const replay = await runFinanceWorkflowIdempotent({ ...request, runId: "pay-run-2" });
  assert.equal(count(), 1);
  assert.equal(first.status, "prepared");
  assert.equal(first.idempotency.replayed, false);
  assert.ok(first.runtime, "first call returns the live result");
  assert.equal(replay.status, "prepared");
  assert.equal(replay.idempotency.replayed, true);
  assert.equal(replay.runId, "pay-run-1");
  assert.deepEqual(replay.payment.payment, request.payment);
  assert.equal(replay.payment.execution, "simulation_only");
  const replayed = ledger.findByType("finance_audit").filter(entry => entry.metadata.eventType === "finance.execution_replayed");
  assert.equal(replayed.length, 1);
  assert.equal(replayed[0].event.payload.idempotencyKey, "pay-001");
  assert.equal(replayed[0].event.payload.priorRunId, "pay-run-1");
});

test("finance: same key with a different payment is rejected and nothing is prepared", async () => {
  const store = createIdempotencyStore();
  const { tools, count } = countingTools();
  const base = { policy, knowledge: knowledge(), ledger: new ExecutionLedger(), tools, idempotencyStore: store, idempotencyKey: "pay-002" };
  await runFinanceWorkflowIdempotent({ ...base, payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" } });
  await assert.rejects(
    () => runFinanceWorkflowIdempotent({ ...base, payment: { currency: "USD", amount: 900, vendorId: "vendor-ok" } }),
    error => error.code === ERROR_CODES.IDEMPOTENCY_CONFLICT,
  );
  assert.equal(count(), 1);
});

test("finance: pending approval is not remembered; the same key completes after approval", async () => {
  const store = createIdempotencyStore();
  const { tools, count } = countingTools();
  const base = { payment: { currency: "USD", amount: 5000, vendorId: "vendor-ok" }, policy, knowledge: knowledge(), ledger: new ExecutionLedger(), tools, idempotencyStore: store, idempotencyKey: "pay-003", requesterId: "requester-a" };
  const pending = await runFinanceWorkflowIdempotent(base);
  assert.equal(pending.status, "pending");
  assert.equal(pending.idempotency.stored, false);
  const approved = await runFinanceWorkflowIdempotent({ ...base, approval: { decision: "approved", reviewer: "reviewer-b" } });
  assert.equal(approved.status, "prepared");
  const replay = await runFinanceWorkflowIdempotent({ ...base, approval: { decision: "approved", reviewer: "reviewer-b" } });
  assert.equal(replay.idempotency.replayed, true);
  assert.equal(count(), 1);
});

test("finance: blocked outcomes replay, tenants are isolated, and keyless calls run normally", async () => {
  const store = createIdempotencyStore();
  const base = { policy, knowledge: knowledge(), ledger: new ExecutionLedger(), idempotencyStore: store };
  const blocked = await runFinanceWorkflowIdempotent({ ...base, payment: { currency: "USD", amount: 10, vendorId: "vendor-blocked" }, idempotencyKey: "pay-004" });
  assert.equal(blocked.status, "blocked");
  assert.equal((await runFinanceWorkflowIdempotent({ ...base, payment: { currency: "USD", amount: 10, vendorId: "vendor-blocked" }, idempotencyKey: "pay-004" })).idempotency.replayed, true);
  const tenantB = await runFinanceWorkflowIdempotent({ ...base, tenantId: "tenant-b", payment: { currency: "USD", amount: 20, vendorId: "vendor-ok" }, idempotencyKey: "pay-004" });
  assert.equal(tenantB.status, "prepared");
  assert.equal(tenantB.idempotency.replayed, false);
  const keyless = await runFinanceWorkflowIdempotent({ ...base, payment: { currency: "USD", amount: 20, vendorId: "vendor-ok" } });
  assert.equal(keyless.idempotency, null);
});

test("idempotency records persist in the file state store across instances", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ops-pilot-idem-"));
  try {
    const { tools, count } = countingTools();
    const request = { payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" }, policy, knowledge: knowledge(), ledger: new ExecutionLedger(), tools, idempotencyKey: "pay-005" };
    await runFinanceWorkflowIdempotent({ ...request, idempotencyStore: createIdempotencyStore({ store: new FileStateStore(dir) }) });
    const restarted = await runFinanceWorkflowIdempotent({ ...request, ledger: new ExecutionLedger(), idempotencyStore: createIdempotencyStore({ store: new FileStateStore(dir) }) });
    assert.equal(restarted.idempotency.replayed, true);
    assert.equal(count(), 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("HTTP /run honours the Idempotency-Key header", async () => {
  let calls = 0;
  const server = createRuntimeHttpServer({ run: (task, tool, options) => ({ status: "success", task, runId: options.runId || `run-${++calls}`, calls }), idempotencyStore: createIdempotencyStore() });
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();
  const post = (body, key) => new Promise((resolve, reject) => {
    const headers = { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) };
    const req = http.request({ port, method: "POST", path: "/run", headers }, response => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { data += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, replayed: response.headers["idempotent-replayed"], body: JSON.parse(data) }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
  try {
    const first = await post({ task: "sync invoices" }, "http-key-1");
    const second = await post({ task: "sync invoices" }, "http-key-1");
    const conflict = await post({ task: "sync vendors" }, "http-key-1");
    const invalid = await post({ task: "sync invoices" }, "bad key!");
    const noKey = await post({ task: "sync invoices" });
    assert.equal(first.status, 200);
    assert.equal(first.replayed, "false");
    assert.equal(second.replayed, "true");
    assert.deepEqual(second.body, first.body);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, ERROR_CODES.IDEMPOTENCY_CONFLICT);
    assert.equal(invalid.status, 400);
    assert.equal(noKey.replayed, undefined);
    assert.equal(calls, 2);
  } finally {
    server.close();
  }
});
