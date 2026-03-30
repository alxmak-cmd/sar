# Technical Reference

## Architecture Overview

SAR has two entrypoints — a CLI (`run.js`) and an HTTP server (`server.js`) — that share all reasoning logic through a single module: `lib/chain.js`. Neither entrypoint duplicates prompt definitions, validators, or the retry wrapper.

```
run.js          ─┐
                  ├─▶ lib/chain.js  ─▶  Anthropic API
server.js       ─┘
     │
     └─▶ public/index.html  (static, EventSource via fetch)
```

The Anthropic client is instantiated by the caller and passed into `runStepWithRetry`, so both entrypoints own their own client instance.

---

## File Reference

### `lib/chain.js`

The shared reasoning core. Exports:

| Export | Type | Description |
|--------|------|-------------|
| `SYSTEM_PROMPT` | `string` | Global instruction enforcing JSON-only output |
| `STEPS` | `Array<StepConfig>` | Ordered array of 5 step definitions |
| `runStepWithRetry(client, stepName, userPrompt, temperature, validate)` | `async function` | Calls the API with retry logic; returns parsed, validated JSON |
| `computeConfidence(evaluations, critique)` | `function` | Returns `'high'` \| `'medium'` \| `'low'` |

**`StepConfig` shape:**
```js
{
  name: string,           // Step identifier, e.g. 'DEFINE_PROBLEM'
  temperature: number,    // 0.5 for GENERATE_OPTIONS, 0.2 for all others
  validate: Function,     // (data) => string | null
  buildPrompt: Function,  // (state) => string
  stateKey: string,       // Key written to state object on success
}
```

---

### `run.js`

CLI entrypoint. Reads `process.argv[2]` as the problem statement. Iterates `STEPS` sequentially, writes `state.json` after every step, and prints a summary box to stdout on completion.

---

### `server.js`

Express 5 HTTP server. Serves `public/` as static files. Exposes one endpoint:

**`POST /analyze`**

Request body:
```json
{ "problem": "string" }
```

Response: `text/event-stream`. Emits three event types:

| Event | Payload | When |
|-------|---------|------|
| `step` | `{ step: string, result: object }` | After each of the 5 steps completes |
| `complete` | `{ summary: SummaryObject, state: StateObject }` | After all steps and confidence are computed |
| `error` | `{ message: string }` | On any thrown error |

`SummaryObject`:
```json
{
  "selected_option": "string",
  "confidence": "high | medium | low",
  "tradeoffs_count": 4,
  "risks_count": 5,
  "failure_modes_count": 3,
  "justification_excerpt": "string (120 chars max)"
}
```

---

### `public/index.html`

Single-file frontend. No frameworks or build step. Uses `fetch` + `ReadableStream` to consume the SSE stream from `POST /analyze` (the `EventSource` API is not used because it does not support POST requests). Buffers the response stream and splits on `\n\n` to parse SSE events.

---

## Full State Object

The `state` object is built incrementally as steps complete. This is the shape after all 5 steps:

```json
{
  "problem": "string",

  "define_problem": {
    "requirements": ["string"],
    "constraints": ["string"],
    "assumptions": ["string"]
  },

  "generate_options": {
    "options": [
      {
        "name": "string",
        "description": "string",
        "components": ["string"],
        "data_flow": "string"
      }
    ]
  },

  "evaluate_options": {
    "evaluations": [
      {
        "option": "string",
        "scalability": 1,
        "cost": 1,
        "complexity": 1,
        "latency": 1,
        "reliability": 1,
        "notes": "string"
      }
    ]
  },

  "critique_design": {
    "risks": ["string"],
    "failure_modes": ["string"],
    "edge_cases": ["string"],
    "unknowns": ["string"]
  },

  "finalize_architecture": {
    "selected_option": "string",
    "justification": "string",
    "tradeoffs": ["string"],
    "why_not_others": ["string"],
    "confidence": "high | medium | low"
  }
}
```

`state.json` is written to disk (CLI only) after each step completes, including after the confidence field is appended.

---

## Schema Validators

Each step has a dedicated validator in `lib/chain.js`. All return `null` on success or a descriptive error string on failure.

| Step | Key checks |
|------|-----------|
| `DEFINE_PROBLEM` | `requirements`, `constraints`, `assumptions` are arrays |
| `GENERATE_OPTIONS` | `options` is an array with ≥ 3 items; each item has `name` (string), `description` (string), `components` (array), `data_flow` (string) |
| `EVALUATE_OPTIONS` | `evaluations` is an array; each item has `option` (string), five score fields (`scalability`, `cost`, `complexity`, `latency`, `reliability`) as numbers in range 1–5, and `notes` (string) |
| `CRITIQUE_DESIGN` | `risks`, `failure_modes`, `edge_cases`, `unknowns` are arrays |
| `FINALIZE_ARCHITECTURE` | `selected_option` and `justification` are strings; `tradeoffs` and `why_not_others` are arrays |

---

## Retry Logic

`runStepWithRetry` makes up to 4 total attempts (1 initial + 3 retries). On failure it builds a 3-turn message array:

1. Original user prompt (unchanged)
2. The model's bad response as an `assistant` turn
3. A new `user` turn containing the specific error

This gives the model its own output alongside an exact description of what was wrong, without mutating the original prompt.

Errors are classified as either JSON parse failures or schema validation failures — both are treated identically by the retry loop.

---

## Confidence Scoring

`computeConfidence(evaluations, critique)` computes two factors:

**Score spread** — for each of the 5 scoring dimensions, compute the standard deviation of scores across all options. Average the 5 std devs. `avgSpread >= 1.0` means options were meaningfully differentiated and the model had a clear basis for comparison.

**Risk volume** — sum `risks.length + failure_modes.length`. A total above 12 (more than 6 in each category) signals a high-risk or underspecified design.

| `spreadOk` | `riskOk` | Result |
|-----------|---------|--------|
| ✓ | ✓ | `high` |
| ✓ | ✗ | `medium` |
| ✗ | ✓ | `medium` |
| ✗ | ✗ | `low` |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key |
| `PORT` | No | `3000` | Port the HTTP server listens on |

Both are loaded from `.env` via `dotenv`.

---

## Local Development

```bash
# Install dependencies
npm install

# CLI
node run.js "Your problem statement here"

# Web server
node server.js
```

---

## Deployment

Render is the recommended platform. Deploy as a **Web Service** (not a static site) with the following settings:

| Setting | Value |
|---------|-------|
| Environment | Node |
| Build command | `npm install` |
| Start command | `node server.js` |
| Instance type | Any (free tier works for low traffic) |

Set `ANTHROPIC_API_KEY` as an environment variable in the Render dashboard. Do not commit `.env` to version control.

Because each analysis run makes 5 sequential API calls and can take 30–90 seconds, ensure the platform does not impose a request timeout shorter than 120 seconds. Render's default timeout is sufficient.
