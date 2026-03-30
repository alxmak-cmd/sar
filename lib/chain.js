// --- System prompt ---

export const SYSTEM_PROMPT = `You are an architecture reasoning assistant.
You must respond with valid JSON only — no markdown code fences, no prose, no commentary.
Your entire response must be a single, parseable JSON object matching the schema described in the user message.`;

// --- Validators ---

function validateDefineProblem(data) {
  for (const key of ['requirements', 'constraints', 'assumptions']) {
    if (!Array.isArray(data[key])) return `"${key}" must be an array`;
  }
  return null;
}

function validateGenerateOptions(data) {
  if (!Array.isArray(data.options) || data.options.length < 3)
    return '"options" must be an array with at least 3 items';
  for (const [i, opt] of data.options.entries()) {
    if (typeof opt.name !== 'string') return `options[${i}].name must be a string`;
    if (typeof opt.description !== 'string') return `options[${i}].description must be a string`;
    if (!Array.isArray(opt.components)) return `options[${i}].components must be an array`;
    if (typeof opt.data_flow !== 'string') return `options[${i}].data_flow must be a string`;
  }
  return null;
}

function validateEvaluateOptions(data) {
  if (!Array.isArray(data.evaluations)) return '"evaluations" must be an array';
  const scoreFields = ['scalability', 'cost', 'complexity', 'latency', 'reliability'];
  for (const [i, ev] of data.evaluations.entries()) {
    if (typeof ev.option !== 'string') return `evaluations[${i}].option must be a string`;
    for (const field of scoreFields) {
      if (typeof ev[field] !== 'number' || ev[field] < 1 || ev[field] > 5)
        return `evaluations[${i}].${field} must be a number between 1 and 5`;
    }
    if (typeof ev.notes !== 'string') return `evaluations[${i}].notes must be a string`;
  }
  return null;
}

function validateCritiqueDesign(data) {
  for (const key of ['risks', 'failure_modes', 'edge_cases', 'unknowns']) {
    if (!Array.isArray(data[key])) return `"${key}" must be an array`;
  }
  return null;
}

function validateFinalizeArchitecture(data) {
  if (typeof data.selected_option !== 'string') return '"selected_option" must be a string';
  if (typeof data.justification !== 'string') return '"justification" must be a string';
  if (!Array.isArray(data.tradeoffs)) return '"tradeoffs" must be an array';
  if (!Array.isArray(data.why_not_others)) return '"why_not_others" must be an array';
  return null;
}

// --- Steps config ---

