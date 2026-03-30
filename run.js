import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync } from 'fs';
import { STEPS, SYSTEM_PROMPT, runStepWithRetry, computeConfidence } from './lib/chain.js';

const problem = process.argv[2];
if (!problem) {
  console.error('Usage: node run.js "<problem statement>"');
  process.exit(1);
}

const client = new Anthropic();
const state = { problem };

for (const step of STEPS) {
  console.log('\n' + '='.repeat(60));
  console.log(`  STEP: ${step.name}`);
  console.log('='.repeat(60));

  const userPrompt = step.buildPrompt(state);
  const parsed = await runStepWithRetry(client, step.name, userPrompt, step.temperature, step.validate);

  state[step.stateKey] = parsed;

  writeFileSync('state.json', JSON.stringify(state, null, 2), 'utf8');
  console.log(JSON.stringify(parsed, null, 2));
}

// Compute confidence and attach to state.finalize_architecture
const confidence = computeConfidence(
  state.evaluate_options.evaluations,
  state.critique_design
);
state.finalize_architecture.confidence = confidence;
writeFileSync('state.json', JSON.stringify(state, null, 2), 'utf8');

// Summary block
const fin = state.finalize_architecture;
const justificationExcerpt = fin.justification.slice(0, 120) + (fin.justification.length > 120 ? '…' : '');
const W = 72;
const divider = '─'.repeat(W);
const selectedName = fin.selected_option.slice(0, 54) + (fin.selected_option.length > 54 ? '…' : '');

console.log('\n┌' + divider + '┐');
console.log('│' + '  ARCHITECTURE DECISION SUMMARY'.padEnd(W) + '│');
console.log('├' + divider + '┤');
console.log('│' + `  Selected : ${selectedName}`.padEnd(W) + '│');
console.log('│' + `  Confidence: ${confidence.toUpperCase()}`.padEnd(W) + '│');
console.log('│' + `  Tradeoffs : ${fin.tradeoffs.length}`.padEnd(W) + '│');
console.log('│' + `  Risks     : ${state.critique_design.risks.length}  Failure modes: ${state.critique_design.failure_modes.length}`.padEnd(W) + '│');
console.log('├' + divider + '┤');
console.log('│' + `  ${justificationExcerpt}`.padEnd(W) + '│');
console.log('└' + divider + '┘');
console.log('\nFinal state written to state.json');
