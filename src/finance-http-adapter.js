"use strict";

function createFinanceHttpAdapter(connector) {
  if (!connector || typeof connector.request !== "function") throw new TypeError("connector must expose request()");

  return Object.freeze({
    async getInvoice(invoiceId) {
      if (typeof invoiceId !== "string" || !invoiceId.trim()) throw new TypeError("invoiceId must be a non-empty string");
      const response = await connector.request(`/invoices/${encodeURIComponent(invoiceId)}`);
      return response.body;
    },
    async getVendor(vendorId) {
      if (typeof vendorId !== "string" || !vendorId.trim()) throw new TypeError("vendorId must be a non-empty string");
      const response = await connector.request(`/vendors/${encodeURIComponent(vendorId)}`);
      return response.body;
    },
    async checkPayment(payment) {
      if (!payment || typeof payment !== "object" || Array.isArray(payment)) throw new TypeError("payment must be an object");
      const response = await connector.request("/payments/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payment) });
      return response.body;
    },
    async preparePayment(payment) {
      if (!payment || typeof payment !== "object" || Array.isArray(payment)) throw new TypeError("payment must be an object");
      const response = await connector.request("/payments/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payment) });
      return response.body;
    },
  });
}

module.exports = { createFinanceHttpAdapter };
