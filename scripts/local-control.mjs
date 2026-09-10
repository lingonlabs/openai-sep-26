import { readFileSync } from 'node:fs';
const token = readFileSync(new URL('../.local/pairing-token', import.meta.url), 'utf8').trim();
const endpoint = 'http://127.0.0.1:4318';
async function request(path, body) {
  const result = await fetch(endpoint + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await result.json(); if (!result.ok) throw new Error(data.error ?? `HTTP ${result.status}`); return data;
}
const state = await request('/control/state');
const command = process.argv[2] ?? 'status';
if (command === 'status') {
  console.log(JSON.stringify({ connected: state.connected, activeWorkspaceId: state.activeWorkspaceId,
    ambient: state.ambient && { status: state.ambient.status, lastChecked: state.ambient.lastChecked, reason: state.ambient.reason, error: state.ambient.error, rememberedPages: state.ambient.visits.length },
    workspaces: state.workspaces.map(w => ({ id: w.id, name: w.name, paused: w.paused, tabs: w.tabs.map(t => ({ id: t.id, title: t.title, scope: t.scope, paused: t.paused })) })),
    tasks: state.tasks.map(t => ({ id: t.id, status: t.status, title: t.title, error: t.error, actions: t.activity.length })),
  }, null, 2));
} else if (command === 'inspect-netsuite') {
  const workspace = state.workspaces.find(w => w.id === state.activeWorkspaceId && !w.paused);
  const tab = workspace?.tabs.find(t => !t.paused && /(^|\.)netsuite\.com$/.test(new URL(t.scope).hostname));
  if (!tab) throw new Error('Select the NetSuite tab in an active Ambient workspace first.');
  const result = await request('/control/start', { workspaceId: workspace.id, readOnly: true,
    prompt: `This is a read-only connection test of the extension. Inspect ONLY tab ${tab.id} (${tab.title}) using browser_action. Identify the current NetSuite page and list its available navigation and form controls. Do not click, type, navigate, save, or change anything. Use only inspect, and screenshot if needed. Return a concise account of what is actually visible. Do not inspect other tabs.` });
  console.log(JSON.stringify(result));
} else if (command === 'test-gmail-search') {
  const workspace = state.workspaces.find(w => w.id === state.activeWorkspaceId && !w.paused);
  const tab = workspace?.tabs.find(t => !t.paused && new URL(t.scope).hostname === 'mail.google.com');
  if (!tab) throw new Error('Select Gmail in an active Ambient workspace first.');
  console.log(JSON.stringify(await request('/control/start', { workspaceId: workspace.id,
    prompt: `Test the updated browser search interaction ONLY in Gmail tab ${tab.id}. Inspect, fill the visible Search mail field with "invoice newer_than:90d", then use ENTER on the inspected search field and inspect the results. Verify that the query actually applied. Stop after verifying search or after two failed attempts, and report the exact blocker if any. Do not inspect other tabs, open messages, send anything, change settings, or modify messages. This is a short regression test of search only.` })));
} else if (command === 'test-sheet-vision') {
  const workspace = state.workspaces.find(w => w.id === state.activeWorkspaceId && !w.paused);
  const tab = workspace?.tabs.find(t => !t.paused && new URL(t.scope).hostname === 'docs.google.com');
  if (!tab) throw new Error('Select the onboarding Sheet in an active Ambient workspace first.');
  console.log(JSON.stringify(await request('/control/start', { workspaceId: workspace.id, readOnly: true,
    prompt: `Read-only visual capture test ONLY in selected Google Sheets tab ${tab.id}. Inspect once, then take a screenshot using browser_action even if page text is sparse. Report whether actual grid cells are legible in the image, the visible column headers, the visible populated row numbers and vendor names, and any selected range or scroll position visible. Distinguish screenshot evidence from DOM text. This is a baseline, not proof any row was newly added. Do not click, type, scroll, navigate, or modify anything. Do not inspect other tabs. Stop after these two observations and your report; no invoice work or NetSuite checks are requested.` })));
} else if (command === 'visual-status') {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(new URL('../.local/ambient.sqlite', import.meta.url).pathname, { readOnly: true });
  try {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(`ambient:memory:${state.activeWorkspaceId}`);
    const memory = row ? JSON.parse(row.value) : { pages: {} };
    console.log(JSON.stringify({ connected: state.connected, runningTaskId: state.runningTaskId,
      status: state.ambient?.status, reason: state.ambient?.reason, lastChecked: state.ambient?.lastChecked,
      visualBaselines: Object.values(memory.pages).filter(p => p.image).map(p => ({ title: p.title, lastSeen: p.lastSeen, bytes: p.image.length })),
      suggestions: state.suggestions.map(s => ({ title: s.title, detail: s.detail, options: s.options?.map(o => o.label) })),
    }, null, 2));
  } finally { db.close(); }
} else if (command === 'ambient') {
  console.log(JSON.stringify(state.ambient ?? { status: 'unavailable' }, null, 2));
} else if (command === 'result') {
  const task = state.tasks.find(t => t.id === process.argv[3]); if (!task) throw new Error('Task not found.');
  console.log(JSON.stringify({ id: task.id, status: task.status, activity: task.activity, messages: task.messages, error: task.error }, null, 2));
} else throw new Error('Use status, ambient, visual-status, inspect-netsuite, test-gmail-search, test-sheet-vision, or result TASK_ID.');
