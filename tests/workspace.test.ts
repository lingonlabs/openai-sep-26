import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTarget, scopeFor, withinScope, detectBillForm, isCommitControl, canReplaceValue, ClientMessageSchema } from '../packages/shared/src/index.js';
const workspace = { id: 'close', name: 'September', paused: false, tabs: [{ id: 1, scope: 'https://demo.app.netsuite.com/', title: 'Bills', paused: false }] };
const tab = { id: 1, title: 'Bills', url: 'https://demo.app.netsuite.com/app/accounting/transactions/vendbill.nl' };
test('targets must belong to the active, unpaused workspace and origin', () => {
  assert.doesNotThrow(() => assertTarget(workspace, 'close', tab));
  assert.throws(() => assertTarget(workspace, 'another', tab));
  assert.throws(() => assertTarget({ ...workspace, paused: true }, 'close', tab));
  assert.throws(() => assertTarget(workspace, 'close', { ...tab, id: 2 }));
  assert.throws(() => assertTarget(workspace, 'close', { ...tab, url: 'https://evil.test' }));
  assert.throws(() => assertTarget({ ...workspace, tabs: [{ ...workspace.tabs[0], paused: true }] }, 'close', tab));
});
test('Gmail account and spreadsheet scopes stay specific', () => {
  const gmail = scopeFor('https://mail.google.com/mail/u/0/#inbox')!;
  assert.equal(gmail, 'https://mail.google.com/mail/u/0/');
  assert.equal(withinScope('https://mail.google.com/mail/u/1/#inbox', gmail), false);
  const sheet = scopeFor('https://docs.google.com/spreadsheets/d/abc123/edit')!;
  assert.equal(withinScope('https://docs.google.com/spreadsheets/d/xyz456/edit', sheet), false);
  assert.equal(withinScope('https://demo.app.netsuite.com.evil.test/', workspace.tabs[0].scope), false);
  assert.equal(withinScope('https://user:password@demo.app.netsuite.com/', workspace.tabs[0].scope), false);
});
test('local practice pages cannot navigate into the backend', () => {
  const scope = scopeFor('http://127.0.0.1:4318/fixtures/gmail')!;
  assert.equal(withinScope('http://127.0.0.1:4318/bridge', scope), false);
  assert.equal(scopeFor('http://127.0.0.1:4318/'), null);
  assert.equal(scopeFor('chrome://extensions'), null);
  assert.equal(scopeFor('file:///etc/passwd'), null);
});
test('bill detection requires an allowed application and visible form context', () => {
  assert.equal(detectBillForm(tab.url, 'Vendor Bill', true), true);
  assert.equal(detectBillForm(tab.url, 'Vendor Bill', false), false);
  assert.equal(detectBillForm('https://evil.test', 'Add New Bill', true), false);
  assert.equal(detectBillForm('http://127.0.0.1:4318/fixtures/netsuite', 'Accounts payable', true), false);
  assert.equal(detectBillForm('http://127.0.0.1:4318/fixtures/netsuite', 'Add New Bill', true), true);
});
test('commit controls are reserved for the human', () => {
  for (const label of ['Save', 'Save & New', 'Submit bill', 'Send', 'Pay vendor', 'Delete invoice', 'Post journal', 'Approve']) assert.equal(isCommitControl(label), true, label);
  for (const label of ['Search mail', 'Add New Bill', 'Invoice NS-1042', 'Vendor']) assert.equal(isCommitControl(label), false, label);
});
test('bridge rejects malformed or oversized task requests', () => {
  assert.equal(ClientMessageSchema.safeParse({ type: 'start', prompt: 'read' }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'start', workspaceId: 'close', prompt: 'x'.repeat(12001) }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'hello', token: 'token', clientId: 'client' }).success, true);
});
test('bill preparation preserves existing user input while allowing search queries', () => {
  assert.equal(canReplaceValue('Invoice number', 'NS-1041', 'NS-1042'), false);
  assert.equal(canReplaceValue('Amount', '', '850.00'), true);
  assert.equal(canReplaceValue('Currency', 'USD', 'USD'), true);
  assert.equal(canReplaceValue('Search mail', 'old query', 'new query'), true);
});
