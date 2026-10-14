"use strict";

const { ExecutionLedger } = require("./execution-ledger");
const { createPolicyKnowledge } = require("./finance-policy-knowledge");
const { runFinanceWorkflow } = require("./finance-reference-workflow");

const DEFAULT_WORKFLOW_CASES = Object.freeze([
  {
    id: "workflow-allowed-payment",
    payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    expectedStatus: "prepared",
    expectedDecision: "allowed",
    approval: null,
  },
  {
    id: "workflow-blocked-vendor",
    payment: { currency: "USD", amount: 250, vendorId: "vendor-blocked" },
    policy: { approvalThreshold: 1000, blockedVendors: ["vendor-blocked"] },
    expectedStatus: "blocked",
    expectedDecision: "blocked",
    approval: null,
  },
  {
    id: "workflow-pending-approval",
    payment: { currency: "USD", amount: 1500, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    expectedStatus: "pending",
    expectedDecision: "requires_approval",
    approval: null,
  },
  {
    id: "workflow-approved-payment",
    payment: { currency: "USD", amount: 1500, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    expectedStatus: "prepared",
    expectedDecision: "requires_approval",
    approval: { decision: "approved", reviewer: "evaluation-reviewer" },
  },
  {
    id: "workflow-rejected-payment",
    payment: { currency: "USD", amount: 1500, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    expectedStatus: "rejected",
    expectedDecision: "requires_approval",
    approval: { decision: "rejected", reviewer: "evaluation-reviewer" },
  },
]);

function createDefaultFinanceKnowledge() {
  return createPolicyKnowledge([
    { id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." },
    { id: "vendor-blocklist", title: "Vendor blocklist", text: "Blocked vendors cannot receive payments." },
  ]);
}

function evaluateFinanceWorkflowCase(testCase, { knowledge = createDefaultFinanceKnowledge(), workflow = runFinanceWorkflow } = {}) {
  if (!testCase || typeof testCase !== "object" || Array.isArray(testCase) || typeof testCase.id !== "string" || !testCase.id.trim()) {
    throw new TypeError("testCase must have a non-empty id");
  }
  if (typeof workflow !== "function") throw new TypeError("workflow must be a function");
  const ledger = new ExecutionLedger();
  const runId = "evaluation:" + testCase.id;
  const result = workflow({
    payment: testCase.payment,
    policy: testCase.policy,
    knowledge,
    ledger,
    runId,
    operationId: runId,
    tenantId: "evaluation",
    approval: testCase.approval,
  });
  const auditEvents = ledger.findByType("finance_audit");
  const expectedEvidenceId = testCase.expectedDecision === "blocked" ? "vendor-blocklist" : "payment-threshold";
  const evidencePass = testCase.expectedDecision === "blocked"
    ? result.decision?.evidence?.some(item => item.id === expectedEvidenceId) === true
    : result.decision?.evidence?.some(item => item.id === expectedEvidenceId) === true;
  const auditPass = auditEvents.length > 0 && auditEvents.every(event => event.metadata?.runId === runId);
  const policyPass = result.decision?.decision === testCase.expectedDecision;
  const workflowPass = result.status === testCase.expectedStatus;
  const noUnsafePreparation = result.status !== "blocked" && result.status !== "pending" && result.status !== "rejected"
    ? result.payment?.execution === "simulation_only"
    : result.payment === null;
  return Object.freeze({
    id: testCase.id,
    passed: policyPass && workflowPass && evidencePass && auditPass && noUnsafePreparation,
    policyPass,
    workflowPass,
    evidencePass,
    auditPass,
    noUnsafePreparation,
    expectedStatus: testCase.expectedStatus,
    actualStatus: result.status,
    expectedDecision: testCase.expectedDecision,
    actualDecision: result.decision?.decision ?? null,
    auditEventCount: auditEvents.length,
    runId,
  });
}

function evaluateFinanceWorkflowSuite(testCases = DEFAULT_WORKFLOW_CASES, options = {}) {
  if (!Array.isArray(testCases)) throw new TypeError("testCases must be an array");
  const results = testCases.map(testCase => evaluateFinanceWorkflowCase(testCase, options));
  const passed = results.filter(result => result.passed).length;
  return Object.freeze({
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? passed / results.length : 0,
    results,
  });
}

module.exports = {
  DEFAULT_WORKFLOW_CASES,
  createDefaultFinanceKnowledge,
  evaluateFinanceWorkflowCase,
  evaluateFinanceWorkflowSuite,
};
