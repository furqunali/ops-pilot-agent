# OpsPilot — Architecture

This document is an accurate map of the code that exists in [`src/`](../src) today. It
describes the modules, how they compose into the five-stage task loop
(**parse → plan → execute → verify → report**), and the supporting subsystems around
that loop. Nothing here is aspirational — every module, export, and behaviour named
below is present in the repository.

> For the behavioural contract behind the loop see [`agent-instructions.md`](../agent-instructions.md).
> For runnable snippets see [`examples.md`](../examples.md); for how to run things see [`USAGE.md`](USAGE.md).

---

## Design at a glance

OpsPilot is a small, dependency-free Node.js library (CommonJS modules, no runtime
`dependencies` in [`package.json`](../package.json)). Each file exports one focused
capability so the pieces can be composed or tested in isolation. The public building
block is the **task loop**, wrapped by a handful of ready-made *pipeline* entry points;
everything else is supporting infrastructure (results, tools, scheduling, governance,
observability).

```
                       ┌──────────────── pipeline entry points ────────────────┐
                       │  runtime-orchestrator  runtime-pipeline  pipeline-     │
                       │  (sync)                (sync, +report)   execution     │
                       │                                          (async, tool  │
                       │                                          objects)      │
                       └───────────────────────────┬───────────────────────────┘
                                                    │ compose
        parse ─────────► plan ─────────► execute ─────────► verify ─────────► report
     (Task model)   (task-planner)   (task-executor /   (task-verifier)  (runtime-report /
                                      execution-        │                 runtime-pipeline-
                                      dispatcher +      │                 audit)
                                      tool-executor)    │
                                                        ▼
                              tool-registry · tool-contract · execution-policy
```

---

## Module map

### 1. Task model & results

| Module | Exports | Responsibility |
| --- | --- | --- |
| [`task-model.js`](../src/task-model.js) | `Task` | Value object for an instruction. Trims input and rejects empty/non-string input in the constructor. |
| [`task-result.js`](../src/task-result.js) | `TaskResult` | Class wrapper for a result (`task`, `status`, `output`, `error`) with `isSuccessful()` and `toJSON()`. Enforces `status ∈ {success, failed, skipped}`. |
| [`failed-result.js`](../src/failed-result.js) | `failedResult` | Helper that builds a plain `{ task, status: "failed", output: null, error }` object from a task string and an `Error` or message. |
| [`result-normalizer.js`](../src/result-normalizer.js) | `STATUSES`, `normalizeStatus`, `normalizeOutput`, `normalizeResult`, `mergeResults`, `resultSummary` | Canonicalises heterogeneous result objects: lower-cases/validates status, deep-normalises output, merges two results, and aggregates a list into success/failure counts and rates. |

### 2. The five-stage loop

| Module | Exports | Responsibility |
| --- | --- | --- |
| [`task-planner.js`](../src/task-planner.js) | `planTask` | Turns a `Task` (or raw string) into the fixed five-step plan: `parse` & `plan` = `ready`, `execute` = `requires-tool`, `verify` & `report` = `pending`. |
| [`task-executor.js`](../src/task-executor.js) | `executeTask` | Synchronous execution against a **function** tool. No tool → `{ status: "skipped" }`; a function tool → `{ status: "success", output: tool(task) }`. |
| [`task-verifier.js`](../src/task-verifier.js) | `verifyResult` | Checks a result is well-formed: returns `{ valid, checks: { taskPresent, statusValid } }`. |
| [`execution-policy.js`](../src/execution-policy.js) | `validatePlan`, `authorizeExecution` | Structural validation of a plan, and the authorization gate: execution is allowed only when the `execute` step is `requires-tool` **and** a tool is supplied. |
| [`execution-dispatcher.js`](../src/execution-dispatcher.js) | `dispatchExecution` | Bridges policy and tools: authorizes via `authorizeExecution`, then runs the **tool object** through `executeWithTool`; returns `skipped` with a reason when not authorized. |

### 3. Tools

| Module | Exports | Responsibility |
| --- | --- | --- |
| [`tool-contract.js`](../src/tool-contract.js) | `VALID_CAPABILITIES`, `validateTool` | Defines what a valid tool is: an object with a non-empty `name`, an `execute` function, and a non-empty `capabilities` array drawn from `{read, write, execute}`. |
| [`tool-executor.js`](../src/tool-executor.js) | `executeWithTool` | Async single-tool runner. Validates the tool, awaits `tool.execute(input)`, and normalises the outcome to `{ status, output, error }`, converting thrown errors into `failed`. |
| [`tool-registry.js`](../src/tool-registry.js) | `ToolRegistry` | In-memory registry: `register` (validates, rejects duplicate names), `get`, and `list` (name + capabilities). |

