#!/usr/bin/env node
"use strict";

// Prints the OpsPilot Assurance Console for the Finance reference suite.
//   node scripts/assurance-console.js [--json]
// Exits non-zero when any evaluation gate fails, so it can gate CI.

const { buildAssuranceConsole } = require("../src/demo-snapshot");

const json = process.argv.includes("--json");
const { dashboard, text } = buildAssuranceConsole({ runId: process.env.OPSPILOT_RUN_ID || "console-local" });
console.log(json ? JSON.stringify(dashboard, null, 2) : text);
process.exitCode = dashboard.summary.passRate === 1 ? 0 : 1;
