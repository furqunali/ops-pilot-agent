# OpsPilot — Runnable scenarios

These are the three task patterns from [`examples.md`](../examples.md) turned into
**runnable, end-to-end scenarios**. Each one wires the existing `src/` modules
(`task-planner`, the execution pipeline, `tool-registry`, the tools in
`src/tools/`, `runtime-report`, …) through the full **parse → plan → execute →
verify → report** loop against injectable, non-sensitive fixtures. No network,
no third-party dependencies.

## Run them

From the repo root (no install step — there are no dependencies):

```bash
node examples/inbox-triage.js    # Scenario 1 — Summarise & route
node examples/status-report.js   # Scenario 2 — Routine report
node examples/data-cleanup.js    # Scenario 3 — Data tidy-up
```

Each prints a flattened runtime-report (task, status, verified, output, the five
plan steps, and — where applicable — the audit trail).

## What each scenario does

| File | Pattern | Wires | End-to-end behaviour |
| --- | --- | --- | --- |
| [`inbox-triage.js`](inbox-triage.js) | Summarise & route | `pipeline-execution` (policy-gated async), a read-only inbox tool, `runtime-report` | Triages a support-inbox fixture, flags urgent items, verifies, and emits the five-event audit trail. Also shows the human-in-the-loop guardrail: an outward-facing follow-up with **no** tool is *skipped with a reason*. |
| [`status-report.js`](status-report.js) | Routine report | `ToolRegistry`, `runTaskPipeline`, the real `filesystem-tool` | Compiles a Markdown weekly status from a tracker fixture, then persists it via the registered filesystem tool — all I/O confined to a sandbox directory. |
| [`data-cleanup.js`](data-cleanup.js) | Data tidy-up | `ToolRegistry`, `runTaskPipeline`, the real `transform-tool` | De-duplicates messy vendor records, renames keys onto a clean shape, and redacts a stray secret — reporting honestly how many duplicates were dropped. |

## Tests

Each scenario exports a core function that is exercised end-to-end in
[`../tests/scenarios.test.js`](../tests/scenarios.test.js) with injected fixtures
(and a temp sandbox for the filesystem write). Run the whole suite with:

```bash
node --test
```
