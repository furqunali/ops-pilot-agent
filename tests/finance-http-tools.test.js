"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createFinanceHttpTools } = require("../src/finance-http-tools");

function createServer() {
  return http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/vendors/vendor-1") {
      response.end(JSON.stringify({ id: "vendor-1", name: "Example Vendor" }));
      return;
    }
    if (request.url === "/invoices/invoice-1") {
      response.end(JSON.stringify({ id: "invoice-1", amount: 250 }));
      return;
    }
    if (request.url === "/payments/prepare" && request.method === "POST") {
      let body = "";
      request.on("data", chunk => { body += chunk; });
      request.on("end", () => response.end(JSON.stringify({ status: "prepared", payment: JSON.parse(body) })));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
}

async function listen(instance) {
  await new Promise(resolve => instance.listen(0, "127.0.0.1", resolve));
  return instance.address().port;
}

test("finance HTTP tools map service endpoints to finance operations", async () => {
  const instance = createServer();
  const port = await listen(instance);
  try {
    const connector = { request: async (path, options) => {
      const response = await fetch("http://127.0.0.1:" + port + path, options);
      const body = await response.json();
      if (!response.ok) throw new Error("request failed");
      return { status: response.status, body };
    } };
    const tools = createFinanceHttpTools(connector);
    assert.deepEqual(await tools.getVendor("vendor-1"), { id: "vendor-1", name: "Example Vendor" });
    assert.deepEqual(await tools.getInvoice("invoice-1"), { id: "invoice-1", amount: 250 });
    const prepared = await tools.preparePayment({ currency: "USD", amount: 250, vendorId: "vendor-1" });
    assert.equal(prepared.status, "prepared");
    assert.equal(prepared.payment.execution, "simulation_only");
  } finally { instance.close(); }
});

test("finance HTTP tools validate payments before network execution", async () => {
  let called = false;
  const tools = createFinanceHttpTools({ request: async () => { called = true; } });
  await assert.rejects(tools.preparePayment({ amount: -1, currency: "USD", vendorId: "vendor-1" }), /non-negative/);
  assert.equal(called, false);
});
