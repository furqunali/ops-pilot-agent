"use strict";

const STATUSES = new Set(["success","failed","skipped"]);

function normalizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (!STATUSES.has(value)) throw new TypeError(`unsupported status: ${status}`);
  return value;
}

function normalizeOutput(output) {
  if (output === undefined) return null;
  if (output === null) return null;
  if (typeof output === "string" || typeof output === "number" || typeof output === "boolean") return output;
  if (Array.isArray(output)) return output.map(normalizeOutput);
  if (typeof output === "object") {
    const normalized = {};
    for (const [key, value] of Object.entries(output)) normalized[key] = normalizeOutput(value);
    return normalized;
  }
  return String(output);
}

function normalizeResult(result) {
  if (!result || typeof result !== "object") throw new TypeError("result must be an object");
  const status = normalizeStatus(result.status);
  const task = typeof result.task === "string" ? result.task.trim() : "";
  if (!task) throw new TypeError("result.task must be non-empty");
  return {
    task,
    status,
    output: normalizeOutput(result.output),
    error: result.error == null ? null : String(result.error),
    metadata: normalizeOutput(result.metadata || {}),
  };
}

function mergeResults(primary, secondary) {
  const left = normalizeResult(primary);
  const right = normalizeResult(secondary);
  return normalizeResult({
    task: left.task,
    status: right.status,
    output: right.output ?? left.output,
    error: right.error ?? left.error,
    metadata: { ...left.metadata, ...right.metadata },
  });
}

function resultSummary(results) {
  if (!Array.isArray(results)) throw new TypeError("results must be an array");
  const normalized = results.map(normalizeResult);
  const counts = { success: 0, failed: 0, skipped: 0 };
  for (const result of normalized) counts[result.status] += 1;
  return {
    total: normalized.length,
    ...counts,
    successRate: normalized.length ? counts.success / normalized.length : 0,
    failureRate: normalized.length ? counts.failed / normalized.length : 0,
  };
}

module.exports = { STATUSES, normalizeStatus, normalizeOutput, normalizeResult, mergeResults, resultSummary };
