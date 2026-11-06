# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Optional LLM planner (`src/llm-planner.js`) for Gemini, OpenAI and Anthropic using the built-in `fetch` with no SDK dependencies. It is selected with `OPSPILOT_LLM_PROVIDER`, `OPSPILOT_LLM_MODEL` and the provider API key variables. Proposed plans are validated against the plan contract. Missing keys, timeouts, network or provider errors, invalid JSON and schema violations fall back to the deterministic planner, and the reason is recorded.
- `runPlannedTaskPipeline()`, an async entry point that awaits the proposed plan and then runs the existing deterministic pipeline, including authorization.
- `runTaskPipeline()` accepts a pre-computed `plan` option. It is validated with `validatePlan` and must belong to the same task. Planner provenance is written to the `plan` stage metadata and the ledger completion record.
- `RUNTIME_PLANNER_FALLBACK` error code.
- `.gitignore` excluding `.env` files and `node_modules`.
