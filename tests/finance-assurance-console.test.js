"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildEvaluationDashboard } = require("../src/finance-evaluation-dashboard");
const { renderAssuranceConsole } = require("../src/finance-assurance-console");

test("assurance report includes product identity, gates, decisions, and actionable failures", () => {
  const report = buildEvaluationDashboard({ results: [
    { id: "invoice-allow", passed: true, policyPass: true, evidencePass: true, evaluatorPass: true, actualDecision: "allowed" },
    { id: "vendor-block", passed: false, policyPass: false, evidencePass: true, evaluatorPass: true, expectedDecision: "blocked", actualDecision: "allowed", evidence: [{ id: "vendor-policy", title: "Vendor policy" }] },
  ] }, { generatedAt: new Date("2026-10-14T00:00:00.000Z"), runId: "run-42" });

  assert.equal(report.product, "OpsPilot Assurance Console");
  assert.equal(report.schemaVersion, "2.0");
  assert.equal(report.status, "attention_required");
  assert.equal(report.risk, "critical");
  assert.equal(report.runId, "run-42");
  assert.deepEqual(report.pipeline, ["intake", "policy_gate", "evidence_binding", "approval_control", "simulation", "audit_commit", "evaluation"]);
  assert.deepEqual(report.failures[0].failedGates, ["policy"]);
  assert.equal(report.decisions.allowed, 2);
});

test("assurance console has a distinct terminal presentation and JSON mode", () => {
  const report = buildEvaluationDashboard({ results: [
    { id: "safe-payment", passed: true, policyPass: true, evidencePass: true, evaluatorPass: true, actualDecision: "allowed" },
  ] }, { generatedAt: new Date("2026-10-14T00:00:00.000Z") });
  const text = renderAssuranceConsole(report);
  assert.match(text, /OPS PILOT \/ ASSURANCE CONSOLE/);
  assert.match(text, /POLICY GATE/);
  assert.match(text, /None — all evaluation gates passed/);
  assert.deepEqual(JSON.parse(renderAssuranceConsole(report, { format: "json" })), report);
  assert.throws(() => renderAssuranceConsole(report, { format: "html" }), /format must be text or json/);
});

test("assurance console rejects malformed reports", () => {
  assert.throws(() => renderAssuranceConsole(null), /report must be an assurance console report/);
});
