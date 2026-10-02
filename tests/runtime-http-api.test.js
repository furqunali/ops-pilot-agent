"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createRuntimeHttpServer } = require("../src/runtime-http-api");

function request(port, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, method, path, headers: body ? { "content-type": "application/json" } : {} }, response => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { data += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
    });
    req.on("error", reject);
    if (body) req.end(JSON.stringify(body)); else req.end();
  });
}

test("runtime HTTP API exposes health and readiness", async () => {
  const server = createRuntimeHttpServer({ run: () => ({ status: "success" }) });
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  assert.deepEqual((await request(port, "GET", "/health")).body, { status: "ok" });
  assert.deepEqual((await request(port, "GET", "/ready")).body, { status: "ready", ledger: false });
  server.close();
});

test("runtime HTTP API validates and executes run requests", async () => {
  const server = createRuntimeHttpServer({ run: (task, tool, options) => ({ status: "success", task, options }) });
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const response = await request(port, "POST", "/run", { task: "sync invoices", options: { runId: "http-1" } });
  assert.equal(response.status, 200);
  assert.equal(response.body.task, "sync invoices");
  assert.equal(response.body.options.runId, "http-1");
  assert.equal((await request(port, "POST", "/run", {})).status, 400);
  assert.equal((await request(port, "GET", "/missing")).status, 404);
  server.close();
});
