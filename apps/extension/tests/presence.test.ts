import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Presence, type PresenceProps } from '../src/components/Presence.js';

const props: PresenceProps = { paused: false, working: false, monitoring: true, progress: '', onPosition: () => {}, send: async () => ({ ok: true }),
  suggestion: { id: 'offer', workspaceId: 'demo', tabId: 1, version: 'v', title: 'Review this invoice?', detail: '<script>untrusted</script>', vendor: '', key: 'invoice', createdAt: 0,
    options: [{ label: 'Check NetSuite', prompt: 'Check the bill.', kind: 'task' }, { label: 'No help needed', prompt: 'No help.', kind: 'dismiss' }] },
};
test('floating offer contains selectable choices and a free-text alternative without a panel-opening prerequisite', () => {
  const html = renderToStaticMarkup(createElement(Presence, props));
  assert.match(html, /type="radio"/); assert.match(html, /Check NetSuite/); assert.match(html, /No help needed/);
  assert.match(html, /<textarea/); assert.match(html, /Something else/); assert.match(html, />Continue</);
  assert.doesNotMatch(html, /Choose how to help|<script>/);
});
test('working popup shows progress and stop instead of actionable stale choices; errors remain visible', () => {
  const html = renderToStaticMarkup(createElement(Presence, { ...props, working: true, progress: 'Reading Gmail', error: 'Search failed.' }));
  assert.match(html, /Reading Gmail/); assert.match(html, /Stop task/); assert.match(html, /role="alert"/);
  assert.match(html, /Search failed/); assert.doesNotMatch(html, /type="radio"|>Continue</);
});
