"use strict";

function formatEntry(entry) {
  const runId = entry.metadata?.runId || "-";
  const attempts = entry.metadata?.attempts ?? entry.result?.attempts?.length ?? 0;
  const durationMs = entry.metadata?.durationMs ?? "-";
  return {
    id: entry.id,
    runId,
    type: entry.type,
    status: entry.status,
    task: entry.task ?? null,
    attempts,
    durationMs,
    authorization: entry.metadata?.authorization ?? null,
    timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : String(entry.timestamp),
  };
}

function inspectLedgerRuns(ledger, runId = null) {
  if (!ledger || !Array.isArray(ledger.entries)) throw new TypeError("ledger must expose entries");
  const entries = ledger.entries.filter(entry => entry.type === "completion" || entry.type === "start");
  if (runId !== null) {
    if (typeof runId !== "string" || !runId.trim()) throw new TypeError("runId must be a non-empty string");
    const matches = entries.filter(entry => entry.metadata?.runId === runId);
    if (matches.length === 0) return null;
    return matches.map(formatEntry);
  }

  const seen = new Set();
  return entries.slice().reverse().filter(entry => {
    const id = entry.metadata?.runId;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(formatEntry);
}

module.exports = { inspectLedgerRuns, formatEntry };
