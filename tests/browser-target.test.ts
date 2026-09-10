import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFreshTarget, targetFingerprint, isSearchField, isSheetNameBox, isCellAddress } from '../apps/extension/src/browser-target.js';

test('Sheets navigation is limited to the real name box and a single cell address', () => {
  const attributes: Record<string, string> = { id: 't-name-box' };
  const field = { tagName: 'INPUT', getAttribute: (name: string) => attributes[name] ?? null } as unknown as HTMLElement;
  assert.equal(isSheetNameBox(field, 'https://docs.google.com/spreadsheets/d/demo/edit'), true);
  assert.equal(isSheetNameBox(field, 'https://example.com/spreadsheets/d/demo/edit'), false);
  assert.equal(isSheetNameBox(field, 'https://docs.google.com/document/d/demo/edit'), false);
  attributes.id = 't-formula-bar-input';
  assert.equal(isSheetNameBox(field, 'https://docs.google.com/spreadsheets/d/demo/edit'), false);
  for (const address of ['A6', 'C6', '$AB$123']) assert.equal(isCellAddress(address), true);
  for (const value of ['Vendor name', '=SUM(A1:A6)', 'A0', 'A6:C6', 'A6\nC6']) assert.equal(isCellAddress(value), false);
});

test('unrelated page updates do not invalidate an unchanged inspected search field', () => {
  const attributes: Record<string, string> = { type: 'text', name: 'q', 'aria-label': 'Search mail' };
  const field = { tagName: 'INPUT', value: '', getAttribute: (name: string) => attributes[name] ?? null, closest: () => null } as unknown as HTMLElement;
  const before = targetFingerprint(field, 'Search mail');
  // No page revision is part of the control fingerprint; value and semantics are.
  const input = { requestedVersion: 'inspection-1', inspectionVersion: 'inspection-1', inspectedUrl: 'https://mail.google.com/mail/u/0/#inbox', currentUrl: 'https://mail.google.com/mail/u/0/#inbox', connected: true, visible: true, before, after: targetFingerprint(field, 'Search mail') };
  assert.doesNotThrow(() => assertFreshTarget(input));
  (field as HTMLInputElement).value = 'user typed this';
  assert.throws(() => assertFreshTarget({ ...input, after: targetFingerprint(field, 'Search mail') }), /Target changed/);
  assert.throws(() => assertFreshTarget({ ...input, connected: false }), /Target changed/);
  assert.throws(() => assertFreshTarget({ ...input, currentUrl: 'https://mail.google.com/mail/u/0/#sent' }), /Page or inspection changed/);
  assert.throws(() => assertFreshTarget({ ...input, requestedVersion: 'older-inspection' }), /Page or inspection changed/);
  (field as HTMLInputElement).value = '';
  attributes.disabled = '';
  assert.notEqual(before, targetFingerprint(field, 'Search mail'));
});

test('Gmail search is recognized even when its label is Ask Gmail, without allowing ordinary form submission', () => {
  const attributes: Record<string, string> = { name: 'q', type: 'text' };
  const field = { tagName: 'INPUT', getAttribute: (name: string) => attributes[name] ?? null, closest: () => null } as unknown as HTMLElement;
  assert.equal(isSearchField(field, 'Ask Gmail', 'mail.google.com'), true);
  assert.equal(isSearchField(field, 'Ask Gmail', 'example.com'), false);
  attributes.name = 'memo';
  assert.equal(isSearchField(field, 'Memo', 'mail.google.com'), false);
  assert.equal(isSearchField(field, 'Memo', 'demo.app.netsuite.com'), false);
  attributes.type = 'search';
  assert.equal(isSearchField(field, 'Look up', 'example.com'), true);
});
