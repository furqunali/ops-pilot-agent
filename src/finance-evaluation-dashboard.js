"use strict";

function buildEvaluationDashboard(suite, { generatedAt = new Date() } = {}) {
  if (!suite || typeof suite !== "object" || !Array.isArray(suite.results)) {
    throw new TypeError("suite must expose results");
  }
  if (!(generatedAt instanceof Date) || Number.isNaN(generatedAt.getTime())) {
    throw new TypeError("generatedAt must be a valid Date");
  }

  const dimensions = {
    policy: suite.results.filter(result => result.policyPass).length,
    evidence: suite.results.filter(result => result.evidencePass).length,
    evaluator: suite.results.filter(result => result.evaluatorPass).length,
    overall: suite.results.filter(result => result.passed).length,
  };
  const total = suite.results.length;
  const rate = count => (total ? count / total : 0);

  return Object.freeze({
    generatedAt: generatedAt.toISOString(),
    total,
    passed: dimensions.overall,
    failed: total - dimensions.overall,
    passRate: rate(dimensions.overall),
    dimensions: Object.freeze({
      policy: Object.freeze({ passed: dimensions.policy, passRate: rate(dimensions.policy) }),
      evidence: Object.freeze({ passed: dimensions.evidence, passRate: rate(dimensions.evidence) }),
      evaluator: Object.freeze({ passed: dimensions.evaluator, passRate: rate(dimensions.evaluator) }),
    }),
    failures: suite.results
      .filter(result => !result.passed)
      .map(result => Object.freeze({
        id: result.id,
        policyPass: result.policyPass,
        evidencePass: result.evidencePass,
        evaluatorPass: result.evaluatorPass,
      })),
  });
}

function dashboardToJson(dashboard) {
  if (!dashboard || typeof dashboard !== "object") throw new TypeError("dashboard must be an object");
  if (typeof dashboard.passRate !== "number" || !dashboard.dimensions) throw new TypeError("dashboard must be a built evaluation dashboard");
  return JSON.stringify(dashboard, null, 2);
}

module.exports = { buildEvaluationDashboard, dashboardToJson };
