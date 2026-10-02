"use strict";

function validateProvider(provider) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) throw new TypeError("provider must be an object");
  for (const method of ["getInvoice", "getVendor", "preparePayment"]) {
    if (typeof provider[method] !== "function") throw new TypeError(`provider must expose ${method}()`);
  }
  return true;
}

function createFinanceProviderAdapter(provider) {
  validateProvider(provider);
  return Object.freeze({
    "finance.get_invoice": input => provider.getInvoice(input),
    "finance.get_vendor": input => provider.getVendor(input),
    "finance.prepare_payment": input => provider.preparePayment(input),
  });
}

module.exports = { validateProvider, createFinanceProviderAdapter };
