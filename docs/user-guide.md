# User Guide

## What is SAR?

When you ask an AI to design a system, it almost always gives you an answer immediately — confidently naming a specific architecture before it has examined your constraints, considered alternatives, or thought about what could go wrong. This is a fundamental limitation of single-shot prompting: the model pattern-matches to familiar solutions rather than reasoning through your specific problem.

SAR (Sequential Architecture Reasoning) solves this by forcing the model through five structured steps before it can make a recommendation. Each step builds on the last, passing the full context forward. By the time a final architecture is selected, it has been derived from explicit requirements, compared against alternatives, scored across five dimensions, and stress-tested for risks and failure modes.

---

## Using the Web UI

1. Open the app in your browser (or visit [sar-urjs.onrender.com](https://sar-urjs.onrender.com))
2. Replace the pre-filled example in the textarea with your problem statement
3. Click **Run Analysis**
4. Watch the five step cards update in real time as each step completes
5. Read the final decision panel when the analysis finishes

The **confidence badge** (green / amber / red) gives a quick signal of how decisive the analysis was. See [Confidence Score](#confidence-score) below.

You can run multiple analyses in the same session — clicking Run again resets all cards and starts fresh.

---

## Using the CLI

```bash
node run.js "Your problem statement here"
```

Progress is printed to the terminal as each step completes. The full accumulated state is written to `state.json` after every step, so if a run fails partway through you can inspect exactly how far it got. The final summary box is printed to stdout on completion.

---

## Writing Good Problem Statements

The quality of the analysis depends heavily on the problem statement. A good statement includes:

- **What** the system needs to do
- **Who** uses it and at what scale
- **Hard constraints** (budget, latency SLAs, compliance requirements, existing infrastructure)
- **Known tradeoffs** you're willing to accept or want evaluated

### Too vague
> "Design a chat app"

The model has no constraints to work with and will generate generic options with little differentiation.

### Too specific
> "Should I use Redis Pub/Sub or Kafka for my existing Node.js service that already uses PostgreSQL?"

This is a narrower decision than SAR is designed for. A targeted comparison prompt will serve you better.

### Good
> "Design a real-time messaging system for a B2B SaaS product. Expected load: 50,000 active users, ~2M messages per day. Must support message history (90-day retention), read receipts, and file attachments up to 25MB. We run on AWS. Hard constraint: no managed services above $2,000/month at current scale. End-to-end encryption is a future requirement but not needed now."

> "Design the data pipeline for a mobile analytics product. We collect ~500 events per user session, with ~100K daily active users. The business needs real-time dashboards (< 30s lag) and historical analysis going back 2 years. Team is 3 engineers, no dedicated data infrastructure expertise."

> "We need to migrate a monolithic Rails application to support independent scaling of our API, background job processing, and file storage layers. The app currently handles 10K requests/min at peak. Zero downtime is required. We have 4 months and a team of 6."

---

## Interpreting the 5 Steps

### Step 1 — Define Problem

The model extracts **requirements** (what the system must do), **constraints** (hard limits it must operate within), and **assumptions** (things treated as true that haven't been stated explicitly).

**What to look for:** Check the assumptions. If the model assumed something important that is actually a constraint — or missed a key requirement — your problem statement may need to be more explicit. The rest of the analysis flows from this step.

---

### Step 2 — Generate Options

The model produces at least 3 distinct architecture options, each with a name, description, list of components, and a data flow description.

**What to look for:** Are the options genuinely different in their approach, or are they superficial variations of the same pattern? Good options should represent different architectural philosophies (e.g., event-driven vs. request/response, managed vs. self-hosted, monolith vs. distributed). If all options look similar, the problem statement may not have enough constraints to drive differentiation.

---

### Step 3 — Evaluate Options

Each option is scored 1–5 on five dimensions:

| Dimension | What it measures |
|-----------|-----------------|
| **Scalability** | How well the option handles growth in load or data volume |
| **Cost** | Estimated operational and infrastructure expense (5 = lowest cost) |
| **Complexity** | Implementation and operational burden (5 = least complex) |
| **Latency** | Response time characteristics for the critical path (5 = lowest latency) |
| **Reliability** | Fault tolerance and availability expectations (5 = most reliable) |

**What to look for:** Look at the spread of scores across options. If all options score similarly on all dimensions, the model didn't find meaningful differentiation — this is reflected in a lower confidence score. A useful evaluation will show clear winners and losers on specific dimensions, making tradeoffs visible.

---

### Step 4 — Critique Design

The model stress-tests the top-scoring option(s), identifying:

- **Risks** — things that could go wrong during implementation or operation
- **Failure modes** — specific ways the system could fail in production
- **Edge cases** — unusual inputs or conditions the design may not handle well
- **Unknowns** — open questions that need answers before committing to this design

**What to look for:** This step often surfaces the most valuable output. A long list of risks and failure modes isn't necessarily bad — it means the model found a design worth examining closely. Pay particular attention to unknowns: these are the questions you should answer before making a real-world decision.

---

### Step 5 — Finalize Architecture

The model selects one option and provides:

- **Justification** — the reasoning behind the selection given the requirements and constraints
- **Tradeoffs** — what is being accepted or sacrificed with this choice
- **Why not others** — the specific reasons the other options were rejected

**What to look for:** The tradeoffs list is the most actionable output. These are the things you'll need to live with — or mitigate — if you implement this architecture. If a tradeoff is unacceptable, run the analysis again with that constraint made explicit in the problem statement.

---

## Confidence Score

The confidence score is computed automatically after step 5.

| Score | Meaning |
|-------|---------|
| **High** (green) | Options were clearly differentiated by the evaluation scores, and the design has a manageable number of identified risks. The recommendation has a solid basis. |
| **Medium** (amber) | Either options scored too similarly (making the choice less decisive) or the critique identified an elevated number of risks. Treat the recommendation as a strong candidate, not a conclusion. |
| **Low** (red) | Both factors are unfavorable — options were hard to differentiate and the design carries significant identified risk. Use the output as a starting point for deeper investigation, not as a final answer. |

A low confidence score does not mean the analysis failed. It means the problem is genuinely complex or underspecified, and you should examine the risks and unknowns from step 4 before making a decision.

---

## Use Cases

### Interview Preparation

Use SAR to practice system design thinking before technical interviews. Run your problem statement through the chain, then compare the model's approach to your own. Pay attention to requirements you missed in step 1 and tradeoffs you didn't consider in step 5.

---

### Architecture Decision Records (ADRs)

SAR's output maps directly to a well-structured ADR. Step 1 becomes the context section, steps 2–3 become the options considered, step 4 becomes the consequences, and step 5 becomes the decision. Export `state.json` and use it as the basis for a formal record.

---

### Team Design Reviews

Use SAR to prepare for or facilitate design review meetings. Running the analysis before a review surfaces risks and tradeoffs that the team can discuss, rather than spending meeting time generating options from scratch. The critique step in particular tends to raise questions that engineers close to the problem have normalized.

---

### Learning System Design Patterns

SAR exposes the reasoning behind architectural choices, not just the choices themselves. For engineers building their system design intuition, running a variety of problems through the chain — and reading the `why_not_others` field carefully — builds understanding of when different patterns apply and what their real costs are.

---

### Vendor Evaluation

Phrase vendor or technology choices as architecture problems. For example: "We need a managed search solution for an e-commerce catalog with 5M SKUs, faceted filtering, typo tolerance, and < 100ms p99 latency. Evaluate self-hosted Elasticsearch, Algolia, and Typesense." The evaluation step will score each option across the relevant dimensions.

---

### Pre-Mortem Analysis

Before committing to a design, run it through SAR as a pre-mortem. Frame the problem statement around the proposed design and ask the model to critique it specifically. Step 4's failure modes and unknowns become your pre-mortem checklist.

---

## Limitations

**Not a substitute for domain expertise.** SAR produces structured reasoning, not authoritative recommendations. The model does not know your team's skills, your organization's operational practices, or the specifics of your existing infrastructure unless you include them in the problem statement.

**Quality degrades with vague inputs.** Underspecified problem statements produce options that differ only superficially, evaluations that cluster around mid-range scores, and critiques that surface generic rather than problem-specific risks.

**Scores are relative, not absolute.** The 1–5 scores in step 3 reflect the model's assessment of how options compare to each other for your problem — they are not universal ratings of the technologies involved.

**Each run is independent.** SAR has no memory between runs. Follow-up questions or refinements require a new run with an updated problem statement.

**Analysis takes time.** Each run makes 5 sequential API calls. Expect 30–90 seconds for a complete analysis depending on problem complexity.
