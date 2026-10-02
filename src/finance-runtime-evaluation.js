"use strict";

function evaluateFinanceAgentRun(run, expectations = {}) {
  if (!run || typeof run !== "object" || !run.finance || !run.result || !run.verification) {
    throw new TypeError("run must contain finance, result, and verification");
  }

  const expectedFinanceStatus = expectations.expectedFinanceStatus || "prepared";
  const expectedRuntimeStatus = expectations.expectedRuntimeStatus || "success";
  const expectedVerified = expectations.expectedVerified ?? true;

  const financePass = run.finance.status === expectedFinanceStatus;
  const runtimePass = run.result.status === expectedRuntimeStatus;
  const verificationPass = run.verification.valid === expectedVerified;
  const evidencePass = Array.isArray(run.finance.decision?.evidence) && run.finance.decision.evidence.length > 0;

  return Object.freeze({
    passed: financePass && runtimePass && verificationPass && evidencePass,
    financePass,
    runtimePass,
    verificationPass,
    evidencePass,
    runId: run.runId || null,
    actualFinanceStatus: run.finance.status,
    actualRuntimeStatus: run.result.status,
  });
}

function evaluateFinanceAgentRuns(runs, expectations = {}) {
  if (!Array.isArray(runs)) throw new TypeError("runs must be an array");
  const results = runs.map(run => evaluateFinanceAgentRun(run, expectations));
  const passed = results.filter(result => result.passed).length;
  return Object.freeze({
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? passed / results.length : 0,
    results,
  });
}

module.exports = { evaluateFinanceAgentRun, evaluateFinanceAgentRuns };
