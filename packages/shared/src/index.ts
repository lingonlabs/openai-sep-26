import { z } from 'zod';

export const TabSchema = z.object({ id: z.number().int(), title: z.string(), url: z.string(), favIconUrl: z.string().optional() });
export type BrowserTab = z.infer<typeof TabSchema>;
export const WorkspaceSchema = z.object({
  id: z.string(), name: z.string().min(1).max(80), paused: z.boolean(),
  tabs: z.array(z.object({ id: z.number().int(), scope: z.string(), title: z.string(), paused: z.boolean() })).max(20),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
export const ContextSchema = z.object({
  tabId: z.number().int(), url: z.string(), title: z.string(), version: z.string(),
  kind: z.enum(['bill_form', 'page']), vendor: z.string().max(300), observedAt: z.number(), visitId: z.string().optional(),
  text: z.string().max(16000).optional(), baseline: z.boolean().optional(), ambientEpoch: z.number().optional(),
  image: z.string().startsWith('data:image/jpeg;base64,').max(2 * 1024 * 1024).optional(),
});
export type PageContext = z.infer<typeof ContextSchema>;
export const ActionSchema = z.object({
  tabId: z.number().int(), action: z.enum(['inspect', 'click', 'fill', 'press', 'scroll', 'navigate', 'screenshot']),
  ref: z.string().nullable(), text: z.string().max(12000).nullable(), url: z.string().nullable(),
  version: z.string().nullable(),
});
export type BrowserAction = z.infer<typeof ActionSchema>;
export type BrowserCommand = { type: 'command'; id: string; taskId: string; workspaceId: string; args: BrowserAction };
export type BrowserObservation = {
  url: string; title: string; version: string; text: string;
  elements: { ref: string; tag: string; role: string; label: string; value?: string; inputType?: string }[];
  image?: string;
};
export const ObservationSchema = z.object({
  url: z.string().url(), title: z.string(), version: z.string(), text: z.string().max(30000),
  elements: z.array(z.object({ ref: z.string(), tag: z.string(), role: z.string(), label: z.string(), value: z.string().optional(), inputType: z.string().optional() })).max(200),
  image: z.string().startsWith('data:image/png;base64,').max(10 * 1024 * 1024).optional(),
});
export const FindingSchema = z.object({
  vendor: z.string(), invoice: z.string(), amount: z.string(),
  status: z.enum(['candidate', 'recorded', 'onboarding', 'uncertain']),
  explanation: z.string(), sources: z.array(z.object({ title: z.string(), url: z.string().url() })).min(1),
});
export type Finding = z.infer<typeof FindingSchema> & { id: string };
export const HelpInstructionSchema = z.object({ id: z.string().max(100), text: z.string().min(1).max(2000), enabled: z.boolean() });
export type HelpInstruction = z.infer<typeof HelpInstructionSchema>;
export const AmbientPreferencesSchema = z.object({ enabled: z.boolean(), instructions: z.array(HelpInstructionSchema).max(12) });
export type AmbientPreferences = z.infer<typeof AmbientPreferencesSchema>;
export type ActionOption = { label: string; prompt: string; kind?: 'task' | 'dismiss' };
export type AmbientStatus = {
  workspaceId: string; preferences: AmbientPreferences; status: 'watching' | 'evaluating' | 'paused' | 'task_active' | 'error';
  summary: string; reason: string; lastChecked: number | null; error?: string; epoch: number;
  recent: { at: number; kind: string; text: string }[];
  visits: { url: string; title: string; count: number; lastSeen: number }[];
};
export const defaultAmbientPreferences = (): AmbientPreferences => ({ enabled: true, instructions: [
  { id: 'invoices', text: 'When I open an invoice or a new bill, offer to check the supporting email and whether it is already recorded in NetSuite.', enabled: true },
  { id: 'vendors', text: 'When a new vendor appears in my onboarding sheet, offer to check NetSuite and prepare a vendor record for review.', enabled: true },
  { id: 'revisits', text: 'If I repeatedly return to the same page or seem stuck after a failed task, ask whether I would like help. Do not assume something is wrong.', enabled: true },
] });
export type Suggestion = { id: string; workspaceId: string; tabId: number; version: string; title: string; detail: string; vendor: string; key: string; createdAt: number;
  options?: ActionOption[]; sourceUrl?: string; visitId?: string; instructionId?: string; reason?: string };
export type TaskHandoff = { kind: 'user' | 'limit' | 'stalled' | 'review_error'; reason: string; nextStep: string };
export type Task = {
  id: string; workspaceId: string; title: string; status: 'running' | 'completed' | 'blocked' | 'stopped' | 'failed';
  createdAt: number; updatedAt: number; messages: { id?: string; role: 'user' | 'assistant'; text: string; findingIds?: string[]; interim?: boolean }[];
  activity: { id: string; text: string; at: number; status: 'working' | 'done' | 'error'; detail?: string; error?: string }[];
  findings: Finding[]; error?: string; readOnly?: boolean;
  phase?: 'investigating' | 'reviewing'; progress?: string;
  handoff?: TaskHandoff; queuedReplies?: string[]; runStartedAt?: number;
};
export type ServerState = { apiReady: boolean; model: string; tasks: Task[]; suggestions: Suggestion[]; runningTaskId: string | null; ambient?: AmbientStatus };
export type ExtensionState = {
  workspaces: Workspace[]; activeWorkspaceId: string | null; tabs: BrowserTab[];
  connection: 'offline' | 'connecting' | 'connected'; server: ServerState; error: string | null;
};
export const emptyServer: ServerState = { apiReady: false, model: 'gpt-6-astra', tasks: [], suggestions: [], runningTaskId: null };
export const emptyState: ExtensionState = { workspaces: [], activeWorkspaceId: null, tabs: [], connection: 'offline', server: emptyServer, error: null };

export function taskProgress(task: Task): string {
  const latest = task.activity.at(-1);
  if (task.status !== 'running') return task.status === 'completed' ? 'Investigation finished' : task.error || 'Investigation stopped';
  if (task.progress) return task.progress;
  if (!latest) return 'Starting the investigation…';
  if (latest.status === 'working') return latest.text;
  if (latest.status === 'error') return 'Reviewing a browser error and deciding how to continue…';
  return `Considering the next step after: ${latest.text}`;
}

export function taskStateLabel(task: Pick<Task, 'status' | 'phase' | 'handoff'>): string {
  if (task.status === 'running') return task.phase === 'reviewing' ? 'Checking completion' : 'Working';
  if (task.status === 'completed') return 'Completed';
  if (task.status === 'blocked') return task.handoff?.kind === 'user' ? 'Waiting for you' : 'Paused · needs continuation';
  return task.status === 'stopped' ? 'Stopped' : 'Could not finish';
}

export type TaskPresence = Pick<Task, 'id' | 'status' | 'phase' | 'handoff' | 'error'> & { queuedReplyCount: number };
export function taskPresence(task: Task): TaskPresence {
  return { id: task.id, status: task.status, phase: task.phase, handoff: task.handoff, error: task.error, queuedReplyCount: task.queuedReplies?.length ?? 0 };
}

export function resumeTaskPrompt(task: Task): string {
  return `${task.handoff?.kind === 'user' ? 'I have completed the step you requested.' : 'Continue the unfinished task.'} Reinspect the selected tabs and verify the current state before acting. Continue the original request within its existing scope.${task.handoff?.nextStep ? `\nPending step: ${task.handoff.nextStep}` : ''}`;
}

export function findingsForMessage(task: Task, index: number): { findings: Finding[]; legacy: boolean } {
  const message = task.messages[index];
  if (message?.role !== 'assistant') return { findings: [], legacy: false };
  const ids = new Set(message.findingIds ?? []);
  const linked = task.findings.filter(finding => ids.has(finding.id));
  const lastAssistant = task.messages.map(m => m.role).lastIndexOf('assistant');
  if (index !== lastAssistant) return { findings: linked, legacy: false };
  const claimed = new Set(task.messages.flatMap(m => m.findingIds ?? []));
  const older = task.findings.filter(finding => !claimed.has(finding.id));
  return { findings: [...linked, ...older], legacy: older.length > 0 };
}

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), token: z.string(), clientId: z.string() }),
  z.object({ type: z.literal('sync'), workspaces: z.array(WorkspaceSchema).max(20), activeWorkspaceId: z.string().nullable(), tabs: z.array(TabSchema).max(500) }),
  z.object({ type: z.literal('context'), context: ContextSchema }),
  z.object({ type: z.literal('dismiss'), id: z.string() }),
  z.object({ type: z.literal('ambient:settings'), workspaceId: z.string(), preferences: AmbientPreferencesSchema }),
  z.object({ type: z.literal('ambient:forget'), workspaceId: z.string() }),
  z.object({ type: z.literal('start'), workspaceId: z.string(), prompt: z.string().min(1).max(12000), taskId: z.string().optional(), suggestionId: z.string().optional(), readOnly: z.boolean().optional() }),
  z.object({ type: z.literal('reply'), workspaceId: z.string(), taskId: z.string(), prompt: z.string().trim().min(1).max(12000) }),
  z.object({ type: z.literal('resume'), workspaceId: z.string(), taskId: z.string() }),
  z.object({ type: z.literal('stop') }),
  z.object({ type: z.literal('result'), id: z.string(), ok: z.boolean(), data: z.unknown().optional(), error: z.string().optional() }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = BrowserCommand | { type: 'state'; state: ServerState } | { type: 'error'; message: string } | { type: 'cancel'; taskId: string } | { type: 'pong' };

export function scopeFor(url: string): string | null {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    if (u.hostname === 'mail.google.com') return u.origin + ((u.pathname.match(/^(\/mail\/u\/[^/]+)(?:\/|$)/)?.[1] ?? '/mail') + '/');
    if (u.hostname === 'docs.google.com') { const m = u.pathname.match(/^\/spreadsheets\/d\/[^/]+/); return m ? u.origin + m[0] + '/' : null; }
    // Local practice pages are isolated from the backend's endpoints.
    if (['localhost', '127.0.0.1'].includes(u.hostname)) return u.pathname.startsWith('/fixtures/') ? u.origin + '/fixtures/' : null;
    return u.origin + '/';
  } catch { return null; }
}
export function withinScope(url: string, scope: string): boolean {
  try {
    const target = new URL(url), allowed = new URL(scope);
    return target.origin === allowed.origin && target.pathname.startsWith(allowed.pathname) && !target.username && !target.password;
  } catch { return false; }
}
export function assertTarget(workspace: Workspace | undefined, activeId: string | null, tab: BrowserTab | undefined): void {
  if (!workspace || workspace.id !== activeId || workspace.paused) throw new Error('Workspace is not actively watching.');
  const member = workspace.tabs.find(t => t.id === tab?.id);
  if (!member || member.paused || !tab || !withinScope(tab.url, member.scope)) throw new Error('Tab is outside the active workspace or is paused.');
}
export function isCommitControl(label: string): boolean {
  return /\b(save|submit|send|pay|delete|approve|purchase|post|void|confirm payment|make payment)\b/i.test(label);
}
export function canReplaceValue(label: string, current: string, next: string): boolean {
  return !current.trim() || current === next || /\b(search|filter|find)\b/i.test(label);
}
export function detectBillForm(url: string, heading: string, hasForm: boolean): boolean {
  if (!hasForm) return false;
  let u: URL; try { u = new URL(url); } catch { return false; }
  const netsuite = /(^|\.)netsuite\.com$/.test(u.hostname);
  const fixture = ['127.0.0.1', 'localhost'].includes(u.hostname) && u.pathname === '/fixtures/netsuite';
  if (!netsuite && !fixture) return false;
  return /(?:add|new|enter|create|vendor)\s+(?:a\s+)?bill\b/i.test(heading) || (netsuite && /vendbill\.nl$/i.test(u.pathname) && !u.searchParams.has('id'));
}
