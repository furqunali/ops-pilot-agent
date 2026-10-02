"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runCli, parseArgs } = require("../src/cli-runner");

test("CLI exposes finance evaluation mode", () => {
  assert.equal(parseArgs(["--finance-evaluate"]).financeEvaluate, true);
  const output = [];
  const result = runCli(["--finance-evaluate"], { out: line => output.push(line) });
  assert.equal(result.code, 0);
  assert.match(output[0], /Finance evaluation/);
  assert.match(output[0], /PassRate: 1/);
});

test("CLI finance evaluation supports JSON output", () => {
  const output = [];
  const result = runCli(["--finance-evaluate", "--json"], { out: line => output.push(line) });
  assert.equal(result.code, 0);
  const parsed = JSON.parse(output[0]);
  assert.equal(parsed.dashboard.passRate, 1);
  assert.equal(parsed.suite.total, 3);
});
