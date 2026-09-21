# OpsPilot — Usage

How to install the project, use the library, register tools, and run the tests. Every
command and API call here matches the code in [`src/`](../src) as it exists today.

> OpsPilot is currently a **library**, not a long-running service or interactive shell.
> There is no network server or REPL yet (see the Roadmap in the [README](../README.md)).
> The only executable script in the repo is the scaffold entry point `src/dummy.js`; the
> rest is consumed programmatically via `require(...)`, as shown below.

---

## Requirements

- **Node.js ≥ 18** (the test runner uses the built-in `node:test` module and the code
  uses modern syntax such as private class fields and `??`). Developed and verified on
  Node.js 20+.
- **No third-party dependencies.** [`package.json`](../package.json) declares no runtime
  or dev dependencies and the repo ships no lockfile, so there is nothing to download.

## Install

```bash
git clone https://github.com/furqunali/ops-pilot-agent.git
cd ops-pilot-agent

# Nothing to install — there are no dependencies.
# Run the scaffold entry point to confirm your toolchain works:
node src/dummy.js
```

`npm ci` / `npm install` are effectively no-ops here (no dependencies), so you can skip
them; if you run `npm ci` in CI it will simply confirm there is nothing to install.

## Run the tests

Tests use Node's built-in runner — no framework to install. The `test` script in
[`package.json`](../package.json) is:

```json
"scripts": { "test": "node --test" }
```

Run the full suite from the repo root:

```bash
npm test
# equivalently:
node --test
```

`node --test` auto-discovers `*.test.js` files. Specs live in **two** directories, both
of which are picked up:

- [`test/`](../test) — `task-executor`, `task-planner`, `task-result`
- [`tests/`](../tests) — the runtime/tool/pipeline specs (dispatcher, metrics, policy,
  pipeline, contract, errors, health, observability, orchestrator, report, audit,
  result, tool-contract, tool-executor, tool-registry, failed-result)

Run a single file while iterating:

```bash
node --test test/task-planner.test.js
node --test tests/pipeline-execution.test.js
```

### Writing a new test

Follow the existing style (`node:test` + `node:assert/strict`, requiring from `../src`):

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { planTask } = require("../src/task-planner");

test("planTask produces the five-stage plan", () => {
  const plan = planTask("reconcile invoices");
  assert.equal(plan.steps.length, 5);
  assert.equal(plan.steps[2].action, "execute");
  assert.equal(plan.steps[2].status, "requires-tool");
});
```

Place it in `test/` or `tests/` (both are discovered) and name it `*.test.js`.

---

## Using the library

### Define a tool

A tool is a plain object validated by
[`tool-contract.js`](../src/tool-contract.js): a non-empty `name`, an `execute`
function, and a non-empty `capabilities` array drawn from `read` / `write` / `execute`.
`execute` may be sync or async and receives the (trimmed) task string.

```js
const readInbox = {
  name: "inbox-reader",
  capabilities: ["read"],
  execute: async (task) => {
    // ...do the real work, return any serialisable value...
    return { summary: `digest for: ${task}`, urgent: 0 };
  },
};
```

### Register tools

[`ToolRegistry`](../src/tool-registry.js) validates on registration and rejects
duplicate names:

```js
const { ToolRegistry } = require("./src/tool-registry");

const registry = new ToolRegistry();          // or new ToolRegistry([toolA, toolB])
registry.register(readInbox);                  // throws if invalid or name already taken

registry.list();          // [{ name: "inbox-reader", capabilities: ["read"] }]
registry.get("inbox-reader");                  // the tool, or null if absent
```

### Run a task end-to-end (policy-gated, async)

[`executePlannedTask`](../src/pipeline-execution.js) plans the task, enforces the
execution-policy authorization gate, runs the **tool object**, verifies the result, and
builds the five-event audit trail:

```js
const { executePlannedTask } = require("./src/pipeline-execution");

const run = await executePlannedTask("summarise today's support inbox", readInbox);

run.result.status;        // "success" | "failed" | "skipped"
run.verification.valid;   // true
run.audit.map(e => e.stage); // ["parse","plan","execute","verify","report"]
```

Call it **without** a tool to see the guardrail in action — the execute stage is
`skipped` with a reason rather than silently doing nothing:

```js
const skipped = await executePlannedTask("delete production data");
skipped.result.status;    // "skipped"
skipped.result.error;     // "tool is required"
```

### Run a task and get a report (sync, function tool)

[`runTaskPipeline`](../src/runtime-pipeline.js) works with a plain **function** tool and
additionally returns a flattened `report`:

```js
const { runTaskPipeline } = require("./src/runtime-pipeline");

const { report } = runTaskPipeline(
  "generate the weekly operations status",
  (task) => ({ rows: 12 })      // the function tool
);

report.status;    // "success"
report.verified;  // true
report.steps;     // the five plan steps
```

If you only need result + verification (no report/audit), use
[`runTask`](../src/runtime-orchestrator.js) instead.

### Governance: permissions and redaction

Gate loop actions by role with
[`PermissionPolicy`](../src/permission-policy.js), and scrub secrets from anything you
log or persist with [`data-redaction.js`](../src/data-redaction.js):

```js
const { createDefaultPermissionPolicy } = require("./src/permission-policy");
const { sanitizeAuditEvent } = require("./src/data-redaction");

const policy = createDefaultPermissionPolicy();
policy.allow("operator", "execute");   // true
policy.allow("observer", "execute");   // false — observers cannot execute
policy.require("operator", "execute"); // true, or throws for a disallowed role

sanitizeAuditEvent({ stage: "execute", tool: "billing", api_key: "sk-live-123" });
// { stage: "execute", tool: "billing", api_key: "[REDACTED]" }
```

---

## Configuration

Runtime knobs are read from `OPS_*` environment variables (plus explicit overrides) by
[`runtime-config.js`](../src/runtime-config.js):

```js
const { loadRuntimeConfig } = require("./src/runtime-config");

const config = loadRuntimeConfig(process.env, { environment: "staging" });
// { maxRetries, retryDelayMs, executionTimeoutMs, auditRetention,
//   maxQueueDepth, healthWindow, environment }  (frozen)
```

| Env var | Config field | Default |
| --- | --- | --- |
| `OPS_MAX_RETRIES` | `maxRetries` | `2` |
| `OPS_RETRY_DELAY_MS` | `retryDelayMs` | `100` |
| `OPS_EXECUTION_TIMEOUT_MS` | `executionTimeoutMs` | `30000` |
| `OPS_AUDIT_RETENTION` | `auditRetention` | `1000` |
| `OPS_MAX_QUEUE_DEPTH` | `maxQueueDepth` | `100` |
| `OPS_HEALTH_WINDOW` | `healthWindow` | `100` |
| `NODE_ENV` | `environment` | `development` |

Secrets (API keys, tokens) are **not** read from config here — supply them to your tool
implementations via the environment, and never commit them (see the README's Security
section).

## Continuous integration

[`.github/workflows/node-tests.yml`](../.github/workflows/node-tests.yml) runs
`npm test` on Node.js 20 for every push and pull request against `main`.

## Where to go next

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the full module map and how the loop composes.
- [`examples.md`](../examples.md) — copy-pasteable worked examples.
- [`agent-instructions.md`](../agent-instructions.md) — the behavioural contract.