### 4. Pipelines (loop compositions)

These are the ready-made entry points that wire the loop together. They differ in what
they return and whether they take a **function** tool or a **tool object**.

| Module | Exports | Responsibility |
| --- | --- | --- |
| [`runtime-orchestrator.js`](../src/runtime-orchestrator.js) | `runTask` | Synchronous loop over a **function** tool: `plan → execute → verify`. Returns `{ task, plan, result, verification }` (no report/audit). |
| [`runtime-pipeline.js`](../src/runtime-pipeline.js) | `runTaskPipeline` | Synchronous loop over a **function** tool that additionally builds `report` and `audit`. Returns `{ task, plan, result, verification, report, audit }`. |
| [`runtime-pipeline-v2.js`](../src/runtime-pipeline-v2.js) | `runTaskPipeline` | A behaviourally identical variant of `runtime-pipeline.js`, kept as a separate entry point. |
| [`pipeline-execution.js`](../src/pipeline-execution.js) | `executePlannedTask` | **Async** loop over a **tool object**: `planTask → dispatchExecution → verifyResult → buildPipelineAudit`. Returns `{ task, plan, result, verification, audit }`. This is the path that enforces the `execution-policy` authorization gate. |

### 5. Reporting, audit & contract

| Module | Exports | Responsibility |
| --- | --- | --- |
| [`runtime-report.js`](../src/runtime-report.js) | `buildRuntimeReport` | Flattens a run into a stable report object (`task`, `status`, `verified`, `output`, `error`, `steps`, `audit`). Throws on malformed runs. |
| [`runtime-pipeline-audit.js`](../src/runtime-pipeline-audit.js) | `buildPipelineAudit` | Produces the five-event audit trail (one `createAuditEvent` per stage), mapping the execute stage to the result status and verify to success/failed. |
| [`task-audit.js`](../src/task-audit.js) | `VALID_STAGES`, `createAuditEvent`, `appendAuditEvent` | Low-level audit primitives: validates stage ∈ `{parse, plan, execute, verify, report}` and builds/appends immutable-shaped audit events. |
| [`runtime-contract.js`](../src/runtime-contract.js) | `validateRuntimeRun` | Asserts a run object has a non-empty `task.input`, a valid `result.status`, a boolean `verification.valid`, and an array `audit`. |

### 6. Reliability & execution support

| Module | Exports | Responsibility |
| --- | --- | --- |
| [`retry-policy.js`](../src/retry-policy.js) | `isRetryableError`, `calculateBackoff`, `createRetryPolicy`, `executeWithRetry` | Retry with exponential backoff (capped). Retries only errors marked/known retryable; records per-attempt outcomes and returns `{ value, attempts, error? }`. |
| [`execution-timeout.js`](../src/execution-timeout.js) | `createTimeoutError`, `withTimeout`, `timeoutBudget` | Wraps an async operation in a `Promise.race` timeout (injectable timers) and computes remaining budget from a start time. |
| [`execution-ledger.js`](../src/execution-ledger.js) | `ExecutionLedger`, `compareLedgerEntries` | Append-only, capped ledger of start/completion/health entries with query helpers, `summarize()`, and JSON `export`/`import` round-tripping. |
| [`execution-metrics.js`](../src/execution-metrics.js) | `summarizeExecution` | Condenses a single run (result + verification + audit) into task/status/verified/stage counts. |
| [`runtime-errors.js`](../src/runtime-errors.js) | `normalizeExecutionError`, `withErrorContext` | Normalises any thrown value into `{ name, message }` and optionally attaches a context object. |

### 7. Scheduling, queueing & task lifecycle

| Module | Exports | Responsibility |
| --- | --- | --- |
| [`task-queue.js`](../src/task-queue.js) | `TaskQueue`, `drainQueue` | Bounded priority queue (higher priority first, FIFO tie-break) with enqueue/dequeue/peek/remove, open/close, and snapshot/restore; `drainQueue` processes up to a limit. |
| [`task-state-machine.js`](../src/task-state-machine.js) | `STATES`, `TRANSITIONS`, `TaskStateMachine`, `validateTransitionPath` | Explicit lifecycle FSM (`created → queued → running → succeeded/failed/…`) with guarded transitions, history, terminal detection, retry `reset()`, and path validation. |
| [`task-dependencies.js`](../src/task-dependencies.js) | `normalizeDependencyMap`, `detectCycles`, `topologicalOrder`, `dependencyStatus` | DAG utilities over a task dependency map: cycle detection, deterministic topological sort, and readiness/missing-parent status. |
| [`runtime-scheduler.js`](../src/runtime-scheduler.js) | `RuntimeScheduler` | Time-based job scheduler with an injectable clock: `schedule`/`cancel`/`due`/`markRunning`/`markComplete`/`removeFinished`/`snapshot`. |

