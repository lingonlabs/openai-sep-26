import assert from 'node:assert/strict';
import { reviewCompletion, type CompletionRequest } from './completion-review.js';

const request: CompletionRequest = { model: process.env.OPENAI_MODEL || 'gpt-6-astra', signal: AbortSignal.timeout(90000),
  workspace: { id: 'synthetic', name: 'Synthetic review test', paused: false, tabs: [{ id: 1, title: 'Gmail', scope: 'https://mail.google.com/mail/u/0/', paused: false }] },
  goal: 'Find the latest synthetic Northstar invoice and verify its amount.', readOnly: false,
  response: 'I only saw the inbox. Gmail search was blocked in a previous task. I could not verify the amount.', messages: [], findings: [], previousReviews: [],
  activity: [{ id: 'inspect', text: 'Read Gmail', at: Date.now(), status: 'done' }],
  observations: [{ url: 'https://mail.google.com/mail/u/0/#inbox', title: 'Synthetic inbox', version: 'v1', text: 'Northstar invoice INV-123. Search mail.',
    elements: [{ ref: 'e1', tag: 'input', role: 'searchbox', label: 'Search mail' }, { ref: 'e2', tag: 'tr', role: 'row', label: 'Northstar invoice INV-123' }] }],
};
const recoverable = await reviewCompletion(request);
assert.equal(recoverable.decision, 'continue'); assert.ok(recoverable.nextStep);
console.log('Live review recognized the untried Gmail recovery path.');
const blocked = await reviewCompletion({ ...request, response: 'The selected mailbox requires sign-in.', observations: [{ ...request.observations[0], text: 'Sign in to Gmail', elements: [] }] });
assert.equal(blocked.decision, 'blocked'); assert.ok(blocked.nextStep);
console.log('Live review requested human help at the sign-in boundary.');
const complete = await reviewCompletion({ ...request, goal: 'Tell me which page is open. Do not interact.', readOnly: true,
  response: 'The selected Gmail inbox is open.' });
assert.equal(complete.decision, 'complete');
console.log('Live review accepted a supported, completed read-only request.');
