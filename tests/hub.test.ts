import test from 'node:test';
import assert from 'node:assert/strict';
import { Hub } from '../apps/server/src/hub.js';
import { Store } from '../apps/server/src/store.js';
import type { AmbientDriver, AmbientRequest } from '../apps/server/src/ambient-agent.js';
import type { AgentDriver } from '../apps/server/src/agent.js';
import type { CompletionReviewer } from '../apps/server/src/completion-review.js';
import type { BrowserAction, ClientMessage, ServerMessage } from '../packages/shared/src/index.js';
const workspace = { id: 'close', name: 'September', paused: false, tabs: [
  { id: 1, scope: 'https://demo.app.netsuite.com/', title: 'NetSuite', paused: false },
  { id: 2, scope: 'https://mail.google.com/mail/u/0/', title: 'Gmail', paused: false },
] };
const tabs = [{ id: 1, title: 'NetSuite', url: 'https://demo.app.netsuite.com/app/accounting/transactions/vendbill.nl' }, { id: 2, title: 'Gmail', url: 'https://mail.google.com/mail/u/0/#inbox' }];
const context = { tabId: 1, url: tabs[0].url, title: 'Vendor Bill', version: 'v1', kind: 'bill_form' as const, vendor: '', text: 'New Bill', visitId: 'doc-1', observedAt: Date.now() };
const mockAmbient: AmbientDriver = async r => ({ decision: 'offer', summary: 'A bill was observed.', reason: 'A selected bill matches the invoice instruction.', instructionId: 'invoices', tabId: r.events[0].tabId, entityKey: r.events[0].text, title: 'Check this bill?', detail: 'Compare invoice evidence.', options: [{ kind: 'task', label: 'Check invoices', prompt: 'Check invoices.' }, { kind: 'task', label: 'Review this bill', prompt: 'Inspect the bill.' }] });
const action = (tabId: number): BrowserAction => ({ tabId, action: 'inspect', ref: null, version: null, text: null, url: null });
const completeReview: CompletionReviewer = async () => ({ decision: 'complete', reason: 'Requested work is supported.', nextStep: '' });
async function setup(driver: AgentDriver, apiReady = true, ambientDriver: AmbientDriver = mockAmbient, reviewer: CompletionReviewer = completeReview) {
  const store = new Store(':memory:'); const hub = new Hub(store, driver, 'gpt-6-astra', apiReady, ambientDriver, reviewer); hub.connected = true;
  await hub.receive({ type: 'sync', activeWorkspaceId: 'close', workspaces: [structuredClone(workspace)], tabs }); return { hub, store };
}
test('ambient suggestion is deduplicated, dismissed, persisted, and invalidated on page changes', async () => {
  const { hub, store } = await setup(async () => ({ text: 'unused', history: [] }));
  hub.observe(context); hub.observe(context); await hub.ambient.evaluate(); assert.equal(hub.suggestions.length, 1);
  await hub.receive({ type: 'dismiss', id: hub.suggestions[0].id }); hub.observe(context); assert.equal(hub.suggestions.length, 0);
  assert.ok(hub.ambient.status?.recent.some(e => e.kind === 'response'));
  hub.observe({ ...context, vendor: 'Northstar', text: 'New Bill Northstar' }); await hub.ambient.evaluate(); assert.equal(hub.suggestions.length, 1);
  hub.observe({ ...context, kind: 'page', visitId: 'different-page' }); assert.equal(hub.suggestions.length, 0); hub.ambient.cancel(); store.close();
});
test('accepted investigation executes across tabs and persists task and coordinator state', async () => {
  const seen: number[] = [];
  const driver: AgentDriver = async r => {
    for (const id of [2, 1]) { const result = await r.browser(action(id)); seen.push(id); assert.equal(result.version, 'v1'); }
    r.finding({ vendor: 'Northstar', invoice: 'NS-1042', amount: 'USD 850.00', status: 'candidate', explanation: 'No matching bill in the records checked.', sources: [{ title: 'Email', url: tabs[1].url }] });
    r.delta('Found one candidate.'); return { text: 'Found one candidate.', history: [{ role: 'user', content: r.prompt }] };
  };
  const { hub, store } = await setup(driver);
  hub.send = (message: ServerMessage) => { if (message.type === 'command') queueMicrotask(() => { void hub.receive({ type: 'result', id: message.id, ok: true, data: { url: tabs.find(t => t.id === message.args.tabId)!.url, title: 'Page', version: 'v1', text: 'Evidence', elements: [] } }); }); };
  hub.observe(context); await hub.ambient.evaluate();
  await hub.receive({ type: 'start', workspaceId: 'close', suggestionId: hub.suggestions[0].id, prompt: 'Check invoices.' });
  assert.deepEqual(seen, [2, 1]); assert.equal(hub.tasks[0].status, 'completed'); assert.equal(hub.tasks[0].findings.length, 1);
  assert.equal(hub.tasks[0].activity.every(a => a.status === 'done'), true);
  assert.deepEqual(store.get('memory:close', []), ['completed: Found one candidate. ']);
  assert.equal(store.get<unknown[]>(`history:${hub.tasks[0].id}`, []).length, 1); hub.ambient.cancel(); store.close();
});
test('only one run may control the browser and Stop rejects in-flight commands', async () => {
  let commandSeen!: () => void; const pending = new Promise<void>(resolve => { commandSeen = resolve; });
  const { hub, store } = await setup(async r => { await r.browser(action(1)); return { text: 'done', history: [] }; });
  hub.send = m => { if (m.type === 'command') commandSeen(); };
  const run = hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Inspect.' }); await pending;
  await assert.rejects(hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Competing run.' }), /already/);
  await hub.receive({ type: 'stop' }); await run;
  assert.equal(hub.tasks[0].status, 'stopped'); assert.equal(hub.running, null); hub.ambient.cancel(); store.close();
});
test('workspace pause cancels browser work before further commands', async () => {
  let started!: () => void; const signal = new Promise<void>(resolve => { started = resolve; });
  const { hub, store } = await setup(async r => { await r.browser(action(2)); return { text: 'done', history: [] }; });
  hub.send = m => { if (m.type === 'command') started(); };
  const run = hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Inspect.' }); await signal;
  await hub.receive({ type: 'sync', activeWorkspaceId: 'close', workspaces: [{ ...workspace, paused: true }], tabs }); await run;
  assert.equal(hub.tasks[0].status, 'stopped'); hub.ambient.cancel(); store.close();
});
test('missing API key cannot silently run a fake investigation', async () => {
  const { hub, store } = await setup(async () => { throw new Error('Should never run'); }, false);
  await assert.rejects(hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Inspect.' }), /OPENAI_API_KEY/); assert.equal(hub.tasks.length, 0); hub.ambient.cancel(); store.close();
});
test('stale suggestion acceptance is rejected', async () => {
  const { hub, store } = await setup(async () => ({ text: 'unused', history: [] }));
  hub.observe(context); await hub.ambient.evaluate(); const id = hub.suggestions[0].id; hub.observe({ ...context, kind: 'page', visitId: 'different-page' });
  await assert.rejects(hub.receive({ type: 'start', workspaceId: 'close', suggestionId: id, prompt: 'Inspect.' }), /no longer/); hub.ambient.cancel(); store.close();
});
test('read-only tasks cannot click even if the model requests it', async () => {
  let dispatched = false;
  const { hub, store } = await setup(async r => {
    await assert.rejects(r.browser({ ...action(1), action: 'click', ref: 'e1', version: 'v1' }), /read-only/);
    return { text: 'Read-only restriction verified.', history: [] };
  });
  hub.send = message => { if (message.type === 'command') dispatched = true; };
  await hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Inspect only.', readOnly: true });
  assert.equal(dispatched, false); assert.equal(hub.tasks[0].status, 'completed'); hub.ambient.cancel(); store.close();
});

test('accepted offers are remembered and execution completion refreshes the baseline', async () => {
  const { hub, store } = await setup(async () => ({ text: 'done', history: [] }));
  hub.observe(context); await hub.ambient.evaluate();
  await hub.receive({ type: 'start', workspaceId: 'close', suggestionId: hub.suggestions[0].id, prompt: 'Check.' });
  hub.observe({ ...context, text: 'Agent changed this form', visitId: 'agent-document' });
  await hub.ambient.evaluate();
  assert.equal(hub.suggestions.length, 0);
  assert.ok(hub.ambient.status?.recent.some(e => e.kind === 'task'));
  hub.observe({ ...context, text: 'Another invoice', visitId: 'user-document' }); await hub.ambient.evaluate();
  assert.equal(hub.suggestions.length, 1);
  hub.ambient.cancel(); hub.ambient.cancel(); store.close();
});

test('browser failure details survive completion and persistence', async () => {
  const { hub, store } = await setup(async r => {
    await assert.rejects(r.browser(action(2)), /Target changed/);
    return { text: 'Search could not be completed.', history: [] };
  });
  hub.send = m => { if (m.type === 'command') queueMicrotask(() => { void hub.receive({ type: 'result', id: m.id, ok: false, error: 'Target changed since inspection.' }); }); };
  await hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Check.' });
  assert.equal(store.tasks()[0].activity[0].error, 'Target changed since inspection.');
  assert.equal(store.tasks()[0].activity[0].status, 'error'); hub.ambient.cancel(); store.close();
});

test('returning to a bill replaces an expired offer; current pending offers and explicit declines suppress repeats', async () => {
  const requests: AmbientRequest[] = [];
  const { hub, store } = await setup(async () => ({ text: 'unused', history: [] }), true, async r => {
    requests.push(r);
    return { ...await mockAmbient(r), entityKey: 'same-bill', summary: 'The previous bill offer is pending.' };
  });
  hub.observe(context); await hub.ambient.evaluate();
  const firstId = hub.suggestions[0].id;
  hub.observe({ ...context, text: 'New Bill toolbar updated' }); await hub.ambient.evaluate();
  assert.equal(requests.at(-1)?.pendingSuggestions[0].id, firstId);
  assert.equal(hub.suggestions[0].id, firstId);
  const homeTabs = [{ ...tabs[0], url: 'https://demo.app.netsuite.com/app/center/card.nl' }, tabs[1]];
  await hub.receive({ type: 'sync', activeWorkspaceId: 'close', workspaces: [workspace], tabs: homeTabs });
  assert.equal(hub.suggestions.length, 0);
  assert.ok(hub.ambient.status?.recent.some(e => e.kind === 'expired'));
  await hub.receive({ type: 'sync', activeWorkspaceId: 'close', workspaces: [workspace], tabs });
  hub.observe({ ...context, visitId: 'doc-return' });
  hub.observe({ ...context, visitId: 'doc-return', text: 'New Bill toolbar settled' });
  await hub.ambient.evaluate();
  assert.deepEqual(requests.at(-1)?.pendingSuggestions, []);
  assert.equal(requests.at(-1)?.events[0].newVisit, true);
  assert.equal(hub.suggestions.length, 1);
  assert.notEqual(hub.suggestions[0].id, firstId);
  await hub.receive({ type: 'dismiss', id: hub.suggestions[0].id });
  hub.observe({ ...context, visitId: 'doc-return-again' }); await hub.ambient.evaluate();
  assert.equal(hub.suggestions.length, 0);
  hub.ambient.cancel(); store.close();
});

test('completion review continues the same task with history and per-message findings while ambient remains suspended', async () => {
  let attempts = 0, reviewCount = 0;
  const driver: AgentDriver = async request => {
    attempts++;
    if (attempts === 2) { assert.equal(request.history.length, 1); assert.match(request.recovery!, /Open the exposed message row/); }
    request.finding({ vendor: 'Synthetic vendor', invoice: 'INV-1', amount: attempts === 1 ? 'Unknown' : 'USD 80', status: 'uncertain', explanation: `Attempt ${attempts}`, sources: [{ title: 'Email', url: tabs[1].url }] });
    return { text: attempts === 1 ? 'Invoice details remain incomplete.' : 'The invoice evidence is now verified.', history: [{ role: 'assistant', content: `attempt ${attempts}` }] };
  };
  const { hub, store } = await setup(driver, true, mockAmbient, async request => {
    reviewCount++; assert.equal(hub.ambient.status?.status, 'task_active'); assert.equal(hub.state().runningTaskId, hub.tasks[0].id);
    assert.equal(hub.tasks[0].phase, 'reviewing'); assert.equal(request.goal, 'Verify invoice evidence.');
    hub.observe(context);
    return reviewCount === 1 ? { decision: 'continue', reason: 'The message has not been opened.', nextStep: 'Open the exposed message row and read its details.' } : { decision: 'complete', reason: 'Evidence was verified.', nextStep: '' };
  });
  await hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Verify invoice evidence.' });
  const task = hub.tasks[0], responses = task.messages.filter(m => m.role === 'assistant');
  assert.equal(attempts, 2); assert.equal(task.status, 'completed'); assert.equal(task.messages.filter(m => m.role === 'user').length, 1);
  assert.equal(responses[0].interim, true); assert.deepEqual(responses[0].findingIds, [task.findings[0].id]); assert.deepEqual(responses[1].findingIds, [task.findings[1].id]);
  assert.deepEqual(store.tasks()[0].messages, task.messages); assert.equal(hub.suggestions.length, 0);
  hub.ambient.cancel(); store.close();
});

test('Stop during completion review prevents all recovery work even when the review returns continue', async () => {
  let attempts = 0, finish!: () => void, entered!: () => void;
  const reviewing = new Promise<void>(resolve => { entered = resolve; });
  const { hub, store } = await setup(async () => { attempts++; return { text: 'Incomplete', history: [] }; }, true, mockAmbient,
    request => new Promise(resolve => { finish = () => { assert.equal(request.signal.aborted, true); resolve({ decision: 'continue', reason: 'Missing evidence', nextStep: 'Inspect again.' }); }; entered(); }));
  const task = hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Investigate.' }); await reviewing;
  await hub.receive({ type: 'stop' }); finish(); await task;
  assert.equal(attempts, 1); assert.equal(hub.tasks[0].status, 'stopped'); assert.equal(hub.running, null);
  hub.ambient.cancel(); store.close();
});

test('completion recovery is bounded and repeated failed plans are not retried', async () => {
  for (const repeated of [false, true]) {
    let attempts = 0;
    const { hub, store } = await setup(async () => { attempts++; return { text: 'Still incomplete.', history: [] }; }, true, mockAmbient,
      async () => ({ decision: 'continue', reason: 'Missing evidence.', nextStep: repeated ? 'Same failed plan.' : `Distinct approach ${attempts}.` }));
    await hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Investigate.' });
    assert.equal(attempts, repeated ? 2 : 3); assert.equal(hub.tasks[0].status, 'blocked'); assert.match(hub.tasks[0].error!, /Automatic recovery stopped/);
    hub.ambient.cancel(); store.close();
  }
});

test('a genuine blocker asks for a specific next step and persists it for follow-up', async () => {
  const { hub, store } = await setup(async () => ({ text: 'The mailbox is logged out.', history: [] }), true, mockAmbient,
    async () => ({ decision: 'blocked', reason: 'The selected mailbox needs sign-in.', nextStep: 'Please sign in to the selected Gmail tab, then tell me to continue.' }));
  await hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Inspect the mailbox.', readOnly: true });
  assert.equal(hub.tasks[0].status, 'blocked'); assert.match(hub.tasks[0].messages.at(-1)!.text, /Next step needed/);
  assert.match(JSON.stringify(store.get(`history:${hub.tasks[0].id}`, [])), /sign in/);
  await hub.receive({ type: 'start', workspaceId: 'close', taskId: hub.tasks[0].id, prompt: 'Continue.' });
  assert.equal(hub.tasks[0].readOnly, true);
  hub.ambient.cancel(); store.close();
});

test('review failure retains the result but cannot silently mark unfinished work completed', async () => {
  const { hub, store } = await setup(async () => ({ text: 'Partial evidence retained.', history: [] }), true, mockAmbient,
    async () => { throw new Error('Review unavailable'); });
  await hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Investigate.' });
  assert.equal(hub.tasks[0].status, 'blocked'); assert.match(hub.tasks[0].error!, /Review unavailable/);
  assert.equal(hub.tasks[0].messages.at(-1)!.text, 'Partial evidence retained.');
  hub.ambient.cancel(); store.close();
});
