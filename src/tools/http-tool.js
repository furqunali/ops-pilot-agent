"use strict";

const { validateTool } = require("../tool-contract");
const { executeWithRetry } = require("../retry-policy");
const { redact, redactText } = require("../data-redaction");

const ALLOWED_METHODS = new Set([
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
]);

// HTTP status codes that indicate a transient failure worth retrying.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function headersToObject(headers) {
  if (!headers) return {};
  if (typeof headers.entries === "function") {
    return Object.fromEntries(headers.entries());
  }
  if (typeof headers.forEach === "function") {
    const output = {};
    headers.forEach((value, key) => { output[key] = value; });
    return output;
  }
  if (typeof headers === "object") return { ...headers };
  return {};
}

function parseRequest(input) {
  if (input && typeof input === "object") return input;
  if (typeof input !== "string" || !input.trim()) {
    throw new TypeError("http tool input must be a URL string or request object");
  }
  const trimmed = input.trim();
  if (trimmed.startsWith("{")) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new TypeError("http tool JSON input is invalid");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("http tool request object is invalid");
    }
    return parsed;
  }
  return { url: trimmed };
}

function normalizeRequest(request) {
  const url = request.url;
  if (typeof url !== "string" || !url.trim()) {
    throw new TypeError("http tool request requires a url");
  }
  const method = String(request.method || "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw new TypeError(`http tool method is not allowed: ${method}`);
  }
  const headers = { ...(request.headers || {}) };
  let body = request.body;
  if (body !== undefined && body !== null && typeof body === "object") {
    body = JSON.stringify(body);
    const hasContentType = Object.keys(headers).some(
      key => key.toLowerCase() === "content-type"
    );
    if (!hasContentType) headers["content-type"] = "application/json";
  }
  return { url: url.trim(), method, headers, body };
}

async function readBody(response) {
  const headers = headersToObject(response.headers);
  const contentType = String(
    headers["content-type"] || headers["Content-Type"] || ""
  ).toLowerCase();
  if (contentType.includes("application/json") && typeof response.json === "function") {
    try {
      return await response.json();
    } catch {
      // fall through to text parsing when the payload is not valid JSON
    }
  }
  if (typeof response.text === "function") {
    const text = await response.text();
    return typeof text === "string" ? redactText(text) : text;
  }
  return null;
}

/**
 * Build a tool-contract-compliant HTTP tool.
 *
 * The fetch implementation is injected so the tool can be exercised without
 * touching the network. Transient failures (network errors flagged retryable
 * by the retry policy, or retryable HTTP status codes) are retried through the
 * shared retry policy, and all headers/bodies are passed through data-redaction
 * before they leave the tool.
 *
 * @param {object} options
 * @param {Function} options.fetch      Fetch-like implementation (required).
 * @param {object}   [options.retry]    Retry-policy options (maxAttempts, ...).
 * @param {object}   [options.redaction] Options forwarded to data-redaction.
 * @param {string}   [options.name]     Tool name (default "http").
 * @param {string[]} [options.capabilities] Tool capabilities.
 */
function createHttpTool(options = {}) {
  const fetchImpl = options.fetch;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("createHttpTool requires an injectable fetch function");
  }
  const retryOptions = options.retry || {};
  const redactionOptions = options.redaction || {};
  const name = options.name || "http";
  const capabilities = Array.isArray(options.capabilities) && options.capabilities.length
    ? options.capabilities
    : ["read", "write"];

  async function execute(input) {
    const request = normalizeRequest(parseRequest(input));

    const { value: response, attempts, error } = await executeWithRetry(
      async () => {
        const res = await fetchImpl(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });
        if (!res || typeof res.status !== "number") {
          throw new TypeError("http tool received an invalid response");
        }
        if (RETRYABLE_STATUS.has(res.status)) {
          const retryable = new Error(`http request failed with status ${res.status}`);
          retryable.code = "TEMPORARY_FAILURE";
          retryable.retryable = true;
          retryable.status = res.status;
          throw retryable;
        }
        return res;
      },
      retryOptions
    );

    if (error) {
      const wrapped = new Error(error.message || "http request failed");
      wrapped.name = error.name || "Error";
      wrapped.attempts = attempts.length;
      throw wrapped;
    }

    const responseHeaders = redact(headersToObject(response.headers), redactionOptions);
    const rawBody = await readBody(response);
    const body = rawBody && typeof rawBody === "object"
      ? redact(rawBody, redactionOptions)
      : rawBody;

    return {
      ok: response.ok ?? (response.status >= 200 && response.status < 300),
      status: response.status,
      statusText: response.statusText ?? "",
      headers: responseHeaders,
      body,
      request: {
        method: request.method,
        url: request.url,
        headers: redact(request.headers, redactionOptions),
      },
      attempts: attempts.length,
    };
  }

  const tool = { name, capabilities, execute };
  validateTool(tool);
  return tool;
}

module.exports = { createHttpTool, ALLOWED_METHODS, RETRYABLE_STATUS };
