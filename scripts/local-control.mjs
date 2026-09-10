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
} else if (command === 'result') {
  const task = state.tasks.find(t => t.id === process.argv[3]); if (!task) throw new Error('Task not found.');
  console.log(JSON.stringify({ id: task.id, status: task.status, activity: task.activity, messages: task.messages, error: task.error }, null, 2));
} else throw new Error('Use status, inspect-netsuite, or result TASK_ID.');
