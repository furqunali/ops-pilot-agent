function assessRuntimeHealth(summary) {
  if (!summary || typeof summary !== "object") throw new TypeError("summary is required");
  const failed = Number(summary.failed) || 0;
  const total = Number(summary.total) || 0;
  return {
    healthy: total > 0 && failed === 0,
    total,
    failed,
    successRate: total === 0 ? 0 : (total - failed) / total,
  };
}

module.exports = { assessRuntimeHealth };
