import { Agent, run, setTracingDisabled } from '@openai/agents';
setTracingDisabled(true);
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
const model = process.env.OPENAI_MODEL || 'gpt-6-astra';
const agent = new Agent({ name: 'Connection check', model, instructions: 'Reply with exactly: Astra connection ready.', modelSettings: { reasoning: { effort: 'low' }, maxTokens: 128 } });
const result = await run(agent, 'Check this API connection.', { maxTurns: 1, signal: AbortSignal.timeout(45000) });
console.log(`${model}: ${result.finalOutput}`);
