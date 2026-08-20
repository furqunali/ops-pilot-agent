# 🛠️ OpsPilot — AI Operations Agent

*An operations copilot that turns plain-language instructions into planned, verified, multi-step work.*

> 🚧 **Status: early-stage / work-in-progress.** This repository currently defines the agent's operating specification, behavioural contract, and project scaffold. The execution runtime is being built out — see the [Roadmap](#-roadmap). Nothing here is fabricated: what is documented below reflects what is in the repo today.

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

> The runtime is still under construction; these steps set up the current scaffold.

```bash
git clone https://github.com/furqunali/ops-pilot-agent.git
cd ops-pilot-agent

# Node.js scaffold
node src/dummy.js
```

Start by reading [`agent-instructions.md`](agent-instructions.md) (the operating spec) and [`examples.md`](examples.md) (the task patterns) to understand the intended behaviour.

## 🔒 Security

- **No secrets committed.** Credentials and API keys are intended to be supplied via environment variables, never checked into the repository.
- **Human-in-the-loop for risky actions.** Irreversible or outward-facing steps require explicit confirmation by design.
- **Anonymized examples.** The documented task examples use generic, non-sensitive scenarios — no real customer or company data.

## 🗺️ Roadmap

This is an early-stage build. Honest next steps:

- [ ] Implement the core task loop (parse → plan → execute → verify → report) in `src/`.
- [ ] Add a pluggable tool/connector interface for real integrations (inbox, trackers, data stores).
- [ ] Wire environment-variable-based configuration for credentials.
- [ ] Add automated tests around the planning and verification stages.
- [ ] Turn the documented examples into runnable end-to-end scenarios.

## Related

- [`Digital_FTE`](https://github.com/furqunali/Digital_FTE) · [`digital-fte-agent`](https://github.com/furqunali/digital-fte-agent)

---

*Part of [Furqan Ali](https://github.com/furqunali)'s portfolio — AI & Intelligent Automation / Digital Transformation.*
