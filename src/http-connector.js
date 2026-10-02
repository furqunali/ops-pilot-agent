"use strict";

const { resolveConnectorConfig } = require("./connector-config");
const { executeWithRetry } = require("./retry-policy");

function createHttpConnector(definition, env = process.env, options = {}) {
  const config = resolveConnectorConfig(definition, env);
  if (!config.ready) throw new Error(`connector '${config.name}' is not configured: ${config.missing.join(", ")}`);
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 10_000;
  const headers = { accept: "application/json", ...(options.headers || {}) };
  const authHeader = options.authHeader || "authorization";
  const secret = env[definition.requiredEnv[0]];
  const retryOptions = options.retryOptions || { maxAttempts: 1 };
  if (secret) headers[authHeader] = `Bearer ${secret}`;

  return Object.freeze({
    name: config.name,
    async request(path, requestOptions = {}) {
      if (typeof path !== "string" || !path.startsWith("/")) throw new TypeError("path must start with '/'");
      const execution = await executeWithRetry(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(new URL(path, config.baseUrl), {
            ...requestOptions,
            headers: { ...headers, ...(requestOptions.headers || {}) },
            signal: controller.signal,
          });
          const text = await response.text();
          let body = text;
          try { body = text ? JSON.parse(text) : null; } catch { /* preserve non-JSON response bodies */ }
          if (!response.ok) {
            const error = new Error(`connector request failed with status ${response.status}`);
            error.code = "CONNECTOR_HTTP_ERROR";
            error.status = response.status;
            error.body = body;
            error.retryable = response.status >= 500 || response.status === 429;
            throw error;
          }
          return Object.freeze({ status: response.status, body });
        } catch (error) {
          if (error.name === "AbortError") {
            const timeout = new Error(`connector request timed out after ${timeoutMs}ms`);
            timeout.code = "CONNECTOR_TIMEOUT";
            timeout.retryable = true;
            throw timeout;
          }
          throw error;
        } finally {
          clearTimeout(timer);
        }
      }, retryOptions);
      if (execution.error) throw Object.assign(new Error(execution.error.message), execution.error);
      return execution.value;
    },
  });
}

module.exports = { createHttpConnector };
