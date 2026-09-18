function recordStage(stages, stage, status, startedAt, finishedAt, metadata = {}) {
  if (!Array.isArray(stages)) throw new TypeError("stages must be an array");
  if (typeof stage !== "string" || !stage.trim()) throw new TypeError("stage must be non-empty");
  if (typeof status !== "string" || !status.trim()) throw new TypeError("status must be non-empty");
  if (!(startedAt instanceof Date) || !(finishedAt instanceof Date)) throw new TypeError("timestamps must be Date values");
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
  return stages.concat({ stage: stage.trim(), status: status.trim(), durationMs, metadata });
}

function summarizeStages(stages) {
  if (!Array.isArray(stages)) throw new TypeError("stages must be an array");
  return {
    total: stages.length,
    successful: stages.filter(item => item.status === "success").length,
    failed: stages.filter(item => item.status === "failed").length,
    durationMs: stages.reduce((sum, item) => sum + (Number(item.durationMs) || 0), 0),
  };
}

module.exports = { recordStage, summarizeStages };
