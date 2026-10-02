"use strict";

const { evaluateFinanceCase } = require("./finance-evaluation");

function evaluateRuntimeFinanceRun(run, testCase, knowledge, evaluator = null) {
  if (!run || typeof run !== "object") throw new TypeError("run must be an object");
  if (typeof run.runId !== "string" || !run.runId.trim()) throw new TypeError("run.runId must be a non-empty string");
  if (!run.result || typeof run.result.status !== "string") throw new TypeError("run.result must expose status");

  const evaluation = evaluateFinanceCase(testCase, knowledge, evaluator);
  return Object.freeze({
    runId: run.runId,
    runtimeStatus: run.result.status,
    verified: Boolean(run.verification?.valid),
    passed: evaluation.passed,
    evaluation,
  });
}

function summarizeRuntimeFinanceEvaluations(results) {
  if (!Array.isArray(results)) throw new TypeError("results must be an array");
  const passed = results.filter(result => result && result.passed === true).length;
  const verified = results.filter(result => result && result.verified === true).length;
  const total = results.length;
  return Object.freeze({
    total,
    passed,
    failed: total - passed,
    passRate: total ? passed / total : 0,
    verified,
    verificationRate: total ? verified / total : 0,
  });
}

module.exports = { evaluateRuntimeFinanceRun, summarizeRuntimeFinanceEvaluations };
