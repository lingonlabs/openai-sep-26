import { ActionSchema, WorkspaceSchema, assertTarget, emptyState, scopeFor, withinScope, taskProgress, taskPresence, type BrowserCommand, type ExtensionState, type ServerMessage, type Workspace } from '@ambient/shared';

export default defineBackground(() => {
  let state: ExtensionState = structuredClone(emptyState);
  let socket: WebSocket | null = null, token = '', clientId = '', top = '58%';
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  const cancelled = new Set<string>();
  const handled = new Set<string>();
  const attached = new Set<number>();
  const injecting = new Set<number>();
  let commandQueue = Promise.resolve();
  let browserRestarted = false;
  // storage.session also clears on an unpacked extension reload. Use the actual
  // browser-start event to invalidate tab IDs; preserve selections on code reload.
  chrome.runtime.onStartup.addListener(() => {
    browserRestarted = true;
    state.workspaces = state.workspaces.map(w => ({ ...w, tabs: [], paused: true }));
    sync(); void broadcast();
    void ready.then(persist);
  });
  const ready = (async () => {
    const local = await chrome.storage.local.get(['workspaces', 'activeWorkspaceId', 'pairingToken', 'clientId', 'presenceTop']);
    const stored = WorkspaceSchema.array().safeParse(local.workspaces);
    state.workspaces = stored.success ? stored.data : [];
    if (browserRestarted) {
      state.workspaces = state.workspaces.map(w => ({ ...w, tabs: [], paused: true }));
    }
    state.activeWorkspaceId = typeof local.activeWorkspaceId === 'string' ? local.activeWorkspaceId : null;
    token = typeof local.pairingToken === 'string' ? local.pairingToken : '';
    clientId = typeof local.clientId === 'string' ? local.clientId : crypto.randomUUID();
    top = typeof local.presenceTop === 'string' ? local.presenceTop : '58%';
    await chrome.storage.local.set({ clientId });
    await refreshTabs();
    await inject();
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    chrome.alarms.create('ambient-connect', { periodInMinutes: .5 });
    if (token) connect();
  })();
  function send(message: unknown) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
  function sync() { send({ type: 'sync', workspaces: state.workspaces, activeWorkspaceId: state.activeWorkspaceId, tabs: state.tabs }); }
  async function broadcast(reset = false, baseline = false) {
    const runningTask = state.server.tasks.find(t => t.id === state.server.runningTaskId);
    const latestTask = runningTask ?? [...state.server.tasks.filter(t => t.workspaceId === state.activeWorkspaceId)].sort((a,b) => b.updatedAt-a.updatedAt)[0];
    void chrome.runtime.sendMessage({ type: 'state:changed', state }).catch(() => {});
    for (const tab of state.tabs) {
      const workspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
      const member = workspace?.tabs.find(t => t.id === tab.id);
      const active = !!member && withinScope(tab.url, member.scope);
      void chrome.tabs.sendMessage(tab.id, { type: 'presence', active, scope: member?.scope, paused: !!workspace?.paused || !!member?.paused,
        working: !!state.server.runningTaskId, taskId: state.server.runningTaskId, task: latestTask ? taskPresence(latestTask) : null, progress: runningTask ? taskProgress(runningTask) : '', error: state.error,
        ambientEnabled: state.connection === 'connected' && (state.server.ambient?.preferences.enabled ?? false) && (state.server.ambient?.preferences.instructions.some(i => i.enabled) ?? false), ambientEpoch: state.server.ambient?.epoch ?? 0, baseline,
        suggestion: state.server.suggestions.find(s => s.tabId === tab.id && s.workspaceId === workspace?.id) ?? null, top, reset,
      }, { frameId: 0 }).catch(() => {});
    }
  }
  async function inject() {
    const workspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
    if (!workspace) return;
    for (const member of workspace.tabs) {
      const tab = state.tabs.find(t => t.id === member.id);
      if (!tab || !withinScope(tab.url, member.scope) || injecting.has(member.id)) continue;
      injecting.add(member.id);
      try {
        const alive = await chrome.tabs.sendMessage(member.id, { type: 'observer:ping' }, { frameId: 0 }).catch(() => null);
        if (!alive?.ok) await chrome.scripting.executeScript({ target: { tabId: member.id }, files: ['content-scripts/observer.js'] });
      }
      catch (error) { state.error = `Cannot watch ${tab.title}. Grant site access in workspace settings. ${String(error)}`; }
      finally { injecting.delete(member.id); }
    }
    await broadcast(true);
  }
  async function persist() {
    await chrome.storage.local.set({ workspaces: state.workspaces, activeWorkspaceId: state.activeWorkspaceId });
    sync(); await inject(); await broadcast();
  }
  async function refreshTabs() {
    state.tabs = (await chrome.tabs.query({})).filter(t => t.id != null && t.url && scopeFor(t.url)).map(t => ({ id: t.id!, title: t.title ?? 'Untitled', url: t.url!, favIconUrl: t.favIconUrl }));
    const ids = new Set(state.tabs.map(t => t.id));
    state.workspaces = state.workspaces.map(w => ({ ...w, tabs: w.tabs.filter(t => ids.has(t.id)) }));
    sync(); await broadcast();
  }
  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(reconnect); state.connection = 'connecting'; void broadcast();
    const ws = new WebSocket('ws://127.0.0.1:4318/bridge'); socket = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ type: 'hello', token, clientId })); sync(); };
    ws.onmessage = event => {
      let message: ServerMessage; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'state') {
        const justConnected = state.connection !== 'connected';
        const justFinished = !!state.server.runningTaskId && !message.state.runningTaskId;
        if (message.state.runningTaskId && message.state.runningTaskId !== state.server.runningTaskId) cancelled.delete(message.state.runningTaskId);
        state.connection = 'connected'; state.error = null; state.server = message.state; void broadcast(justConnected || justFinished, justFinished);
      }
      else if (message.type === 'error') { state.error = message.message; void broadcast(); }
      else if (message.type === 'cancel') { cancelled.add(message.taskId); }
      else if (message.type === 'command') {
        commandQueue = commandQueue.then(() => execute(message)).catch(() => {});
      }
    };
    ws.onclose = event => {
      if (socket !== ws) return;
      socket = null; state.connection = 'offline'; state.server.runningTaskId = null; state.server.suggestions = [];
      state.error = event.code === 1008 ? 'Pairing rejected. Check the local token and reconnect.' : 'Local server disconnected. Start pnpm dev to reconnect.';
      void broadcast();
      if (event.code !== 1008 && token) reconnect = setTimeout(connect, 3000);
    };
    ws.onerror = () => { state.error = 'Cannot reach the local server on port 4318.'; void broadcast(); };
  }
  async function debug(tabId: number, method: string, params: Record<string, unknown>) {
    if (!attached.has(tabId)) { await chrome.debugger.attach({ tabId }, '1.3'); attached.add(tabId); }
    return await chrome.debugger.sendCommand({ tabId }, method, params) as Record<string, unknown>;
  }
  async function execute(command: BrowserCommand) {
    if (handled.has(command.id)) { send({ type: 'result', id: command.id, ok: false, error: 'Duplicate command rejected; inspect the page before retrying.' }); return; }
    handled.add(command.id); if (handled.size > 2000) handled.delete(handled.values().next().value!);
    const result = (ok: boolean, data?: unknown, error?: string) => send({ type: 'result', id: command.id, ok, data, error });
    try {
      const args = ActionSchema.parse(command.args);
      if (cancelled.has(command.taskId) || state.server.runningTaskId !== command.taskId) throw new Error('Task is no longer active.');
      const actualTab = await chrome.tabs.get(args.tabId);
      const workspace = state.workspaces.find(w => w.id === command.workspaceId);
      assertTarget(workspace, state.activeWorkspaceId, { id: args.tabId, title: actualTab.title ?? '', url: actualTab.url ?? '' });
      const member = workspace!.tabs.find(t => t.id === args.tabId)!;
      if (args.action === 'navigate') {
        if (!args.url || !withinScope(args.url, member.scope)) throw new Error('Navigation leaves this tab’s selected scope.');
        // Do not navigate away from a filled form to research elsewhere.
        await chrome.tabs.update(args.tabId, { url: args.url });
        await waitForLoad(args.tabId); await refreshTabs(); await inject();
      }
      let response = await chrome.tabs.sendMessage(args.tabId, { type: 'execute', action: args.action === 'navigate' ? { ...args, action: 'inspect' } : args }, { frameId: 0 });
      if (!response?.ok) throw new Error(response?.error ?? 'No page observation returned.');
      if (cancelled.has(command.taskId)) throw new Error('Stopped. An action may already have reached the page; inspect before continuing.');
      if (args.action === 'press') {
        if (!response.data.text.startsWith('[KEY_TARGET_VALIDATED]')) throw new Error('Keyboard target was not validated.');
        const key = args.text?.toUpperCase(); const code = key === 'ENTER' ? 13 : key === 'TAB' ? 9 : 27;
        const name = key === 'ENTER' ? 'Enter' : key === 'TAB' ? 'Tab' : 'Escape';
        await debug(args.tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code });
        await debug(args.tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code });
        // The next model step must inspect the post-key page again after any async rendering.
        response = await chrome.tabs.sendMessage(args.tabId, { type: 'execute', action: { ...args, action: 'inspect' } }, { frameId: 0 });
      }
      if (args.action === 'screenshot') {
        const shot = await debug(args.tabId, 'Page.captureScreenshot', { format: 'png' });
        response.data.image = `data:image/png;base64,${shot.data}`;
      }
      result(true, response.data);
    } catch (error) { result(false, undefined, error instanceof Error ? error.message : String(error)); }
    finally {
      for (const id of attached) { await chrome.debugger.detach({ tabId: id }).catch(() => {}); attached.delete(id); }
      await refreshTabs();
    }
  }
  async function waitForLoad(id: number) {
    for (let i = 0; i < 40; i++) { if ((await chrome.tabs.get(id)).status === 'complete') return; await new Promise(r => setTimeout(r, 200)); }
    throw new Error('Page navigation timed out.');
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'state:changed') return;
    const fromPanel = !sender.tab && sender.url?.startsWith(chrome.runtime.getURL(''));
    // Opening the side panel must happen in direct response to the user's click.
    // The manifest declares a global panel, so open it in the clicked page's window.
    // Call before waiting for storage; Chrome requires the original user gesture.
    if (message.type === 'panel:open' && sender.tab?.windowId !== undefined) {
      void chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => respond({ ok: true }), error => respond({ ok: false, error: `Chrome could not open the side panel: ${String(error)}. Use the toolbar icon or open the assistant in a tab below.` })); return true;
    }
    void ready.then(async () => {
      if (message.type === 'page:ready') { await broadcast(true); return { ok: true }; }
      if (message.type === 'page:context' && sender.tab?.id) {
        if (state.connection !== 'connected' || state.server.runningTaskId) return { ok: true };
        send({ type: 'context', context: { ...message.context, visitId: `${sender.documentId ?? sender.tab.id}|${message.context.visitId}`, tabId: sender.tab.id, url: sender.url ?? message.context.url } }); return { ok: true };
      }
      if (message.type === 'ui:get' && fromPanel) { await refreshTabs(); return state; }
      if (message.type === 'ui:pair' && fromPanel) {
        token = String(message.token).trim(); await chrome.storage.local.set({ pairingToken: token });
        const previous = socket; socket = null; previous?.close(); connect(); return { ok: true };
      }
      const active = state.workspaces.find(w => w.id === state.activeWorkspaceId);
      const pageMember = sender.tab?.id && active?.tabs.find(t => t.id === sender.tab!.id && withinScope(sender.url ?? '', t.scope));
      if (!fromPanel && !pageMember) throw new Error('This page is not selected in the workspace.');
      if (message.type === 'panel:tab') { await chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') }); return { ok: true }; }
      if (message.type === 'ui:save' && fromPanel) {
        const name = String(message.name).trim().slice(0, 80); if (!name) throw new Error('Give the workspace a name.');
        const tabs = state.tabs.filter(t => (message.tabIds as number[]).includes(t.id)).map(t => ({ id: t.id, title: t.title, scope: scopeFor(t.url)!, paused: false }));
        if (!tabs.length) throw new Error('Select at least one tab.');
        const workspace: Workspace = { id: message.id || crypto.randomUUID(), name, tabs, paused: false };
        state.workspaces = [...state.workspaces.filter(w => w.id !== workspace.id).map(w => ({ ...w, paused: true })), workspace];
        state.activeWorkspaceId = workspace.id; await persist(); return { ok: true };
      }
      if (message.type === 'ui:switch' && fromPanel) {
        state.workspaces = state.workspaces.map(w => ({ ...w, paused: w.id !== message.id })); state.activeWorkspaceId = message.id; await persist();
      } else if (message.type === 'workspace:pause' && active) { active.paused = !!message.paused; await persist(); }
      else if (message.type === 'tab:pause' && active) { const t = active.tabs.find(t => t.id === (fromPanel ? message.tabId : sender.tab?.id)); if (t) t.paused = !!message.paused; await persist(); }
      else if (message.type === 'tab:remove' && active) { active.tabs = active.tabs.filter(t => t.id !== (fromPanel ? message.tabId : sender.tab?.id)); await persist(); }
      else if (message.type === 'presence:position') { top = String(message.top); await chrome.storage.local.set({ presenceTop: top }); }
      else if (message.type === 'ui:stop') { if (state.server.runningTaskId) cancelled.add(state.server.runningTaskId); send({ type: 'stop' }); }
      else if (message.type === 'ui:dismiss') {
        if (state.connection !== 'connected') throw new Error('Connect to the local server first.');
        const suggestion = state.server.suggestions.find(s => s.id === message.id && s.workspaceId === active?.id && (fromPanel || s.tabId === sender.tab?.id));
        if (!suggestion) throw new Error('Suggestion expired.');
        send({ type: 'dismiss', id: suggestion.id }); return { ok: true, started: false };
      }
      else if ((message.type === 'ui:ambient-settings' || message.type === 'ui:ambient-forget') && fromPanel) {
        send({ type: message.type === 'ui:ambient-settings' ? 'ambient:settings' : 'ambient:forget', workspaceId: state.activeWorkspaceId, preferences: message.preferences });
      }
      else if (message.type === 'ui:accept') {
        if (state.connection !== 'connected') throw new Error('Connect to the local server first.');
        if (state.server.runningTaskId) throw new Error('A task is already running.');
        const s = state.server.suggestions.find(s => s.id === message.id && s.workspaceId === active?.id && (fromPanel || s.tabId === sender.tab?.id)); if (!s) throw new Error('Suggestion expired.');
        if (!message.text?.trim() && s.options?.[Number(message.option)]?.kind === 'dismiss') { send({ type: 'dismiss', id: s.id }); return { ok: true, started: false }; }
        const chosen = typeof message.text === 'string' && message.text.trim() ? message.text.trim() : s.options?.[Number(message.option)]?.prompt;
        if (!chosen) throw new Error('Choose an option or write what you would like help with.');
        send({ type: 'start', workspaceId: s.workspaceId, suggestionId: s.id, prompt: `${chosen}\n\nContext for this request: ${s.title}. ${s.detail}. Reinspect the selected pages before acting. Leave changes for human review; do not save, submit, or send.` });
      } else if (message.type === 'ui:reply' || message.type === 'ui:resume') {
        if (state.connection !== 'connected') throw new Error('Connect to the local server first.');
        const task = state.server.tasks.find(t => t.id === message.taskId && t.workspaceId === active?.id);
        if (!task) throw new Error('Select the task’s workspace before replying.');
        send({ type: message.type === 'ui:resume' ? 'resume' : 'reply', workspaceId: task.workspaceId, taskId: task.id, prompt: message.prompt });
      } else if (message.type === 'ui:start' && fromPanel) {
        if (state.connection !== 'connected') throw new Error('Connect to the local server first.');
        send({ type: 'start', workspaceId: state.activeWorkspaceId, prompt: message.prompt, taskId: message.taskId });
      }
      await broadcast(); return { ok: true };
    }).then(respond, error => { state.error = error instanceof Error ? error.message : String(error); void broadcast(); respond({ ok: false, error: state.error }); });
    return true;
  });
  chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.status === 'complete') void ready.then(async () => { await refreshTabs(); await inject(); }); });
  chrome.tabs.onActivated.addListener(({ tabId }) => { void ready.then(async () => { if (!state.server.runningTaskId) await chrome.tabs.sendMessage(tabId, { type: 'ambient:activated' }, { frameId: 0 }).catch(() => {}); }); });
  chrome.tabs.onRemoved.addListener(() => { void ready.then(async () => { await refreshTabs(); await persist(); }); });
  chrome.tabs.onCreated.addListener(() => { void ready.then(refreshTabs); });
  chrome.alarms.onAlarm.addListener(() => { void ready.then(() => { if (token) connect(); send({ type: 'ping' }); }); });
  setInterval(() => send({ type: 'ping' }), 20000);
});
