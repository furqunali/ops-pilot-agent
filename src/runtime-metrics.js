"use strict";

function summarizeRuns(runs) {
  if (!Array.isArray(runs)) throw new TypeError("runs must be an array");

  const metrics = {
    total: runs.length,
    successful: 0,
    failed: 0,
    skipped: 0,
    verified: 0,
    unverified: 0,
    retryAttempts: 0,
    durationMs: 0,
  };

  for (const run of runs) {
    if (!run || !run.result || !run.verification) throw new TypeError("run result is incomplete");
    if (run.result.status === "success") metrics.successful += 1;
    if (run.result.status === "failed") metrics.failed += 1;
    if (run.result.status === "skipped") metrics.skipped += 1;
    if (run.verification.valid) metrics.verified += 1;
    else metrics.unverified += 1;

    metrics.retryAttempts += Number.isFinite(Number(run.retryAttempts)) ? Math.max(0, Number(run.retryAttempts)) : (Array.isArray(run.result.attempts) ? run.result.attempts.length : 0);
    metrics.durationMs += run.observability?.summary?.durationMs || 0;
  }

  return Object.freeze(metrics);
}

function metricsFromLedger(ledger) {
  if (!ledger || !Array.isArray(ledger.entries)) throw new TypeError("ledger must expose entries");
  const completions = ledger.entries.filter(entry => entry.type === "completion");
  return summarizeRuns(completions.map(entry => ({
    result: entry.result,
    retryAttempts: entry.metadata?.attempts,
    verification: { valid: Boolean(entry.metadata?.verified) },
    observability: { summary: { durationMs: Number(entry.metadata?.durationMs) || 0 } },
  })));
}

module.exports = { summarizeRuns, metricsFromLedger };
