"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFinanceIntegrationAdapter, createInMemoryFinanceAdapter } = require("../src/finance-integration-adapters");

test("finance adapter exposes async external integration boundary", async () => {
  const adapter = createInMemoryFinanceAdapter({ invoices: [{ id: "inv-1", amount: 250 }], vendors: [{ id: "vendor-1" }] });
  assert.deepEqual(await adapter.getInvoice("inv-1"), { id: "inv-1", amount: 250 });
  assert.deepEqual(await adapter.getVendor("vendor-1"), { id: "vendor-1" });
  assert.deepEqual(await adapter.preparePayment({ amount: 250 }), { status: "prepared", payment: { amount: 250 }, execution: "simulation_only" });
});

test("finance adapter rejects non-simulated payment execution", async () => {
  const adapter = createFinanceIntegrationAdapter({
    getInvoice: async () => null,
    getVendor: async () => null,
    preparePayment: async payment => ({ status: "prepared", payment, execution: "live" }),
  });
  await assert.rejects(() => adapter.preparePayment({ amount: 100 }), /simulation_only/);
});

test("finance adapter validates handlers", () => {
  assert.throws(() => createFinanceIntegrationAdapter({}), /getInvoice must be a function/);
});
