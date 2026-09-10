import { useEffect, useState } from 'react';
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Circle, CircleCheck, Clock3, ExternalLink, FileText, FolderOpen, Link2, Loader2, Mail, MoreHorizontal, Pause, Play, Plus, Settings2, ShieldCheck, Sparkles, Square, Table2, X } from 'lucide-react';
import { emptyState, type ExtensionState, type Workspace, type Task, type BrowserTab } from '@ambient/shared';
import { Button } from './components/Button';

const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
const preview: ExtensionState = { ...structuredClone(emptyState), connection: 'connected', activeWorkspaceId: 'preview',
  workspaces: [{ id: 'preview', name: 'September close', paused: false, tabs: [
    { id: 1, title: 'NetSuite sandbox', scope: 'https://demo.app.netsuite.com/', paused: false },
    { id: 2, title: 'Gmail · Demo inbox', scope: 'https://mail.google.com/mail/u/0/', paused: false },
    { id: 3, title: 'Vendor register', scope: 'https://docs.google.com/spreadsheets/d/demo/', paused: false },
  ] }], tabs: [
    { id: 1, title: 'NetSuite sandbox', url: 'https://demo.app.netsuite.com/' },
    { id: 2, title: 'Gmail · Demo inbox', url: 'https://mail.google.com/mail/u/0/' },
    { id: 3, title: 'Vendor register', url: 'https://docs.google.com/spreadsheets/d/demo/' },
  ], server: { ...structuredClone(emptyState.server), apiReady: true, suggestions: [{ id: 'preview', workspaceId: 'preview', tabId: 1, version: '', title: 'A new bill. A useful place to start.', detail: 'I can check Gmail for invoices, compare them with NetSuite, and flag anything that may need recording.', vendor: '', key: '', createdAt: Date.now() }] },
};
function provider(tab: { url?: string; scope?: string; title: string }) {
  const url = tab.url ?? tab.scope ?? '';
  if (url.includes('netsuite')) return { name: 'NetSuite', label: 'Bills & ledger', icon: FileText, style: 'netsuite' };
  if (url.includes('gmail') || url.includes('mail.google')) return { name: 'Gmail', label: 'Invoice evidence', icon: Mail, style: 'gmail' };
  if (url.includes('docs.google') || url.includes('/vendors')) return { name: 'Google Sheets', label: 'Vendor onboarding', icon: Table2, style: 'sheets' };
  return { name: tab.title, label: 'Watched page', icon: FolderOpen, style: 'generic' };
}

