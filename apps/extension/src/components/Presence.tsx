import React, { useEffect, useRef, useState } from 'react';
import { taskStateLabel, type Suggestion, type TaskPresence } from '@ambient/shared';
import { lingonLogo, lingonFont } from '../brand';
import { ActionCard } from './ActionCard';
import { TaskHandoff } from './TaskHandoff';

export type PresenceProps = {
  paused: boolean; working: boolean; monitoring: boolean; suggestion: Suggestion | null;
  progress: string; error?: string | null;
  task?: TaskPresence | null;
  send: (message: unknown) => Promise<{ ok?: boolean; error?: string; started?: boolean } | undefined>;
  onPosition: (top: number) => void;
};

export function Presence({ paused, working, monitoring, suggestion, task, progress, error, send, onPosition }: PresenceProps) {
  useEffect(() => {
    const font = new FontFace('Lingon Inter', `url(${lingonFont})`, { weight: '100 900' });
    document.fonts.add(font);
    void font.load().catch(() => {});
    return () => { document.fonts.delete(font); };
  }, []);
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false), [localError, setError] = useState('');
  const [handledId, setHandledId] = useState<string | null>(null);
  const dragging = useRef<{ start: number; top: number; moved: boolean } | null>(null);
  const submitting = useRef(false);
  const [reply, setReply] = useState('');
  const pausedTask = task && task.status !== 'running' && task.status !== 'completed' ? task : null;
  const stateLabel = task ? taskStateLabel(task) : working ? 'Working' : 'No task running';
  useEffect(() => { if (error) setHandledId(null); }, [error]);
  const offer = !working && !paused && !pausedTask && suggestion?.id !== handledId ? suggestion : null;
  async function dispatch(message: unknown, submittedId?: string) {
    if (submitting.current) return false;
    submitting.current = true; setBusy(true); setError('');
    try {
      const result = await send(message);
      if (!result?.ok) throw new Error(result?.error || 'The extension did not respond. Reload Ambient and reopen this page.');
      if (submittedId) { setHandledId(submittedId); setExpanded(result.started !== false); }
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); return false; }
    finally { submitting.current = false; setBusy(false); }
  }
  return <>
    <button type="button" className={'orb' + (working ? ' working' : pausedTask ? ' waiting' : paused || !monitoring ? ' paused' : '')}
      aria-label={`${stateLabel}. ${working ? 'Agent active' : 'Agent idle'}. Open controls`}
      aria-expanded={!!offer || expanded || working || !!pausedTask?.handoff}
      onClick={() => { if (!dragging.current?.moved) setExpanded(value => !value); }}
      onPointerDown={event => { dragging.current = { start: event.clientY, top: event.currentTarget.getBoundingClientRect().top, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => {
        const drag = dragging.current; if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        if (Math.abs(event.clientY - drag.start) > 5) drag.moved = true;
        if (drag.moved) onPosition(Math.max(12, Math.min(innerHeight - 65, drag.top + event.clientY - drag.start)));
      }}
      onPointerUp={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (dragging.current?.moved) void send({ type: 'presence:position', top: event.currentTarget.getBoundingClientRect().top + 'px' });
      }}><img src={lingonLogo} alt=""/><span className="dot"/><span className="orb-state">{stateLabel}</span></button>
    {(offer || expanded || working || pausedTask?.handoff || localError || error) && <section className="bubble" aria-label="Ambient assistant" onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
<div className="popup-brand"><img src={lingonLogo} alt=""/><span>Lingon Labs<small>Close companion</small></span></div>
      <div className={'task-state ' + (working ? 'active' : 'idle')} role="status"><strong>{stateLabel}</strong><span>{working ? 'Agent active' : 'Agent not running'}</span></div>
      {offer ? <ActionCard key={offer.id} suggestion={offer} disabled={busy}
        onChoose={(option, text) => { void dispatch({ type: 'ui:accept', id: offer.id, option, text }, offer.id); }}
        onDismiss={() => { void dispatch({ type: 'ui:dismiss', id: offer.id }, offer.id); }}/>
        : pausedTask ? <TaskHandoff key={pausedTask.id} task={pausedTask} disabled={busy || paused}
          onResume={async () => { if (!await dispatch({ type: 'ui:resume', taskId: pausedTask.id })) throw new Error('The task could not be resumed. See the error below.'); }}
          onReply={async text => { if (!await dispatch({ type: 'ui:reply', taskId: pausedTask.id, prompt: text })) throw new Error('The update could not be sent. See the error below.'); }}/>
        : <><div className="eyebrow">Lingon Labs · {working ? 'working' : paused || !monitoring ? 'paused' : 'close companion'}</div>
          <h2 className="title">{working ? 'Checking your workspace' : paused || !monitoring ? 'Monitoring is paused' : 'Here when you need a hand'}</h2>
          <p className="detail" role="status">{working ? progress || 'Starting the investigation…' : 'Only the tabs you selected belong to this workspace.'}</p>
        </>}
      {(localError || error) && <p role="alert" className="popup-error">{localError || error}</p>}
      {busy && <p role="status" className="detail">Sending…</p>}
      {!!task?.queuedReplyCount && <p role="status" className="queued-reply">Update received · will be used after the current step.</p>}
      {working && task && <form className="task-update" onSubmit={event => { event.preventDefault(); if (reply.trim()) void dispatch({ type: 'ui:reply', taskId: task.id, prompt: reply.trim() }).then(ok => { if (ok) setReply(''); }); }}>
        <textarea aria-label="Update for active task" placeholder="I opened the PDF…" value={reply} maxLength={12000} onChange={event => setReply(event.target.value)}/>
        <button type="submit" className="plain" disabled={busy || !reply.trim()}>Send update</button>
      </form>}
      {working && <button type="button" className="stop" onClick={() => { void dispatch({ type: 'ui:stop' }); }}>Stop task</button>}
      <button type="button" className="plain" disabled={busy} onClick={() => { void dispatch({ type: 'panel:open' }); }}>Open assistant ↗</button>
      {localError && <button type="button" className="plain" disabled={busy} onClick={() => { void dispatch({ type: 'panel:tab' }); }}>Open assistant in a tab ↗</button>}
      <p className="monitor-note">{working ? 'Ambient inspection paused during task' : monitoring && !paused ? 'Ambient watching for changes' : 'Ambient monitoring paused'}</p>
      {expanded && <div className="menu">
        <button type="button" className="plain" onClick={() => { void dispatch({ type: 'tab:pause', paused: !paused }); }}>{paused ? 'Resume tab' : 'Pause tab'}</button>
        <button type="button" className="plain" onClick={() => { void dispatch({ type: 'workspace:pause', paused: true }); }}>Pause workspace</button>
        <button type="button" className="plain" onClick={() => { void dispatch({ type: 'tab:remove' }); }}>Remove tab</button>
      </div>}
    </section>}
  </>;
}

