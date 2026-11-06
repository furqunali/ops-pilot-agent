"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FALLBACK_REASONS,
  DEFAULT_MODELS,
  loadLlmPlannerConfig,
  buildProviderRequest,
  validateProposedPlan,
  createLlmPlanner,
  runPlannedTaskPipeline,
} = require("../src/llm-planner");
const { ExecutionLedger } = require("../src/execution-ledger");
const { runTaskPipeline } = require("../src/runtime-pipeline");

const TASK = "compile the weekly operations report";

const GOOD_PLAN = {
  steps: [
    { id: 1, action: "parse", status: "ready", description: "restate the reporting request" },
    { id: 2, action: "plan", status: "ready" },
    { id: 3, action: "execute", status: "requires-tool", description: "run the report tool" },
    { id: 4, action: "verify", status: "pending" },
    { id: 5, action: "report", status: "pending" },
  ],
};

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

function envelope(provider, text) {
  if (provider === "gemini") return { candidates: [{ content: { parts: [{ text }] } }] };
  if (provider === "openai") return { choices: [{ message: { content: text } }] };
  return { content: [{ type: "text", text }], stop_reason: "end_turn" };
}

function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return handler(url, init);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

for (const provider of ["gemini", "openai", "anthropic"]) {
  test(`${provider} planner returns a validated LLM plan`, async () => {
    const fetchImpl = mockFetch(() => jsonResponse(envelope(provider, JSON.stringify(GOOD_PLAN))));
    const planner = createLlmPlanner({ env: { OPSPILOT_LLM_PROVIDER: provider, OPSPILOT_LLM_API_KEY: "test-key" }, fetchImpl });
    const plan = await planner.plan(TASK);
    assert.equal(plan.planner.source, "llm");
    assert.equal(plan.planner.provider, provider);
    assert.equal(plan.planner.model, DEFAULT_MODELS[provider]);
    assert.equal(plan.task, TASK);
    assert.deepEqual(plan.steps.map(step => step.action), ["parse", "plan", "execute", "verify", "report"]);
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(fetchImpl.calls[0].init.method, "POST");
    assert.match(JSON.stringify(fetchImpl.calls[0].body), /compile the weekly operations report/);
  });
}

