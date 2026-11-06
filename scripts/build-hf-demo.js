#!/usr/bin/env node
"use strict";

// Regenerates the demo snapshot behind the Hugging Face Space:
// runs the Finance evaluations, renders the Assurance Console and writes JSON.
//
//   node scripts/build-hf-demo.js [--out <file>] [--run-id <id>] [--count-tests]
//
// --count-tests runs the full `node --test` suite first and records the count.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildDemoSnapshot } = require("../src/demo-snapshot");

const DEFAULT_OUT = path.join("hf-demo", "snapshot.json");

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, runId: "hf-demo-001", countTests: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--out") args.out = argv[++index];
    else if (flag === "--run-id") args.runId = argv[++index];
    else if (flag === "--count-tests") args.countTests = true;
    else if (flag === "-h" || flag === "--help") args.help = true;
    else throw new Error(`unknown option: ${flag}`);
    if ((flag === "--out" || flag === "--run-id") && !argv[index]) throw new Error(`${flag} requires a value`);
  }
  return args;
}

function countTests(cwd) {
  const result = spawnSync(process.execPath, ["--test"], { cwd, encoding: "utf8" });
  const output = `${result.stdout}\n${result.stderr}`;
  const total = output.match(/^(?:ℹ|#) tests (\d+)$/m);
  const failed = output.match(/^(?:ℹ|#) fail (\d+)$/m);
  if (result.status !== 0 || !total || !failed || Number(failed[1]) !== 0) {
    throw new Error("test suite did not pass; refusing to publish a demo snapshot");
  }
  return Number(total[1]);
}

function main(argv = process.argv.slice(2), { cwd = path.resolve(__dirname, ".."), log = console.log } = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    log("usage: node scripts/build-hf-demo.js [--out <file>] [--run-id <id>] [--count-tests]");
    return null;
  }
  const testCount = args.countTests ? countTests(cwd) : null;
  const snapshot = buildDemoSnapshot({ runId: args.runId, testCount });
  const { kpis } = snapshot;
  if (kpis.workflow.passed !== kpis.workflow.total || kpis.policySuite.passed !== kpis.policySuite.total || kpis.runtime.passed !== kpis.runtime.total) {
    throw new Error("evaluations did not fully pass; refusing to publish a demo snapshot");
  }
  const outFile = path.resolve(cwd, args.out);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  log(`wrote ${path.relative(cwd, outFile) || outFile}`);
  log(`workflow ${kpis.workflow.passed}/${kpis.workflow.total} · policy ${kpis.policySuite.passed}/${kpis.policySuite.total} · runtime ${kpis.runtime.passed}/${kpis.runtime.total} · risk ${kpis.risk}${testCount !== null ? ` · tests ${testCount}` : ""}`);
  return { outFile, snapshot };
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, main };
