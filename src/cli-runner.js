const { planTask } = require("./task-planner");
const { runTask } = require("./runtime-orchestrator");
const { ToolRegistry } = require("./tool-registry");
const { buildRuntimeReport } = require("./runtime-report");

const USAGE = [
  "opspilot — turn a plain-language task into a planned, executed run",
  "",
  "Usage:",
  "  opspilot <task...> [options]",
  "",
  "Options:",
  "  --tool <name>   Force a specific registered tool instead of auto-routing",
  "  --dry-run       Plan only; skip execution (no tool is invoked)",
  "  --json          Emit the runtime report as JSON instead of text",
  "  --list-tools    List the registered tools and exit",
  "  -h, --help      Show this help and exit",
  "",
  "Examples:",
  '  opspilot "compile the weekly operations report"',
  '  opspilot "echo the handoff note" --tool echo --json',
].join("\n");

// Built-in tools that ship with the CLI. Each satisfies the tool-contract
// ({ name, capabilities, execute }) and can be routed to by keyword.
function createDefaultRegistry() {
  return new ToolRegistry([
    {
      name: "report",
      capabilities: ["read"],
      keywords: ["report", "summary", "summarise", "summarize", "compile", "status"],
      execute: (input) => `report compiled for task: ${input}`,
    },
    {
      name: "sync",
      capabilities: ["read", "write"],
      keywords: ["sync", "reconcile", "invoice", "invoices", "ledger", "update"],
      execute: (input) => `sync completed for task: ${input}`,
    },
    {
      name: "echo",
      capabilities: ["read"],
      keywords: ["echo", "repeat", "print"],
      execute: (input) => input,
    },
  ]);
}

// Route a natural-language task to the best-matching registered tool.
// Matching is keyword based and case-insensitive; the first tool with the
// most keyword hits wins. Returns null when nothing matches so the caller
// can fall back to a plan-only (skipped) run rather than guessing.
function selectTool(registry, taskInput) {
  if (typeof taskInput !== "string" || !taskInput.trim()) {
    throw new TypeError("taskInput must be a non-empty string");
  }
  const haystack = taskInput.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const name of registry.tools.keys()) {
    const tool = registry.get(name);
    const keywords = Array.isArray(tool.keywords) ? tool.keywords : [];
    let score = 0;
    for (const keyword of keywords) {
      if (haystack.includes(String(keyword).toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = tool;
    }
  }
  return best;
}

// Minimal, dependency-free argv parser scoped to the flags this CLI accepts.
function parseArgs(argv) {
  const parsed = {
    task: null,
    tool: null,
    json: false,
    dryRun: false,
    listTools: false,
    help: false,
  };
  const words = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      case "--json":
        parsed.json = true;
        break;
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--list-tools":
        parsed.listTools = true;
        break;
      case "--tool": {
        const value = argv[i + 1];
        if (typeof value !== "string" || value.startsWith("-")) {
          throw new Error("--tool requires a tool name");
        }
        parsed.tool = value;
        i += 1;
        break;
      }
      default:
        if (arg.startsWith("--")) throw new Error(`unknown option: ${arg}`);
        words.push(arg);
    }
  }
  if (words.length > 0) parsed.task = words.join(" ");
  return parsed;
}

// Render a runtime report as readable text for the terminal.
function formatReport(report) {
  const lines = [
    `Task:     ${report.task}`,
    `Status:   ${report.status}`,
    `Verified: ${report.verified ? "yes" : "no"}`,
    "",
    "Plan:",
    ...report.steps.map((step) => `  ${step.id}. ${step.action} [${step.status}]`),
    "",
    "Result:",
    `  ${report.output === null ? "(no tool executed)" : JSON.stringify(report.output)}`,
  ];
  if (report.error) lines.push("", `Error: ${report.error}`);
  return lines.join("\n");
}

// Core CLI: parse args, plan, route to a tool, execute via the orchestrator,
// and print a report. Returns { code, report } so tests can assert on both
// the exit code and the structured outcome without touching process state.
function runCli(argv, options = {}) {
  const registry = options.registry || createDefaultRegistry();
  const out = options.out || ((line) => process.stdout.write(`${line}\n`));

  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    out(error.message);
    out("");
    out(USAGE);
    return { code: 2, report: null };
  }

  if (args.help) {
    out(USAGE);
    return { code: 0, report: null };
  }

  if (args.listTools) {
    for (const tool of registry.list()) {
      out(`${tool.name} [${tool.capabilities.join(", ")}]`);
    }
    return { code: 0, report: null };
  }

  if (!args.task) {
    out("error: a task description is required");
    out("");
    out(USAGE);
    return { code: 2, report: null };
  }

  // Plan is computed explicitly so plan-only (--dry-run) runs still surface
  // the five-stage loop even though the orchestrator would recompute it.
  const plan = planTask(args.task);

  let tool = null;
  if (!args.dryRun) {
    if (args.tool) {
      tool = registry.get(args.tool);
      if (!tool) {
        out(`error: unknown tool '${args.tool}'`);
        return { code: 2, report: null };
      }
    } else {
      tool = selectTool(registry, args.task);
    }
  }

  const runner = tool ? (input) => tool.execute(input) : null;
  const run = runTask(args.task, runner);
  const report = buildRuntimeReport({ ...run, plan });

  out(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
  return { code: report.verified ? 0 : 1, report };
}

module.exports = {
  USAGE,
  createDefaultRegistry,
  selectTool,
  parseArgs,
  formatReport,
  runCli,
};
