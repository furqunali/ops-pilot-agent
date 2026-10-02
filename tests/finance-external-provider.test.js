"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFinanceProvider, createHttpFinanceProvider } = require("../src/finance-external-provider");

test("finance provider retries explicitly retryable failures", async () => {
  let calls = 0;
  const provider = createFinanceProvider({
    getInvoice: async () => {
      calls += 1;
      if (calls === 1) { const error = new Error("temporary"); error.code = "EAI_AGAIN"; throw error; }
      return { id: "inv-1" };
    },
    getVendor: async id => ({ id }),
    maxAttempts: 2,
  });
  assert.deepEqual(await provider.getInvoice("inv-1"), { id: "inv-1" });
  assert.equal(calls, 2);
});

test("http finance provider validates response and builds safe paths", async () => {
  const calls = [];
  const provider = createHttpFinanceProvider({
    baseUrl: "https://finance.example.test/api/",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return { ok: true, json: async () => ({ id: "vendor/1" }) };
    },
  });
  assert.deepEqual(await provider.getVendor("vendor/1"), { id: "vendor/1" });
  assert.equal(calls[0].url, "https://finance.example.test/api/vendors/vendor%2F1");
  assert.equal(calls[0].options.method, "GET");
});

test("http finance provider classifies server errors as retryable", async () => {
  let calls = 0;
  const provider = createHttpFinanceProvider({
    baseUrl: "https://finance.example.test/",
    maxAttempts: 2,
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 503, json: async () => ({}) };
    },
  });
  await assert.rejects(provider.getInvoice("inv-1"), error => error.code === "RATE_LIMITED" && error.status === 503);
  assert.equal(calls, 2);
});
