"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFinanceTools } = require("../src/finance-mcp-tools");
const { createMcpFinanceServer, PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION } = require("../src/mcp-finance-server");

const meta = { "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION };
const server = createMcpFinanceServer({
  tools: createFinanceTools({
    invoices: [{ id: "inv-1", total: 1250 }],
    vendors: [{ id: "vendor-1", name: "Example Vendor" }],
  }),
});

test("discovers the modern stateless MCP protocol", () => {
  const response = server.handle({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: meta } });
  assert.deepEqual(response.result.supportedVersions, [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION]);
  assert.deepEqual(response.result.capabilities, { tools: {} });
  assert.equal(response.result.ttlMs, 60000);
  assert.equal(response.result._meta["io.modelcontextprotocol/serverInfo"].name, "opspilot-finance");
});

test("lists finance tools through modern tools/list", () => {
  const response = server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: meta } });
  assert.equal(response.result.tools.length, 4);
  assert.equal(response.result.tools[0].name, "finance.get_invoice");
});

test("invokes a finance tool through modern tools/call", () => {
  const response = server.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "finance.get_vendor", arguments: "vendor-1", _meta: meta },
  });

  assert.deepEqual(response.result.structuredContent, { id: "vendor-1", name: "Example Vendor" });
  assert.equal(response.result.content[0].type, "text");
});

test("returns a tool result error when execution fails", () => {
  const response = server.handle({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "finance.check_payment",
      arguments: { amount: -1, currency: "USD", vendorId: "vendor-1" },
      _meta: meta,
    },
  });

  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /non-negative/);
});

test("rejects modern requests without protocol metadata", () => {
  const response = server.handle({ jsonrpc: "2.0", id: 5, method: "tools/list", params: {} });
  assert.equal(response.error.code, -32602);
});

test("supports the legacy initialize handshake for compatibility", () => {
  const response = server.handle({
    jsonrpc: "2.0",
    id: 6,
    method: "initialize",
    params: { protocolVersion: LEGACY_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "legacy-client", version: "1.0.0" } },
  });
  assert.equal(response.result.protocolVersion, LEGACY_PROTOCOL_VERSION);
});

test("returns JSON-RPC errors for unknown methods and tools", () => {
  assert.equal(server.handle({ jsonrpc: "2.0", id: 7, method: "nope", params: { _meta: meta } }).error.code, -32601);
  assert.equal(server.handle({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "finance.unknown", arguments: {}, _meta: meta },
  }).error.code, -32602);
});
