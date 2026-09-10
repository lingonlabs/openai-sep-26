import test from 'node:test';
import assert from 'node:assert/strict';
import { Ambient } from '../apps/server/src/ambient.js';
import { Store } from '../apps/server/src/store.js';
import { defaultAmbientPreferences, type PageContext, type Suggestion } from '../packages/shared/src/index.js';
import { ambientInput, type AmbientDecision, type AmbientDriver, type AmbientRequest } from '../apps/server/src/ambient-agent.js';

const workspace = { id: 'finance', name: 'Finance', paused: false, tabs: [{ id: 1, title: 'Invoices', scope: 'https://mail.google.com/mail/u/0/', paused: false }] };
const page = (text = 'Invoice A', visitId = 'doc|initial'): PageContext => ({ tabId: 1, url: 'https://mail.google.com/mail/u/0/#invoice-a', title: 'Invoice A', version: 'v', kind: 'page', vendor: '', text, visitId, observedAt: Date.now() });
const quiet = (summary = 'Remember invoice A.'): AmbientDecision => ({ decision: 'quiet', summary, reason: 'Nothing requiring an interruption.', instructionId: '', tabId: 0, entityKey: '', title: '', detail: '', options: [] });
const offer = (): AmbientDecision => ({ ...quiet(), decision: 'offer', instructionId: 'invoices', tabId: 1, entityKey: 'invoice-a', title: 'Review invoice A?', detail: 'An invoice is open.', options: [{ kind: 'task', label: 'Check NetSuite', prompt: 'Check whether it exists.' }, { kind: 'task', label: 'Review evidence', prompt: 'Review the email evidence.' }] });
function setup(driver: AmbientDriver) {
  const store = new Store(':memory:'), offers: Suggestion[] = [];
  const ambient = new Ambient(store, driver, 'test', true, () => {}, s => offers.push(s));
  ambient.update(workspace, true, false);
  return { store, ambient, offers, close: () => { ambient.cancel(); store.close(); } };
}

test('visual-only changes reach the evaluator with persisted before/after images and no extra visit', async () => {
  const requests: AmbientRequest[] = [];
  const { ambient, store, close } = setup(async r => { requests.push(r); return quiet(); });
  const before = 'data:image/jpeg;base64,YmVmb3Jl', after = 'data:image/jpeg;base64,YWZ0ZXI=';
  ambient.observe({ ...page('Canvas toolbar only'), image: before }); await ambient.evaluate();
  assert.equal(requests[0].events[0].previousImage, undefined);
  ambient.observe({ ...page('Canvas toolbar only'), image: before }); await ambient.evaluate();
  assert.equal(requests.length, 1);
  ambient.cancel();
  const restored = new Ambient(store, async r => { requests.push(r); return quiet(); }, 'test', true, () => {}, () => {});
  restored.update(workspace, true, false);
  restored.observe({ ...page('Canvas toolbar only'), image: after }); await restored.evaluate();
  const event = requests[1].events[0];
  assert.equal(event.previousImage, before); assert.equal(event.image, after); assert.equal(event.visitCount, 1);
  const content = ambientInput(requests[1])[0].content;
  assert.deepEqual(content.filter(c => c.type === 'input_image').map(c => c.image), [before, after]);
  assert.ok(!JSON.stringify(content.filter(c => c.type === 'input_text')).includes('base64'));
  assert.ok(!JSON.stringify(restored.status).includes('base64'));
  restored.cancel(); close();
});

test('visual coalescing retains the original baseline and execution changes are never evaluated', async () => {
  const requests: AmbientRequest[] = [];
  const { ambient, close } = setup(async r => { requests.push(r); return quiet(); });
  const frame = (image: string) => ({ ...page('Same DOM'), image });
  ambient.observe(frame('before')); await ambient.evaluate();
  ambient.observe(frame('typing')); ambient.observe(frame('finished')); await ambient.evaluate();
  assert.equal(requests[1].events[0].previousImage, 'before'); assert.equal(requests[1].events[0].image, 'finished');
  ambient.update(workspace, true, true); ambient.observe(frame('agent')); await ambient.evaluate();
  assert.equal(requests.length, 2);
  ambient.update(workspace, true, false); ambient.observe(frame('agent done')); await ambient.evaluate();
  assert.equal(requests.length, 2);
  ambient.observe(frame('user edit')); await ambient.evaluate();
  assert.equal(requests[2].events[0].previousImage, 'agent done'); close();
});

test('ambient memory persists visits and summaries; DOM changes and extension reloads are not extra visits', async () => {
  const seen: AmbientRequest[] = [];
  const { ambient, store, close } = setup(async r => { seen.push(r); return quiet(); });
  ambient.observe(page()); await ambient.evaluate();
  ambient.observe(page()); await ambient.evaluate(); assert.equal(seen.length, 1);
  ambient.observe(page('Invoice A updated')); await ambient.evaluate(); assert.equal(seen[1].events[0].visitCount, 1);
  for (let i=2; i<=5; i++) { ambient.observe(page('Invoice A updated', `doc|activation-${i}`)); await ambient.evaluate(); }
  assert.equal(ambient.status?.visits[0].count, 5);
  ambient.cancel();
  const restored = new Ambient(store, async r => { seen.push(r); return quiet(); }, 'test', true, () => {}, () => {});
  restored.update(workspace, true, false);
  assert.equal(restored.status?.summary, 'Remember invoice A.');
  restored.observe(page('Invoice A updated')); await restored.evaluate();
  assert.equal(restored.status?.visits[0].count, 5);
  restored.cancel(); close();
});