export function App() {
  const [state, setState] = useState<ExtensionState>(isExtension ? structuredClone(emptyState) : preview);
  const [error, setError] = useState(''); const [token, setToken] = useState(''); const [pairing, setPairing] = useState(false);
  const [editing, setEditing] = useState<Workspace | 'new' | null>(null); const [draftName, setDraftName] = useState('September close');
  const [selectedTabs, setSelectedTabs] = useState<number[]>([]); const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState(''); const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [view, setView] = useState<'workspace' | 'activity'>('workspace');
  const active = state.workspaces.find(w => w.id === state.activeWorkspaceId);
  const tasks = state.server.tasks.filter(t => t.workspaceId === active?.id);
  const task = tasks.find(t => t.id === selectedTask) ?? tasks[0];
  const suggestion = state.server.suggestions.find(s => s.workspaceId === active?.id);
  const watching = !!active && !active.paused;
  const running = !!state.server.runningTaskId;
  const available = isExtension && state.connection === 'connected' && state.server.apiReady && watching && !!active?.tabs.some(t => !t.paused);
  async function dispatch(message: unknown) {
    if (!isExtension) { setError('This is an interface preview. Load the extension in your demo Chrome profile to use the workspace.'); return; }
    setError('');
    try { const result = await chrome.runtime.sendMessage(message); if (result?.ok === false) throw new Error(result.error); return result; }
    catch (e) { setError(e instanceof Error ? e.message : 'The extension could not complete that action.'); }
  }
  useEffect(() => {
    if (!isExtension) return;
    let alive = true;
    const refresh = () => chrome.runtime.sendMessage({ type: 'ui:get' }).then(s => { if (alive && s?.workspaces) setState(s); }).catch(() => { if (alive) setError('Reconnect the side panel after reloading the extension.'); });
    const listener = (message: { type: string; state: ExtensionState }) => { if (message.type === 'state:changed') setState(message.state); };
    chrome.runtime.onMessage.addListener(listener); void refresh(); const interval = setInterval(refresh, 4000);
    return () => { alive = false; clearInterval(interval); chrome.runtime.onMessage.removeListener(listener); };
  }, []);
  function edit(workspace: Workspace | 'new') { setEditing(workspace); setDraftName(workspace === 'new' ? 'September close' : workspace.name); setSelectedTabs(workspace === 'new' ? [] : workspace.tabs.map(t => t.id)); }
  async function saveWorkspace() {
    if (!isExtension) { void dispatch({}); return; }
    setSaving(true); setError('');
    try {
      const origins = [...new Set(state.tabs.filter(t => selectedTabs.includes(t.id)).map(t => new URL(t.url).origin + '/*'))];
      if (!origins.length) throw new Error('Select at least one tab.');
      // Request optional site access in the direct handler for the Save click.
      if (!await chrome.permissions.request({ origins })) throw new Error('Site access was not granted. Workspace was not changed.');
      const result = await chrome.runtime.sendMessage({ type: 'ui:save', id: editing === 'new' ? undefined : editing?.id, name: draftName, tabIds: selectedTabs });
      if (!result?.ok) throw new Error(result?.error || 'Could not save workspace.'); setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }
  async function start(text: string, taskId?: string) {
    if (!text.trim()) return;
    const result = await dispatch({ type: 'ui:start', prompt: text.trim(), taskId });
    if (result?.ok) { setPrompt(''); setView('activity'); }
  }
  function openSource(url: string) { if (isExtension) void chrome.tabs.create({ url }); else window.open(url, '_blank', 'noopener,noreferrer'); }

  return <div className="app-shell">
    {!isExtension && <div className="preview-banner">INTERFACE PREVIEW <a href="/">Local setup <ArrowUpRight size={12}/></a></div>}
    <header className="app-header"><div className="brand"><div className="brand-symbol"><Sparkles size={20} strokeWidth={1.5}/></div><span>ambient<span className="brand-period">.</span></span></div><button className="connection" title="Local connection settings" onClick={() => setPairing(!pairing)}><span className={'status-dot ' + (state.connection === 'connected' ? 'green' : 'amber')}/>{state.connection === 'connected' ? 'Local' : state.connection === 'connecting' ? 'Connecting' : 'Offline'}<Settings2 size={13}/></button></header>
    <div className="workspace-switcher"><FolderOpen size={15}/><select aria-label="Active workspace" value={state.activeWorkspaceId ?? ''} onChange={e => { void dispatch({ type: 'ui:switch', id: e.target.value }); setSelectedTask(null); }}><option value="" disabled>Select a workspace</option>{state.workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select><ChevronDown size={13}/><Button size="icon" variant="ghost" title="Create workspace" onClick={() => edit('new')}><Plus size={17}/></Button></div>
    {(error || state.error) && <div role="alert" className="error-box"><span>{error || state.error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={14}/></button></div>}
    {(pairing || state.connection !== 'connected') && <section className="pair-card"><div className="section-heading"><Link2 size={16}/><h2>Connect your local companion</h2></div><p>Start <code>pnpm dev</code>, then paste the token from <code>.local/pairing-token</code>.</p><form onSubmit={e => { e.preventDefault(); void dispatch({ type: 'ui:pair', token }).then(() => { setToken(''); setPairing(false); }); }}><input aria-label="Local pairing token" type="password" autoComplete="off" placeholder="Local pairing token" value={token} onChange={e => setToken(e.target.value)}/><Button disabled={!token.trim()} size="small">Connect</Button></form><small>Your OpenAI API key stays on the local server.</small></section>}
    <nav className="view-nav"><button className={view === 'workspace' ? 'selected' : ''} onClick={() => setView('workspace')}>Workspace</button><button className={view === 'activity' ? 'selected' : ''} onClick={() => setView('activity')}>Activity {tasks.length > 0 && <span>{tasks.length}</span>}</button></nav>
    <main className="main-content">
      {view === 'workspace' ? <>
        <div className="intro"><div className="eyebrow">YOUR CLOSE COMPANION</div><h1>A little more<br/><em>peace of mind.</em></h1><p>I’ll keep an eye on your workspace<br/>and offer a hand at the right moment.</p></div>
        {active ? <>
          <div className="watching-line"><span className={'status-dot ' + (watching ? 'green' : '')}/><span>{watching ? `Watching ${active.tabs.filter(t => !t.paused).length} selected tabs` : 'Workspace paused'}</span><Button variant="ghost" size="small" onClick={() => { void dispatch({ type: 'workspace:pause', paused: watching }); }}>{watching ? <Pause size={12}/> : <Play size={12}/>} {watching ? 'Pause' : 'Resume'}</Button></div>
          <section className="tabs-card"><div className="section-header"><span>IN THIS WORKSPACE</span><button onClick={() => edit(active)}>Edit tabs <Settings2 size={12}/></button></div>{active.tabs.length ? active.tabs.map(tab => { const p = provider(tab); const Icon = p.icon; return <div className="tab-row" key={tab.id}><div className={'app-icon ' + p.style}><Icon size={17}/></div><div className="tab-detail"><strong>{p.name}</strong><span title={tab.title}>{tab.title}</span></div><button className="tab-pause" aria-label={`${tab.paused ? 'Resume' : 'Pause'} ${p.name}`} onClick={() => { void dispatch({ type: 'tab:pause', tabId: tab.id, paused: !tab.paused }); }}>{tab.paused ? <Play size={13}/> : <span className="tiny-dot"/>}</button></div>; }) : <div className="empty-small">Select your open tabs to start watching. Tabs must be reselected after restarting Chrome.</div>}</section>
          {suggestion && watching ? <section className="suggestion-card"><div className="suggestion-label"><Sparkles size={13}/> A MOMENT TO HELP</div><h2>{suggestion.title}</h2><p>{suggestion.detail}</p><div className="suggestion-actions"><Button disabled={!available || running} onClick={() => { void dispatch({ type: 'ui:accept', id: suggestion.id }).then(() => setView('activity')); }}>Check invoices <ArrowUpRight size={16}/></Button><button onClick={() => { void dispatch({ type: 'ui:dismiss', id: suggestion.id }); }}>Not now</button></div><div className="scope-note"><ShieldCheck size={12}/> Findings first. You review any bill changes.</div></section> : <section className="quiet-card"><div className="quiet-orbit"><Sparkles size={24} strokeWidth={1}/></div><h2>{running ? 'Working through your tabs' : watching ? 'A quiet second pair of eyes' : 'Here whenever you’re ready'}</h2><p>{running ? 'Follow the investigation in Activity. You can stop it at any time.' : 'Open a new vendor bill in NetSuite. I’ll offer to check your inbox for supporting invoices.'}</p>{running && <Button size="small" variant="secondary" onClick={() => setView('activity')}>View progress <ArrowUpRight size={13}/></Button>}</section>}
          {!state.server.apiReady && state.connection === 'connected' && <p className="api-note">Watching is ready. Add an OpenAI API key to the local server to enable investigations.</p>}
        </> : <section className="empty-workspace"><FolderOpen size={26} strokeWidth={1.3}/><h2>Bring your tabs together</h2><p>Choose your NetSuite sandbox, Gmail, and vendor sheet. Ambient watches only the tabs you select.</p><Button onClick={() => edit('new')}>Create workspace <Plus size={15}/></Button></section>}
      </> : <>
        <div className="activity-heading"><div><div className="eyebrow">THE WORK, AS IT HAPPENS</div><h1>Close notes.</h1></div>{running && <Button variant="danger" size="small" onClick={() => { void dispatch({ type: 'ui:stop' }); }}><Square size={12}/>Stop</Button>}</div>
        {tasks.length > 1 && <select className="task-select" aria-label="Investigation" value={task?.id ?? ''} onChange={e => setSelectedTask(e.target.value)}>{tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>}
        {task ? <TaskView task={task} onOpen={openSource} onPrepare={finding => start(`Prepare the bill for invoice ${finding.invoice} from ${finding.vendor}, amount ${finding.amount}, based on the verified findings. Reinspect sources and the current bill form first. Fill only the matching bill and leave it for human review. Do not save or submit.`, task.id)} canPrepare={available && !running}/> : <section className="quiet-card"><Clock3 size={28} strokeWidth={1.2}/><h2>Your next investigation starts here</h2><p>Accept a suggestion or ask a question about your selected tabs. Findings and sources will appear as the work progresses.</p></section>}
      </>}
    </main>
    <footer className="composer"><form onSubmit={e => { e.preventDefault(); void start(prompt, view === 'activity' ? task?.id : undefined); }}><textarea aria-label="Ask Ambient" placeholder={running ? 'An investigation is running…' : 'Ask about your workspace…'} value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (available && !running) void start(prompt, view === 'activity' ? task?.id : undefined); } }}/><div className="composer-bottom"><span><Sparkles size={12}/> Astra <span className="composer-context">· {view === 'activity' && task ? 'Continue investigation' : 'New investigation'}</span></span><Button size="icon" title="Send request" disabled={!available || running || !prompt.trim()}><ArrowUp size={16}/></Button></div></form><div className="footer-note"><ShieldCheck size={11}/> Selected tabs only <span>•</span> You’re in control</div></footer>
    {editing && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Choose workspace tabs" className="workspace-modal"><div className="modal-heading"><div><div className="eyebrow">MAKE ROOM FOR THE WORK</div><h2>{editing === 'new' ? 'New workspace' : 'Edit workspace'}</h2></div><Button variant="ghost" size="icon" title="Close workspace editor" onClick={() => setEditing(null)}><X size={18}/></Button></div><label className="field-label" htmlFor="workspace-name">Workspace name</label><input id="workspace-name" value={draftName} maxLength={80} onChange={e => setDraftName(e.target.value)}/><div className="section-header"><span>OPEN TABS · {selectedTabs.length} SELECTED</span></div><div className="tab-choices">{state.tabs.length ? state.tabs.map(tab => { const p = provider(tab); const Icon = p.icon; return <label className="tab-choice" key={tab.id}><input type="checkbox" checked={selectedTabs.includes(tab.id)} onChange={e => setSelectedTabs(e.target.checked ? [...selectedTabs, tab.id] : selectedTabs.filter(id => id !== tab.id))}/><div className={'app-icon ' + p.style}><Icon size={16}/></div><span><strong>{tab.title}</strong><small>{new URL(tab.url).hostname}</small></span></label>; }) : <p className="empty-small">Open your NetSuite sandbox and Gmail in this Chrome profile, then return here.</p>}</div><p className="small-note">Chrome will ask for access to the sites you select. Other tabs stay outside this workspace.</p>{error && <p className="modal-error">{error}</p>}<Button className="full-width" disabled={saving || !selectedTabs.length || !draftName.trim()} onClick={() => { void saveWorkspace(); }}>{saving ? <Loader2 className="spin" size={15}/> : <Check size={15}/>} {editing === 'new' ? 'Start watching' : 'Save workspace'}</Button></section></div>}
  </div>;
}

function TaskView({ task, onOpen, onPrepare, canPrepare }: { task: Task; onOpen: (url: string) => void; onPrepare: (finding: Task['findings'][number]) => void; canPrepare: boolean }) {
  return <div className="task-view"><div className={'task-status ' + task.status}>{task.status === 'running' ? <Loader2 size={13} className="spin"/> : task.status === 'completed' ? <CircleCheck size={13}/> : <Circle size={13}/>} {task.status === 'running' ? 'Investigating' : task.status === 'completed' ? 'Investigation complete' : task.status === 'stopped' ? 'Stopped' : 'Needs attention'}</div>
    {task.error && <div className="error-box">{task.error}</div>}
    {task.messages.map((message, i) => <div key={i} className={'message ' + message.role}><div className="message-author">{message.role === 'user' ? 'YOU' : 'AMBIENT'}</div><p>{message.text || 'Reading your workspace…'}</p></div>)}
    {task.findings.length > 0 && <div className="findings"><div className="section-header"><span>FINDINGS · {task.findings.length}</span></div>{task.findings.map(f => <article className="finding-card" key={f.id}><div className="finding-top"><span className={'finding-status ' + f.status}>{({ candidate: 'No match found', recorded: 'Already recorded', onboarding: 'Check onboarding', uncertain: 'Needs review' })[f.status]}</span><strong>{f.amount}</strong></div><h3>{f.vendor}</h3><div className="invoice-ref">Invoice {f.invoice}</div><p>{f.explanation}</p><div className="sources">{f.sources.map((s, i) => <button key={i} onClick={() => onOpen(s.url)}><ExternalLink size={11}/>{s.title}</button>)}</div>{f.status === 'candidate' && <Button variant="secondary" size="small" disabled={!canPrepare} onClick={() => onPrepare(f)}>Prepare for review <ArrowUpRight size={13}/></Button>}</article>)}</div>}
    {task.activity.length > 0 && <details className="activity-log" open={task.status === 'running'}><summary>Browser activity <span>{task.activity.length} actions</span></summary>{task.activity.map(a => <div key={a.id} className={'activity-event ' + a.status}>{a.status === 'working' ? <Loader2 size={12} className="spin"/> : a.status === 'done' ? <Check size={12}/> : <X size={12}/>}<span>{a.text}</span><time>{new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</details>}
  </div>;
}
