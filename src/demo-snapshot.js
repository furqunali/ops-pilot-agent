"use strict";

// Builds the deterministic demo snapshot shown on the public Hugging Face
// Space: the Finance policy evaluation (with its Assurance Console), the
// end-to-end runtime evaluation and the five-scenario workflow evaluation.
// Everything runs offline against simulation-only fixtures.

const { DEFAULT_CASES, evaluateFinanceSuiteDashboard } = require("./finance-evaluation");
const { createPolicyKnowledge } = require("./finance-policy-knowledge");
const { renderAssuranceConsole } = require("./finance-assurance-console");
const { runFinanceAgentTask } = require("./finance-runtime");
const { evaluateFinanceAgentRuns } = require("./finance-runtime-evaluation");
const { evaluateFinanceWorkflowSuite } = require("./finance-workflow-evaluation");
const { ExecutionLedger } = require("./execution-ledger");

const SNAPSHOT_SCHEMA_VERSION = "opspilot.demo-snapshot/v1";

function referenceKnowledge() {
  return createPolicyKnowledge([
    { id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." },
    { id: "vendor-blocklist", title: "Vendor blocklist", text: "Blocked vendors cannot receive payments." },
  ]);
}

function buildAssuranceConsole({ runId = "console-001", generatedAt = new Date(), profile = "finance-reference" } = {}) {
  const { suite, dashboard } = evaluateFinanceSuiteDashboard(DEFAULT_CASES, referenceKnowledge(), null, { runId, profile, generatedAt });
  return { suite, dashboard, text: renderAssuranceConsole(dashboard) };
}

function buildDemoSnapshot({ runId = "hf-demo-001", generatedAt = new Date(), testCount = null } = {}) {
  const generated = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  if (Number.isNaN(generated.getTime())) throw new TypeError("generatedAt must be a valid date");
  const consoleResult = buildAssuranceConsole({ runId, generatedAt: generated });

  const runtimeRun = runFinanceAgentTask({
    task: "prepare vendor payment",
    payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    knowledge: referenceKnowledge(),
    ledger: new ExecutionLedger(),
    runId: `${runId}:runtime`,
  });
  const runtimeEvaluation = evaluateFinanceAgentRuns([runtimeRun]);
  const workflowEvaluation = evaluateFinanceWorkflowSuite();
  const dashboard = consoleResult.dashboard;

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    runId,
    generatedAt: generated.toISOString(),
    executionMode: "simulation_only",
    tests: Number.isInteger(testCount) ? { total: testCount } : null,
    kpis: {
      workflow: { passed: workflowEvaluation.passed, total: workflowEvaluation.total },
      policySuite: { passed: dashboard.summary.passed, total: dashboard.summary.total },
      runtime: { passed: runtimeEvaluation.passed, total: runtimeEvaluation.total },
      risk: dashboard.risk,
      status: dashboard.status,
    },
    assuranceConsole: { text: consoleResult.text, report: JSON.parse(renderAssuranceConsole(dashboard, { format: "json" })) },
    runtimeEvaluation,
    workflowEvaluation,
  };
}

module.exports = { SNAPSHOT_SCHEMA_VERSION, referenceKnowledge, buildAssuranceConsole, buildDemoSnapshot };
