import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { STEPS, runStepWithRetry, computeConfidence } from './lib/chain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// POST /analyze
// Accepts: { problem: string }
// Streams progress as Server-Sent Events, one event per completed step,
// plus a final "complete" event and an "error" event on failure.
app.post('/analyze', async (req, res) => {
  const { problem } = req.body;
  if (!problem || typeof problem !== 'string' || !problem.trim()) {
    return res.status(400).json({ error: 'Request body must include a non-empty "problem" string.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const client = new Anthropic();
  const state = { problem: problem.trim() };

  try {
    for (const step of STEPS) {
      const userPrompt = step.buildPrompt(state);
      const parsed = await runStepWithRetry(
        client,
        step.name,
        userPrompt,
        step.temperature,
        step.validate
      );

      state[step.stateKey] = parsed;
      send('step', { step: step.name, result: parsed });
    }

    // Compute confidence and attach
    const confidence = computeConfidence(
      state.evaluate_options.evaluations,
      state.critique_design
    );
    state.finalize_architecture.confidence = confidence;

    // Build summary data for the final event
    const fin = state.finalize_architecture;
    const summary = {
      selected_option: fin.selected_option,
      confidence,
      tradeoffs_count: fin.tradeoffs.length,
      risks_count: state.critique_design.risks.length,
      failure_modes_count: state.critique_design.failure_modes.length,
      justification_excerpt: fin.justification.slice(0, 120) + (fin.justification.length > 120 ? '…' : ''),
    };

    send('complete', { summary, state });
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SAR server listening on http://localhost:${PORT}`);
});
