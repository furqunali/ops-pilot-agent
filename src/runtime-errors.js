function normalizeExecutionError(error) {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message || "Unknown error" };
  }
  return { name: "UnknownError", message: String(error) };
}

function withErrorContext(error, context = {}) {
  const normalized = normalizeExecutionError(error);
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new TypeError("context must be an object");
  }
  return { ...normalized, context: { ...context } };
}

module.exports = { normalizeExecutionError, withErrorContext };
