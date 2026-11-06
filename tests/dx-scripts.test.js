"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildDemoSnapshot, buildAssuranceConsole, SNAPSHOT_SCHEMA_VERSION } = require("../src/demo-snapshot");
const { parseArgs, main: buildHfDemo } = require("../scripts/build-hf-demo");
const { main: runDemo } = require("../scripts/demo");
const { runCli } = require("../src/cli-runner");

const ROOT = path.resolve(__dirname, "..");

test("package.json exposes the documented npm scripts", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  for (const name of ["test", "eval", "console", "demo", "build:hf-demo"]) assert.equal(typeof pkg.scripts[name], "string", name);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  for (const script of ["scripts/assurance-console.js", "scripts/demo.js", "scripts/build-hf-demo.js"]) {
    assert.ok(fs.existsSync(path.join(ROOT, script)), script);
  }
});

test("demo snapshot runs every Finance evaluation and renders the Assurance Console", () => {
  const snapshot = buildDemoSnapshot({ runId: "snapshot-test", generatedAt: "2026-11-06T00:00:00.000Z", testCount: 42 });
  assert.equal(snapshot.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.generatedAt, "2026-11-06T00:00:00.000Z");
  assert.equal(snapshot.executionMode, "simulation_only");
  assert.deepEqual(snapshot.tests, { total: 42 });
  assert.deepEqual(snapshot.kpis.workflow, { passed: 5, total: 5 });
  assert.deepEqual(snapshot.kpis.policySuite, { passed: 3, total: 3 });
  assert.deepEqual(snapshot.kpis.runtime, { passed: 1, total: 1 });
  assert.equal(snapshot.kpis.risk, "nominal");
  assert.match(snapshot.assuranceConsole.text, /^OPS PILOT \/ ASSURANCE CONSOLE/);
  assert.match(snapshot.assuranceConsole.text, /Run: snapshot-test/);
  assert.equal(snapshot.assuranceConsole.report.runId, "snapshot-test");
  assert.equal(snapshot.workflowEvaluation.results.length, 5);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.throws(() => buildDemoSnapshot({ generatedAt: "not a date" }), /valid date/);
  assert.equal(buildAssuranceConsole().dashboard.summary.passRate, 1);
});

test("build-hf-demo writes the snapshot JSON to the requested path", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ops-pilot-hf-"));
  try {
    const logs = [];
    const out = path.join(dir, "nested", "snapshot.json");
    buildHfDemo(["--out", out, "--run-id", "hf-test"], { cwd: ROOT, log: line => logs.push(line) });
    const written = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(written.runId, "hf-test");
    assert.equal(written.kpis.workflow.passed, 5);
    assert.match(logs.join("\n"), /workflow 5\/5 · policy 3\/3 · runtime 1\/1 · risk nominal/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(parseArgs([]), { out: path.join("hf-demo", "snapshot.json"), runId: "hf-demo-001", countTests: false });
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
  assert.throws(() => parseArgs(["--out"]), /requires a value/);
});

test("demo script tours the runtime offline", async () => {
  const lines = [];
  await runDemo(line => lines.push(line));
  const text = lines.join("\n");
  assert.match(text, /success\s+compile the weekly operations report/);
  assert.match(text, /blocked: prompt-injection screening/);
  assert.match(text, /attempt 2: prepared \(replayed: true\)/);
  assert.match(text, /opspilot_runs_total\{status="success"\}/);
});

test("CLI evaluation summaries print real line breaks", () => {
  for (const flag of ["--finance-evaluate", "--finance-runtime-evaluate"]) {
    const lines = [];
    runCli([flag], { out: line => lines.push(line) });
    assert.doesNotMatch(lines.join("\n"), /\\n/, flag);
    assert.ok(lines.join("\n").split("\n").length >= 4, flag);
  }
});
