"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFinanceProviderAdapter, validateProvider } = require("../src/finance-provider-adapter");

test("provider adapter exposes MCP-compatible finance tool names", () => {
  const calls = [];
  const adapter = createFinanceProviderAdapter({
    getInvoice: id => { calls.push(["invoice", id]); return { id }; },
    getVendor: id => { calls.push(["vendor", id]); return { id }; },
    preparePayment: payment => { calls.push(["payment", payment]); return { status: "prepared", payment }; },
  });
  assert.deepEqual(adapter["finance.get_invoice"]("inv-1"), { id: "inv-1" });
  assert.deepEqual(adapter["finance.get_vendor"]("vendor-1"), { id: "vendor-1" });
  assert.deepEqual(adapter["finance.prepare_payment"]({ amount: 10 }), { status: "prepared", payment: { amount: 10 } });
  assert.equal(calls.length, 3);
});

test("provider adapter rejects incomplete providers", () => {
  assert.throws(() => validateProvider(null), /provider must be an object/);
  assert.throws(() => createFinanceProviderAdapter({ getInvoice() {} }), /getVendor/);
  assert.throws(() => createFinanceProviderAdapter({ getInvoice() {}, getVendor() {} }), /preparePayment/);
});
