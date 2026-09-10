import assert from 'node:assert/strict';
import { driveAmbient } from './ambient-agent.js';

// Real model, synthetic page observations only. No browser accounts are accessed.
const request = {
  model: process.env.OPENAI_MODEL || 'gpt-6-astra', signal: AbortSignal.timeout(90000),
  workspace: { id: 'synthetic', name: 'Ambient regression', paused: false, tabs: [{ id: 1, title: 'Synthetic invoice', scope: 'http://127.0.0.1:4318/fixtures/', paused: false }] },
  preferences: { enabled: true, instructions: [{ id: 'repeat-help', text: 'When I return to the same invoice for the fifth time, offer to investigate what is blocking me, with options. Do not repeat after I decline unless something materially changes.', enabled: true }] },
  summary: 'The user previously opened synthetic invoice NS-1042 four times. No help has been offered yet.', recent: [],
  events: [{ tabId: 1, url: 'http://127.0.0.1:4318/fixtures/gmail?invoice=NS-1042', title: 'Synthetic invoice NS-1042', visitId: 'visit-5', hash: 'synthetic', kind: 'page', text: 'Synthetic invoice NS-1042 from Northstar Software, USD 850.00.', previousText: 'Synthetic invoice NS-1042 from Northstar Software, USD 850.00.', visitCount: 5, newVisit: true, at: Date.now() }],
};
const decision = await driveAmbient(request);
assert.ok(['offer','question'].includes(decision.decision));
assert.equal(decision.instructionId, 'repeat-help'); assert.equal(decision.tabId, 1);
assert.ok(decision.options.length >= 2); assert.ok(decision.summary.length > 0);
console.log(JSON.stringify({ phase: 'repeated-visit', decision: decision.decision, options: decision.options.map(o => o.label) }));
const followup = await driveAmbient({ ...request, summary: decision.summary,
  recent: [{ at: Date.now(), kind: 'response', text: `The user declined: ${decision.title}. They want to handle this themselves.` }],
  events: [{ ...request.events[0], newVisit: false }],
});
assert.equal(followup.decision, 'quiet');
console.log('Live ambient memory/choice test passed; the declined follow-up stayed quiet.');
