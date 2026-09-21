# OpsPilot — Examples

Illustrative tasks OpsPilot is designed to handle, followed by **runnable worked
examples** against the current API. The worked examples below were executed against the
code in [`src/`](src) and the commented output is their real output. See
[`docs/USAGE.md`](docs/USAGE.md) for setup and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for the module map.

## Task patterns

### Example 1 — Summarise & route
**Instruction:** "Summarise today's support inbox and flag anything urgent."
**Behaviour:** reads the inbox, produces a short digest, and marks high-priority items for a human.

### Example 2 — Routine report
**Instruction:** "Generate the weekly operations status from the tracker."
**Behaviour:** pulls the tracker data, compiles the status document, and saves it to the dashboard.

### Example 3 — Data tidy-up
**Instruction:** "Normalise the new vendor entries and de-duplicate."
**Behaviour:** cleans the records, removes duplicates, and reports what changed.

---

## Worked examples

Run any of these from the repo root with `node <file>.js` (no dependencies to install).

### A. Summarise & route — the policy-gated async pipeline

Pattern 1 above, realised with [`executePlannedTask`](src/pipeline-execution.js) and a
validated tool object. This is the path that enforces the execution-policy gate and
emits the five-event audit trail.

```js
const { executePlannedTask } = require("./src/pipeline-execution");

const inbox = {
  name: "inbox",
  capabilities: ["read"],
  execute: (task) => `digest for: ${task}`,
};

(async () => {
  const run = await executePlannedTask("summarise today's support inbox", inbox);

  console.log(run.result.status);                 // success
  console.log(run.verification.valid);            // true
  console.log(run.audit.map(e => `${e.stage}:${e.status}`).join(" "));
  // parse:success plan:success execute:success verify:success report:success
  console.log(run.result.output);                 // digest for: summarise today's support inbox
})();
```

Omitting the tool demonstrates the human-in-the-loop guardrail — the execute stage is
**skipped with a reason** instead of running unconstrained:

```js
const run = await executePlannedTask("email every customer a refund");
console.log(run.result.status);   // skipped
console.log(run.result.error);    // tool is required
```

### B. Routine report — register a tool, run the pipeline, read the report

Pattern 2 above, using [`ToolRegistry`](src/tool-registry.js) to register a tool and
[`runTaskPipeline`](src/runtime-pipeline.js) to get a flattened report.

```js
const { ToolRegistry } = require("./src/tool-registry");
const { runTaskPipeline } = require("./src/runtime-pipeline");

const registry = new ToolRegistry();
registry.register({
  name: "tracker",
  capabilities: ["read"],
  execute: () => ({ rows: 12 }),
});

console.log(registry.list());
// [ { name: 'tracker', capabilities: [ 'read' ] } ]

const tracker = registry.get("tracker");
const { report } = runTaskPipeline(
  "generate the weekly operations status",
  (task) => tracker.execute(task)   // adapt the tool object to a function tool
);

console.log(report.status);    // success
console.log(report.verified);  // true
console.log(report.output);    // { rows: 12 }
console.log(report.steps.length); // 5
```

### C. Governance — permissions and secret redaction

Pattern for the safety guarantees in the README: authorize loop actions by role with
[`PermissionPolicy`](src/permission-policy.js), and scrub secrets before logging with
[`sanitizeAuditEvent`](src/data-redaction.js).

```js
const { createDefaultPermissionPolicy } = require("./src/permission-policy");
const { sanitizeAuditEvent } = require("./src/data-redaction");

const policy = createDefaultPermissionPolicy();
console.log(policy.allow("operator", "execute"));  // true
console.log(policy.allow("observer", "execute"));  // false

const event = { stage: "execute", tool: "billing", api_key: "sk-live-123", note: "ok" };
console.log(sanitizeAuditEvent(event));
// { stage: 'execute', tool: 'billing', api_key: '[REDACTED]', note: 'ok' }
```
