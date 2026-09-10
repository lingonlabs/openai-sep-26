import test from 'node:test';
import assert from 'node:assert/strict';
import { Hub } from '../apps/server/src/hub.js';
import { Store } from '../apps/server/src/store.js';
import type { AgentDriver } from '../apps/server/src/agent.js';
import type { BrowserAction, ClientMessage, ServerMessage } from '../packages/shared/src/index.js';
const workspace = { id: 'close', name: 'September', paused: false, tabs: [
  { id: 1, scope: 'https://demo.app.netsuite.com/', title: 'NetSuite', paused: false },
  { id: 2, scope: 'https://mail.google.com/mail/u/0/', title: 'Gmail', paused: false },
] };
const tabs = [{ id: 1, title: 'NetSuite', url: 'https://demo.app.netsuite.com/app/accounting/transactions/vendbill.nl' }, { id: 2, title: 'Gmail', url: 'https://mail.google.com/mail/u/0/#inbox' }];
const context = { tabId: 1, url: tabs[0].url, title: 'Vendor Bill', version: 'v1', kind: 'bill_form' as const, vendor: '', observedAt: Date.now() };
const action = (tabId: number): BrowserAction => ({ tabId, action: 'inspect', ref: null, version: null, text: null, url: null });
async function setup(driver: AgentDriver, apiReady = true) {
  const store = new Store(':memory:'); const hub = new Hub(store, driver, 'gpt-6-astra', apiReady); hub.connected = true;
  await hub.receive({ type: 'sync', activeWorkspaceId: 'close', workspaces: [structuredClone(workspace)], tabs }); return { hub, store };
}
test('ambient suggestion is deduplicated, dismissed, persisted, and invalidated on page changes', async () => {
  const { hub, store } = await setup(async () => ({ text: 'unused', history: [] }));
  hub.observe(context); hub.observe(context); assert.equal(hub.suggestions.length, 1);
  await hub.receive({ type: 'dismiss', id: hub.suggestions[0].id }); hub.observe(context); assert.equal(hub.suggestions.length, 0);
  assert.equal(Object.keys(store.get('dismissed', {})).length, 1);
  hub.observe({ ...context, vendor: 'Northstar' }); assert.equal(hub.suggestions.length, 1);
  hub.observe({ ...context, kind: 'page' }); assert.equal(hub.suggestions.length, 0); store.close();
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
  hub.observe(context);
  await hub.receive({ type: 'start', workspaceId: 'close', suggestionId: hub.suggestions[0].id, prompt: 'Check invoices.' });
  assert.deepEqual(seen, [2, 1]); assert.equal(hub.tasks[0].status, 'completed'); assert.equal(hub.tasks[0].findings.length, 1);
  assert.equal(hub.tasks[0].activity.every(a => a.status === 'done'), true);
  assert.deepEqual(store.get('memory:close', []), ['Found one candidate.']);
  assert.equal(store.get<unknown[]>(`history:${hub.tasks[0].id}`, []).length, 1); store.close();
});
test('only one run may control the browser and Stop rejects in-flight commands', async () => {
  let commandSeen!: () => void; const pending = new Promise<void>(resolve => { commandSeen = resolve; });
  const { hub, store } = await setup(async r => { await r.browser(action(1)); return { text: 'done', history: [] }; });
  hub.send = m => { if (m.type === 'command') commandSeen(); };
  const run = hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Inspect.' }); await pending;
  await assert.rejects(hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Competing run.' }), /already/);
  await hub.receive({ type: 'stop' }); await run;
  assert.equal(hub.tasks[0].status, 'stopped'); assert.equal(hub.running, null); store.close();
});
test('workspace pause cancels browser work before further commands', async () => {
  let started!: () => void; const signal = new Promise<void>(resolve => { started = resolve; });
  const { hub, store } = await setup(async r => { await r.browser(action(2)); return { text: 'done', history: [] }; });
  hub.send = m => { if (m.type === 'command') started(); };
  const run = hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Inspect.' }); await signal;
  await hub.receive({ type: 'sync', activeWorkspaceId: 'close', workspaces: [{ ...workspace, paused: true }], tabs }); await run;
  assert.equal(hub.tasks[0].status, 'stopped'); store.close();
});
test('missing API key cannot silently run a fake investigation', async () => {
  const { hub, store } = await setup(async () => { throw new Error('Should never run'); }, false);
  await assert.rejects(hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Inspect.' }), /OPENAI_API_KEY/); assert.equal(hub.tasks.length, 0); store.close();
});
test('stale suggestion acceptance is rejected', async () => {
  const { hub, store } = await setup(async () => ({ text: 'unused', history: [] }));
  hub.observe(context); const id = hub.suggestions[0].id; hub.observe({ ...context, kind: 'page' });
  await assert.rejects(hub.receive({ type: 'start', workspaceId: 'close', suggestionId: id, prompt: 'Inspect.' }), /no longer/); store.close();
});
test('read-only tasks cannot click even if the model requests it', async () => {
  let dispatched = false;
  const { hub, store } = await setup(async r => {
    await assert.rejects(r.browser({ ...action(1), action: 'click', ref: 'e1', version: 'v1' }), /read-only/);
    return { text: 'Read-only restriction verified.', history: [] };
  });
  hub.send = message => { if (message.type === 'command') dispatched = true; };
  await hub.receive({ type: 'start', workspaceId: 'close', prompt: 'Inspect only.', readOnly: true });
  assert.equal(dispatched, false); assert.equal(hub.tasks[0].status, 'completed'); store.close();
});
