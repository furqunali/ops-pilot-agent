"use strict";

const { invokeFinanceTool } = require("./finance-mcp-tools");

const PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSION = "2025-11-25";
const SERVER_INFO = Object.freeze({ name: "opspilot-finance", version: "0.1.0" });

const TOOL_DEFINITIONS = Object.freeze([
  { name: "finance.get_invoice", description: "Look up a finance invoice by id.", inputSchema: { type: "string" } },
  { name: "finance.get_vendor", description: "Look up a finance vendor by id.", inputSchema: { type: "string" } },
  {
    name: "finance.check_payment",
    description: "Validate a payment in the finance sandbox.",
    inputSchema: {
      type: "object",
      properties: { currency: { type: "string" }, amount: { type: "number" }, vendorId: { type: "string" } },
      required: ["currency", "amount", "vendorId"],
    },
  },
  {
    name: "finance.prepare_payment",
    description: "Prepare a payment for simulation-only execution.",
    inputSchema: {
      type: "object",
      properties: { currency: { type: "string" }, amount: { type: "number" }, vendorId: { type: "string" } },
      required: ["currency", "amount", "vendorId"],
    },
  },
]);

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result: { ...result, _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO } } };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function modernRequest(message) {
  return message.params?._meta?.["io.modelcontextprotocol/protocolVersion"] === PROTOCOL_VERSION;
}

function validateModernRequest(message) {
  if (!modernRequest(message)) {
    return jsonRpcError(message.id, -32602, "modern MCP requests must declare protocol version in _meta");
  }
  return null;
}

function createMcpFinanceServer({ tools }) {
  if (!tools || typeof tools !== "object") throw new TypeError("tools must be an object");

  function handle(message) {
    if (!message || message.jsonrpc !== "2.0" || message.method === undefined) {
      return jsonRpcError(message?.id ?? null, -32600, "invalid request");
    }

    if (message.method === "server/discover") {
      return jsonRpcResult(message.id, {
        supportedVersions: [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION],
        capabilities: { tools: {} },
        ttlMs: 60000,
        cacheScope: "private",
      });
    }

    if (message.method === "initialize") {
      if (message.params?.protocolVersion !== LEGACY_PROTOCOL_VERSION) {
        return jsonRpcError(message.id, -32602, "unsupported legacy protocol version");
      }
      return jsonRpcResult(message.id, {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }

    if (message.method === "notifications/initialized") return null;

    const modernError = validateModernRequest(message);
    if (modernError) return modernError;

    if (message.method === "tools/list") {
      return jsonRpcResult(message.id, { tools: TOOL_DEFINITIONS, ttlMs: 60000, cacheScope: "private" });
    }

    if (message.method === "tools/call") {
      const modernError = validateModernRequest(message);\n    if (modernError) return modernError;\n    const name = message.params?.name;
      const argumentsValue = message.params?.arguments;
      if (typeof name !== "string" || !name.trim()) {
        return jsonRpcError(message.id, -32602, "tools/call requires a tool name");
      }
      if (typeof tools[name] !== "function") {
        return jsonRpcError(message.id, -32602, "unknown tool");
      }

      try {
        const value = invokeFinanceTool(tools, name, argumentsValue);
        return jsonRpcResult(message.id, {
          content: [{ type: "text", text: JSON.stringify(value) }],
          structuredContent: value,
        });
      } catch (error) {
        return jsonRpcResult(message.id, {
          isError: true,
          content: [{ type: "text", text: error.message || "tool execution failed" }],
        });
      }
    }

    return jsonRpcError(message.id, -32601, "method not found");
  }

  async function handleAsync(message) {\n    if (message?.method !== "tools/call") return handle(message);\n    const name = message.params?.name;\n    const argumentsValue = message.params?.arguments;\n    if (typeof name !== "string" || !name.trim()) return jsonRpcError(message.id, -32602, "tools/call requires a tool name");\n    if (typeof tools[name] !== "function") return jsonRpcError(message.id, -32602, "unknown tool");\n    try {\n      const value = await tools[name](argumentsValue);\n      return jsonRpcResult(message.id, { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });\n    } catch (error) {\n      return jsonRpcResult(message.id, { isError: true, content: [{ type: "text", text: error.message || "tool execution failed" }] });\n    }\n  }\n\n  return Object.freeze({ handle, protocolVersion: PROTOCOL_VERSION, serverInfo: SERVER_INFO });
}

module.exports = {
  PROTOCOL_VERSION,
  LEGACY_PROTOCOL_VERSION,
  SERVER_INFO,
  TOOL_DEFINITIONS,
  createMcpFinanceServer,
};
