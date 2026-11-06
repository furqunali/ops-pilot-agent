"use strict";

const http = require("node:http");
const { runTaskPipeline } = require("./runtime-pipeline");

// Options that only the server operator may set. A remote caller must never
// be able to self-approve a flagged task, swap the ledger, or inject a plan.
const SERVER_CONTROLLED_OPTIONS = Object.freeze(["ledger", "inputGuard", "injectionApproval", "plan", "executionAdapter"]);

function createRuntimeHttpServer({ run = runTaskPipeline, ledger = null, inputGuard = null } = {}) {
  if (typeof run !== "function") throw new TypeError("run must be a function");
  if (inputGuard !== null && (!inputGuard || typeof inputGuard.screenTask !== "function")) throw new TypeError("inputGuard must expose screenTask()");
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
        const clientOptions = input.options && typeof input.options === "object" && !Array.isArray(input.options) ? { ...input.options } : {};
        for (const key of SERVER_CONTROLLED_OPTIONS) delete clientOptions[key];
        const result = run(input.task, input.tool || null, { ...clientOptions, ledger, ...(inputGuard ? { inputGuard } : {}) });
        return send(200, result);
      } catch (error) {
        return send(400, { error: error.code || "RUNTIME_REQUEST_FAILED", message: error.message });
      }
    });
  });
}

module.exports = { createRuntimeHttpServer };
