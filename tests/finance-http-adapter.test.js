"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFinanceHttpAdapter } = require("../src/finance-http-adapter");

test("finance HTTP adapter maps provider operations to connector requests", async () => {
  const calls = [];
  const connector = {
    async request(path, options = {}) {
      calls.push({ path, options });
      if (path.startsWith("/invoices/")) return { status: 200, body: { id: "inv-1" } };
      if (path.startsWith("/vendors/")) return { status: 200, body: { id: "vendor-1" } };
      return { status: 200, body: { status: "prepared", execution: "simulation_only" } };
    },
  };
  const adapter = createFinanceHttpAdapter(connector);
  assert.deepEqual(await adapter.getInvoice("inv-1"), { id: "inv-1" });
  assert.deepEqual(await adapter.getVendor("vendor-1"), { id: "vendor-1" });
  assert.deepEqual(await adapter.checkPayment({ currency: "USD", amount: 10, vendorId: "vendor-1" }), { status: "prepared", execution: "simulation_only" });
  assert.deepEqual(await adapter.preparePayment({ currency: "USD", amount: 10, vendorId: "vendor-1" }), { status: "prepared", execution: "simulation_only" });
  assert.equal(calls[0].path, "/invoices/inv-1");
  assert.equal(calls[1].path, "/vendors/vendor-1");
  assert.equal(calls[2].options.method, "POST");
  assert.equal(calls[3].path, "/payments/prepare");
});

test("finance HTTP adapter validates identifiers and payloads", async () => {
  const adapter = createFinanceHttpAdapter({ request: async () => ({ status: 200, body: {} }) });
  await assert.rejects(adapter.getInvoice(""), /invoiceId must be a non-empty string/);
  await assert.rejects(adapter.getVendor(""), /vendorId must be a non-empty string/);
  await assert.rejects(adapter.checkPayment(null), /payment must be an object/);
  await assert.rejects(adapter.preparePayment([]), /payment must be an object/);
});
