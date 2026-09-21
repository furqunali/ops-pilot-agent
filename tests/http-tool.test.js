"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createHttpTool } = require("../src/tools/http-tool");
const { validateTool } = require("../src/tool-contract");

// Build a fake fetch that returns a queued sequence of responses (or repeats
// the last one) and records every call it receives.
function makeFetch(responses) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return fakeResponse(next);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function fakeResponse(spec = {}) {
  const status = spec.status ?? 200;
  const headers = spec.headers || {};
  const bodyIsObject = spec.json !== undefined;
  return {
    status,
    statusText: spec.statusText ?? "",
    ok: status >= 200 && status < 300,
    headers,
    async json() {
      if (spec.json === undefined) throw new Error("no json body");
      return spec.json;
    },
    async text() {
      if (spec.text !== undefined) return spec.text;
      return bodyIsObject ? JSON.stringify(spec.json) : "";
    },
  };
}

test("returns a contract-compliant tool", () => {
  const tool = createHttpTool({ fetch: makeFetch({ status: 200 }) });
  assert.equal(validateTool(tool), true);
  assert.equal(tool.name, "http");
  assert.deepEqual(tool.capabilities, ["read", "write"]);
});

test("requires an injectable fetch", () => {
  assert.throws(() => createHttpTool({}), /requires an injectable fetch/);
});

test("performs a GET and normalizes the response", async () => {
  const fetchImpl = makeFetch({
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    json: { hello: "world" },
  });
  const tool = createHttpTool({ fetch: fetchImpl });

  const result = await tool.execute("https://example.test/data");

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.statusText, "OK");
  assert.deepEqual(result.body, { hello: "world" });
  assert.equal(result.request.method, "GET");
  assert.equal(result.request.url, "https://example.test/data");
  assert.equal(result.attempts, 1);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, "https://example.test/data");
  assert.equal(fetchImpl.calls[0].init.method, "GET");
});

test("accepts a JSON request descriptor and serializes object bodies", async () => {
  const fetchImpl = makeFetch({ status: 201, json: { id: 7 }, headers: { "content-type": "application/json" } });
  const tool = createHttpTool({ fetch: fetchImpl });

  const result = await tool.execute(JSON.stringify({
    url: "https://example.test/items",
    method: "post",
    body: { title: "hi" },
  }));

  assert.equal(result.status, 201);
  assert.equal(result.request.method, "POST");
  const init = fetchImpl.calls[0].init;
  assert.equal(init.method, "POST");
  assert.equal(init.body, JSON.stringify({ title: "hi" }));
  assert.equal(init.headers["content-type"], "application/json");
});

test("retries retryable status codes then succeeds", async () => {
  const fetchImpl = makeFetch([
    { status: 503 },
    { status: 503 },
    { status: 200, json: { ok: true }, headers: { "content-type": "application/json" } },
  ]);
  const tool = createHttpTool({ fetch: fetchImpl, retry: { maxAttempts: 3, baseDelayMs: 0 } });

  const result = await tool.execute("https://example.test/retry");

  assert.equal(result.status, 200);
  assert.equal(result.attempts, 3);
  assert.equal(fetchImpl.calls.length, 3);
});

test("throws after exhausting retries on persistent retryable failures", async () => {
  const fetchImpl = makeFetch({ status: 500 });
  const tool = createHttpTool({ fetch: fetchImpl, retry: { maxAttempts: 2, baseDelayMs: 0 } });

  await assert.rejects(
    () => tool.execute("https://example.test/down"),
    /status 500/
  );
  assert.equal(fetchImpl.calls.length, 2);
});

test("does not retry non-retryable status codes", async () => {
  const fetchImpl = makeFetch({ status: 404, statusText: "Not Found", text: "missing" });
  const tool = createHttpTool({ fetch: fetchImpl, retry: { maxAttempts: 3, baseDelayMs: 0 } });

  const result = await tool.execute("https://example.test/missing");

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.attempts, 1);
  assert.equal(fetchImpl.calls.length, 1);
});

test("retries network errors flagged as retryable by the policy", async () => {
  const netError = new Error("connection reset");
  netError.code = "ECONNRESET";
  const fetchImpl = makeFetch([
    netError,
    { status: 200, json: { recovered: true }, headers: { "content-type": "application/json" } },
  ]);
  const tool = createHttpTool({ fetch: fetchImpl, retry: { maxAttempts: 3, baseDelayMs: 0 } });

  const result = await tool.execute("https://example.test/flaky");

  assert.equal(result.status, 200);
  assert.equal(result.attempts, 2);
});

test("redacts sensitive response headers and body fields", async () => {
  const fetchImpl = makeFetch({
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": "session=abc123" },
    json: { user: "furqan", api_key: "sk-super-secret", nested: { password: "hunter2" } },
  });
  const tool = createHttpTool({ fetch: fetchImpl });

  const result = await tool.execute("https://example.test/secret");

  assert.equal(result.headers["set-cookie"], "[REDACTED]");
  assert.equal(result.body.api_key, "[REDACTED]");
  assert.equal(result.body.nested.password, "[REDACTED]");
  assert.equal(result.body.user, "furqan");
});

test("redacts sensitive request headers echoed back in the result", async () => {
  const fetchImpl = makeFetch({ status: 200, text: "ok" });
  const tool = createHttpTool({ fetch: fetchImpl });

  const result = await tool.execute(JSON.stringify({
    url: "https://example.test/auth",
    headers: { authorization: "Bearer supersecret", "x-trace": "keep" },
  }));

  assert.equal(result.request.headers.authorization, "[REDACTED]");
  assert.equal(result.request.headers["x-trace"], "keep");
  // The real (unredacted) header must still be sent to fetch.
  assert.equal(fetchImpl.calls[0].init.headers.authorization, "Bearer supersecret");
});

test("supports Headers-like objects with an entries() iterator", async () => {
  const headers = new Map([["content-type", "text/plain"], ["token", "abc"]]);
  const fetchImpl = makeFetch({ status: 200, headers, text: "plain body" });
  const tool = createHttpTool({ fetch: fetchImpl });

  const result = await tool.execute("https://example.test/plain");

  assert.equal(result.headers["content-type"], "text/plain");
  assert.equal(result.headers.token, "[REDACTED]");
  assert.equal(result.body, "plain body");
});

test("rejects disallowed methods and missing urls", async () => {
  const tool = createHttpTool({ fetch: makeFetch({ status: 200 }) });
  await assert.rejects(
    () => tool.execute(JSON.stringify({ url: "https://x.test", method: "TRACE" })),
    /method is not allowed/
  );
  await assert.rejects(
    () => tool.execute(JSON.stringify({ method: "GET" })),
    /requires a url/
  );
});

test("rejects malformed JSON input", async () => {
  const tool = createHttpTool({ fetch: makeFetch({ status: 200 }) });
  await assert.rejects(() => tool.execute("{not json"), /JSON input is invalid/);
});
