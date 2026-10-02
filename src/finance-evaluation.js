"use strict";

const { DECISIONS, evaluatePaymentPolicy } = require("./finance-policy");
const { attachPolicyEvidence } = require("./finance-policy-evidence");
const { buildEvaluationDashboard } = require("./finance-evaluation-dashboard");

const DEFAULT_CASES = Object.freeze([
  {
    id: "allow-small-payment",
    payment: { currency: "USD", amount: 250, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    query: "approval threshold",
    expectedDecision: DECISIONS.ALLOWED,
    expectedEvidence: ["payment-threshold"],
  },
  {
    id: "approve-large-payment",
    payment: { currency: "USD", amount: 1500, vendorId: "vendor-ok" },
    policy: { approvalThreshold: 1000 },
    query: "approval threshold",
    expectedDecision: DECISIONS.REQUIRES_APPROVAL,
    expectedEvidence: ["payment-threshold"],
  },
  {
    id: "block-vendor",
    payment: { currency: "USD", amount: 250, vendorId: "vendor-blocked" },
    policy: { approvalThreshold: 1000, blockedVendors: ["vendor-blocked"] },
    query: "blocked vendors",
    expectedDecision: DECISIONS.BLOCKED,
    expectedEvidence: ["vendor-blocklist"],
  },
]);

function validateCase(testCase) {
  if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) throw new TypeError("testCase must be an object");
  if (typeof testCase.id !== "string" || !testCase.id.trim()) throw new TypeError("testCase.id must be non-empty");
  if (!testCase.payment || !testCase.policy) throw new TypeError("testCase must include payment and policy");
  if (typeof testCase.query !== "string" || !testCase.query.trim()) throw new TypeError("testCase.query must be non-empty");
  if (!Array.isArray(testCase.expectedEvidence)) throw new TypeError("testCase.expectedEvidence must be an array");
  return true;
}

function evaluateFinanceCase(testCase, knowledge, evaluator = null) {
  validateCase(testCase);
  const decision = evaluatePaymentPolicy(testCase.payment, testCase.policy);
  const evidencedDecision = attachPolicyEvidence(decision, knowledge, testCase.query);
  const evidenceIds = evidencedDecision.evidence.map(item => item.id);
  const expectedEvidence = testCase.expectedEvidence;
  const policyPass = decision.decision === testCase.expectedDecision;
  const evidencePass = expectedEvidence.every(id => evidenceIds.includes(id));
  const evaluatorPass = evaluator ? evaluator(evidencedDecision, testCase) === true : true;

  return Object.freeze({
    id: testCase.id,
    passed: policyPass && evidencePass && evaluatorPass,
    policyPass,
    evidencePass,
    evaluatorPass,
    expectedDecision: testCase.expectedDecision,
    actualDecision: decision.decision,
    evidence: evidencedDecision.evidence,
  });
}

function evaluateFinanceSuite(testCases, knowledge, evaluator = null) {
  if (!Array.isArray(testCases)) throw new TypeError("testCases must be an array");
  const results = testCases.map(testCase => evaluateFinanceCase(testCase, knowledge, evaluator));
  const passed = results.filter(result => result.passed).length;
  return Object.freeze({
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? passed / results.length : 0,
    results,
  });
}

function evaluateFinanceSuiteDashboard(testCases, knowledge, evaluator = null, options = {}) {
  const suite = evaluateFinanceSuite(testCases, knowledge, evaluator);
  return Object.freeze({ suite, dashboard: buildEvaluationDashboard(suite, options) });
}

module.exports = { DEFAULT_CASES, validateCase, evaluateFinanceCase, evaluateFinanceSuite, evaluateFinanceSuiteDashboard };
