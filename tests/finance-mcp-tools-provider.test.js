"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFinanceTools } = require("../src/finance-mcp-tools");

test("finance tools delegate invoice and vendor lookup to external provider", async () => {
  const calls = [];
  const tools = createFinanceTools({
    provider: {
      async getInvoice(id) { calls.push(["invoice", id]); return { id, source: "external" }; },
      async getVendor(id) { calls.push(["vendor", id]); return { id, source: "external" }; },
    },
  });
  assert.deepEqual(await tools["finance.get_invoice"]("inv-1"), { id: "inv-1", source: "external" });
  assert.deepEqual(await tools["finance.get_vendor"]("vendor-1"), { id: "vendor-1", source: "external" });
  assert.deepEqual(calls, [["invoice", "inv-1"], ["vendor", "vendor-1"]]);
});

test("finance tools reject malformed external providers", () => {
  assert.throws(() => createFinanceTools({ provider: {} }), /provider must expose/);
});
