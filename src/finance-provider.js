"use strict";

function createJsonFinanceProvider({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = 5000, headers = {} } = {}) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) throw new TypeError("baseUrl must be a non-empty string");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("timeoutMs must be a positive integer");
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        ...options,
        headers: { Accept: "application/json", ...headers, ...(options.headers || {}) },
        signal: controller.signal,
      });
      if (!response || typeof response.ok !== "boolean") throw new TypeError("finance provider response must expose ok");
      if (!response.ok) {
        const error = new Error(`finance provider request failed: ${response.status}`);
        error.code = response.status === 429 ? "RATE_LIMITED" : `HTTP_${response.status}`;
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw error;
      }
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    getInvoice(invoiceId) {
      if (typeof invoiceId !== "string" || !invoiceId.trim()) throw new TypeError("invoiceId must be a non-empty string");
      return request(`/invoices/${encodeURIComponent(invoiceId.trim())}`);
    },
    getVendor(vendorId) {
      if (typeof vendorId !== "string" || !vendorId.trim()) throw new TypeError("vendorId must be a non-empty string");
      return request(`/vendors/${encodeURIComponent(vendorId.trim())}`);
    },
    searchTransactions(query = "") {
      if (typeof query !== "string") throw new TypeError("query must be a string");
      return request(`/transactions?query=${encodeURIComponent(query)}`);
    },
  });
}

module.exports = { createJsonFinanceProvider };
