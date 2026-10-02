"use strict";

const { PROTOCOL_VERSION, createMcpFinanceServer } = require("./mcp-finance-server");

function readJsonBody(request, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        reject(Object.assign(new Error("request body too large"), { statusCode: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(Object.assign(new Error("request body must be valid JSON"), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function createMcpFinanceHttpHandler({ tools, maxBodyBytes = 1024 * 1024 } = {}) {
  const server = createMcpFinanceServer({ tools });
  return async function handleHttp(request, response) {
    if (request.method !== "POST") {
      response.writeHead(405, { Allow: "POST", "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "method not allowed" }));
      return;
    }
    const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      response.writeHead(415, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "content-type must be application/json" }));
      return;
    }

    try {
      const message = await readJsonBody(request, maxBodyBytes);
      const protocolVersion = request.headers["mcp-protocol-version"];
      if (message.method !== "server/discover" && message.method !== "initialize" && protocolVersion !== PROTOCOL_VERSION) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32602, message: "MCP-Protocol-Version header is required for modern requests" } }));
        return;
      }
      const result = await server.handleAsync(message);
      if (result === null) {
        response.writeHead(202);
        response.end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": message.method === "initialize" ? "2025-11-25" : PROTOCOL_VERSION,
      });
      response.end(JSON.stringify(result));
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 400;
      response.writeHead(statusCode, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message || "invalid request" }));
    }
  };
}

module.exports = { createMcpFinanceHttpHandler };
