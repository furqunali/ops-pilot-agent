"use strict";

const { invokeFinanceTool } = require("./finance-mcp-tools");

const PROTOCOL_VERSION = "2025-06-18";
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
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function createMcpFinanceServer({ tools }) {
  if (!tools || typeof tools !== "object") throw new TypeError("tools must be an object");

  function handle(message) {
    if (!message || message.jsonrpc !== "2.0" || message.method === undefined) {
      return jsonRpcError(message?.id ?? null, -32600, "invalid request");
    }

    if (message.method === "notifications/initialized") return null;

    if (message.method === "initialize") {
      return jsonRpcResult(message.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }

    if (message.method === "tools/list") {
      return jsonRpcResult(message.id, { tools: TOOL_DEFINITIONS });
    }

    if (message.method === "tools/call") {
      const name = message.params?.name;
      const argumentsValue = message.params?.arguments;
      if (typeof name !== "string" || !name.trim()) {
        return jsonRpcError(message.id, -32602, "tools/call requires a tool name");
      }

      try {
        const value = invokeFinanceTool(tools, name, argumentsValue);
        return jsonRpcResult(message.id, {
          content: [{ type: "text", text: JSON.stringify(value) }],
          structuredContent: value,
        });
      } catch (error) {
        return jsonRpcError(message.id, -32000, error.message || "tool execution failed");
      }
    }

    return jsonRpcError(message.id, -32601, "method not found");
  }

  return Object.freeze({ handle, protocolVersion: PROTOCOL_VERSION, serverInfo: SERVER_INFO });
}

module.exports = { PROTOCOL_VERSION, SERVER_INFO, TOOL_DEFINITIONS, createMcpFinanceServer };
