"use strict";

// Scenario 1 — "Summarise & route" (examples.md, pattern 1).
//
// Instruction: "Summarise today's support inbox and flag anything urgent."
//
// This wires the policy-gated async pipeline end to end:
//   executePlannedTask -> plan -> execution-policy gate -> tool -> verify -> audit
// and then flattens the run into a runtime-report (src/runtime-report.js).
//
// It also demonstrates the human-in-the-loop guardrail: an outward-facing
// follow-up ("email every flagged customer") is run WITHOUT a tool, so the
// execute stage is skipped with a reason instead of acting unconstrained.

const { executePlannedTask } = require("../src/pipeline-execution");
const { buildRuntimeReport } = require("../src/runtime-report");
const { renderReport } = require("./_render");

// A small, non-sensitive fixture standing in for a real inbox connector.
const DEFAULT_MESSAGES = [
  { id: "T-1001", from: "acme@example.com", subject: "Invoice question", priority: "normal" },
  { id: "T-1002", from: "beta@example.com", subject: "URGENT: production down", priority: "urgent" },
  { id: "T-1003", from: "gamma@example.com", subject: "Feature request", priority: "low" },
  { id: "T-1004", from: "delta@example.com", subject: "Cannot log in — urgent", priority: "urgent" },
];

// Build a read-only inbox tool that conforms to the tool contract. The messages
// are captured in the closure; execute() receives the (trimmed) task string and
// returns a serialisable digest — exactly what the pipeline expects.
function createInboxTool(messages = DEFAULT_MESSAGES) {
  if (!Array.isArray(messages)) throw new TypeError("messages must be an array");
  return {
    name: "support-inbox",
    capabilities: ["read"],
    execute(task) {
      const flagged = messages.filter(
        message => message.priority === "urgent" || /urgent/i.test(message.subject)
      );
      return {
        instruction: task,
        total: messages.length,
        urgent: flagged.length,
        flagged: flagged.map(message => ({ id: message.id, subject: message.subject })),
        digest: `${messages.length} messages triaged; ${flagged.length} flagged for a human.`,
      };
    },
  };
}

// Flatten an executePlannedTask run into a runtime-report. executePlannedTask
// returns `task` as a string, so we adapt it to the { task: { input } } shape
// buildRuntimeReport validates.
function reportFor(run) {
  return buildRuntimeReport({
    task: { input: run.task },
    plan: run.plan,
    result: run.result,
    verification: run.verification,
    audit: run.audit,
  });
}

// Core scenario. Returns the successful triage run, its report, and the
// guardrail run so callers (and tests) can assert on real outcomes.
async function runInboxTriage({ messages } = {}) {
  const instruction = "Summarise today's support inbox and flag anything urgent";
  const inbox = createInboxTool(messages);

  const run = await executePlannedTask(instruction, inbox);
  const report = reportFor(run);

  // The outward-facing follow-up is intentionally run without a tool: the
  // execution-policy gate skips it rather than emailing customers unchecked.
  const guardrailRun = await executePlannedTask("email every flagged customer a status update");

  return { instruction, run, report, guardrail: guardrailRun };
}

module.exports = { createInboxTool, runInboxTriage };

if (require.main === module) {
  runInboxTriage()
    .then(({ report, guardrail }) => {
      console.log(renderReport(report, { title: "Scenario 1 — Inbox triage" }));
      console.log("\nGuardrail (outward-facing action, no tool supplied):");
      console.log(`  status : ${guardrail.result.status}`);
      console.log(`  reason : ${guardrail.result.error}`);
    })
    .catch(error => {
      console.error("inbox-triage scenario failed:", error);
      process.exitCode = 1;
    });
}
