"use strict";

const { dashboardToJson } = require("./finance-evaluation-dashboard");

function renderAssuranceConsole(report, { format = "text" } = {}) {
  if (!report || typeof report !== "object" || !report.summary || !report.dimensions) {
    throw new TypeError("report must be an assurance console report");
  }
  if (format === "json") return dashboardToJson(report);
  if (format !== "text") throw new TypeError("format must be text or json");

  const pct = value => `${(value * 100).toFixed(1)}%`;
  const line = (label, value) => `${label.padEnd(18, " ")} ${value}`;
  const out = [
    "OPS PILOT / ASSURANCE CONSOLE",
    "════════════════════════════════════════════════════",
    `${report.status.toUpperCase()}  ·  RISK ${report.risk.toUpperCase()}  ·  PROFILE ${report.profile}`,
    `Run: ${report.runId || "not-correlated"}    Generated: ${report.generatedAt}`,
    "────────────────────────────────────────────────────",
    line("EVALUATION", `${report.summary.passed}/${report.summary.total} passed (${pct(report.summary.passRate)})`),
    line("POLICY GATE", pct(report.dimensions.policy.passRate)),
    line("EVIDENCE BINDING", pct(report.dimensions.evidence.passRate)),
    line("EVALUATOR", pct(report.dimensions.evaluator.passRate)),
    "────────────────────────────────────────────────────",
    "DECISION DISTRIBUTION",
  ];
  const decisions = Object.entries(report.decisions || {});
  out.push(...(decisions.length ? decisions.map(([name, count]) => line(name, String(count))) : ["No decisions recorded"]));
  out.push("────────────────────────────────────────────────────", "FAILED GATES");
  out.push(...(report.failures.length ? report.failures.map(failure => `${failure.id}: ${failure.failedGates.join(", ") || "overall evaluator"}`) : ["None — all evaluation gates passed"]));
  return out.join("\n");
}

module.exports = { renderAssuranceConsole };
