"use strict";

const PRODUCT_NAME = "OpsPilot Assurance Console";
const PIPELINE = Object.freeze([
  "intake",
  "policy_gate",
  "evidence_binding",
  "approval_control",
  "simulation",
  "audit_commit",
  "evaluation",
]);

function buildEvaluationDashboard(suite, { generatedAt = new Date(), runId = null, profile = "finance-reference" } = {}) {
  if (!suite || typeof suite !== "object" || !Array.isArray(suite.results)) {
    throw new TypeError("suite must expose results");
  }
  if (!(generatedAt instanceof Date) || Number.isNaN(generatedAt.getTime())) {
    throw new TypeError("generatedAt must be a valid Date");
  }
  if (runId !== null && (typeof runId !== "string" || !runId.trim())) {
    throw new TypeError("runId must be null or a non-empty string");
  }
  if (typeof profile !== "string" || !profile.trim()) throw new TypeError("profile must be a non-empty string");

  const results = suite.results;
  const total = results.length;
  const count = predicate => results.filter(predicate).length;
  const rate = value => total ? value / total : 0;
  const policyPassed = count(result => result.policyPass === true);
  const evidencePassed = count(result => result.evidencePass === true);
  const evaluatorPassed = count(result => result.evaluatorPass === true);
  const passed = count(result => result.passed === true);
  const decisionCounts = {};
  for (const result of results) {
    const decision = result.actualDecision || "unclassified";
    decisionCounts[decision] = (decisionCounts[decision] || 0) + 1;
  }
  const failures = results.filter(result => result.passed !== true).map(result => Object.freeze({
    id: result.id,
    expectedDecision: result.expectedDecision ?? null,
    actualDecision: result.actualDecision ?? null,
    failedGates: Object.freeze([
      ...(result.policyPass === true ? [] : ["policy"]),
      ...(result.evidencePass === true ? [] : ["evidence"]),
      ...(result.evaluatorPass === true ? [] : ["evaluator"]),
    ]),
    evidence: result.evidence || [],
  }));
  const criticalFailures = failures.filter(result => result.failedGates.includes("policy")).length;
  const risk = criticalFailures ? "critical" : failures.length ? "elevated" : "nominal";

  return Object.freeze({
    product: PRODUCT_NAME,
    schemaVersion: "2.0",
    generatedAt: generatedAt.toISOString(),
    runId: runId ? runId.trim() : null,
    profile: profile.trim(),
    pipeline: PIPELINE,
    status: failures.length ? "attention_required" : "passed",
    risk,
    total,\n    passed,\n    failed: total - passed,\n    passRate: rate(passed),\n    summary: Object.freeze({ total, passed, failed: total - passed, passRate: rate(passed) }),
    dimensions: Object.freeze({
      policy: Object.freeze({ passed: policyPassed, failed: total - policyPassed, passRate: rate(policyPassed) }),
      evidence: Object.freeze({ passed: evidencePassed, failed: total - evidencePassed, passRate: rate(evidencePassed) }),
      evaluator: Object.freeze({ passed: evaluatorPassed, failed: total - evaluatorPassed, passRate: rate(evaluatorPassed) }),
    }),
    decisions: Object.freeze({ ...decisionCounts }),
    failures: Object.freeze(failures),
  });
}

function dashboardToJson(dashboard) {
  if (!dashboard || typeof dashboard !== "object" || Array.isArray(dashboard)) {
    throw new TypeError("dashboard must be an object");
  }
  return JSON.stringify(dashboard, null, 2);
}

module.exports = { PRODUCT_NAME, PIPELINE, buildEvaluationDashboard, dashboardToJson };
