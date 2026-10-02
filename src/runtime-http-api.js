"use strict";

const http = require("node:http");
const { runTaskPipeline } = require("./runtime-pipeline");

function createRuntimeHttpServer({ run = runTaskPipeline, ledger = null } = {}) {
  if (typeof run !== "function") throw new TypeError("run must be a function");
  return http.createServer((request, response) => {
    const send = (status, payload) => {
      response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(payload));
    };

    if (request.method === "GET" && request.url === "/health") return send(200, { status: "ok" });
    if (request.method === "GET" && request.url === "/ready") {
      return send(200, { status: "ready", ledger: Boolean(ledger) });
    }
    if (request.method !== "POST" || request.url !== "/run") return send(404, { error: "not_found" });

    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      try {
        const input = JSON.parse(body || "{}");
        if (typeof input.task !== "string" || !input.task.trim()) return send(400, { error: "task_required" });
        const result = run(input.task, input.tool || null, { ...(input.options || {}), ledger });
        return send(200, result);
      } catch (error) {
        return send(400, { error: error.code || "RUNTIME_REQUEST_FAILED", message: error.message });
      }
    });
  });
}

module.exports = { createRuntimeHttpServer };
