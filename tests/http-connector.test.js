"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createHttpConnector } = require("../src/http-connector");

function server() {
  let retryCalls = 0;
  const instance = http.createServer((request, response) => {
    if (request.url === "/retry") {
      retryCalls += 1;
      if (retryCalls === 1) {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: "temporary" }));
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ recovered: true }));
      return;
    }
    if (request.url === "/ok") {
      assert.equal(request.headers.authorization, "Bearer secret");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.statusCode = 503;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: "temporary" }));
  });
  instance.retryCalls = () => retryCalls;
  return instance;
}

async function listen(instance) {
  await new Promise(resolve => instance.listen(0, "127.0.0.1", resolve));
  return instance.address().port;
}

test("HTTP connector sends secret by reference and parses JSON", async () => {
  const instance = server();
  const port = await listen(instance);
  try {
    const connector = createHttpConnector({ name: "test", baseUrl: "http://127.0.0.1:" + port, requiredEnv: ["TEST_API_KEY"] }, { TEST_API_KEY: "secret" });
    const result = await connector.request("/ok");
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true });
  } finally { instance.close(); }
});

test("HTTP connector retries retryable 5xx responses through the shared policy", async () => {
  const instance = server();
  const port = await listen(instance);
  try {
    const connector = createHttpConnector(
      { name: "test", baseUrl: "http://127.0.0.1:" + port, requiredEnv: ["TEST_API_KEY"] },
      { TEST_API_KEY: "secret" },
      { retryOptions: { maxAttempts: 2, baseDelayMs: 0 } },
    );
    const result = await connector.request("/retry");
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { recovered: true });
    assert.equal(instance.retryCalls(), 2);
  } finally { instance.close(); }
});

test("HTTP connector exposes structured non-2xx errors", async () => {
  const instance = server();
  const port = await listen(instance);
  try {
    const connector = createHttpConnector({ name: "test", baseUrl: "http://127.0.0.1:" + port, requiredEnv: ["TEST_API_KEY"] }, { TEST_API_KEY: "secret" });
    await assert.rejects(connector.request("/error"), error => error.code === "CONNECTOR_HTTP_ERROR" && error.status === 503 && error.body.error === "temporary");
  } finally { instance.close(); }
});

test("HTTP connector rejects unconfigured connectors", () => {
  assert.throws(() => createHttpConnector({ name: "test", baseUrl: "https://example.test", requiredEnv: ["MISSING_KEY"] }, {}), /not configured/);
});
