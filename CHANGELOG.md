# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
