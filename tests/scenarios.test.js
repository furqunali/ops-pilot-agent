"use strict";

// End-to-end tests for the runnable example scenarios. Each test imports the
// scenario's core function, runs it with injected fixtures (and, for the status
// report, a sandbox temp dir), and asserts on the real runtime-report / run
// produced by the actual pipeline modules. No network; filesystem writes are
// confined to a per-test temp directory that is cleaned up afterwards.

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { runInboxTriage, createInboxTool } = require("../examples/inbox-triage");
const { runStatusReport } = require("../examples/status-report");
const { runDataCleanup } = require("../examples/data-cleanup");

test("inbox-triage: triages fixtures, flags urgent, passes verification", async () => {
  const messages = [
    { id: "A", subject: "hello", priority: "normal" },
    { id: "B", subject: "URGENT: outage", priority: "urgent" },
    { id: "C", subject: "please help urgent", priority: "low" },
  ];
  const { run, report } = await runInboxTriage({ messages });

  assert.equal(run.result.status, "success");
  assert.equal(run.verification.valid, true);
  assert.deepEqual(
    run.audit.map(event => `${event.stage}:${event.status}`),
    ["parse:success", "plan:success", "execute:success", "verify:success", "report:success"]
  );

  assert.equal(report.status, "success");
  assert.equal(report.verified, true);
  assert.equal(report.steps.length, 5);
  assert.equal(report.output.total, 3);
  assert.equal(report.output.urgent, 2); // B (priority) + C (subject match)
  assert.deepEqual(report.output.flagged.map(item => item.id), ["B", "C"]);
});

test("inbox-triage: outward-facing follow-up is skipped by the guardrail", async () => {
  const { guardrail } = await runInboxTriage();
  assert.equal(guardrail.result.status, "skipped");
  assert.equal(guardrail.result.error, "tool is required");
});

test("inbox-triage: tool honours the tool contract", () => {
  const tool = createInboxTool([]);
  assert.equal(tool.name, "support-inbox");
  assert.deepEqual(tool.capabilities, ["read"]);
  assert.equal(tool.execute("t").urgent, 0);
});

test("status-report: compiles and persists the document inside the sandbox", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opspilot-status-test-"));
  try {
    const tracker = [
      { item: "Task one", status: "done", owner: "ops" },
      { item: "Task two", status: "blocked", owner: "support" },
    ];
    const { report, registry, savedPath, document } = await runStatusReport({ tracker, outputDir: root });

    assert.equal(report.status, "success");
    assert.equal(report.verified, true);
    assert.equal(report.steps.length, 5);
    assert.equal(report.output.rows, 2);

    // The filesystem tool was registered and used.
    assert.deepEqual(registry, [{ name: "filesystem", capabilities: ["read", "write"] }]);

    // The document was really written, inside the sandbox root, with matching content.
    assert.equal(savedPath, path.join(root, "reports", "weekly-status.md"));
    const onDisk = await fs.readFile(savedPath, "utf8");
    assert.equal(onDisk, document);
    assert.match(onDisk, /# Weekly Operations Status/);
    assert.match(onDisk, /1 blocked, 1 done/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("data-cleanup: de-duplicates, reshapes, and redacts secrets", () => {
  const records = [
    { vendor_id: "V-1", vendor_name: "One", contact_email: "a@x.example", api_key: "sk-secret" },
    { vendor_id: "V-1", vendor_name: "One dup", contact_email: "a@x.example" },
    { vendor_id: "V-2", vendor_name: "Two", contact_email: "b@x.example" },
  ];
  const { report, registry, summary } = runDataCleanup({ records });

  assert.equal(report.status, "success");
  assert.equal(report.verified, true);
  assert.equal(report.steps.length, 5);
  assert.deepEqual(registry, [{ name: "vendor-transform", capabilities: ["read"] }]);

  assert.equal(summary.before, 3);
  assert.equal(summary.after, 2);
  assert.equal(summary.duplicatesRemoved, 1);

  // Keys were renamed onto the clean shape and the secret was redacted (not dropped).
  assert.deepEqual(summary.cleaned.map(record => record.id), ["V-1", "V-2"]);
  assert.equal(summary.cleaned[0].name, "One");
  assert.equal(summary.cleaned[0].email, "a@x.example");
  assert.equal(summary.cleaned[0].api_key, "[REDACTED]");
});
