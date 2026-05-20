# SAR — Sequential Architecture Reasoning

**Live demo:** [sar-urjs.onrender.com](https://sar-urjs.onrender.com)

---

## The Problem

LLMs default to pattern-matching when asked to design systems — they surface the first plausible-sounding architecture and rationalize it. For complex, constraint-heavy problems, this produces confident-sounding but under-examined designs.

SAR forces the model through five structured reasoning steps before committing to a recommendation, preventing premature convergence and surfacing risks that a single-shot prompt would skip entirely.

---

## How It Works

Each run executes a sequential reasoning chain where every step receives the full accumulated state from all prior steps:

| Step | Name | What it does |
|------|------|-------------|
| 1 | Define Problem | Extracts requirements, constraints, and assumptions from the raw problem statement |
| 2 | Generate Options | Produces at least 3 meaningfully distinct architecture options, each with components and data flow |
| 3 | Evaluate Options | Scores every option on scalability, cost, complexity, latency, and reliability (1–5) |
| 4 | Critique Design | Identifies risks, failure modes, edge cases, and unknowns in the top-scoring design(s) |
| 5 | Finalize Architecture | Selects one option with justification, accepted tradeoffs, and explicit reasons for rejecting the others |

A confidence score (`high` / `medium` / `low`) is computed after Step 5 based on score spread across options and total risk volume. `LOW` confidence doesn't mean the recommendation is wrong — it means the problem is genuinely hard and warrants deeper review.

---

## Technical Decisions Worth Noting

**Render over Vercel** — the 5-step chain takes 90–120 seconds per run. Vercel's serverless functions time out at 10 seconds on the hobby plan. Render runs a persistent Express server with no timeout limit. Same decision carried into StratOS v2 and v3.

**SSE over WebSockets** — Server-Sent Events are unidirectional, which is exactly what this use case requires. Each step streams to the browser as it completes via `fetch` + `ReadableStream`, using a buffer that handles chunks split across event boundaries. No WebSocket server needed.

**Retry with multi-turn correction** — each step is wrapped in a retry loop (max 3 attempts). On failure, it builds a correction thread: original prompt → bad model response → correction request with the specific error. The original prompt is never mutated, keeping retry inputs clean.

**Schema validation at every step** — each step has a dedicated validator checking field types, array presence, and numeric score ranges. Validation errors feed directly into the retry loop — the model sees exactly what it got wrong and why.

**Vanilla JS over React** — single input, streaming output, no component reuse. React would add a build step and boilerplate for no meaningful gain. Deliberate tool choice.

---

## Stack

- **Runtime:** Node.js
- **LLM:** Claude Sonnet via Anthropic SDK  
- **Web server:** Express
- **Frontend:** Vanilla JS — no frameworks, no build step
- **Hosting:** Render

---

## Example Problem Statements

The quality of the output scales with the specificity of the input:

> Design a multi-tenant SaaS database that handles 10,000 concurrent users, requires row-level data isolation between tenants, needs sub-100ms query latency, and must support GDPR data deletion requests.

> Design a webhook delivery system with at-least-once delivery semantics, configurable retry policies, ordering guarantees per entity, and the ability to scale to 50,000 events per second during peak traffic.

---

## Use Cases

- **System design interview prep** — run your proposed design through SAR and see what risks or alternatives it surfaces
- **Architecture Decision Records** — the `why_not_others` output maps directly to the "Considered Options" section of an ADR
- **Team design reviews** — share the Step 4 critique as a pre-read to surface failure modes before the meeting
- **Pre-mortem analysis** — use the critique output as a checklist for what to design against before writing any code

---

## Context

Built as part of a portfolio of AI-powered product tools. The goal was to demonstrate that structured prompting architecture — not just prompt-and-hope — produces meaningfully better outputs for complex reasoning tasks.

