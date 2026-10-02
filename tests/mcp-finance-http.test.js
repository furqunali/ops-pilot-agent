"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createFinanceTools } = require("../src/finance-mcp-tools");
const { PROTOCOL_VERSION } = require("../src/mcp-finance-server");
const { createMcpFinanceHttpHandler } = require("../src/mcp-finance-http");

function request(server, { method = "POST", headers = {}, body = "{}" } = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({ hostname: "127.0.0.1", port: address.port, method, headers: { "Content-Length": Buffer.byteLength(body), ...headers } }, res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function withServer(fn) {
  const handler = createMcpFinanceHttpHandler({ tools: createFinanceTools() });
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { return await fn(server); } finally { await new Promise(resolve => server.close(resolve)); }
}

test("MCP HTTP adapter serves discovery and tool calls", async () => {
  await withServer(async server => {
    const discovery = await request(server, { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "server/discover", params: {} }) });
    assert.equal(discovery.statusCode, 200);
    assert.equal(JSON.parse(discovery.body).result.supportedVersions.includes(PROTOCOL_VERSION), true);

    const call = await request(server, {
      headers: { "Content-Type": "application/json", "MCP-Protocol-Version": PROTOCOL_VERSION },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "finance.check_payment", arguments: { currency: "USD", amount: 10, vendorId: "v1" }, _meta: { "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION } } }),
    });
    assert.equal(call.statusCode, 200);
    assert.equal(JSON.parse(call.body).result.structuredContent.checked, true);
  });
});

test("MCP HTTP adapter rejects unsupported methods, content types, and missing protocol headers", async () => {
  await withServer(async server => {
    assert.equal((await request(server, { method: "GET", headers: { Accept: "application/json" } })).statusCode, 405);
    assert.equal((await request(server, { headers: { "Content-Type": "text/plain" } })).statusCode, 415);
    const missing = await request(server, { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }) });
    assert.equal(missing.statusCode, 400);
    assert.match(missing.body, /MCP-Protocol-Version/);
  });
});
