const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  MemoryStateStore,
  FileStateStore,
  createStateStore,
  persistLedger,
  restoreLedger,
} = require("../src/persistence/state-store");
const { ExecutionLedger } = require("../src/execution-ledger");

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ops-pilot-state-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// A single suite of behavioural assertions applied to every backend so both
// stay interchangeable behind the shared interface. `withStore` provides a
// fresh store per test and tears down any backing resources afterwards.
function runContract(name, withStore) {
  test(`${name}: saves and loads a snapshot`, () => withStore(async store => {
    assert.equal(await store.load("missing"), null);
    assert.equal(await store.has("missing"), false);
    await store.save("run-1", { count: 3, tags: ["a", "b"] });
    assert.equal(await store.has("run-1"), true);
    assert.deepEqual(await store.load("run-1"), { count: 3, tags: ["a", "b"] });
  }));

  test(`${name}: returns detached copies on save and load`, () => withStore(async store => {
    const input = { nested: { value: 1 } };
    await store.save("run-1", input);
    input.nested.value = 999;
    const loaded = await store.load("run-1");
    assert.equal(loaded.nested.value, 1);
    loaded.nested.value = 42;
    assert.equal((await store.load("run-1")).nested.value, 1);
  }));

  test(`${name}: overwrites an existing key`, () => withStore(async store => {
    await store.save("run-1", { v: 1 });
    await store.save("run-1", { v: 2 });
    assert.deepEqual(await store.load("run-1"), { v: 2 });
  }));

  test(`${name}: lists and deletes keys`, () => withStore(async store => {
    await store.save("beta", { v: 1 });
    await store.save("alpha", { v: 2 });
    assert.deepEqual(await store.keys(), ["alpha", "beta"]);
    assert.equal(await store.delete("alpha"), true);
    assert.equal(await store.delete("alpha"), false);
    assert.deepEqual(await store.keys(), ["beta"]);
    await store.clear();
    assert.deepEqual(await store.keys(), []);
  }));

  test(`${name}: rejects invalid keys and non-serializable snapshots`, () => withStore(async store => {
    await assert.rejects(() => store.save("", { v: 1 }), /non-empty string/);
    await assert.rejects(() => store.load(42), /non-empty string/);
    await assert.rejects(() => store.save("run-1", undefined), /JSON-serializable/);
  }));
}

runContract("memory", run => run(new MemoryStateStore()));
runContract("file", run => withTempDir(dir => run(new FileStateStore(dir))));

test("createStateStore selects the requested backend", () => {
  assert.equal(createStateStore().backend, "memory");
  assert.equal(createStateStore({ backend: "memory" }).backend, "memory");
  assert.equal(createStateStore({ backend: "file", directory: "/tmp/x" }).backend, "file");
  assert.throws(() => createStateStore({ backend: "redis" }), /unknown state store backend/);
});

test("FileStateStore requires a directory", () => {
  assert.throws(() => new FileStateStore(), /directory must be a non-empty string/);
  assert.throws(() => new FileStateStore({}), /directory must be a non-empty string/);
});

test("FileStateStore encodes unsafe key characters reversibly", async () => {
  await withTempDir(async dir => {
    const store = new FileStateStore(dir);
    await store.save("tenant/42:run", { ok: true });
    assert.deepEqual(await store.keys(), ["tenant/42:run"]);
    assert.deepEqual(await store.load("tenant/42:run"), { ok: true });
    // The key must not leak a directory separator into the filesystem.
    const files = await fs.readdir(dir);
    assert.equal(files.length, 1);
    assert.ok(!files[0].includes("/"));
  });
});

test("FileStateStore leaves no temp files behind after a save", async () => {
  await withTempDir(async dir => {
    const store = new FileStateStore(dir);
    await store.save("run-1", { v: 1 });
    const files = await fs.readdir(dir);
    assert.deepEqual(files, ["run-1.json"]);
  });
});

test("persistLedger + restoreLedger round-trips an execution ledger (memory)", async () => {
  const store = new MemoryStateStore();
  const ledger = new ExecutionLedger();
  ledger.recordStart("sync invoices");
  ledger.recordCompletion("sync invoices", { status: "success" });
  ledger.recordCompletion("archive logs", { status: "failed" });

  await persistLedger(store, "ledger:main", ledger);

  const restored = new ExecutionLedger();
  assert.equal(await restoreLedger(store, "ledger:main", restored), true);
  assert.deepEqual(restored.export(), ledger.export());
  assert.deepEqual(restored.summarize(), ledger.summarize());
  // The restored ledger must keep appending with fresh, non-colliding ids.
  const next = restored.append({ type: "note" });
  assert.equal(next.id, ledger.latest().id + 1);
});

test("restoreLedger reports a missing snapshot without touching the ledger", async () => {
  const store = new MemoryStateStore();
  const ledger = new ExecutionLedger();
  ledger.recordStart("sync invoices");
  assert.equal(await restoreLedger(store, "absent", ledger), false);
  assert.equal(ledger.entries.length, 1);
});

test("execution-ledger snapshot survives a real file round-trip", async () => {
  await withTempDir(async dir => {
    const source = new ExecutionLedger();
    source.recordStart("sync invoices");
    source.recordCompletion("sync invoices", { status: "success", output: { count: 2 } });

    const writer = new FileStateStore(dir);
    await persistLedger(writer, "ledger:main", source);

    // A brand-new store instance pointed at the same directory simulates a
    // process restart reading state written by a previous run.
    const reader = new FileStateStore(dir);
    const restored = new ExecutionLedger();
    assert.equal(await restoreLedger(reader, "ledger:main", restored), true);
    assert.deepEqual(restored.export(), source.export());
  });
});

test("ledger helpers validate their argument", async () => {
  const store = new MemoryStateStore();
  await assert.rejects(() => persistLedger(store, "k", {}), /export\(\) method/);
  await assert.rejects(() => restoreLedger(store, "k", {}), /import\(\) method/);
});
