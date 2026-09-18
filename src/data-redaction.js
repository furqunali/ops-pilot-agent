"use strict";

const DEFAULT_SENSITIVE_KEYS = Object.freeze([
  "password","passwd","token","access_token","refresh_token","api_key","apikey",
  "secret","authorization","cookie","set-cookie","private_key","client_secret"
]);

function compileKeyMatcher(keys = DEFAULT_SENSITIVE_KEYS) {
  if (!Array.isArray(keys)) throw new TypeError("keys must be an array");
  const normalized = keys.map(key => String(key).trim().toLowerCase()).filter(Boolean);
  return key => normalized.some(sensitive => key.toLowerCase().includes(sensitive));
}

function redact(value, options = {}) {
  const replacement = options.replacement ?? "[REDACTED]";
  const matcher = options.matcher || compileKeyMatcher(options.keys || DEFAULT_SENSITIVE_KEYS);
  const maxDepth = Number.isInteger(options.maxDepth) && options.maxDepth >= 0 ? options.maxDepth : 12;

  function visit(input, depth) {
    if (depth > maxDepth) return "[MAX_DEPTH]";
    if (Array.isArray(input)) return input.map(item => visit(item, depth + 1));
    if (!input || typeof input !== "object") return input;
    const output = {};
    for (const [key, item] of Object.entries(input)) {
      output[key] = matcher(key) ? replacement : visit(item, depth + 1);
    }
    return output;
  }

  return visit(value, 0);
}

function redactText(text, patterns = []) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const builtins = [
    /Bearer\s+[A-Za-z0-9._~-]+/gi,
    /(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi,
  ];
  let result = text;
  for (const pattern of [...builtins, ...patterns]) {
    if (!(pattern instanceof RegExp)) throw new TypeError("patterns must contain RegExp values");
    result = result.replace(pattern, match => {
      const separator = match.includes(":") ? ":" : "=";
      const index = match.indexOf(separator);
      return index >= 0 ? `${match.slice(0, index + 1)} [REDACTED]` : "[REDACTED]";
    });
  }
  return result;
}

function sanitizeAuditEvent(event) {
  if (!event || typeof event !== "object") throw new TypeError("event is required");
  return redact(event);
}

module.exports = { DEFAULT_SENSITIVE_KEYS, compileKeyMatcher, redact, redactText, sanitizeAuditEvent };
