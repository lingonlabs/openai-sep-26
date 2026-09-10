import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findingsForMessage, taskStateLabel, taskPresence, type Task } from '@ambient/shared';
import { TaskView } from '../src/components/TaskView.js';
import { TaskHandoff } from '../src/components/TaskHandoff.js';

const task: Task = { id: 'task', workspaceId: 'demo', title: 'Verify invoices', status: 'completed', createdAt: 0, updatedAt: 0, activity: [],
  messages: [{ role: 'user', text: 'First request' }, { id: 'a', role: 'assistant', text: 'First response', findingIds: ['a'] }, { role: 'user', text: 'Second request' }, { id: 'b', role: 'assistant', text: 'Second response', findingIds: ['b'] }],
  findings: ['a','b'].map(id => ({ id, vendor: `Vendor ${id}`, invoice: id, amount: 'USD 10', status: 'uncertain', explanation: 'Synthetic evidence', sources: [{ title: 'Source', url: 'https://example.com/' }] })),
};
test('each response owns its findings and renders them collapsed beneath that response', () => {
  const html = renderToStaticMarkup(createElement(TaskView, { task, onOpen: () => {}, onPrepare: () => {}, canPrepare: false }));
  assert.equal((html.match(/<details class="message-findings">/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<details[^>]*class="message-findings"[^>]*open/);
  assert.ok(html.indexOf('First response') < html.indexOf('Vendor a'));
  assert.ok(html.indexOf('Vendor a') < html.indexOf('Second request'));
  assert.ok(html.indexOf('Second response') < html.indexOf('Vendor b'));
  assert.deepEqual(findingsForMessage(task, 1).findings.map(f => f.id), ['a']);
});
test('older unlinked findings are retained once and labelled as earlier task evidence', () => {
  const legacy = structuredClone(task); legacy.messages.forEach(message => { delete message.findingIds; });
  assert.equal(findingsForMessage(legacy, 1).findings.length, 0);
  assert.equal(findingsForMessage(legacy, 3).legacy, true);
  const html = renderToStaticMarkup(createElement(TaskView, { task: legacy, onOpen: () => {}, onPrepare: () => {}, canPrepare: false }));
  assert.match(html, /includes earlier task evidence/); assert.equal((html.match(/Vendor a/g) ?? []).length, 1);
});

test('waiting and paused tasks have explicit resume controls distinct from active review', () => {
  const waiting: Task = { ...task, status: 'blocked', handoff: { kind: 'user', reason: 'Need the PDF.', nextStep: 'Open the PDF in Gmail.' } };
  const html = renderToStaticMarkup(createElement(TaskHandoff, { task: taskPresence(waiting), disabled: false, onResume: async () => {}, onReply: async () => {} }));
  assert.match(html, /I’ve done that — continue/); assert.match(html, /agent is not running/); assert.match(html, /Update for this task/);
  assert.equal(taskStateLabel(waiting), 'Waiting for you');
  assert.equal(taskStateLabel({ ...waiting, handoff: { ...waiting.handoff!, kind: 'limit' } }), 'Paused · needs continuation');
  assert.equal(taskStateLabel({ ...task, status: 'running', phase: 'reviewing' }), 'Checking completion');
});