export const STEPS = [
  {
    name: 'DEFINE_PROBLEM',
    temperature: 0.2,
    validate: validateDefineProblem,
    buildPrompt: (state) => `
You are on Step 1 of 5: DEFINE_PROBLEM.

Problem statement: ${state.problem}

Analyze the problem and extract its requirements, constraints, and assumptions.

Respond with this exact JSON schema:
{
  "requirements": ["<string>", ...],
  "constraints": ["<string>", ...],
  "assumptions": ["<string>", ...]
}
`,
    stateKey: 'define_problem',
  },
  {
    name: 'GENERATE_OPTIONS',
    temperature: 0.5,
    validate: validateGenerateOptions,
    buildPrompt: (state) => `
You are on Step 2 of 5: GENERATE_OPTIONS.

Problem statement: ${state.problem}

Step 1 analysis:
${JSON.stringify(state.define_problem, null, 2)}

Generate at least 3 distinct architecture options. Each option must have a name, description, a components array, and a data_flow string.

Respond with this exact JSON schema:
{
  "options": [
    {
      "name": "<string>",
      "description": "<string>",
      "components": ["<string>", ...],
      "data_flow": "<string>"
    }
  ]
}
`,
    stateKey: 'generate_options',
  },
  {
    name: 'EVALUATE_OPTIONS',
    temperature: 0.2,
    validate: validateEvaluateOptions,
    buildPrompt: (state) => `
You are on Step 3 of 5: EVALUATE_OPTIONS.

Problem statement: ${state.problem}

Step 1 analysis:
${JSON.stringify(state.define_problem, null, 2)}

Step 2 options:
${JSON.stringify(state.generate_options, null, 2)}

Score each option on scalability, cost, complexity, latency, and reliability using a 1–5 scale (5 = best). Include brief notes per option.

Respond with this exact JSON schema:
{
  "evaluations": [
    {
      "option": "<name>",
      "scalability": <1-5>,
      "cost": <1-5>,
      "complexity": <1-5>,
      "latency": <1-5>,
      "reliability": <1-5>,
      "notes": "<string>"
    }
  ]
}
`,
    stateKey: 'evaluate_options',
  },
  {
    name: 'CRITIQUE_DESIGN',
    temperature: 0.2,
    validate: validateCritiqueDesign,
    buildPrompt: (state) => `
You are on Step 4 of 5: CRITIQUE_DESIGN.

Problem statement: ${state.problem}

Step 1 analysis:
${JSON.stringify(state.define_problem, null, 2)}

Step 2 options:
${JSON.stringify(state.generate_options, null, 2)}

Step 3 evaluations:
${JSON.stringify(state.evaluate_options, null, 2)}

Critically examine the top-scoring design(s). Identify risks, failure modes, edge cases, and unknowns.

Respond with this exact JSON schema:
{
  "risks": ["<string>", ...],
  "failure_modes": ["<string>", ...],
  "edge_cases": ["<string>", ...],
  "unknowns": ["<string>", ...]
}
`,
    stateKey: 'critique_design',
  },
  {
    name: 'FINALIZE_ARCHITECTURE',
    temperature: 0.2,
    validate: validateFinalizeArchitecture,
    buildPrompt: (state) => `
You are on Step 5 of 5: FINALIZE_ARCHITECTURE.

Problem statement: ${state.problem}

Step 1 analysis:
${JSON.stringify(state.define_problem, null, 2)}

Step 2 options:
${JSON.stringify(state.generate_options, null, 2)}

Step 3 evaluations:
${JSON.stringify(state.evaluate_options, null, 2)}

Step 4 critique:
${JSON.stringify(state.critique_design, null, 2)}

Select the best architecture option. Provide a justification, list the tradeoffs accepted, and explain why the other options were not chosen.

Respond with this exact JSON schema:
{
  "selected_option": "<name>",
  "justification": "<string>",
  "tradeoffs": ["<string>", ...],
  "why_not_others": ["<string>", ...]
}
`,
    stateKey: 'finalize_architecture',
  },
];

// --- Retry wrapper ---
// client is passed in so callers (run.js, server.js) own the Anthropic instance.

const MAX_RETRIES = 3;

export async function runStepWithRetry(client, stepName, userPrompt, temperature, validate) {
  let lastRawText = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    if (attempt > 1) {
      console.log(`  ⚠ Retry ${attempt - 1}/${MAX_RETRIES} — ${stepName}: ${lastError}`);
    }

    const messages =
      attempt === 1
        ? [{ role: 'user', content: userPrompt }]
        : [
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: lastRawText },
            {
              role: 'user',
              content: `Your previous response was invalid. Error: ${lastError}\n\nPlease correct your response and return valid JSON only, matching the required schema exactly.`,
            },
          ];

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature,
      system: SYSTEM_PROMPT,
      messages,
    });

    lastRawText = response.content[0].text.trim();

    let parsed;
    try {
      parsed = JSON.parse(lastRawText);
    } catch (err) {
      lastError = `JSON parse error — ${err.message}`;
      continue;
    }

    const validationError = validate(parsed);
    if (validationError) {
      lastError = `Schema validation failed — ${validationError}`;
      continue;
    }

    console.log(`  ✓ ${stepName}`);
    return parsed;
  }

  throw new Error(`Step ${stepName} failed after ${MAX_RETRIES} retries. Last error: ${lastError}`);
}

// --- Confidence scoring ---

export function computeConfidence(evaluations, critique) {
  const scoreFields = ['scalability', 'cost', 'complexity', 'latency', 'reliability'];
  let totalSpread = 0;
  for (const field of scoreFields) {
    const scores = evaluations.map((e) => e[field]);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
    totalSpread += Math.sqrt(variance);
  }
  const avgSpread = totalSpread / scoreFields.length;

  const riskCount = critique.risks.length + critique.failure_modes.length;

  const spreadOk = avgSpread >= 1.0;
  const riskOk = riskCount <= 12;

  if (spreadOk && riskOk) return 'high';
  if (!spreadOk && !riskOk) return 'low';
  return 'medium';
}
