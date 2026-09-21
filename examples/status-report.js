"use strict";

// Scenario 2 — "Routine report" (examples.md, pattern 2).
//
// Instruction: "Generate the weekly operations status from the tracker."
//
// This wires ToolRegistry + runTaskPipeline + the real filesystem tool:
//   1. Register the filesystem tool in a ToolRegistry (rooted at a sandbox dir).
//   2. Run the task through runTaskPipeline with a function tool that reads the
//      tracker fixture and compiles a Markdown status document. That gives a
//      genuine runtime-report (status/verified/steps/output).
//   3. Persist the compiled document by executing the registered filesystem
//      tool — all I/O confined to the sandbox root.
//
// The tracker data and the output directory are injectable so this runs with no
// network and no side effects outside the given directory.

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { ToolRegistry } = require("../src/tool-registry");
const { runTaskPipeline } = require("../src/runtime-pipeline");
const { registerFilesystemTool } = require("../src/tools/filesystem-tool");
const { renderReport } = require("./_render");

// A non-sensitive tracker fixture standing in for a real project tracker.
const DEFAULT_TRACKER = [
  { item: "Onboard vendor ACME", status: "done", owner: "ops" },
  { item: "Migrate billing export", status: "in-progress", owner: "finance" },
  { item: "Rotate service credentials", status: "in-progress", owner: "ops" },
  { item: "Archive Q2 tickets", status: "blocked", owner: "support" },
];

// Compile the tracker rows into a deterministic Markdown status document.
function compileStatusDocument(tracker) {
  const counts = tracker.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `${count} ${status}`)
    .join(", ");
  const rows = tracker
    .map(row => `- [${row.status}] ${row.item} (${row.owner})`)
    .join("\n");
  return {
    document: `# Weekly Operations Status\n\n${tracker.length} items: ${summary}.\n\n${rows}\n`,
    rows: tracker.length,
    summary,
  };
}

// Core scenario. Returns the runtime-report, the path the document was written
// to, the registry listing, and the compiled document itself.
async function runStatusReport({ tracker = DEFAULT_TRACKER, outputDir } = {}) {
  if (!Array.isArray(tracker)) throw new TypeError("tracker must be an array");
  const root = outputDir || (await fs.mkdtemp(path.join(os.tmpdir(), "opspilot-status-")));

  const registry = new ToolRegistry();
  registerFilesystemTool(registry, { root });

  const instruction = "Generate the weekly operations status from the tracker";
  const { report } = runTaskPipeline(instruction, () => compileStatusDocument(tracker));

  // Persist the compiled document through the registered filesystem tool.
  const fsTool = registry.get("filesystem");
  const relativePath = "reports/weekly-status.md";
  const writeResult = await fsTool.execute(
    JSON.stringify({ op: "write", path: relativePath, content: report.output.document })
  );

  return {
    instruction,
    report,
    registry: registry.list(),
    savedPath: writeResult.path,
    document: report.output.document,
  };
}

module.exports = { compileStatusDocument, runStatusReport };

if (require.main === module) {
  runStatusReport()
    .then(({ report, registry, savedPath }) => {
      console.log(renderReport(report, { title: "Scenario 2 — Weekly status report" }));
      console.log(`\nregistered tools : ${registry.map(tool => tool.name).join(", ")}`);
      console.log(`saved report to  : ${savedPath}`);
    })
    .catch(error => {
      console.error("status-report scenario failed:", error);
      process.exitCode = 1;
    });
}
