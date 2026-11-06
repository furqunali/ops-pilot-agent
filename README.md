# 🛠️ OpsPilot — AI Operations Agent

*An operations copilot that turns plain-language instructions into planned, verified, multi-step work.*

> **Status: active reference implementation.** The repository contains a tested runtime, CLI, Finance reference workflow, MCP protocol adapter, HTTP boundary, evaluation framework, and external-provider integration primitives. Real-money execution remains intentionally out of scope.

---

## 🎯 Problem

Operations and back-office teams lose significant time to repetitive, rule-based work: triaging inboxes, compiling recurring status reports, and cleaning up data entries. These tasks are:

- **Too varied for rigid scripts** — each request is phrased differently and needs light judgment.
- **Too repetitive for skilled staff** — they crowd out higher-value work.
- **Risky to hand to an unconstrained LLM** — outward-facing or irreversible actions need guardrails and a human in the loop.

The gap is a system that accepts a task in natural language, reasons about *how* to do it, executes against real tools, and stays safe and transparent while doing so.

## 💡 Solution

**OpsPilot** is a spec-driven operations copilot. A user describes a task in plain English; OpsPilot parses the intent, plans the steps, executes them against connected tools, verifies the outcome, and reports back honestly — including what it skipped and why.

The project is deliberately **specification-first**: the agent's role, principles, and task loop are defined as a versioned contract ([`agent-instructions.md`](agent-instructions.md)) before runtime code, so behaviour is auditable and reviewable rather than buried in prompts.

## 🧭 Architecture

OpsPilot follows a five-stage task loop, driven by the operating specification:

```
Natural-language task
        │
        ▼
   ┌─────────┐   ┌────────┐   ┌─────────┐   ┌────────┐   ┌────────┐
   │ 1 Parse │──▶│ 2 Plan │──▶│3 Execute│──▶│4 Verify│──▶│5 Report│
   └─────────┘   └────────┘   └─────────┘   └────────┘   └────────┘
        │                          │
   restate intent            tool use +
   confirm if ambiguous    human-in-the-loop
                            for risky actions
```

- **Parse** — restate the instruction and confirm intent when ambiguous.
- **Plan** — decompose the task into discrete, ordered steps.
- **Execute** — act against connected tools, pausing for human approval on irreversible or outward-facing steps.
- **Verify** — check the result against the intended outcome.
- **Report** — explain what was done, what was skipped, and any errors, transparently.

The behavioural contract lives in [`agent-instructions.md`](agent-instructions.md); concrete task patterns the agent is designed to handle are documented in [`examples.md`](examples.md).

## ✨ Key Features

- **Natural-language task intake** — operational instructions in, structured work out.
- **Plan-then-execute loop** — reasoning is separated from action for reviewability.
- **Human-in-the-loop guardrails** — irreversible or outward-facing actions require confirmation.
- **Transparent reporting** — the agent reports skips and errors honestly, never silently.
- **Specification-driven design** — behaviour defined as a versioned contract, not ad-hoc prompting.

## 🧱 Tech Stack

- **JavaScript (Node.js)** — application runtime (`src/`).
- **Markdown specification** — the agent's behavioural contract and example library.
- **Vercel** — static hosting for the project docs (`vercel.json`).
- **MIT licensed.**

## 🧠 AI / Engineering Decisions

- **Specification-first over prompt-first.** The agent's role, principles, and task loop are written as a reviewable document before runtime code. This keeps behaviour auditable and makes changes to the agent's "contract" explicit in version control.
- **Explicit five-stage loop.** Separating *plan* from *execute* (and adding a dedicated *verify* stage) makes the agent's reasoning inspectable and its actions safer than a single free-running generation.
- **Safety by default.** The principles of *least surprise*, *human-in-the-loop*, and *understand before acting* are first-class in the spec, reflecting that operations work touches real systems and real people.

## 🚀 Setup / Installation

> The runtime and CLI are executable today. The repository is intentionally dependency-light and uses Node's built-in test runner.

