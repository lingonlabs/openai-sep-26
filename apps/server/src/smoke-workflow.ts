import assert from 'node:assert/strict';
import { driveAgent } from './agent.js';
import type { Finding } from '@ambient/shared';
// Explicitly synthetic: checks the real model + SDK + tool loop without touching accounts.
const observations = [
  { url: 'http://127.0.0.1:4318/fixtures/gmail', title: 'Synthetic Gmail evidence', version: 'v1', text: 'This synthetic inbox contains exactly two September invoices: Northstar Software invoice NS-1041, USD 1200.00, September 2 2026; Northstar Software invoice NS-1042, USD 850.00, September 8 2026. Full evidence for this test is on this page.', elements: [] },
  { url: 'http://127.0.0.1:4318/fixtures/netsuite', title: 'Synthetic NetSuite records', version: 'v1', text: 'The complete synthetic September bill list for this test has one record: Northstar Software invoice NS-1041, USD 1200.00. No other records are in the test dataset.', elements: [] },
];
const findings: Omit<Finding, 'id'>[] = []; const inspected = new Set<number>();
const result = await driveAgent({
  model: process.env.OPENAI_MODEL || 'gpt-6-astra', history: [], memory: '', signal: AbortSignal.timeout(90000),
  workspace: { id: 'smoke', name: 'Synthetic tool-loop test', paused: false, tabs: observations.map((o, i) => ({ id: i + 1, title: o.title, scope: 'http://127.0.0.1:4318/fixtures/', paused: false })) },
  prompt: 'This is a synthetic integration test, not a real account. Inspect tabs 1 and 2, compare the two invoices, and record exactly one finding for each invoice with evidence. All test evidence is inline; do not search or click. End with a compact summary.',
  browser: async action => { assert.equal(action.action, 'inspect'); assert.ok(action.tabId === 1 || action.tabId === 2); inspected.add(action.tabId); return observations[action.tabId - 1]; },
  finding: finding => findings.push(finding), delta: () => {},
});
assert.equal(inspected.size, 2);
assert.ok(findings.some(f => f.invoice === 'NS-1041' && f.status === 'recorded'));
assert.ok(findings.some(f => f.invoice === 'NS-1042' && f.status === 'candidate'));
assert.ok(result.history.length > 4);
console.log('Live Astra/Agents SDK tool-loop test passed against synthetic observations.');
console.log(JSON.stringify(findings.map(f => ({ invoice: f.invoice, status: f.status, sources: f.sources.length }))));
