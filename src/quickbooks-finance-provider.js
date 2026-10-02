"use strict";

const PRODUCTION_BASE_URL = "https://quickbooks.api.intuit.com";
const SANDBOX_BASE_URL = "https://sandbox-quickbooks.api.intuit.com";

function createQuickBooksFinanceProvider({ realmId, accessToken, sandbox = true, fetchImpl = globalThis.fetch, baseUrl = null } = {}) {
  if (typeof realmId !== "string" || !realmId.trim()) throw new TypeError("realmId must be a non-empty string");
  if (typeof accessToken !== "string" || !accessToken.trim()) throw new TypeError("accessToken must be a non-empty string");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const root = (baseUrl || (sandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL)).replace(/\/$/, "");
  const prefix = `/v3/company/${encodeURIComponent(realmId.trim())}`;

  async function get(path) {
    const response = await fetchImpl(`${root}${prefix}${path}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken.trim()}` },
    });
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(`QuickBooks request failed: ${response.status}`);
      error.code = response.status === 429 ? "RATE_LIMITED" : `HTTP_${response.status}`;
      error.status = response.status;
      error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw error;
    }
    return body;
  }

  return Object.freeze({
    async getInvoice(invoiceId) {
      if (typeof invoiceId !== "string" || !invoiceId.trim()) throw new TypeError("invoiceId must be a non-empty string");
      return get(`/invoice/${encodeURIComponent(invoiceId.trim())}`);
    },
    async getVendor(vendorId) {
      if (typeof vendorId !== "string" || !vendorId.trim()) throw new TypeError("vendorId must be a non-empty string");
      return get(`/vendor/${encodeURIComponent(vendorId.trim())}`);
    },
  });
}

module.exports = { PRODUCTION_BASE_URL, SANDBOX_BASE_URL, createQuickBooksFinanceProvider };