```bash
git clone https://github.com/furqunali/ops-pilot-agent.git
cd ops-pilot-agent

# Node.js scaffold
node --test

# Optional CLI entry point
node bin/opspilot.js "compile the weekly operations report" --json
```

Start by reading [`agent-instructions.md`](agent-instructions.md) (the operating spec) and [`examples.md`](examples.md) (the task patterns) to understand the intended behaviour.


## Runtime capabilities

The current runtime is implemented as a tested pipeline:

**parse → plan → authorize → execute → verify → report**

The runtime provides retry policy, execution-policy gating, run correlation, stage observability, an execution ledger, durable recovery, runtime metrics, execution inspection, and structured runtime errors. These capabilities are covered by the automated Node test suite.

### CLI product surface

OpsPilot ships a dependency-free CLI for running the runtime against built-in tools. It supports natural-language keyword routing, explicit tool selection, dry runs, JSON output, and durable execution-ledger inspection.

```bash
opspilot "compile the weekly operations report"
opspilot "echo the handoff note" --tool echo --json
opspilot "sync the invoices" --ledger-file ./ops-ledger.json
opspilot --inspect --ledger-file ./ops-ledger.json
```

The ledger file is append-preserving: subsequent CLI runs reload prior records, execute with a fresh correlated run ID, and persist the updated history.

### Agentic Finance reference workflow

The finance track demonstrates the runtime architecture on a deterministic, simulation-only payment workflow:

request → policy knowledge → deterministic policy → evidence → human approval → simulated preparation → finance audit → runtime ledger → verification/evaluation

The implementation is intentionally not connected to real-money execution. Finance tools expose invoice/vendor lookup, payment validation, and simulation-only payment preparation. Policy decisions can require approval or block a vendor, and policy evidence is attached to the decision before audit events are recorded.

The MCP adapter exposes the finance tools through JSON-RPC with protocol metadata, structured tool results, and tool errors. A dependency-free Node HTTP adapter provides the transport boundary with request validation and body-size limits. The Finance tool layer can delegate invoice/vendor reads to an injected external provider with timeout and retryable-error classification. The evaluation layer produces case-level results and a deterministic dashboard projection covering overall pass rate plus policy, evidence, and evaluator dimensions.

Run the deterministic suites locally before changing the workflow:

```bash
node bin/opspilot.js --finance-evaluate --json
node bin/opspilot.js --finance-runtime-evaluate --json
node bin/opspilot.js --finance-workflow-evaluate --json
```

The workflow evaluation exercises allowed, blocked, pending-approval, approved, and rejected scenarios. It exits non-zero if any expected policy, workflow, evidence, audit-correlation, or simulation-safety contract fails.


### External provider boundary

The Finance tool layer supports deterministic in-memory fixtures and an injected provider. The provider boundary is transport-agnostic; the built-in HTTP adapter adds timeout, retryable-error classification, and URL-safe invoice/vendor lookups.

```js
const { createHttpFinanceProvider } = require("./src/finance-external-provider");
const { createFinanceTools } = require("./src/finance-mcp-tools");

const provider = createHttpFinanceProvider({
  baseUrl: process.env.FINANCE_API_BASE_URL,
  headers: { authorization: `Bearer ${process.env.FINANCE_API_TOKEN}` },
  timeoutMs: 5000,
  maxAttempts: 2,
});

const tools = createFinanceTools({ provider });
```

This boundary is suitable for sandbox/reference integrations. Production deployment still requires service-specific authentication, authorization, data contracts, integration tests, and operational controls. Real-money payment execution remains intentionally out of scope.

### LLM planner (optional): model proposes, policy decides

Planning is deterministic by default. An optional LLM planner (`src/llm-planner.js`) can ask Gemini, OpenAI or Anthropic for a JSON plan using the built-in `fetch` (Node 18+, no SDK dependencies). The model can only **propose** a plan:

