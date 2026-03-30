# SAR — Sequential Architecture Reasoning

**Live demo:** [sar-urjs.onrender.com](https://sar-urjs.onrender.com)

---

## The Problem

LLMs default to pattern-matching when asked to design systems — they surface the first plausible-sounding architecture and rationalize it. For complex, constraint-heavy problems this produces confident-sounding but under-examined designs. SAR forces the model through five structured reasoning steps before it can commit to a recommendation, preventing premature convergence and surfacing risks that a single-shot prompt would skip entirely.

---

## Reasoning Chain

| Step | Name | What it does |
|------|------|-------------|
| 1 | **Define Problem** | Extracts requirements, constraints, and assumptions from the raw problem statement |
| 2 | **Generate Options** | Produces at least 3 meaningfully distinct architecture options, each with components and data flow |
| 3 | **Evaluate Options** | Scores every option on scalability, cost, complexity, latency, and reliability (1–5) |
| 4 | **Critique Design** | Identifies risks, failure modes, edge cases, and unknowns in the top-scoring design(s) |
| 5 | **Finalize Architecture** | Selects one option with justification, accepted tradeoffs, and reasons for rejecting the others |

Each step receives the full accumulated state from all prior steps. A confidence score (`high` / `medium` / `low`) is computed after step 5 based on score spread across options and total risk volume.

---

## Quick Start (CLI)

```bash
# 1. Install dependencies
npm install

# 2. Add your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-..." > .env

# 3. Run a problem through the chain
node run.js "Design a real-time analytics pipeline for 10M events per day"
```

State is written to `state.json` after every step. The final summary is printed to the terminal with a confidence score.

---

## Web Server

```bash
node server.js
# open http://localhost:3000
```

Results stream to the browser in real time via Server-Sent Events — each step card updates as it completes.

---

## Tech Stack

- **Runtime:** Node.js (ES modules)
- **LLM:** `claude-sonnet-4-20250514` via Anthropic SDK
- **Web server:** Express 5
- **Frontend:** Vanilla JS, no frameworks
- **Config:** dotenv

---

## How It Works

**SSE streaming** — `POST /analyze` sets `Content-Type: text/event-stream` and writes one `event: step` per completed step, followed by `event: complete` (full state + summary) or `event: error`. The browser consumes this with `fetch` + `ReadableStream`, buffering on `\n\n` boundaries to handle chunks that span event boundaries.

**Retry logic** — each step is wrapped in `runStepWithRetry` (max 3 retries). On failure it builds a multi-turn message thread: the original prompt → the bad model response → a correction request with the specific error. The original prompt is never mutated.

**Schema validation** — every step has a dedicated validator that checks field types, array presence, and numeric ranges (1–5 scores). Validation errors are treated identically to JSON parse errors and fed back into the retry loop.
