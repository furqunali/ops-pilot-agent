"use strict";

// Scenario 3 — "Data tidy-up" (examples.md, pattern 3).
//
// Instruction: "Normalise the new vendor entries and de-duplicate."
//
// This wires ToolRegistry + the real transform tool + runTaskPipeline:
//   1. Build a transform tool (rename/map/redact via src/tools/transform-tool.js)
//      and register it in a ToolRegistry.
//   2. Run the task through runTaskPipeline with a function tool that
//      de-duplicates the raw vendor records by a key, then feeds the survivors
//      through the registered transform tool.
//   3. The runtime-report carries the cleaned records plus an honest summary of
//      what changed (how many duplicates were dropped).
//
// The raw records are injectable; there is no network or filesystem I/O.

const { ToolRegistry } = require("../src/tool-registry");
const { runTaskPipeline } = require("../src/runtime-pipeline");
const { createTransformTool } = require("../src/tools/transform-tool");
const { renderReport } = require("./_render");

// Raw, messy vendor entries: duplicate ids, mixed key names, a stray secret.
const DEFAULT_RECORDS = [
  { vendor_id: "V-1", vendor_name: "  ACME Supplies ", contact_email: "ops@acme.example", api_key: "sk-live-abc" },
  { vendor_id: "V-2", vendor_name: "Beta Foods", contact_email: "hi@beta.example" },
  { vendor_id: "V-1", vendor_name: "ACME Supplies (dup)", contact_email: "ops@acme.example" },
  { vendor_id: "V-3", vendor_name: "Gamma Ltd", contact_email: "team@gamma.example" },
  { vendor_id: "V-2", vendor_name: "Beta Foods (dup)", contact_email: "hi@beta.example" },
];

// The transform spec: rename keys onto a clean, stable shape and redact any
// secret fields (rename keeps every key, so a stray api_key survives to the
// redact step and is genuinely replaced with [REDACTED]).
const CLEANUP_SPEC = {
  name: "vendor-transform",
  rename: { vendor_id: "id", vendor_name: "name", contact_email: "email" },
  redact: true,
};

// De-duplicate records by `key`, keeping the first occurrence. Returns the
// survivors and the count removed so the report can state what changed.
function dedupe(records, key) {
  const seen = new Set();
  const kept = [];
  for (const record of records) {
    const id = record[key];
    if (seen.has(id)) continue;
    seen.add(id);
    kept.push(record);
  }
  return { kept, removed: records.length - kept.length };
}

// Core scenario. Returns the runtime-report, the registry listing, and the
// change summary.
function runDataCleanup({ records = DEFAULT_RECORDS, dedupeKey = "vendor_id" } = {}) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");

  const registry = new ToolRegistry();
  registry.register(createTransformTool(CLEANUP_SPEC));
  const transformTool = registry.get(CLEANUP_SPEC.name);

  const instruction = "Normalise the new vendor entries and de-duplicate";
  const { report } = runTaskPipeline(instruction, () => {
    const { kept, removed } = dedupe(records, dedupeKey);
    const cleaned = transformTool.execute(JSON.stringify(kept));
    return {
      before: records.length,
      after: cleaned.length,
      duplicatesRemoved: removed,
      cleaned,
    };
  });

  return { instruction, report, registry: registry.list(), summary: report.output };
}

module.exports = { dedupe, runDataCleanup, CLEANUP_SPEC };

if (require.main === module) {
  try {
    const { report, registry, summary } = runDataCleanup();
    console.log(renderReport(report, { title: "Scenario 3 — Vendor data cleanup" }));
    console.log(`\nregistered tools : ${registry.map(tool => tool.name).join(", ")}`);
    console.log(
      `changed          : ${summary.before} in -> ${summary.after} out ` +
      `(${summary.duplicatesRemoved} duplicate(s) removed, secrets redacted)`
    );
  } catch (error) {
    console.error("data-cleanup scenario failed:", error);
    process.exitCode = 1;
  }
}