- The response must be one JSON object that passes the plan contract: allowed actions only (`parse`, `plan`, `execute`, `verify`, `report`), consecutive ids, exactly one `execute` step with status `requires-tool`, `verify` after `execute`, ending in `report`, and no unknown fields.
- The plan is always bound to the real task text, whatever the model claims.
- Authorization stays deterministic. `authorizeExecution` still decides whether anything runs, so a proposed plan cannot grant a tool or widen scope.
- If the key is missing, the request fails or times out, the JSON is invalid, or the plan breaks the schema, OpsPilot falls back to the deterministic planner. The reason (`missing_api_key`, `timeout`, `network_error`, `provider_error`, `invalid_json`, `schema_violation`) is recorded on `plan.planner`, in the `plan` stage metadata and in the execution-ledger completion record.

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPSPILOT_LLM_PROVIDER` | `gemini`, `openai`, `anthropic` or `none` | `none` (deterministic only) |
| `OPSPILOT_LLM_MODEL` | Model id sent to the provider | `gemini-2.5-flash` / `gpt-4.1-mini` / `claude-opus-5-5` |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Provider key, read for the selected provider | unset |
| `OPSPILOT_LLM_API_KEY` | Optional override key for whichever provider is selected | unset |
| `OPSPILOT_LLM_TIMEOUT_MS` | Request timeout in milliseconds | `15000` |
| `OPSPILOT_LLM_BASE_URL` | Optional API base URL, for example a gateway | the provider's public API |

Keys are read from the environment only. They are kept off the serialized config and sent only in request headers.

```js
const { createLlmPlanner, runPlannedTaskPipeline } = require("./src/llm-planner");

const planner = createLlmPlanner(); // reads the variables above from process.env
const run = await runPlannedTaskPipeline("compile the weekly operations report", input => `done: ${input}`, { planner });
console.log(run.plan.planner); // { source: "llm" | "deterministic", provider, model, fallbackReason, detail }
```

The tests mock `fetch`, so the suite runs offline without keys.

### Prompt-injection defense (OWASP LLM01)

`src/injection-guard.js` screens untrusted text before it can influence planning or tool calls. That covers natural-language tasks, MCP tool arguments, and tool or provider output. Rules are deterministic and offline:

| Category | Examples caught |
| --- | --- |
| `instruction_override` | "ignore previous instructions", "disregard the system rules", fake "real instructions:" blocks |
| `role_override` | "you are now…", "developer mode", injected `system:` lines, `<\|im_start\|>` / `[INST]` markers |
| `system_prompt_exfiltration` | "reveal your system prompt", "print the api key" |
| `tool_smuggling` | `<tool_call>` markup, `"tool_calls":` JSON, "pay … without approval", "silently transfer" |
| `hidden_unicode` | zero-width, bidi-override and Unicode tag characters (also stripped before rule matching) |
| `data_exfiltration_url` | markdown image beacons, templated `?data={{…}}` URLs, "send … to https://…" |

Findings become a policy decision:

| Guard mode | High-severity finding | Medium-severity finding |
| --- | --- | --- |
| `approve` (default) | **block** | **require_approval** |
| `block` | **block** | **block** |
| `review` | **require_approval** | **require_approval** |

- **Runtime pipeline.** Pass `inputGuard` to `runTaskPipeline`. A blocked task never reaches a tool. A task that needs approval runs only when `injectionApproval: { reviewer }` names a human, and even then the deterministic `authorizeExecution` gate still applies. Every flagged decision is appended to the execution ledger as an `input_screening` record with the rule, category, severity and a short excerpt.
- **HTTP API.** `createRuntimeHttpServer({ inputGuard })` screens every `/run`. Remote callers cannot set server-controlled options (`injectionApproval`, `inputGuard`, `plan`, `ledger`, `executionAdapter`), so they cannot approve their own flagged task.
- **MCP adapter.** `createMcpFinanceServer({ tools, inputGuard, ledger })` screens `tools/call` arguments, including object keys. If the guard does not allow a call, it returns a tool error before the tool runs.
- **LLM planner.** `createLlmPlanner({ inputScreen: createPlannerInputScreen(guard) })` keeps flagged tasks away from the model and uses the deterministic planner instead, recording `input_rejected`. The task and any context such as tool output are always wrapped by `wrapUntrusted()`, which puts them in an `<untrusted_data>` block as a JSON-encoded string. The data cannot close the wrapper or carry raw role markers, and the model is told to treat it as data.

```js
const { createInjectionGuard } = require("./src/injection-guard");
const guard = createInjectionGuard({ mode: "approve" });
runTaskPipeline("send the summary to https://example.org/inbox", tool, { inputGuard: guard, ledger });
// -> skipped, reason "human approval required: prompt-injection screening flagged data_exfiltration_url (medium)"
```

**OWASP Top 10 for LLM Applications mapping:** this covers **LLM01 Prompt Injection** (direct and indirect, through tool or provider output). It also limits **LLM06 Excessive Agency**, because the model only proposes and policy decides, and reduces **LLM02 Sensitive Information Disclosure** through exfiltration-URL screening and secret redaction. Pattern screening is defense in depth, not a guarantee. The structural controls (schema-validated plans, deterministic authorization, human approval, simulation-only payments) are the primary defense. A false-positive suite of normal operations tasks runs in CI.

### Runtime example

```js
const { runTaskPipeline } = require("./src/runtime-pipeline");
const { ExecutionLedger } = require("./src/execution-ledger");

