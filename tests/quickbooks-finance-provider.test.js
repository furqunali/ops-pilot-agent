"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PRODUCTION_BASE_URL, SANDBOX_BASE_URL, createQuickBooksFinanceProvider } = require("../src/quickbooks-finance-provider");

test("QuickBooks provider targets sandbox invoice and vendor endpoints with bearer auth", async () => {
  const calls = [];
  const provider = createQuickBooksFinanceProvider({ realmId: "12345", accessToken: "token", fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  } });

  assert.deepEqual(await provider.getInvoice("inv/1"), { ok: true });
  assert.deepEqual(await provider.getVendor("vendor-2"), { ok: true });
  assert.equal(calls[0].url, `${SANDBOX_BASE_URL}/v3/company/12345/invoice/inv%2F1`);
  assert.equal(calls[0].options.headers.Authorization, "Bearer token");
  assert.equal(calls[1].url, `${SANDBOX_BASE_URL}/v3/company/12345/vendor/vendor-2`);
  assert.equal(PRODUCTION_BASE_URL, "https://quickbooks.api.intuit.com");
});

test("QuickBooks provider supports explicit production base URL and validates configuration", async () => {
  const provider = createQuickBooksFinanceProvider({ realmId: "r1", accessToken: "t1", sandbox: false, fetchImpl: async url => ({ ok: true, status: 200, json: async () => ({ url }) }) });
  const result = await provider.getVendor("v1");
  assert.equal(result.url, `${PRODUCTION_BASE_URL}/v3/company/r1/vendor/v1`);
  assert.throws(() => createQuickBooksFinanceProvider({ realmId: "", accessToken: "t" }), /realmId/);
  assert.throws(() => createQuickBooksFinanceProvider({ realmId: "r", accessToken: "" }), /accessToken/);
});

test("QuickBooks provider classifies rate limits and server failures as retryable", async () => {
  const provider = createQuickBooksFinanceProvider({ realmId: "r1", accessToken: "t1", fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ fault: true }) }) });
  await assert.rejects(provider.getInvoice("i1"), error => error.code === "RATE_LIMITED" && error.retryable === true);
});
