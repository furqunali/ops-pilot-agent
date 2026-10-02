"use strict";

const { validatePayment } = require("./finance-policy");

function createFinanceTools({ invoices = [], vendors = [], provider = null } = {}) {
  if (!Array.isArray(invoices) || !Array.isArray(vendors)) {
    throw new TypeError("invoices and vendors must be arrays");
  }

  if (provider !== null && (!provider || typeof provider.getInvoice !== "function" || typeof provider.getVendor !== "function")) {\n    throw new TypeError("provider must expose getInvoice() and getVendor()");\n  }\n\n  return Object.freeze({
    "finance.get_invoice": invoiceId => provider ? provider.getInvoice(invoiceId) : (invoices.find(item => item.id === invoiceId) || null),
    "finance.get_vendor": vendorId => provider ? provider.getVendor(vendorId) : (vendors.find(item => item.id === vendorId) || null),
    "finance.check_payment": payment => {
      validatePayment(payment);
      return { ...payment, checked: true };
    },
    "finance.prepare_payment": payment => {
      validatePayment(payment);
      return Object.freeze({
        status: "prepared",
        payment: { ...payment },
        execution: "simulation_only",
      });
    },
  });
}

function invokeFinanceTool(tools, name, input) {
  if (!tools || typeof tools[name] !== "function") {
    throw new TypeError("unknown finance tool");
  }
  return tools[name](input);
}

module.exports = { createFinanceTools, invokeFinanceTool };