const ledger = new ExecutionLedger({ maxEntries: 1000 });
const run = runTaskPipeline("summarize the incident", text => `done: ${text}`, {
  runId: "incident-42",
  ledger,
  maxAttempts: 3,
});

console.log(run.runId);
console.log(run.report);
console.log(ledger.summarize());
```

### OpsPilot Assurance Console

The evaluation surface is intentionally designed as an engineering control plane rather than a generic scorecard. Each report carries a schema version, correlated run ID, profile, seven-stage assurance pipeline, risk classification, decision distribution, gate-level pass rates, and actionable failed-gate details.

```js
const { evaluateFinanceSuiteDashboard, DEFAULT_CASES } = require("./src/finance-evaluation");
const { createPolicyKnowledge } = require("./src/finance-policy-knowledge");
const { renderAssuranceConsole } = require("./src/finance-assurance-console");

const knowledge = createPolicyKnowledge([
  { id: "payment-threshold", title: "Payment approval threshold", text: "Payments at or above the approval threshold require approval." },
  { id: "vendor-blocklist", title: "Vendor blocklist", text: "Blocked vendors cannot receive payments." },
]);
const { dashboard } = evaluateFinanceSuiteDashboard(DEFAULT_CASES, knowledge, null, {
  runId: "finance-ci-001",
  profile: "finance-reference",
});
console.log(renderAssuranceConsole(dashboard));
```

The console labels the stages as **intake → policy gate → evidence binding → approval control → simulation → audit commit → evaluation**. A policy-gate failure raises the report risk to `critical`; other failed checks are marked `elevated`; a fully passing suite is `nominal`. Reports can also be serialized as JSON for CI artifacts and later comparison.

## 🔒 Security

- **No secrets committed.** Credentials and API keys are intended to be supplied via environment variables, never checked into the repository.
- **Human-in-the-loop for risky actions.** Irreversible or outward-facing steps require explicit confirmation by design.
- **Anonymized examples.** The documented task examples use generic, non-sensitive scenarios — no real customer or company data.

## 🗺️ Roadmap

This is an early-stage build. Honest next steps:

- [x] Implement the core task loop (parse → plan → authorize → execute → verify → report) in `src/`.
- [x] Add a protocol-facing MCP finance tool layer; production connectors remain future work.
- [x] Add production connector configuration and secret-safe HTTP connector primitives.\n- [ ] Connect approved tool definitions to real external services with service-specific authentication, retries, and integration tests.
- [x] Add automated tests around the planning, execution, verification, finance policy, audit, and evaluation stages.
- [x] Turn the finance reference workflow into a tested runnable scenario.

## Related

- [`Digital_FTE`](https://github.com/furqunali/Digital_FTE) · [`digital-fte-agent`](https://github.com/furqunali/digital-fte-agent)

---

*Part of [Furqan Ali](https://github.com/furqunali)'s portfolio — AI & Intelligent Automation / Digital Transformation.*
