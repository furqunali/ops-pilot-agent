"use strict";

const { validatePayment } = require("./finance-policy");

function createFinanceHttpTools(connector, { paths = {} } = {}) {
  if (!connector || typeof connector.request !== "function") throw new TypeError("connector must expose request()");
  const endpoints = {
    invoice: paths.invoice || (id => `/invoices/${encodeURIComponent(id)}`),
    vendor: paths.vendor || (id => `/vendors/${encodeURIComponent(id)}`),
    preparePayment: paths.preparePayment || "/payments/prepare",
  };

  return Object.freeze({
    async getInvoice(invoiceId) {
      if (typeof invoiceId !== "string" || !invoiceId.trim()) throw new TypeError("invoiceId must be a non-empty string");
      const response = await connector.request(typeof endpoints.invoice === "function" ? endpoints.invoice(invoiceId) : endpoints.invoice);
      return response.body;
    },
    async getVendor(vendorId) {
      if (typeof vendorId !== "string" || !vendorId.trim()) throw new TypeError("vendorId must be a non-empty string");
      const response = await connector.request(typeof endpoints.vendor === "function" ? endpoints.vendor(vendorId) : endpoints.vendor);
      return response.body;
    },
    async preparePayment(payment) {
      validatePayment(payment);
      const response = await connector.request(endpoints.preparePayment, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payment, execution: "simulation_only" }),
      });
      return response.body;
    },
  });
}

module.exports = { createFinanceHttpTools };
