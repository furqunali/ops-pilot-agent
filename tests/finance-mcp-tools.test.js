"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFinanceTools, invokeFinanceTool } = require("../src/finance-mcp-tools");

const tools = createFinanceTools({
  invoices: [{ id: "inv-1", amount: 1500, vendorId: "vendor-1" }],
  vendors: [{ id: "vendor-1", name: "Example Vendor" }],
});

test("exposes finance tool operations", () => {
  assert.equal(invokeFinanceTool(tools, "finance.get_invoice", "inv-1").amount, 1500);
  assert.equal(invokeFinanceTool(tools, "finance.get_vendor", "vendor-1").name, "Example Vendor");
});

test("validates and prepares simulated payments", () => {
  const result = invokeFinanceTool(tools, "finance.prepare_payment", {
    amount: 500,
    currency: "USD",
    vendorId: "vendor-1",
  });
  assert.equal(result.status, "prepared");
  assert.equal(result.execution, "simulation_only");
});

test("rejects unknown tools", () => {
  assert.throws(() => invokeFinanceTool(tools, "finance.unknown", {}), TypeError);
});
