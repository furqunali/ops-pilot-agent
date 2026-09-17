function verifyResult(result) {
  if (!result || typeof result !== "object") {
    throw new TypeError("result must be an object");
  }

  const validStatus = ["success", "failed", "skipped"].includes(result.status);
  const hasTask = typeof result.task === "string" && result.task.trim().length > 0;

  return {
    valid: validStatus && hasTask,
    checks: {
      taskPresent: hasTask,
      statusValid: validStatus,
    },
  };
}

module.exports = { verifyResult };