### 8. Configuration, governance & eventing

| Module | Exports | Responsibility |
| --- | --- | --- |
| [`runtime-config.js`](../src/runtime-config.js) | `DEFAULTS`, `loadRuntimeConfig`, `validateRuntimeConfig`, `withConfig` | Loads a frozen config from `OPS_*` environment variables plus overrides, validates it, and derives patched copies. |
| [`permission-policy.js`](../src/permission-policy.js) | `ACTIONS`, `PermissionPolicy`, `createDefaultPermissionPolicy` | Role → action authorization over the loop actions (`parse`…`retry`), with `allow`/`require`/`grant`/`revoke`/`snapshot` and sensible operator/observer/emergency defaults. |
| [`data-redaction.js`](../src/data-redaction.js) | `DEFAULT_SENSITIVE_KEYS`, `compileKeyMatcher`, `redact`, `redactText`, `sanitizeAuditEvent` | Recursively redacts sensitive keys in objects and secret-like patterns in strings; `sanitizeAuditEvent` is the convenience wrapper for audit payloads. |
| [`runtime-health.js`](../src/runtime-health.js) | `assessRuntimeHealth` | Derives a health verdict (`healthy`, `successRate`) from an aggregate summary. |
| [`runtime-observability.js`](../src/runtime-observability.js) | `recordStage`, `summarizeStages` | Immutable stage-timing recorder and roll-up (counts + total duration). |
| [`event-bus.js`](../src/event-bus.js) | `EventBus` | In-process async pub/sub with `on`/`once`/`off`, awaited `emit`, listener counts, and a queryable event history. |

### 9. Scaffold

| Module | Responsibility |
| --- | --- |
| [`dummy.js`](../src/dummy.js) | The scaffold entry point referenced by the README's setup step (`node src/dummy.js`); prints a startup line. |

---

## How a task flows through the async pipeline

Using [`pipeline-execution.js`](../src/pipeline-execution.js) (`executePlannedTask`) as
the reference path, because it exercises the policy gate and tool contract:

1. **Plan** — `planTask(input)` yields the five-step plan; the `execute` step is marked
   `requires-tool`.
2. **Dispatch** — `dispatchExecution(plan, input, tool)` calls
   `authorizeExecution(plan, tool)`. If the `execute` step is not `requires-tool`, or no
   tool is supplied, the run is `skipped` with a reason. Otherwise it hands off to
   `executeWithTool(tool, input)`.
3. **Execute** — `executeWithTool` validates the tool against the contract, awaits
   `tool.execute(input)`, and normalises the outcome to `{ status, output, error }`.
4. **Verify** — `verifyResult({ task, ...result })` confirms the result is well-formed.
5. **Audit** — `buildPipelineAudit(...)` emits five audit events (`parse`, `plan`,
   `execute`, `verify`, `report`), mapping the `execute` event to the real result status.

The return value is `{ task, plan, result, verification, audit }`, matching the shape
checked by `validateRuntimeRun`.

## Choosing a pipeline entry point

| If you have… | …and want | Use |
| --- | --- | --- |
| a plain function tool | just result + verification (sync) | `runTask` (`runtime-orchestrator`) |
| a plain function tool | result + verification + report + audit (sync) | `runTaskPipeline` (`runtime-pipeline`) |
| a validated tool object | policy-gated async execution + audit | `executePlannedTask` (`pipeline-execution`) |

## Conventions

- **CommonJS** modules (`require` / `module.exports`); no build step.
- **No runtime dependencies** — everything is standard Node.js.
- **Defensive inputs** — modules validate arguments and throw `TypeError`/`Error` with
  clear messages rather than failing silently.
- **Plain data out** — pipelines return serialisable objects, suitable for logging,
  auditing, and the `snapshot`/`export` round-trips several modules provide.
- **Two test roots** — `node --test` discovers specs in both [`test/`](../test) and
  [`tests/`](../tests) (see [`USAGE.md`](USAGE.md)).
