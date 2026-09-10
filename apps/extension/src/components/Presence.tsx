import React, { useEffect, useRef, useState } from 'react';
import { taskStateLabel, type Suggestion, type TaskPresence } from '@ambient/shared';
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
      }}>✦<span className="dot"/><span className="orb-state">{stateLabel}</span></button>
    {(offer || expanded || working || pausedTask?.handoff || localError || error) && <section className="bubble" aria-label="Ambient assistant" onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <div className={'task-state ' + (working ? 'active' : 'idle')} role="status"><strong>{stateLabel}</strong><span>{working ? 'Agent active' : 'Agent not running'}</span></div>
      {offer ? <ActionCard key={offer.id} suggestion={offer} disabled={busy}
        onChoose={(option, text) => { void dispatch({ type: 'ui:accept', id: offer.id, option, text }, offer.id); }}
        onDismiss={() => { void dispatch({ type: 'ui:dismiss', id: offer.id }, offer.id); }}/>
        : pausedTask ? <TaskHandoff key={pausedTask.id} task={pausedTask} disabled={busy || paused}
          onResume={async () => { if (!await dispatch({ type: 'ui:resume', taskId: pausedTask.id })) throw new Error('The task could not be resumed. See the error below.'); }}
          onReply={async text => { if (!await dispatch({ type: 'ui:reply', taskId: pausedTask.id, prompt: text })) throw new Error('The update could not be sent. See the error below.'); }}/>
        : <><div className="eyebrow">Ambient · {working ? 'working' : paused || !monitoring ? 'paused' : 'close companion'}</div>
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
:host{all:initial;position:fixed;right:0;top:58%;z-index:2147483647;font:13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#20302c}
*{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.55}button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #edc65e;outline-offset:2px}
.orb{border:1px solid #ffffff65;border-right:0;background:#1c4739;color:white;border-radius:15px 0 0 15px;width:43px;height:49px;box-shadow:0 4px 20px #12352725;font-size:22px;position:relative;touch-action:none}.orb.paused{background:#6d7773}.dot{position:absolute;right:7px;top:7px;width:6px;height:6px;background:#d7eeba;border-radius:50%}
.bubble{position:fixed;right:54px;top:clamp(12px,var(--ambient-top,58vh),max(12px,calc(100dvh - 590px)));width:min(340px,calc(100vw - 70px));max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;background:#fffdf8;border:1px solid #dce3d8;border-radius:15px;padding:18px;box-shadow:0 12px 44px #112b3024}
.eyebrow,.suggestion-label{font-size:10px;letter-spacing:.12em;color:#5c7468;text-transform:uppercase;margin-bottom:9px}.title,.action-card h2{font-size:16px;line-height:1.35;font-weight:650;margin:0 0 8px}.detail,.action-card p{font-size:12px;color:#65736b;margin:0 0 14px;overflow-wrap:anywhere}
.button-primary,.stop{background:#244e3e;color:white;border:0;border-radius:7px;padding:9px 14px}.stop{background:#9b4137}.plain,.suggestion-actions>button:not(.button-primary){background:transparent;border:0;color:#52655b;padding:8px}
.action-card fieldset{border:0;margin:12px 0;padding:0;min-width:0}.action-card legend{font-weight:600;font-size:12px;padding:0;margin-bottom:8px}.action-option{display:flex;align-items:flex-start;gap:9px;border:1px solid #dce3d8;border-radius:8px;padding:9px;margin:6px 0;cursor:pointer;font-size:12px}.action-option:has(input:checked){background:#eaf0e5;border-color:#789a75}.action-option input{margin:2px 0 0;accent-color:#244e3e;flex-shrink:0}.action-option span{overflow-wrap:anywhere}.action-card textarea{display:block;resize:vertical;width:100%;min-height:65px;max-height:160px;border:1px solid #dce3d8;border-radius:8px;padding:10px;background:white;color:#20302c;font-size:12px}
.suggestion-actions{display:flex;align-items:center;gap:8px;margin:12px 0 4px}.why-suggestion{font-size:11px;color:#65736b}.why-suggestion summary{cursor:pointer}.why-suggestion p{margin-top:8px}.menu{display:flex;flex-wrap:wrap;gap:5px;border-top:1px solid #e4e7df;margin-top:12px;padding-top:10px}.popup-error{color:#9b4137;background:#f9eee7;border-radius:7px;padding:10px;font-size:12px;overflow-wrap:anywhere}
.orb-state{position:absolute;right:49px;top:12px;white-space:nowrap;background:#f5f4ed;color:#294b3a;border:1px solid #d8e0d2;border-radius:12px;padding:3px 8px;font-size:10px}.orb.working{background:#255b73}.orb.working .dot{animation:ambient-pulse 1.4s infinite}.orb.waiting{background:#8e6931}.task-state{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #dde3d6;padding-bottom:10px;margin-bottom:14px;font-size:12px}.task-state span,.monitor-note{color:#6d7c70;font-size:10px}.task-state.active strong{color:#255b73}.task-handoff>strong{font-size:15px}.task-handoff p{font-size:12px;overflow-wrap:anywhere}.handoff-idle,.handoff-reason{color:#776c52}.task-handoff label{display:block;font-size:11px;margin-top:12px}.task-handoff textarea,.task-update textarea{display:block;width:100%;min-height:64px;resize:vertical;border:1px solid #d6dece;border-radius:7px;padding:9px;margin-top:5px;background:white;color:#20302c}.task-update{margin-top:12px}.queued-reply{font-size:11px;color:#385d75;background:#eaf2f5;padding:8px;border-radius:7px}@keyframes ambient-pulse{50%{opacity:.25}}@media(prefers-reduced-motion:reduce){.orb.working .dot{animation:none}}
`;
