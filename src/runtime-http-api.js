"use strict";

const http = require("node:http");
const { runTaskPipeline } = require("./runtime-pipeline");
const { createRuntimeTelemetry } = require("./runtime-telemetry");
const { ERROR_CODES } = require("./runtime-errors");

const IDEMPOTENCY_STATUS = Object.freeze({
  [ERROR_CODES.IDEMPOTENCY_CONFLICT]: 409,
  [ERROR_CODES.IDEMPOTENCY_IN_PROGRESS]: 409,
});

// Options that only the server operator may set. A remote caller must never
// be able to self-approve a flagged task, swap the ledger, or inject a plan.
const SERVER_CONTROLLED_OPTIONS = Object.freeze(["ledger", "inputGuard", "injectionApproval", "plan", "executionAdapter"]);

function createRuntimeHttpServer({ run = runTaskPipeline, ledger = null, inputGuard = null, telemetry = createRuntimeTelemetry(), traceExporter = null, idempotencyStore = null } = {}) {
  if (typeof run !== "function") throw new TypeError("run must be a function");
  if (!telemetry || typeof telemetry.observeRun !== "function" || typeof telemetry.renderMetrics !== "function") throw new TypeError("telemetry must expose observeRun() and renderMetrics()");
  if (traceExporter !== null && (!traceExporter || typeof traceExporter.exportRun !== "function")) throw new TypeError("traceExporter must expose exportRun()");
  if (inputGuard !== null && (!inputGuard || typeof inputGuard.screenTask !== "function")) throw new TypeError("inputGuard must expose screenTask()");
  if (idempotencyStore !== null && (!idempotencyStore || typeof idempotencyStore.execute !== "function")) throw new TypeError("idempotencyStore must expose execute()");
  return http.createServer((request, response) => {
    const send = (status, payload, headers = {}) => {
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
      response.end(JSON.stringify(payload));
    };

    if (request.method === "GET" && request.url === "/health") return send(200, { status: "ok" });
    if (request.method === "GET" && request.url === "/ready") {
      return send(200, { status: "ready", ledger: Boolean(ledger) });
    }
    if (request.method === "GET" && request.url === "/metrics") {
      response.writeHead(200, { "content-type": telemetry.contentType || "text/plain; version=0.0.4; charset=utf-8" });
      return response.end(telemetry.renderMetrics({ ledger }));
    }
    if (request.method !== "POST" || request.url !== "/run") return send(404, { error: "not_found" });

    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => { body += chunk; });
    request.on("end", async () => {
      try {
        const input = JSON.parse(body || "{}");
        if (typeof input.task !== "string" || !input.task.trim()) return send(400, { error: "task_required" });
        const clientOptions = input.options && typeof input.options === "object" && !Array.isArray(input.options) ? { ...input.options } : {};
        for (const key of SERVER_CONTROLLED_OPTIONS) delete clientOptions[key];
        const execute = () => {
          const result = run(input.task, input.tool || null, { ...clientOptions, ledger, ...(inputGuard ? { inputGuard } : {}) });
          telemetry.observeRun(result);
          if (traceExporter && typeof result?.runId === "string" && result.runId) {
            try { traceExporter.exportRun(result); } catch (exportError) { telemetry.observeError?.(exportError); }
          }
          return result;
        };
        const idempotencyKey = request.headers["idempotency-key"];
        if (idempotencyStore && typeof idempotencyKey === "string") {
          // Same key + same request body -> the original response, without
          // running again. Same key + different body -> 409.
          const outcome = await idempotencyStore.execute(idempotencyKey, { task: input.task, tool: input.tool ?? null, options: clientOptions }, execute, { scope: "runtime.run" });
          return send(200, outcome.result, { "idempotent-replayed": String(outcome.replayed) });
        }
        return send(200, execute());
      } catch (error) {
        telemetry.observeError?.(error);
        return send(IDEMPOTENCY_STATUS[error.code] || 400, { error: error.code || "RUNTIME_REQUEST_FAILED", message: error.message });
      }
    });
  });
}

module.exports = { createRuntimeHttpServer };
