"use strict";

function validateLedger(ledger) {
  if (!ledger || !Array.isArray(ledger.entries)) throw new TypeError("ledger must expose entries");
}

function indexRuns(ledger) {
  validateLedger(ledger);
  const runs = new Map();
  for (const entry of ledger.entries) {
    const runId = entry?.metadata?.runId;
    if (typeof runId !== "string" || !runId.trim()) continue;
    if (!runs.has(runId)) runs.set(runId, { runId, starts: [], completions: [] });
    const run = runs.get(runId);
    if (entry.type === "start") run.starts.push(entry);
    if (entry.type === "completion") run.completions.push(entry);
  }
  return runs;
}

function inspectRun(ledger, runId) {
  if (typeof runId !== "string" || !runId.trim()) throw new TypeError("runId must be a non-empty string");
  const run = indexRuns(ledger).get(runId);
  if (!run) return { runId, state: "unknown", recoverable: false, start: null, completion: null };

  const completion = run.completions[run.completions.length - 1] || null;
  const start = run.starts[run.starts.length - 1] || null;

  if (completion) {
    return {
      runId,
      state: completion.status === "failed" ? "failed" : "completed",
      recoverable: false,
      start,
      completion,
    };
  }

  if (start) return { runId, state: "interrupted", recoverable: true, start, completion: null };
  return { runId, state: "unknown", recoverable: false, start: null, completion: null };
}

function listRecoverableRuns(ledger) {
  return [...indexRuns(ledger).keys()]
    .map(runId => inspectRun(ledger, runId))
    .filter(run => run.recoverable);
}

function recoverRun(ledger, runId, { authorize, resume }) {
  if (typeof authorize !== "function") throw new TypeError("authorize must be a function");
  if (typeof resume !== "function") throw new TypeError("resume must be a function");

  const state = inspectRun(ledger, runId);
  if (state.state !== "interrupted") {
    return { status: "skipped", reason: "run is " + state.state, runId };
  }

  const decision = authorize(state.start.task, state.start.metadata);
  if (!decision || decision.allowed !== true) {
    return { status: "blocked", reason: decision?.reason || "recovery is not authorized", runId };
  }

  const result = resume(state.start.task);
  if (!result || typeof result.status !== "string") {
    throw new TypeError("resume must return a runtime result");
  }
  const completion = ledger.recordCompletion(
    state.start.task,
    result,
    { ...state.start.metadata, recovered: true, recovery: "resume", recoveryRunId: runId }
  );

  return { status: "recovered", runId, result, completion };
}

module.exports = { inspectRun, listRecoverableRuns, recoverRun };
