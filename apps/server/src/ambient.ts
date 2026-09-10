import { createHash, randomUUID } from 'node:crypto';
import { assertTarget, defaultAmbientPreferences, type AmbientPreferences, type AmbientStatus, type PageContext, type Suggestion, type Workspace } from '@ambient/shared';
import { AmbientDecisionSchema, type AmbientDriver, type AmbientEvent } from './ambient-agent.js';
import type { Store } from './store.js';

type PageMemory = { url: string; title: string; count: number; lastSeen: number; visitId: string; text: string; hash: string; image?: string };
type Memory = { summary: string; pages: Record<string, PageMemory>; recent: AmbientStatus['recent']; offered: Record<string, number>; responded?: Record<string, number>; lastChecked: number | null; reason: string };
const emptyMemory = (): Memory => ({ summary: '', pages: {}, recent: [], offered: {}, lastChecked: null, reason: 'Waiting for a page observation.' });
export class Ambient {
  private workspace?: Workspace; private connected = false; private taskActive = false;
  private memory = emptyMemory(); private prefs = defaultAmbientPreferences();
  private signature = ''; private epoch = 0; private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>; private lastAttempt = 0;
  private pending = new Map<number, AmbientEvent>(); private latest = new Map<number, AmbientEvent>();
  private baselineTabs = new Set<number>(); private error?: string;
  private reviewTabs = new Set<number>();
  constructor(private store: Store, private driver: AmbientDriver, private model: string, private apiReady: boolean,
    private changed: () => void, private offer: (suggestion: Suggestion) => void,
    private getSuggestions: () => Suggestion[] = () => []) {}
  get status(): AmbientStatus | undefined {
    if (!this.workspace) return;
    return { workspaceId: this.workspace.id, preferences: this.prefs, epoch: this.epoch,
      status: this.taskActive ? 'task_active' : !this.enabled ? 'paused' : this.error ? 'error' : this.controller ? 'evaluating' : 'watching',
      summary: this.memory.summary, reason: this.memory.reason, lastChecked: this.memory.lastChecked, error: this.error,
      recent: this.memory.recent.slice(-20).reverse(),
      visits: Object.values(this.memory.pages).sort((a,b) => b.lastSeen - a.lastSeen).slice(0,10).map(({ url,title,count,lastSeen }) => ({ url,title,count,lastSeen })),
    };
  }
  private get enabled() { return !!this.workspace && this.connected && !this.workspace.paused && this.prefs.enabled && this.prefs.instructions.some(i => i.enabled) && !this.taskActive; }
  update(workspace: Workspace | undefined, connected: boolean, taskActive: boolean) {
    const signature = JSON.stringify([workspace?.id, workspace?.paused, workspace?.tabs.map(t => [t.id,t.scope,t.paused]), connected, taskActive]);
    if (signature === this.signature) return;
    const switched = workspace?.id !== this.workspace?.id;
    this.cancel(); this.signature = signature; this.connected = connected; this.taskActive = taskActive;
    if (switched) {
      this.memory = workspace ? this.store.get<Memory>(`ambient:memory:${workspace.id}`, emptyMemory()) : emptyMemory();
      this.prefs = workspace ? this.store.get<AmbientPreferences>(`ambient:preferences:${workspace.id}`, defaultAmbientPreferences()) : defaultAmbientPreferences();
      this.latest.clear(); this.baselineTabs.clear(); this.error = undefined;
    }
    this.workspace = workspace ? structuredClone(workspace) : undefined;
    if (taskActive) this.baselineTabs = new Set(workspace?.tabs.map(t => t.id));
  }
  settings(preferences: AmbientPreferences) {
    if (!this.workspace) throw new Error('Select a workspace first.');
    this.cancel(); this.prefs = preferences; this.error = undefined;
    this.reviewTabs = new Set(this.workspace.tabs.map(t => t.id));
    this.store.set(`ambient:preferences:${this.workspace.id}`, preferences);
    this.record('settings', 'Updated standing help instructions.'); this.changed();
  }
  forget() {
    this.cancel(); this.memory = emptyMemory(); this.latest.clear(); this.baselineTabs = new Set(this.taskActive ? this.workspace?.tabs.map(t => t.id) : []); this.error = undefined;
    this.persist(); this.changed();
  }
  private persist() { if (this.workspace) this.store.set(`ambient:memory:${this.workspace.id}`, this.memory); }
  record(kind: string, text: string, workspaceId = this.workspace?.id) {
    if (workspaceId && workspaceId !== this.workspace?.id) {
      const memory = this.store.get<Memory>(`ambient:memory:${workspaceId}`, emptyMemory());
      memory.recent = [...memory.recent, { at: Date.now(), kind, text: text.slice(0,1500) }].slice(-60);
      this.store.set(`ambient:memory:${workspaceId}`, memory); return;
    }
    this.memory.recent.push({ at: Date.now(), kind, text: text.slice(0,1500) });
    this.memory.recent = this.memory.recent.slice(-60); this.persist();
  }
  dismiss(suggestion: Suggestion, response = 'Dismissed') {
    this.memory.responded ??= {};
    this.memory.responded[suggestion.key] = Date.now(); this.record('response', `${response}: ${suggestion.title}`);
  }
  observe(context: PageContext) {
    if (!this.enabled || typeof context.text !== 'string' || (context.ambientEpoch !== undefined && context.ambientEpoch !== this.epoch)) return;
    try { assertTarget(this.workspace, this.workspace!.id, { id: context.tabId, url: context.url, title: context.title }); } catch { return; }
    const text = context.text.trim().slice(0,12000);
    const hash = createHash('sha256').update(text).update(context.image ?? '').digest('hex');
    const pageKey = createHash('sha256').update(context.url).digest('hex');
    const previous = this.memory.pages[pageKey];
    const visitId = context.visitId ?? context.version;
    const baseline = context.baseline || this.baselineTabs.has(context.tabId);
    this.baselineTabs.delete(context.tabId);
    const sameDocumentReload = visitId.endsWith('|initial') && previous?.visitId.split('|')[0] === visitId.split('|')[0];
    const newVisit = !baseline && !sameDocumentReload && (!previous || previous.visitId !== visitId);
    const count = (previous?.count ?? 0) + (newVisit ? 1 : 0);
    const event: AmbientEvent = { tabId: context.tabId, url: context.url, title: context.title, visitId, hash,
      kind: context.kind, text, previousText: previous && Date.now() - previous.lastSeen < 86400000 ? previous.text : null,
      image: context.image, previousImage: previous && Date.now() - previous.lastSeen < 86400000 ? previous.image : undefined,
      visitCount: count, newVisit, at: context.observedAt };
    this.memory.pages[pageKey] = { url: context.url, title: context.title, count, lastSeen: Date.now(), visitId, text, hash, image: context.image };
    this.memory.pages = Object.fromEntries(Object.entries(this.memory.pages).sort((a,b) => b[1].lastSeen-a[1].lastSeen).slice(0,100));
    // Keep at most four visual baselines per workspace; images never enter UI state.
    Object.values(this.memory.pages).filter(p => p.image).slice(4).forEach(p => { delete p.image; });
    this.memory.offered = Object.fromEntries(Object.entries(this.memory.offered).filter(([,at]) => Date.now()-at < 86400000).slice(-100));
    this.memory.responded = Object.fromEntries(Object.entries(this.memory.responded ?? {}).filter(([,at]) => Date.now()-at < 86400000).slice(-100));
    this.latest.set(context.tabId, event);
    if (baseline) { this.pending.delete(context.tabId); this.memory.reason = 'Refreshed the baseline after execution; agent changes were not evaluated.'; this.persist(); this.changed(); return; }
    const requestedReview = this.reviewTabs.delete(context.tabId);
    if (!newVisit && previous?.hash === hash && !requestedReview) return;
    if (newVisit) this.record('visit', `Observed visit ${count}: ${context.title}`);
    const queued = this.pending.get(context.tabId);
    if (queued?.url === event.url && queued.visitId === event.visitId) {
      event.newVisit ||= queued.newVisit;
      event.previousText = queued.previousText;
      event.previousImage = queued.previousImage;
    }
    this.pending.set(context.tabId, event); this.persist(); this.schedule(); this.changed();
  }
  private schedule() {
    if (!this.enabled || this.timer || this.controller || !this.pending.size) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.evaluate(); }, Math.max(2500, this.lastAttempt + 15000 - Date.now()));
    this.timer.unref?.();
  }
  async evaluate() {
    if (!this.enabled || this.controller || !this.pending.size || !this.workspace) return;
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    if (!this.apiReady) { this.error = 'Add an API key to enable ambient evaluation.'; this.pending.clear(); this.changed(); return; }
    const events = [...this.pending.values()].slice(0,4); for (const event of events) this.pending.delete(event.tabId);
    const controller = new AbortController(), epoch = this.epoch;
    this.controller = controller; this.lastAttempt = Date.now(); this.error = undefined; this.changed();
    const timeout = setTimeout(() => controller.abort(new Error('Ambient evaluation timed out.')), 60000);
    try {
      const decision = AmbientDecisionSchema.parse(await this.driver({ workspace: this.workspace, preferences: this.prefs, model: this.model,
        signal: controller.signal, summary: this.memory.summary, recent: this.memory.recent.slice(-15), events,
        pendingSuggestions: this.getSuggestions().filter(s => s.workspaceId === this.workspace!.id && Date.now()-s.createdAt < 600000)
          .map(({ id, tabId, title, sourceUrl, visitId }) => ({ id, tabId, title, sourceUrl, visitId })) }));
      if (controller.signal.aborted || this.epoch !== epoch || !this.enabled) return;
      this.memory.summary = decision.summary; this.memory.reason = decision.reason; this.memory.lastChecked = Date.now();
      this.record('evaluation', decision.reason || 'No useful intervention identified.');
      if (decision.decision !== 'quiet') {
        const event = events.find(e => e.tabId === decision.tabId), latest = this.latest.get(decision.tabId);
        const instruction = this.prefs.instructions.find(i => i.id === decision.instructionId && i.enabled);
        if (!event || !latest || event.url !== latest.url || event.visitId !== latest.visitId || event.hash !== latest.hash || !instruction || decision.options.length < 2 || !decision.entityKey || !decision.title) return;
        const key = `${this.workspace.id}:${instruction.id}:${decision.entityKey.toLowerCase().trim()}`;
        if (this.getSuggestions().some(s => s.key === key && Date.now()-s.createdAt < 600000)) return;
        if (Date.now() - (this.memory.responded?.[key] ?? 0) < 15 * 60000) {
          this.memory.reason = 'Kept quiet because you recently accepted or declined this help.'; return;
        }
        this.memory.offered[key] = Date.now();
        this.record('suggestion', decision.title);
        this.offer({ id: randomUUID(), workspaceId: this.workspace.id, tabId: event.tabId, version: event.visitId,
          title: decision.title, detail: decision.detail, vendor: '', key, createdAt: Date.now(),
          sourceUrl: event.url, visitId: event.visitId, instructionId: instruction.id, reason: decision.reason, options: decision.options });
      }
    } catch (error) {
      if (this.epoch === epoch) { this.error = error instanceof Error ? error.message : 'Ambient evaluation failed.'; this.record('error', this.error); }
    } finally {
      clearTimeout(timeout);
      if (this.epoch === epoch) { this.controller = undefined; this.persist(); this.changed(); this.schedule(); }
    }
  }
  cancel() {
    this.epoch++; this.controller?.abort(new Error('Ambient monitoring suspended.')); this.controller = undefined;
    if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.pending.clear();
  }
}
