"use strict";

function createFinanceIntegrationAdapter({ getInvoice, getVendor, preparePayment } = {}) {
  for (const [name, handler] of Object.entries({ getInvoice, getVendor, preparePayment })) {
    if (typeof handler !== "function") throw new TypeError(`${name} must be a function`);
  }

  return Object.freeze({
    async getInvoice(invoiceId) { return getInvoice(invoiceId); },
    async getVendor(vendorId) { return getVendor(vendorId); },
    async preparePayment(payment) {
      const result = await preparePayment(payment);
      if (!result || result.execution !== "simulation_only") {
        throw new Error("external payment adapters must declare simulation_only execution");
      }
      return result;
    },
  });
}

function createInMemoryFinanceAdapter({ invoices = [], vendors = [] } = {}) {
  return createFinanceIntegrationAdapter({
    getInvoice: async id => invoices.find(item => item.id === id) || null,
    getVendor: async id => vendors.find(item => item.id === id) || null,
    preparePayment: async payment => ({ status: "prepared", payment: { ...payment }, execution: "simulation_only" }),
  });
}

module.exports = { createFinanceIntegrationAdapter, createInMemoryFinanceAdapter };