export const presenceStyles = `
:host{all:initial;position:fixed;right:0;top:58%;z-index:2147483647;font:13px/1.5 "Lingon Inter",Inter,Arial,sans-serif;color:#1f3445;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.5}button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #269b96;outline-offset:3px}
.orb{display:grid;place-items:center;border:1px solid #ffffff30;border-right:0;background:#0f172a;border-radius:15px 0 0 15px;width:46px;height:53px;box-shadow:0 4px 24px #0f172a30;position:relative;touch-action:none}.orb img{width:28px;height:28px}.orb.paused{background:#64748b}.dot{position:absolute;right:6px;top:6px;width:5px;height:5px;background:#2cdfcc;border-radius:50%;box-shadow:0 0 0 2px #0f172a}
.bubble{position:fixed;right:58px;--lingon-popup-top:clamp(12px,var(--ambient-top,58vh),max(12px,calc(100dvh - 640px)));top:var(--lingon-popup-top);width:min(350px,calc(100vw - 74px));max-height:calc(100dvh - var(--lingon-popup-top) - 12px);overflow:auto;overscroll-behavior:contain;background:white;border:1px solid #d4e3e5;border-radius:15px;padding:20px;box-shadow:0 16px 56px #0f172a35}
.popup-brand{display:flex;align-items:center;gap:9px;margin:-20px -20px 18px;padding:17px 20px;background:linear-gradient(211deg,#1f3445 1.23%,#3bdecc 239.98%);color:white}.popup-brand img{width:28px;height:28px}.popup-brand span{font:700 17px/1.2 Arial,sans-serif;letter-spacing:-.3px}.popup-brand small{display:block;font:9px/1.5 "Lingon Inter",Inter,Arial,sans-serif;letter-spacing:.09em;color:#b3d9da;margin-top:3px}
.eyebrow,.suggestion-label{font-size:9px;letter-spacing:.13em;color:#269b96;text-transform:uppercase;margin-bottom:10px;font-weight:600}.title,.action-card h2{font-size:20px;line-height:1.3;letter-spacing:-.5px;font-weight:500;margin:0 0 10px}.detail,.action-card p{font-size:12px;line-height:1.7;color:#64808a;margin:0 0 14px;overflow-wrap:anywhere}
.button-primary,.stop{background:#2cdfcc;color:#1f3445;border:1px solid #2cdfcc;border-radius:8px;padding:10px 16px;font-size:12px;font-weight:500}.button-primary:hover:not(:disabled){background:#67dfd1}.stop{background:#fff1f2;color:#be123c;border-color:#fecdd3}.plain,.suggestion-actions>button:not(.button-primary){background:transparent;border:0;color:#64808a;padding:9px;font-size:11px}
.action-card fieldset{border:0;margin:15px 0;padding:0;min-width:0}.action-card legend{font-weight:500;font-size:11px;padding:0;margin-bottom:9px}.action-option{display:flex;align-items:flex-start;gap:9px;border:1px solid #d4e3e5;border-radius:8px;padding:10px;margin:8px 0;cursor:pointer;font-size:11px;background:#f8fafc}.action-option:has(input:checked){background:#e0f2f1;border-color:#269b96}.action-option input{margin:2px 0 0;accent-color:#269b96;flex-shrink:0}.action-option span{overflow-wrap:anywhere}.action-card textarea{display:block;resize:vertical;width:100%;min-height:65px;max-height:160px;border:1px solid #cbdde1;border-radius:8px;padding:11px;background:white;color:#1f3445;font-size:12px;line-height:1.6}.action-card textarea::placeholder{color:#8ca4ab}
.suggestion-actions{display:flex;align-items:center;gap:8px;margin:14px 0 6px}.why-suggestion{font-size:10px;color:#64808a}.why-suggestion summary{cursor:pointer}.why-suggestion p{margin-top:9px}.menu{display:flex;flex-wrap:wrap;gap:5px;border-top:1px solid #e2e8f0;margin-top:12px;padding-top:10px}.popup-error{color:#be123c;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:11px;font-size:12px;overflow-wrap:anywhere}

/* Task confirmation and continuation, from Philipp's latest implementation. */
.orb-state{position:absolute;right:52px;top:14px;white-space:nowrap;background:#f0faf8;color:#1f3445;border:1px solid #b2dfdb;border-radius:20px;padding:4px 9px;font-size:10px;line-height:1.4}.orb[aria-expanded="true"] .orb-state{display:none}.orb.working{background:#1f3445}.orb.working .dot{animation:ambient-pulse 1.4s infinite}.orb.waiting{background:#93691e}.orb.waiting .dot{background:#f8d77a}
.task-state{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px;font-size:11px}.task-state strong{font-weight:600}.task-state span,.monitor-note{color:#718a96;font-size:10px}.task-state.active strong{color:#269b96}.monitor-note{line-height:1.65;margin:14px 0 0}
.task-handoff>strong{font-size:17px;font-weight:500;letter-spacing:-.3px}.task-handoff p{font-size:12px;line-height:1.7;overflow-wrap:anywhere}.handoff-idle,.handoff-reason{color:#8b712f}.task-handoff .handoff-idle{padding:8px 10px;background:#fff8e6;border-radius:7px;font-size:11px}.task-handoff label{display:block;font-size:11px;color:#64808a;margin-top:15px}.task-handoff textarea,.task-update textarea{display:block;width:100%;min-height:70px;max-height:150px;resize:vertical;border:1px solid #cbdde1;border-radius:8px;padding:11px;margin-top:7px;background:white;color:#1f3445;font-size:12px;line-height:1.6}.task-handoff textarea::placeholder,.task-update textarea::placeholder{color:#8ca4ab}.task-update{margin-top:14px}.task-handoff .plain{padding-left:0}.queued-reply{font-size:11px;line-height:1.65;color:#287b76;background:#e0f2f1;padding:10px;border-radius:8px}
@keyframes ambient-pulse{50%{opacity:.25}}@media(prefers-reduced-motion:reduce){.orb.working .dot{animation:none}}
`;
