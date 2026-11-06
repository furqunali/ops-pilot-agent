# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Idempotency keys (`src/idempotency-store.js`), persisted in the existing state store (memory or atomic JSON file). A repeat with the same key and payload returns the original result without executing. The same key with a different payload raises `RUNTIME_IDEMPOTENCY_CONFLICT`. Records have a TTL with `purgeExpired()`, in-process duplicates are coalesced, stale in-progress markers are handled, and failed operations are not remembered.
- `runFinanceWorkflowIdempotent()` (`src/finance-idempotency.js`) makes payment preparation exactly-once per key. Only terminal outcomes are remembered, so a pending approval can be completed with the same key, and each replay records a `finance.execution_replayed` audit event.
- An `Idempotency-Key` header on `POST /run` when the HTTP server is created with `idempotencyStore`. Replays return `Idempotent-Replayed: true`, and conflicts return `409`.
- `RUNTIME_IDEMPOTENCY_CONFLICT` and `RUNTIME_IDEMPOTENCY_IN_PROGRESS` error codes.
- Observability (`src/runtime-telemetry.js`): a dependency-free Prometheus registry and runtime telemetry. It counts runs, stage-duration histograms, approvals, blocks, planner fallbacks, errors and execution attempts, plus ledger gauges built on `metricsFromLedger`.
- `GET /metrics` on the runtime HTTP API, in Prometheus text format 0.0.4. `createRuntimeHttpServer({ telemetry, traceExporter })` observes every `/run`.
- OpenTelemetry-compatible trace export: `buildRunSpans()` (OTLP/JSON-shaped, one span per stage, trace ID derived from the run ID), `createJsonLinesTraceExporter()` and `exportRuntimeTraceOtlp()` for existing `RuntimeTrace` spans.
- Pipeline runs keep wall-clock stage timings (non-enumerable `observability.timings`) for accurate span timestamps.
- Prompt-injection defense (`src/injection-guard.js`, OWASP LLM01). It screens for instruction override, role override, system-prompt exfiltration, tool smuggling, hidden or zero-width Unicode and data-exfiltration URLs. The `approve`, `block` and `review` policy modes turn findings into allow, require-approval or block decisions.
- `runTaskPipeline()` accepts `inputGuard` and `injectionApproval`. Blocked or unapproved tasks are skipped, and every flagged decision is written to the ledger as an `input_screening` record.
- MCP `tools/call` arguments are screened when `createMcpFinanceServer({ inputGuard, ledger })` is configured. `createMcpFinanceHttpHandler` passes both options through.
- `wrapUntrusted()` and `createPlannerInputScreen()`. The LLM planner now wraps the task and context as JSON-encoded untrusted data, and flagged tasks never reach the model.
- Optional LLM planner (`src/llm-planner.js`) for Gemini, OpenAI and Anthropic using the built-in `fetch` with no SDK dependencies. It is selected with `OPSPILOT_LLM_PROVIDER`, `OPSPILOT_LLM_MODEL` and the provider API key variables. Proposed plans are validated against the plan contract. Missing keys, timeouts, network or provider errors, invalid JSON and schema violations fall back to the deterministic planner, and the reason is recorded.
- `runPlannedTaskPipeline()`, an async entry point that awaits the proposed plan and then runs the existing deterministic pipeline, including authorization.
- `runTaskPipeline()` accepts a pre-computed `plan` option. It is validated with `validatePlan` and must belong to the same task. Planner provenance is written to the `plan` stage metadata and the ledger completion record.
- `RUNTIME_PLANNER_FALLBACK` error code.
- `.gitignore` excluding `.env` files and `node_modules`.

### Security

- The runtime HTTP API strips server-controlled options (`injectionApproval`, `inputGuard`, `plan`, `ledger`, `executionAdapter`) from client requests, so callers cannot approve their own flagged tasks. `createRuntimeHttpServer({ inputGuard })` enables screening for `/run`.
