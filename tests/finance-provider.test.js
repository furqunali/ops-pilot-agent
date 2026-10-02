"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createJsonFinanceProvider } = require("../src/finance-provider");

function fakeFetch(expectedPath, payload, optionsCheck = () => {}) {
  return async (url, options) => {
    assert.equal(url, `https://finance.test${expectedPath}`);
    optionsCheck(options);
    return { ok: true, status: 200, json: async () => payload };
  };
}

test("finance provider adapter builds safe invoice, vendor, and transaction requests", async () => {
  const provider = createJsonFinanceProvider({ baseUrl: "https://finance.test/", fetchImpl: fakeFetch("/invoices/inv%2F1", { id: "inv/1" }, options => assert.equal(options.headers.Authorization, "Bearer test")), headers: { Authorization: "Bearer test" } });
  assert.deepEqual(await provider.getInvoice("inv/1"), { id: "inv/1" });

  const vendor = createJsonFinanceProvider({ baseUrl: "https://finance.test", fetchImpl: fakeFetch("/vendors/vendor-1", { id: "vendor-1" }) });
  assert.deepEqual(await vendor.getVendor("vendor-1"), { id: "vendor-1" });

  const transactions = createJsonFinanceProvider({ baseUrl: "https://finance.test", fetchImpl: fakeFetch("/transactions?query=invoice%201", [{ id: "tx-1" }]) });
  assert.deepEqual(await transactions.searchTransactions("invoice 1"), [{ id: "tx-1" }]);
});

test("finance provider adapter classifies retryable HTTP failures", async () => {
  const provider = createJsonFinanceProvider({ baseUrl: "https://finance.test", fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  await assert.rejects(provider.getVendor("vendor-1"), error => error.code === "HTTP_503" && error.retryable === true);
});

test("finance provider adapter validates configuration and identifiers", () => {
  assert.throws(() => createJsonFinanceProvider({ baseUrl: "" }), /baseUrl/);
  assert.throws(() => createJsonFinanceProvider({ baseUrl: "https://x", timeoutMs: 0 }), /timeoutMs/);
  const provider = createJsonFinanceProvider({ baseUrl: "https://x", fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  assert.throws(() => provider.getInvoice(""), /invoiceId/);
  assert.throws(() => provider.getVendor(""), /vendorId/);
});
