"use strict";

function createFinanceProvider({ getInvoice, getVendor, timeoutMs = 5000, maxAttempts = 2 } = {}) {
  if (typeof getInvoice !== "function") throw new TypeError("getInvoice must be a function");
  if (typeof getVendor !== "function") throw new TypeError("getVendor must be a function");
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("timeoutMs must be a positive integer");
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) throw new TypeError("maxAttempts must be a positive integer");

  async function call(operation, input) {
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await operation(input, { signal: controller.signal, attempt });
      } catch (error) {
        lastError = error;
        const code = String(error?.code || "").toUpperCase();
        const retryable = error?.retryable === true || ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "RATE_LIMITED"].includes(code) || error?.name === "AbortError";
        if (!retryable || attempt === maxAttempts - 1) throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error("provider operation failed");
  }

  return Object.freeze({
    getInvoice: invoiceId => call(getInvoice, invoiceId),
    getVendor: vendorId => call(getVendor, vendorId),
    timeoutMs,
    maxAttempts,
  });
}

function createHttpFinanceProvider({ baseUrl, fetchImpl = globalThis.fetch, headers = {}, timeoutMs = 5000, maxAttempts = 2 } = {}) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) throw new TypeError("baseUrl must be a non-empty string");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");

  const request = async (path, { signal }) => {
    const response = await fetchImpl(new URL(path.replace(/^\\/+/, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`), { method: "GET", headers: { accept: "application/json", ...headers }, signal });
    if (!response || typeof response.ok !== "boolean") throw new TypeError("fetchImpl must return a Response-like value");
    if (!response.ok) {
      const error = new Error(`provider request failed with status ${response.status}`);
      error.code = response.status === 429 || response.status >= 500 ? "RATE_LIMITED" : "PROVIDER_HTTP_ERROR";
      error.status = response.status;
      throw error;
    }
    return response.json();
  };

  const provider = createFinanceProvider({
    getInvoice: (id, options) => request(`/invoices/${encodeURIComponent(id)}`, options),
    getVendor: (id, options) => request(`/vendors/${encodeURIComponent(id)}`, options),
    timeoutMs,
    maxAttempts,
  });
  return provider;
}

module.exports = { createFinanceProvider, createHttpFinanceProvider };
