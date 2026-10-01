"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFinanceTools } = require("../src/finance-mcp-tools");
const { createMcpFinanceServer, PROTOCOL_VERSION } = require("../src/mcp-finance-server");

const server = createMcpFinanceServer({
  tools: createFinanceTools({
    invoices: [{ id: "inv-1", total: 1250 }],
    vendors: [{ id: "vendor-1", name: "Example Vendor" }],
  }),
});

test("initializes through JSON-RPC", () => {
  const response = server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(response.result.protocolVersion, PROTOCOL_VERSION);
  assert.deepEqual(response.result.capabilities, { tools: {} });
});

test("lists finance tools through tools/list", () => {
  const response = server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.equal(response.result.tools.length, 4);
  assert.equal(response.result.tools[0].name, "finance.get_invoice");
});

test("invokes a finance tool through tools/call", () => {
  const response = server.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "finance.get_vendor", arguments: "vendor-1" },
  });

  assert.deepEqual(response.result.structuredContent, { id: "vendor-1", name: "Example Vendor" });
  assert.equal(response.result.content[0].type, "text");
});

test("returns JSON-RPC errors for unknown methods and tools", () => {
  assert.equal(server.handle({ jsonrpc: "2.0", id: 4, method: "nope" }).error.code, -32601);
  assert.equal(server.handle({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "finance.unknown", arguments: {} },
  }).error.code, -32000);
});

test("handles initialized notifications without a response", () => {
  assert.equal(server.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
});