test('execution cancels ambient inference, ignores observations while active, and baselines its changes', async () => {
  let resolve!: (value: AmbientDecision) => void;
  const requests: AmbientRequest[] = [];
  const { ambient, offers, close } = setup(r => { requests.push(r); return new Promise(done => { resolve = done; }); });
  ambient.observe(page()); const pending = ambient.evaluate();
  ambient.update(workspace, true, true); assert.equal(requests[0].signal.aborted, true);
  ambient.observe(page('Agent changed field', 'agent-doc'));
  resolve(offer()); await pending; assert.equal(offers.length, 0); assert.equal(ambient.status?.status, 'task_active');
  ambient.update(workspace, true, false); ambient.observe(page('Agent changed field', 'agent-doc')); await ambient.evaluate();
  assert.equal(requests.length, 1); assert.equal(ambient.status?.visits[0].count, 1);
  ambient.observe(page('User changed field', 'user-doc')); const next = ambient.evaluate();
  assert.equal(requests.length, 2); resolve(quiet()); await next; close();
});

test('dismissal and completed work persist, with workspace isolation', async () => {
  const { ambient, store, offers, close } = setup(async () => offer());
  ambient.observe(page()); await ambient.evaluate(); assert.equal(offers.length, 1);
  ambient.dismiss(offers[0]); ambient.observe(page('Invoice A changed')); await ambient.evaluate(); assert.equal(offers.length, 1);
  ambient.update({ ...workspace, id: 'another' }, true, false);
  assert.equal(ambient.status?.summary, ''); assert.equal(ambient.status?.recent.length, 0);
  ambient.record('task', 'Completed invoice A', 'finance');
  assert.equal(ambient.status?.recent.length, 0);
  ambient.update(workspace, true, false);
  assert.ok(ambient.status?.recent.some(e => e.kind === 'task'));
  assert.ok(store.get('ambient:memory:finance', null)); close();
});

test('stale offers and out-of-scope observations cannot become suggestions', async () => {
  let resolve!: (value: AmbientDecision) => void; let calls = 0;
  const { ambient, offers, close } = setup(() => { calls++; return new Promise(done => { resolve = done; }); });
  ambient.observe({ ...page(), tabId: 999 }); await ambient.evaluate(); assert.equal(calls, 0);
  ambient.observe(page()); const pending = ambient.evaluate();
  ambient.observe(page('Different content')); resolve(offer()); await pending; assert.equal(offers.length, 0);
  close();
});

test('standing instructions and pause control persist and cancel pending evaluations', async () => {
  let calls = 0;
  const { ambient, store, close } = setup(async () => { calls++; return quiet(); });
  ambient.observe(page());
  ambient.settings({ enabled: false, instructions: defaultAmbientPreferences().instructions });
  await ambient.evaluate(); assert.equal(calls, 0);
  ambient.observe(page('changed')); await ambient.evaluate(); assert.equal(calls, 0);
  const prefs = { enabled: true, instructions: [{ id: 'custom', text: 'Help with invoice A', enabled: true }] };
  ambient.settings(prefs); ambient.observe(page()); await ambient.evaluate(); assert.equal(calls, 1);
  assert.deepEqual(store.get('ambient:preferences:finance', null), prefs);
  ambient.forget(); assert.equal(ambient.status?.summary, ''); assert.deepEqual(ambient.status?.preferences, prefs); close();
});

test('first observations explicitly lack a prior baseline; model offers must reference enabled instructions', async () => {
  let request!: AmbientRequest;
  const { ambient, offers, close } = setup(async r => { request = r; return { ...offer(), instructionId: 'not-authorized' }; });
  ambient.observe(page()); await ambient.evaluate();
  assert.equal(request.events[0].previousText, null); assert.equal(offers.length, 0); close();
});

test('coalescing page updates preserves the new visit and the original comparison baseline', async () => {
  const requests: AmbientRequest[] = [];
  const { ambient, close } = setup(async r => { requests.push(r); return quiet(); });
  ambient.observe(page());
  ambient.observe(page('Invoice A loaded'));
  ambient.observe(page('Invoice A loaded with controls'));
  await ambient.evaluate();
  assert.equal(requests[0].events[0].newVisit, true);
  assert.equal(requests[0].events[0].previousText, null);
  assert.equal(requests[0].events[0].text, 'Invoice A loaded with controls');
  ambient.observe(page('Invoice A loaded with controls', 'doc|return'));
  ambient.observe(page('Invoice A new navigation text', 'doc|return'));
  await ambient.evaluate();
  assert.equal(requests[1].events[0].newVisit, true);
  assert.equal(requests[1].events[0].visitCount, 2);
  assert.equal(requests[1].events[0].previousText, 'Invoice A loaded with controls');
  close();
});
