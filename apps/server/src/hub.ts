import { randomUUID } from 'node:crypto';
import { assertTarget, withinScope, ObservationSchema, type BrowserTab, type Workspace, type PageContext, type Suggestion, type Task, type ServerMessage, type ServerState, type ClientMessage, type BrowserAction, type BrowserObservation } from '@ambient/shared';
import type { AgentInputItem } from '@openai/agents';
import type { Store } from './store.js';
import type { AgentDriver } from './agent.js';

type Pending = { resolve: (value: BrowserObservation) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export class Hub {
  workspaces: Workspace[] = []; tabs: BrowserTab[] = []; activeId: string | null = null;
  tasks: Task[]; suggestions: Suggestion[] = []; running: { task: Task; controller: AbortController } | null = null;
  private contexts = new Map<number, PageContext>();
  private visits = new Map<number, string>();
  private observations = new Map<number, BrowserObservation>();
  private dismissed: Record<string, number>;
  private pending = new Map<string, Pending>();
  send: (message: ServerMessage) => void = () => {};
  connected = false;
  constructor(readonly store: Store, readonly driver: AgentDriver, readonly model: string, readonly apiReady: boolean) {
    this.tasks = store.tasks().map(task => task.status === 'running' ? { ...task, status: 'stopped', error: 'Backend restarted. Review the browser before continuing.' } : task);
    this.dismissed = store.get('dismissed', {});
  }
  state(): ServerState { return { apiReady: this.apiReady, model: this.model, tasks: this.tasks, suggestions: this.suggestions, runningTaskId: this.running?.task.id ?? null }; }
  publish() { this.store.set('tasks', this.tasks.slice(0, 50)); this.send({ type: 'state', state: this.state() }); }
  async receive(message: ClientMessage) {
    if (message.type === 'sync') {
      this.workspaces = message.workspaces; this.tabs = message.tabs; this.activeId = message.activeWorkspaceId;
      for (const [id, context] of this.contexts) {
        if (this.tabs.find(t => t.id === id)?.url !== context.url) { this.contexts.delete(id); this.visits.delete(id); }
      }
      const active = this.workspaces.find(w => w.id === this.activeId);
      if (this.running && (this.running.task.workspaceId !== this.activeId || active?.paused || !active)) this.stop('Workspace paused or switched.');
      if (this.running) {
        const old = this.store.get<Workspace | null>('running-scope', null);
        if (old && JSON.stringify(old.tabs) !== JSON.stringify(active?.tabs)) this.stop('Workspace tabs changed.');
      }
      this.suggestions = this.suggestions.filter(s => { try { assertTarget(this.workspaces.find(w => w.id === s.workspaceId), this.activeId, this.tabs.find(t => t.id === s.tabId)); return true; } catch { return false; } });
      this.publish();
    } else if (message.type === 'context') this.observe(message.context);
    else if (message.type === 'dismiss') {
      const suggestion = this.suggestions.find(s => s.id === message.id);
      if (suggestion) { this.dismissed[suggestion.key] = Date.now(); this.store.set('dismissed', this.dismissed); }
      this.suggestions = this.suggestions.filter(s => s.id !== message.id); this.publish();
    } else if (message.type === 'start') await this.start(message);
    else if (message.type === 'stop') this.stop('Stopped by you. Inspect any form changes before continuing.');
    else if (message.type === 'result') {
      const pending = this.pending.get(message.id); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.ok) {
        const observation = ObservationSchema.safeParse(message.data);
        if (observation.success) pending.resolve(observation.data);
        else pending.reject(new Error('Browser returned an invalid observation.'));
      }
      else pending.reject(new Error(message.error || 'Browser action failed.'));
    } else if (message.type === 'ping') this.send({ type: 'pong' });
  }
  observe(context: PageContext) {
    try { assertTarget(this.workspaces.find(w => w.id === this.activeId), this.activeId, this.tabs.find(t => t.id === context.tabId)); } catch { return; }
    const tab = this.tabs.find(t => t.id === context.tabId);
    if (!tab || tab.url !== context.url || Date.now() - context.observedAt > 60000) return;
    const previous = this.contexts.get(context.tabId);
    if (!previous || previous.kind !== context.kind || previous.visitId !== context.visitId || previous.url !== context.url)
      this.visits.set(context.tabId, randomUUID());
    this.contexts.set(context.tabId, context);
    this.suggestions = this.suggestions.filter(s => s.tabId !== context.tabId || (context.kind === 'bill_form' && s.vendor === context.vendor));
    if (context.kind !== 'bill_form' || this.running) { this.publish(); return; }
    const key = `${this.activeId}:${context.tabId}:visit:${this.visits.get(context.tabId)}:bill:${context.vendor}`;
    this.suggestions = this.suggestions.filter(s => s.tabId !== context.tabId || s.key === key);
    if (Date.now() - (this.dismissed[key] ?? 0) < 24 * 3600000 || this.suggestions.some(s => s.key === key)) return;
    this.suggestions.push({ id: randomUUID(), workspaceId: this.activeId!, tabId: context.tabId, version: context.version,
      title: context.vendor ? `Check invoices for ${context.vendor}?` : 'Check Gmail before entering this bill?',
      detail: 'I can compare emailed invoices with NetSuite and flag what may still need recording.', vendor: context.vendor, key, createdAt: Date.now() });
    this.publish();
  }
  stop(reason: string) {
    if (!this.running) return;
    this.running.task.error = reason;
    this.running.controller.abort(new Error(reason));
    this.send({ type: 'cancel', taskId: this.running.task.id });
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(reason)); }
    this.pending.clear(); this.publish();
  }
  disconnect() { this.connected = false; this.stop('Browser disconnected. Reconnect and review the page before continuing.'); this.suggestions = []; }
  private async browser(action: BrowserAction, task: Task, signal: AbortSignal): Promise<BrowserObservation> {
    signal.throwIfAborted();
    if (task.readOnly && !['inspect', 'screenshot'].includes(action.action)) throw new Error('This task is read-only. Only inspect and screenshot are permitted.');
    const workspace = this.workspaces.find(w => w.id === task.workspaceId), tab = this.tabs.find(t => t.id === action.tabId);
    assertTarget(workspace, this.activeId, tab);
    if (!this.connected) throw new Error('Extension is disconnected.');
    if (action.action === 'navigate' && (!action.url || !withinScope(action.url, workspace!.tabs.find(t => t.id === action.tabId)!.scope))) throw new Error('Navigation would leave the selected tab scope.');
    const id = randomUUID();
    const site = new URL(tab!.url).hostname;
    const appName = site === 'mail.google.com' ? 'Gmail' : site.endsWith('netsuite.com') ? 'NetSuite' : tab!.title;
    const target = this.observations.get(action.tabId)?.elements.find(e => e.ref === action.ref)?.label;
    const verbs = { inspect: 'Read', screenshot: 'View screenshot of', click: 'Click', fill: 'Fill', press: 'Press', scroll: 'Scroll', navigate: 'Open page in' };
    const activity: Task['activity'][number] = { id, text: `${verbs[action.action]} ${action.action === 'press' ? action.text + ' in ' : ''}${target ? target + ' · ' : ''}${appName}`, detail: action.action === 'fill' ? action.text ?? undefined : action.action === 'navigate' ? action.url ?? undefined : undefined, at: Date.now(), status: 'working' };
    task.activity.push(activity); this.publish();
    try {
      const observation = await new Promise<BrowserObservation>((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Browser command timed out. Inspect the page before retrying.')); }, 25000);
        this.pending.set(id, { resolve, reject, timer });
        this.send({ type: 'command', id, taskId: task.id, workspaceId: task.workspaceId, args: action });
      });
      signal.throwIfAborted(); this.observations.set(action.tabId, observation); activity.status = 'done'; this.publish(); return observation;
    } catch (error) { activity.status = 'error'; activity.error = error instanceof Error ? error.message : String(error); this.publish(); throw error; }
  }
  private async start(message: Extract<ClientMessage, { type: 'start' }>) {
    if (!this.apiReady) throw new Error('Add OPENAI_API_KEY to the backend .env and restart the server.');
    if (this.running) throw new Error('A task is already using this workspace. Stop it before starting another.');
    if (!this.connected) throw new Error('Connect the extension first.');
    const workspace = this.workspaces.find(w => w.id === message.workspaceId);
    if (!workspace || workspace.id !== this.activeId || workspace.paused || !workspace.tabs.some(t => !t.paused)) throw new Error('Select an active workspace with watched tabs.');
    if (message.suggestionId) {
      const s = this.suggestions.find(s => s.id === message.suggestionId && s.workspaceId === workspace.id);
      const context = s && this.contexts.get(s.tabId);
      if (!s || context?.kind !== 'bill_form' || context.vendor !== s.vendor) throw new Error('This suggestion is no longer current. Inspect the page and try again.');
      this.dismissed[s.key] = Date.now(); this.store.set('dismissed', this.dismissed);
    }
    let task = message.taskId ? this.tasks.find(t => t.id === message.taskId && t.workspaceId === workspace.id) : undefined;
    if (message.taskId && !task) throw new Error('Task not found in this workspace.');
    if (!task) {
      task = { id: randomUUID(), workspaceId: workspace.id, title: message.prompt.slice(0, 90), status: 'running', createdAt: Date.now(), updatedAt: Date.now(), messages: [], activity: [], findings: [] };
      this.tasks.unshift(task);
    }
    const controller = new AbortController(); this.running = { task, controller };
    this.store.set('running-scope', workspace); task.status = 'running'; task.error = undefined; task.readOnly = message.readOnly ?? false;
    task.messages.push({ role: 'user', text: message.prompt });
    this.suggestions = this.suggestions.filter(s => s.workspaceId !== workspace.id);
    const assistantMessage = { role: 'assistant' as const, text: '' }; task.messages.push(assistantMessage);
    this.publish();
    const timeout = setTimeout(() => this.stop('Task reached its 5-minute limit. Review progress before continuing.'), 300000);
    try {
      const result = await this.driver({ prompt: message.prompt, workspace, model: this.model, signal: controller.signal,
        history: this.store.get<AgentInputItem[]>(`history:${task.id}`, []),
        memory: this.store.get<string[]>(`memory:${workspace.id}`, []).slice(-8).join('\n'),
        browser: action => this.browser(action, task!, controller.signal),
        finding: finding => { task!.findings.push({ ...finding, id: randomUUID() }); this.publish(); },
        delta: text => { assistantMessage.text += text; this.send({ type: 'state', state: this.state() }); },
      });
      controller.signal.throwIfAborted();
      assistantMessage.text = result.text; task.status = 'completed';
      this.store.set(`history:${task.id}`, result.history);
      this.store.set(`memory:${workspace.id}`, [...this.store.get<string[]>(`memory:${workspace.id}`, []), result.text.slice(0, 4000)].slice(-8));
    } catch (error) {
      task.status = controller.signal.aborted ? 'stopped' : 'failed';
      task.error = controller.signal.aborted ? task.error : error instanceof Error ? error.message : 'Investigation failed.';
      // An interrupted run may have changed the page. Continuation starts with a fresh inspection.
      if (!assistantMessage.text) task.messages.pop();
    } finally {
      clearTimeout(timeout); task.updatedAt = Date.now(); this.running = null; this.publish();
    }
  }
}
