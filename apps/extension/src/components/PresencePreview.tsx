import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Suggestion, TaskPresence } from '@ambient/shared';
import { lingonLogo } from '../brand';
import { Presence, presenceStyles } from './Presence';

// Exercises the actual shadow-root popup with synthetic data and no browser bridge.
export function PresencePreview({ initial }: { initial: Suggestion }) {
  const host = useRef<HTMLDivElement>(null), [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(initial), [working, setWorking] = useState(false);
  const [tick, setTick] = useState(0), [last, setLast] = useState('No action submitted.'), [failPanel, setFailPanel] = useState(false);
  const [task, setTask] = useState<TaskPresence | null>(null);
  useEffect(() => { setShadow(host.current!.shadowRoot ?? host.current!.attachShadow({ mode: 'open' })); }, []);
  useEffect(() => { const interval = setInterval(() => setTick(value => value + 1), 2000); return () => clearInterval(interval); }, []);
  return <main className="presence-preview">
    <header className="preview-heading">
      <div className="preview-logo"><img src={lingonLogo} alt=""/>Lingon Labs</div>
      <h1>Floating assistant preview</h1>
      <p>Sample data · No accounts connected</p>
      <nav className="preview-navigation" aria-label="Preview navigation">
        <a className="preview-return" href="/preview">← Side panel</a>
        <details className="preview-tools">
          <summary>Demo controls</summary>
          <div className="preview-tools-panel">
            <button onClick={() => { setSuggestion({ ...initial, id: crypto.randomUUID() }); setWorking(false); setTask(null); }}>Reset offer</button>
            <button onClick={() => { setWorking(false); setSuggestion(null); setTask({ id: 'preview-task', status: 'blocked', queuedReplyCount: 0, handoff: { kind: 'user', reason: 'The PDF needs opening.', nextStep: 'Open the invoice PDF in the selected Gmail tab.' } }); }}>Preview PDF handoff</button>
            <button onClick={() => { setWorking(false); setSuggestion(null); setTask({ id: 'preview-task', status: 'blocked', queuedReplyCount: 0, handoff: { kind: 'limit', reason: 'Reached the work time limit.', nextStep: 'Reinspect the selected NetSuite tab and continue the record check.' } }); }}>Preview paused task</button>
            <label><input type="checkbox" checked={failPanel} onChange={event => setFailPanel(event.target.checked)}/> Simulate a Chrome panel error</label>
            <p role="status">Preview updates: {tick}. {last}</p>
          </div>
        </details>
      </nav>
    </header>
    <div ref={host}/>
    {shadow && createPortal(<><style>{presenceStyles}</style><Presence paused={false} monitoring working={working} suggestion={suggestion} task={task}
      progress="Reading invoice evidence · synthetic preview" onPosition={top => { host.current!.style.top = top + 'px'; host.current!.style.setProperty('--ambient-top', top + 'px'); }}
      send={async message => {
        const action = message as { type: string; option?: number; text?: string; prompt?: string; taskId?: string };
        if (action.type === 'panel:open' && failPanel) return { ok: false, error: 'Synthetic Chrome error: side panel could not open.' };
        if (action.type === 'ui:accept') {
          const option = suggestion?.options?.[action.option ?? 0];
          const started = !!action.text || option?.kind !== 'dismiss';
          setLast('Submitted: ' + (action.text || option?.prompt || '')); setWorking(started); setSuggestion(null);
          return { ok: true, started };
        }
        if (action.type === 'ui:dismiss') { setLast('Dismissed without starting a task.'); setSuggestion(null); return { ok: true, started: false }; }
        if (action.type === 'ui:resume' || action.type === 'ui:reply') {
          setLast(`${working ? 'Queued update' : 'Continued task'} ${action.taskId}: ${action.prompt || 'Confirmation received.'}`);
          setTask({ id: 'preview-task', status: 'running', queuedReplyCount: working ? (task?.queuedReplyCount ?? 0) + 1 : 0 });
          setWorking(true); return { ok: true };
        }
        if (action.type === 'ui:stop') { setWorking(false); setTask(task ? { ...task, status: 'stopped', queuedReplyCount: 0 } : null); }
        setLast('Action: ' + action.type); return { ok: true };
      }}/></>, shadow)}
  </main>;
}
