const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDefaultRegistry,
  selectTool,
  parseArgs,
  formatReport,
  runCli,
} = require("../src/cli-runner");

function capture() {
  const lines = [];
  return { out: (line) => lines.push(line), lines, text: () => lines.join("\n") };
}

test("parseArgs collects the task words and flags", () => {
  const parsed = parseArgs(["compile", "the", "report", "--json", "--tool", "report"]);
  assert.equal(parsed.task, "compile the report");
  assert.equal(parsed.json, true);
  assert.equal(parsed.tool, "report");
  assert.equal(parsed.dryRun, false);
});

test("parseArgs rejects unknown options and a bare --tool", () => {
  assert.throws(() => parseArgs(["do", "x", "--bogus"]), /unknown option/);
  assert.throws(() => parseArgs(["--tool"]), /--tool requires/);
  assert.throws(() => parseArgs(["--tool", "--json"]), /--tool requires/);
});

test("selectTool routes by keyword and returns null when nothing matches", () => {
  const registry = createDefaultRegistry();
  assert.equal(selectTool(registry, "compile the weekly status report").name, "report");
  assert.equal(selectTool(registry, "sync the outstanding invoices").name, "sync");
  assert.equal(selectTool(registry, "please echo this note").name, "echo");
  assert.equal(selectTool(registry, "do something entirely unrelated"), null);
});

test("selectTool rejects an empty task", () => {
  assert.throws(() => selectTool(createDefaultRegistry(), "   "), /non-empty string/);
});

test("runCli plans, routes and executes a matched task", () => {
  const cap = capture();
  const { code, report } = runCli(["compile", "the", "weekly", "report"], { out: cap.out });
  assert.equal(code, 0);
  assert.equal(report.task, "compile the weekly report");
  assert.equal(report.status, "success");
  assert.equal(report.verified, true);
  assert.equal(report.output, "report compiled for task: compile the weekly report");
  assert.deepEqual(
    report.steps.map((step) => step.action),
    ["parse", "plan", "execute", "verify", "report"],
  );
  assert.match(cap.text(), /Status:\s+success/);
});

test("runCli --dry-run plans without invoking any tool", () => {
  const cap = capture();
  const { code, report } = runCli(["sync", "the", "invoices", "--dry-run"], { out: cap.out });
  assert.equal(code, 0);
  assert.equal(report.status, "skipped");
  assert.equal(report.output, null);
  assert.match(cap.text(), /\(no tool executed\)/);
});

test("runCli --json emits a parseable runtime report", () => {
  const cap = capture();
  const { code } = runCli(["echo", "the", "handoff", "note", "--json"], { out: cap.out });
  assert.equal(code, 0);
  const parsed = JSON.parse(cap.text());
  assert.equal(parsed.task, "echo the handoff note");
  assert.equal(parsed.output, "echo the handoff note");
  assert.equal(parsed.verified, true);
});

test("runCli --tool forces a specific tool and errors on an unknown one", () => {
  const forced = runCli(["reconcile", "records", "--tool", "echo"], { out: capture().out });
  assert.equal(forced.report.output, "reconcile records");

  const cap = capture();
  const missing = runCli(["do", "work", "--tool", "nope"], { out: cap.out });
  assert.equal(missing.code, 2);
  assert.equal(missing.report, null);
  assert.match(cap.text(), /unknown tool 'nope'/);
});

test("runCli requires a task and surfaces usage", () => {
  const cap = capture();
  const { code, report } = runCli([], { out: cap.out });
  assert.equal(code, 2);
  assert.equal(report, null);
  assert.match(cap.text(), /a task description is required/);
  assert.match(cap.text(), /Usage:/);
});

test("runCli --help and --list-tools exit cleanly", () => {
  const help = capture();
  assert.equal(runCli(["--help"], { out: help.out }).code, 0);
  assert.match(help.text(), /Usage:/);

  const listing = capture();
  assert.equal(runCli(["--list-tools"], { out: listing.out }).code, 0);
  assert.match(listing.text(), /report \[read\]/);
  assert.match(listing.text(), /sync \[read, write\]/);
});

test("formatReport renders plan steps and an error line", () => {
  const text = formatReport({
    task: "do a thing",
    status: "failed",
    verified: false,
    output: null,
    error: "boom",
    steps: [{ id: 1, action: "parse", status: "ready" }],
  });
  assert.match(text, /1\. parse \[ready\]/);
  assert.match(text, /Error: boom/);
});
