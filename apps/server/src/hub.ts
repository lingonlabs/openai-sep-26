import { createHash, randomUUID } from 'node:crypto';
import { assertTarget, withinScope, ObservationSchema, resumeTaskPrompt, type BrowserTab, type Workspace, type PageContext, type Suggestion, type Task, type ServerMessage, type ServerState, type ClientMessage, type BrowserAction, type BrowserObservation } from '@ambient/shared';
import type { AgentInputItem } from '@openai/agents';
import type { Store } from './store.js';
import type { AgentDriver } from './agent.js';
import { Ambient } from './ambient.js';
import { driveAmbient, type AmbientDriver } from './ambient-agent.js';
import { CompletionReviewSchema, reviewCompletion, type CompletionReviewer, type CompletionReview } from './completion-review.js';

type Pending = { resolve: (value: BrowserObservation) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export class Hub {
  workspaces: Workspace[] = []; tabs: BrowserTab[] = []; activeId: string | null = null;
  tasks: Task[]; suggestions: Suggestion[] = []; running: { task: Task; controller: AbortController } | null = null;
  private contexts = new Map<number, PageContext>();
  private observations = new Map<number, BrowserObservation>();
  readonly ambient: Ambient;
  private pending = new Map<string, Pending>();
  send: (message: ServerMessage) => void = () => {};
  connected = false;
  constructor(readonly store: Store, readonly driver: AgentDriver, readonly model: string, readonly apiReady: boolean, ambientDriver: AmbientDriver = driveAmbient, private reviewer: CompletionReviewer = reviewCompletion) {
    this.tasks = store.tasks().map(task => task.status === 'running' ? { ...task, status: 'stopped', error: 'Backend restarted. Review the browser before continuing.' } : task);
    for (const task of this.tasks) {
      if (task.status === 'blocked' && !task.handoff) {
        const lastText = [...task.messages].reverse().find(m => m.role === 'assistant')?.text ?? '';
        task.handoff = { kind: /Automatic recovery stopped|minute.*limit/i.test(task.error ?? '') ? 'limit' : /review failed/i.test(task.error ?? '') ? 'review_error' : 'user',
          reason: task.error ?? 'The task needs your attention.', nextStep: lastText.match(/\*\*(?:Remaining step|Next step needed):\*\*\s*([\s\S]+)$/)?.[1] ?? 'Tell me what changed, then continue the task.' };
      }
    }
    this.ambient = new Ambient(store, ambientDriver, model, apiReady, () => this.publish(), suggestion => { this.suggestions = [suggestion]; this.publish(); }, () => this.suggestions);
  }
  state(): ServerState { return { apiReady: this.apiReady, model: this.model, tasks: this.tasks, suggestions: this.suggestions, runningTaskId: this.running?.task.id ?? null, ambient: this.ambient.status }; }
  publish() { this.ambient.update(this.workspaces.find(w => w.id === this.activeId), this.connected, !!this.running); this.store.set('tasks', this.tasks.slice(0, 50)); this.send({ type: 'state', state: this.state() }); }
  async receive(message: ClientMessage) {
    if (message.type === 'sync') {
      this.workspaces = message.workspaces; this.tabs = message.tabs; this.activeId = message.activeWorkspaceId;
      for (const [id, context] of this.contexts) {
        if (this.tabs.find(t => t.id === id)?.url !== context.url) { this.contexts.delete(id); }
      }
      const active = this.workspaces.find(w => w.id === this.activeId);
      if (this.running && (this.running.task.workspaceId !== this.activeId || active?.paused || !active)) this.stop('Workspace paused or switched.');
      if (this.running) {
        const old = this.store.get<Workspace | null>('running-scope', null);
        if (old && JSON.stringify(old.tabs) !== JSON.stringify(active?.tabs)) this.stop('Workspace tabs changed.');
      }
      this.retainSuggestions(s => { try { const tab = this.tabs.find(t => t.id === s.tabId); assertTarget(this.workspaces.find(w => w.id === s.workspaceId), this.activeId, tab); return s.sourceUrl === tab?.url && Date.now()-s.createdAt < 600000; } catch { return false; } });
      this.publish();
    } else if (message.type === 'context') this.observe(message.context);
    else if (message.type === 'dismiss') {
      const suggestion = this.suggestions.find(s => s.id === message.id);
      if (suggestion) this.ambient.dismiss(suggestion);
      this.suggestions = this.suggestions.filter(s => s.id !== message.id); this.publish();
    } else if (message.type === 'ambient:settings' || message.type === 'ambient:forget') {
      if (message.workspaceId !== this.activeId) throw new Error('Select that workspace first.');
      this.suggestions = [];
      if (message.type === 'ambient:settings') this.ambient.settings(message.preferences); else this.ambient.forget();
    } else if (message.type === 'reply' || message.type === 'resume') {
      const task = this.tasks.find(t => t.id === message.taskId && t.workspaceId === message.workspaceId);
      const workspace = this.workspaces.find(w => w.id === message.workspaceId);
      if (!task || workspace?.id !== this.activeId || workspace.paused || !this.connected) throw new Error('Select the task’s active workspace and reconnect before replying.');
      const prompt = message.type === 'resume' ? resumeTaskPrompt(task) : message.prompt;
      if (this.running) {
        if (this.running.task.id !== task.id) throw new Error('A different task is working. Stop it before continuing this one.');
        if (this.running.controller.signal.aborted) throw new Error('The task is stopping. Send the update once it has stopped.');
        task.queuedReplies ??= [];
        if (task.queuedReplies.length >= 5) throw new Error('Five replies are already queued. Wait for the current step to finish.');
        task.queuedReplies.push(prompt); this.publish();
      } else await this.start({ type: 'start', workspaceId: task.workspaceId, taskId: task.id, prompt });
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
    if (this.running) return;
    try { assertTarget(this.workspaces.find(w => w.id === this.activeId), this.activeId, this.tabs.find(t => t.id === context.tabId)); } catch { return; }
    const tab = this.tabs.find(t => t.id === context.tabId);
    if (!tab || tab.url !== context.url || Date.now() - context.observedAt > 60000) return;
    if (context.ambientEpoch !== undefined && context.ambientEpoch !== this.ambient.status?.epoch) return;
    this.contexts.set(context.tabId, context);
    this.retainSuggestions(s => Date.now()-s.createdAt < 600000 && (s.tabId !== context.tabId || (s.sourceUrl === context.url && s.visitId === (context.visitId ?? context.version))));
    this.ambient.observe(context); this.publish();
  }
  private retainSuggestions(keep: (suggestion: Suggestion) => boolean) {
    this.suggestions = this.suggestions.filter(s => {
      if (keep(s)) return true;
      this.ambient.record('expired', `Offer removed after page/scope change or expiry, without a user response: ${s.title}`, s.workspaceId);
      return false;
    });
  }
  stop(reason: string) {
    if (!this.running) return;
    this.running.task.error = reason;
    this.running.task.queuedReplies = [];
    this.running.controller.abort(new Error(reason));
    this.send({ type: 'cancel', taskId: this.running.task.id });
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(reason)); }
    this.pending.clear(); this.publish();
  }
  disconnect() { this.connected = false; this.stop('Browser disconnected. Reconnect and review the page before continuing.'); this.suggestions = []; this.ambient.update(this.workspaces.find(w => w.id === this.activeId), false, !!this.running); }
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
    task.progress = undefined; task.activity.push(activity); this.publish();
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
      if (!s || !context || s.sourceUrl !== context.url || s.visitId !== (context.visitId ?? context.version) || Date.now()-s.createdAt > 600000) throw new Error('This suggestion is no longer current. Inspect the page and try again.');
      this.ambient.dismiss(s, `Accepted: ${message.prompt.slice(0,500)}`);
    }
    let task = message.taskId ? this.tasks.find(t => t.id === message.taskId && t.workspaceId === workspace.id) : undefined;
    if (message.taskId && !task) throw new Error('Task not found in this workspace.');
    if (!task) {
      task = { id: randomUUID(), workspaceId: workspace.id, title: message.prompt.slice(0, 90), status: 'running', createdAt: Date.now(), updatedAt: Date.now(), messages: [], activity: [], findings: [] };
      this.tasks.unshift(task);
    }
    const controller = new AbortController(); this.running = { task, controller };
    this.store.set('running-scope', workspace); task.status = 'running'; task.error = undefined; task.readOnly = message.readOnly ?? task.readOnly ?? false;
    task.phase = 'investigating'; task.progress = undefined; task.handoff = undefined; task.runStartedAt = Date.now();
    task.messages.push({ id: randomUUID(), role: 'user', text: message.prompt });
    this.suggestions = this.suggestions.filter(s => s.workspaceId !== workspace.id);
    const addResponse = (): Task['messages'][number] => {
      const response: Task['messages'][number] = { id: randomUUID(), role: 'assistant', text: '', findingIds: [] };
      task!.messages.push(response); return response;
    };
    let assistantMessage = addResponse();
    const activityStart = task.activity.length, findingStart = task.findings.length;
    const turnObservations = new Map<number, BrowserObservation>();
    const evidence = new Set<string>();
    const reviews: CompletionReview[] = [];
    this.publish();
    const timeout = setTimeout(() => {
      task!.handoff = { kind: 'limit', reason: 'Reached the 10-minute work limit.', nextStep: reviews.at(-1)?.nextStep ?? 'Reinspect the selected tabs and continue the unfinished request.' };
      this.stop('Paused at the 10-minute work limit. Use Continue task to resume.');
    }, 600000);
    try {
      let recovery: string | undefined, prompt = message.prompt, stalledAttempts = 0, attempt = 0;
      const takeReplies = () => {
        const queued = task!.queuedReplies?.splice(0) ?? [];
        if (!queued.length) return false;
        for (const text of queued) task!.messages.push({ id: randomUUID(), role: 'user', text });
        assistantMessage.interim = true; prompt = queued.join('\n\n'); recovery = undefined;
        reviews.length = 0; stalledAttempts = 0;
        task!.phase = 'investigating'; task!.progress = 'Reading your update and continuing…';
        assistantMessage = addResponse(); this.publish(); return true;
      };
      while (true) {
        controller.signal.throwIfAborted();
        const evidenceBefore = evidence.size;
        const result = await this.driver({ prompt,
          recovery, workspace, model: this.model, signal: controller.signal,
          history: this.store.get<AgentInputItem[]>(`history:${task.id}`, []),
          memory: [this.ambient.status?.summary ?? '', ...this.store.get<string[]>(`memory:${workspace.id}`, []).slice(-8)].join('\n'),
          browser: async action => {
            const observation = await this.browser(action, task!, controller.signal); turnObservations.set(action.tabId, observation);
            const { version, ...content } = observation;
            evidence.add(createHash('sha256').update(JSON.stringify(content)).digest('hex')); return observation;
          },
          finding: finding => {
            controller.signal.throwIfAborted();
            const saved = { ...finding, id: randomUUID() }; task!.findings.push(saved); assistantMessage.findingIds!.push(saved.id); this.publish();
          },
          delta: text => { if (!controller.signal.aborted) { assistantMessage.text += text; this.send({ type: 'state', state: this.state() }); } },
        });
        controller.signal.throwIfAborted(); assistantMessage.text = result.text;
        this.store.set(`history:${task.id}`, result.history);
        if (takeReplies()) continue;
        const madeProgress = evidence.size > evidenceBefore;
        stalledAttempts = attempt === 0 || madeProgress ? 0 : stalledAttempts + 1; attempt++;
        task.phase = 'reviewing'; task.progress = 'Checking whether your request is fully handled…'; this.publish();
        let review: CompletionReview;
        try {
          review = CompletionReviewSchema.parse(await this.reviewer({ model: this.model,
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]), workspace,
            goal: (() => { const users = task!.messages.filter(m => m.role === 'user'); const original = users[0]?.text ?? message.prompt; const latest = users.at(-1)?.text; return latest && latest !== original ? `${original}\n\nLatest user direction: ${latest}` : original; })(),
            readOnly: !!task.readOnly, response: result.text, messages: task.messages,
            activity: task.activity.slice(activityStart), findings: task.findings.slice(findingStart),
            observations: [...turnObservations.values()], previousReviews: reviews,
          }));
        } catch (error) {
          controller.signal.throwIfAborted();
          if (takeReplies()) continue;
          task.status = 'blocked'; task.error = `Completion review failed: ${error instanceof Error ? error.message : 'Unknown error'}. The request has not been verified as complete.`;
          task.handoff = { kind: 'review_error', reason: task.error, nextStep: 'Retry the completion check and continue unfinished work.' }; break;
        }
        controller.signal.throwIfAborted();
        if (takeReplies()) continue;
        const repeated = reviews.some(previous => previous.nextStep.trim().toLowerCase() === review.nextStep.trim().toLowerCase());
        reviews.push(review);
        this.ambient.record('review', `${review.decision}: ${review.reason}`, workspace.id);
        if (review.decision === 'complete') { task.status = 'completed'; break; }
        if (review.decision === 'continue' && review.nextStep.trim() && !(repeated && !madeProgress) && stalledAttempts < 2) {
          assistantMessage.interim = true;
          recovery = `${review.reason}\nNext approach: ${review.nextStep}`;
          prompt = 'Continue the existing authorized request using the completion-review guidance. Reinspect before interacting.';
          task.phase = 'investigating'; task.progress = `Trying another approach: ${review.nextStep}`;
          assistantMessage = addResponse(); this.publish(); continue;
        }
        task.status = 'blocked';
        task.error = review.decision === 'continue' ? `Paused because recovery is not producing new evidence. ${review.reason}` : review.reason;
        task.handoff = { kind: review.decision === 'blocked' ? 'user' : 'stalled', reason: task.error, nextStep: review.nextStep };
        if (review.nextStep.trim()) assistantMessage.text += `\n\n**${review.decision === 'blocked' ? 'Waiting for you' : 'Paused — not currently working'}:** ${review.nextStep}`;
        break;
      }
      this.store.set(`memory:${workspace.id}`, [...this.store.get<string[]>(`memory:${workspace.id}`, []), `${task.status}: ${assistantMessage.text.slice(0, 3500)} ${task.error ?? ''}`.slice(0,4000)].slice(-8));
      if (task.status === 'blocked') this.store.set(`history:${task.id}`, [...this.store.get<AgentInputItem[]>(`history:${task.id}`, []),
        { role: 'assistant', content: `Completion check: ${task.error ?? ''}\n${reviews.at(-1)?.nextStep ?? ''}` }]);
    } catch (error) {
      task.status = controller.signal.aborted ? 'stopped' : 'failed';
      task.error = controller.signal.aborted ? task.error : error instanceof Error ? error.message : 'Investigation failed.';
      // An interrupted run may have changed the page. Continuation starts with a fresh inspection.
      if (!assistantMessage.text && !assistantMessage.findingIds?.length) task.messages.pop();
    } finally {
      clearTimeout(timeout); task.updatedAt = Date.now(); task.phase = undefined; task.progress = undefined;
      this.ambient.record('task', `${task.status}: ${task.title}. ${task.error || assistantMessage.text.slice(0,1000)}`, workspace.id);
      this.running = null; this.publish();
    }
  }
}
