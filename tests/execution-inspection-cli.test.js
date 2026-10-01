const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ExecutionLedger } = require("../src/execution-ledger");
const { inspectLedgerRuns } = require("../src/execution-inspection");
const { runCli, parseArgs } = require("../src/cli-runner");

function capture() {
  const lines = [];
  return { out: (line) => lines.push(line), lines, text: () => lines.join("\n") };
}

test("inspectLedgerRuns lists one latest entry per run", () => {
  const ledger = new ExecutionLedger();
  ledger.recordStart("task one", { runId: "run-1", authorization: { allowed: true } });
  ledger.recordCompletion("task one", { status: "success" }, { runId: "run-1", attempts: 2, durationMs: 12, authorization: { allowed: true } });
  ledger.recordStart("task two", { runId: "run-2", authorization: { allowed: false } });
  const rows = inspectLedgerRuns(ledger);
  assert.deepEqual(rows.map(row => row.runId), ["run-2", "run-1"]);
  assert.equal(rows[1].attempts, 2);
});

test("inspectLedgerRuns returns all entries for one run", () => {
  const ledger = new ExecutionLedger();
  ledger.recordStart("task", { runId: "run-7", authorization: { allowed: true } });
  ledger.recordCompletion("task", { status: "success" }, { runId: "run-7", attempts: 1 });
  assert.equal(inspectLedgerRuns(ledger, "run-7").length, 2);
  assert.equal(inspectLedgerRuns(ledger, "missing"), null);
});

test("CLI persists a ledger and inspects it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opspilot-cli-"));
  const file = path.join(dir, "ledger.json");
  const first = capture();
  const run = runCli(["echo", "hello", "--tool", "echo", "--ledger-file", file], { out: first.out });
  assert.equal(run.code, 0);
  assert.equal(parseArgs(["--inspect", "--ledger-file", file, "--json"]).inspect, true);
  const inspect = capture();
  const result = runCli(["--inspect", "--ledger-file", file, "--json"], { out: inspect.out });
  assert.equal(result.code, 0);
  const rows = JSON.parse(inspect.text());
  assert.equal(rows[0].runId, run.report.runId);
  assert.equal(rows[0].status, "success");
  assert.equal(rows[0].attempts, 0);
});

test("CLI returns non-zero for an unknown inspected run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opspilot-cli-"));
  const file = path.join(dir, "ledger.json");
  fs.writeFileSync(file, "[]");
  const cap = capture();
  const result = runCli(["--inspect", "missing", "--ledger-file", file], { out: cap.out });
  assert.equal(result.code, 1);
  assert.match(cap.text(), /run not found/);
});

test("parseArgs validates ledger-file", () => {
  assert.throws(() => parseArgs(["--ledger-file"]), /requires a path/);
});
