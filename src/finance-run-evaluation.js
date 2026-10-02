"use strict";

function evaluateFinanceRun(run, expectations = {}) {
  if (!run || typeof run !== "object") throw new TypeError("run must be an object");
  if (!run.runId || !run.result || !run.verification) throw new TypeError("run must contain runId, result, and verification");
  const expectedStatus = expectations.expectedStatus || "success";
  const statusPass = run.result.status === expectedStatus;
  const verificationPass = run.verification.valid === true;
  const auditPass = Array.isArray(run.audit);
  const observabilityPass = Boolean(run.observability?.summary);
  return Object.freeze({ runId: run.runId, passed: statusPass && verificationPass && auditPass && observabilityPass, statusPass, verificationPass, auditPass, observabilityPass, actualStatus: run.result.status, expectedStatus });
}

function summarizeFinanceRuns(runs, expectations = {}) {
  if (!Array.isArray(runs)) throw new TypeError("runs must be an array");
  const results = runs.map(run => evaluateFinanceRun(run, expectations));
  const passed = results.filter(result => result.passed).length;
  return Object.freeze({ total: results.length, passed, failed: results.length - passed, passRate: results.length ? passed / results.length : 0, results });
}

module.exports = { evaluateFinanceRun, summarizeFinanceRuns };