test("provider requests carry the key only in headers and use provider-specific shapes", () => {
  const gemini = buildProviderRequest(loadLlmPlannerConfig({ OPSPILOT_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "g-key" }), TASK);
  assert.match(gemini.url, /models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(gemini.headers["x-goog-api-key"], "g-key");
  assert.equal(gemini.body.generationConfig.responseMimeType, "application/json");
  const openai = buildProviderRequest(loadLlmPlannerConfig({ OPSPILOT_LLM_PROVIDER: "openai", OPENAI_API_KEY: "o-key", OPSPILOT_LLM_MODEL: "custom-model" }), TASK);
  assert.equal(openai.headers.authorization, "Bearer o-key");
  assert.equal(openai.body.model, "custom-model");
  assert.deepEqual(openai.body.response_format, { type: "json_object" });
  const anthropic = buildProviderRequest(loadLlmPlannerConfig({ OPSPILOT_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a-key" }), TASK);
  assert.equal(anthropic.headers["x-api-key"], "a-key");
  assert.equal(anthropic.headers["anthropic-version"], "2023-06-01");
  for (const request of [gemini, openai, anthropic]) assert.doesNotMatch(JSON.stringify(request.body), /-key/);
});

test("config never exposes the API key when serialized and rejects unknown providers", () => {
  const config = loadLlmPlannerConfig({ OPSPILOT_LLM_PROVIDER: "openai", OPENAI_API_KEY: "secret-value" });
  assert.equal(config.apiKey, "secret-value");
  assert.doesNotMatch(JSON.stringify(config), /secret-value/);
  assert.throws(() => loadLlmPlannerConfig({ OPSPILOT_LLM_PROVIDER: "unknown" }), /OPSPILOT_LLM_PROVIDER/);
  assert.equal(loadLlmPlannerConfig({ OPSPILOT_LLM_PROVIDER: "none" }).provider, null);
});

test("falls back to the deterministic planner when no provider is configured", async () => {
  const fetchImpl = mockFetch(() => { throw new Error("must not be called"); });
  const plan = await createLlmPlanner({ env: {}, fetchImpl }).plan(TASK);
  assert.equal(plan.planner.source, "deterministic");
  assert.equal(plan.planner.fallbackReason, FALLBACK_REASONS.DISABLED);
  assert.equal(fetchImpl.calls.length, 0);
});

test("falls back without calling the network when the API key is missing", async () => {
  const fetchImpl = mockFetch(() => { throw new Error("must not be called"); });
  const plan = await createLlmPlanner({ env: { OPSPILOT_LLM_PROVIDER: "gemini" }, fetchImpl }).plan(TASK);
  assert.equal(plan.planner.fallbackReason, FALLBACK_REASONS.MISSING_KEY);
  assert.match(plan.planner.detail, /GEMINI_API_KEY/);
  assert.deepEqual(plan.steps.map(step => step.action), ["parse", "plan", "execute", "verify", "report"]);
  assert.equal(fetchImpl.calls.length, 0);
});

test("falls back on invalid JSON from the model", async () => {
  const fetchImpl = mockFetch(() => jsonResponse(envelope("openai", "Sure! Here is your plan: step one...")));
  const plan = await createLlmPlanner({ env: { OPSPILOT_LLM_PROVIDER: "openai", OPENAI_API_KEY: "k" }, fetchImpl }).plan(TASK);
  assert.equal(plan.planner.source, "deterministic");
  assert.equal(plan.planner.fallbackReason, FALLBACK_REASONS.INVALID_JSON);
});

test("falls back when the provider envelope itself is not JSON", async () => {
  const fetchImpl = mockFetch(() => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }));
  const plan = await createLlmPlanner({ env: { OPSPILOT_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }, fetchImpl }).plan(TASK);
  assert.equal(plan.planner.fallbackReason, FALLBACK_REASONS.INVALID_JSON);
});

test("accepts a single fenced JSON block", async () => {
  const fetchImpl = mockFetch(() => jsonResponse(envelope("gemini", "```json\n" + JSON.stringify(GOOD_PLAN) + "\n```")));
  const plan = await createLlmPlanner({ env: { OPSPILOT_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k" }, fetchImpl }).plan(TASK);
  assert.equal(plan.planner.source, "llm");
});

test("falls back on schema-violating plans", async () => {
  const violations = [
    { steps: [] },
    { steps: [{ id: 1, action: "delete_everything", status: "ready" }] },
    { steps: GOOD_PLAN.steps.map(step => (step.action === "execute" ? { ...step, status: "ready" } : step)) },
    { steps: GOOD_PLAN.steps.filter(step => step.action !== "verify").map((step, index) => ({ ...step, id: index + 1 })) },
    { steps: GOOD_PLAN.steps.map(step => (step.id === 1 ? { ...step, tool: "shell" } : step)) },
    { steps: GOOD_PLAN.steps.map(step => ({ ...step, id: step.id + 10 })) },
    { steps: [...GOOD_PLAN.steps.slice(0, 3), { id: 4, action: "execute", status: "requires-tool" }, { id: 5, action: "verify", status: "pending" }, { id: 6, action: "report", status: "pending" }] },
  ];
  for (const proposal of violations) {
    const fetchImpl = mockFetch(() => jsonResponse(envelope("openai", JSON.stringify(proposal))));
    const plan = await createLlmPlanner({ env: { OPSPILOT_LLM_PROVIDER: "openai", OPENAI_API_KEY: "k" }, fetchImpl }).plan(TASK);
    assert.equal(plan.planner.source, "deterministic", JSON.stringify(proposal));
    assert.equal(plan.planner.fallbackReason, FALLBACK_REASONS.SCHEMA);
  }
});

test("validated plans always bind to the real task, not the model's claim", () => {
  const plan = validateProposedPlan({ ...GOOD_PLAN, task: "something else" }, TASK);
  assert.equal(plan.task, TASK);
});

test("falls back on timeout", async () => {
  const fetchImpl = mockFetch((url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  }));
  const planner = createLlmPlanner({ env: { OPSPILOT_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k", OPSPILOT_LLM_TIMEOUT_MS: "20" }, fetchImpl });
  const plan = await planner.plan(TASK);
  assert.equal(plan.planner.fallbackReason, FALLBACK_REASONS.TIMEOUT);
});

test("falls back on provider HTTP errors and network errors without leaking secrets", async () => {
  const httpError = mockFetch(() => jsonResponse({ error: "rate limited" }, { ok: false, status: 429 }));
  const first = await createLlmPlanner({ env: { OPSPILOT_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }, fetchImpl: httpError }).plan(TASK);
  assert.equal(first.planner.fallbackReason, FALLBACK_REASONS.PROVIDER);
  assert.match(first.planner.detail, /429/);

  const networkError = mockFetch(() => { throw new Error("connect ECONNREFUSED token=abc123"); });
  const second = await createLlmPlanner({ env: { OPSPILOT_LLM_PROVIDER: "openai", OPENAI_API_KEY: "k" }, fetchImpl: networkError }).plan(TASK);
  assert.equal(second.planner.fallbackReason, FALLBACK_REASONS.NETWORK);
  assert.doesNotMatch(second.planner.detail, /abc123/);
});

test("treats an Anthropic refusal as a provider fallback", async () => {
  const fetchImpl = mockFetch(() => jsonResponse({ content: [], stop_reason: "refusal" }));
  const plan = await createLlmPlanner({ env: { OPSPILOT_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }, fetchImpl }).plan(TASK);
  assert.equal(plan.planner.fallbackReason, FALLBACK_REASONS.PROVIDER);
});

test("LLM plans flow through the deterministic authorization gate", async () => {
  const fetchImpl = mockFetch(() => jsonResponse(envelope("gemini", JSON.stringify(GOOD_PLAN))));
  const planner = createLlmPlanner({ env: { OPSPILOT_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k" }, fetchImpl });
  const ledger = new ExecutionLedger();

  const withoutTool = await runPlannedTaskPipeline(TASK, null, { planner, ledger, runId: "llm-run-1" });
  assert.equal(withoutTool.result.status, "skipped");
  assert.equal(withoutTool.result.reason, "tool is required");
  assert.equal(withoutTool.plan.planner.source, "llm");

  const withTool = await runPlannedTaskPipeline(TASK, input => `done: ${input}`, { planner, ledger, runId: "llm-run-2" });
  assert.equal(withTool.result.status, "success");
  assert.equal(withTool.observability.stages.find(stage => stage.stage === "plan").metadata.planner.source, "llm");
  const completion = ledger.findByType("completion").find(entry => entry.metadata.runId === "llm-run-2");
  assert.deepEqual(completion.metadata.planner, { source: "llm", provider: "gemini", model: DEFAULT_MODELS.gemini, fallbackReason: null });
});

test("runTaskPipeline rejects a proposed plan for a different task or with an invalid shape", async () => {
  assert.throws(() => runTaskPipeline(TASK, null, { plan: { task: "other task", steps: GOOD_PLAN.steps } }), /plan.task must match/);
  assert.throws(() => runTaskPipeline(TASK, null, { plan: { task: TASK, steps: [] } }), /must not be empty/);
  await assert.rejects(() => runPlannedTaskPipeline(TASK, null, {}), /planner must expose plan/);
});
