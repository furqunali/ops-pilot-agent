"use strict";

const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "RUNTIME_INVALID_INPUT",
  PLAN_INVALID: "RUNTIME_PLAN_INVALID",
  AUTHORIZATION_DENIED: "RUNTIME_AUTHORIZATION_DENIED",
  TOOL_REQUIRED: "RUNTIME_TOOL_REQUIRED",
  EXECUTION_FAILED: "RUNTIME_EXECUTION_FAILED",
  VERIFICATION_FAILED: "RUNTIME_VERIFICATION_FAILED",
  RECOVERY_BLOCKED: "RUNTIME_RECOVERY_BLOCKED",
  PERSISTENCE_FAILED: "RUNTIME_PERSISTENCE_FAILED",
});

class RuntimeError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.context = options.context && typeof options.context === "object" ? { ...options.context } : {};
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

function normalizeExecutionError(error, context = {}) {
  if (error instanceof RuntimeError) return { name: error.name, code: error.code, message: error.message, context: { ...error.context, ...context } };
  if (error instanceof Error) return { name: error.name || "Error", code: error.code || "RUNTIME_UNCLASSIFIED", message: error.message || "Unknown error", context: { ...(error.context && typeof error.context === "object" ? error.context : {}), ...context } };
  return { name: "UnknownError", code: "RUNTIME_UNCLASSIFIED", message: String(error), context: { ...context } };
}

function withErrorContext(error, context = {}) {
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new TypeError("context must be an object");
  return normalizeExecutionError(error, context);
}

function createRuntimeError(code, message, context = {}, cause) {
  if (!Object.values(ERROR_CODES).includes(code)) throw new TypeError("code must be a known runtime error code");
  return new RuntimeError(code, message, { context, cause });
}

module.exports = { ERROR_CODES, RuntimeError, createRuntimeError, normalizeExecutionError, withErrorContext };
