import React, { useState } from 'react';
import type { TaskPresence } from '@ambient/shared';

export function TaskHandoff({ task, disabled, onResume, onReply }: {
  task: TaskPresence; disabled: boolean; onResume: () => Promise<void>; onReply: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const waiting = task.handoff?.kind === 'user';
  async function act(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setError('');
    try { await action(); setText(''); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <section className="task-handoff" aria-label={waiting ? 'Waiting for your confirmation' : 'Continue paused task'}>
    <strong>{waiting ? 'Waiting for you' : 'Task paused'}</strong>
    <p className="handoff-idle">The task agent is not running.</p>
    <p>{task.handoff?.nextStep || task.error || 'Continue from the last saved response.'}</p>
    {task.handoff?.kind !== 'user' && task.handoff?.reason && <p className="handoff-reason">{task.handoff.reason}</p>}
    <button type="button" className="button button-primary" disabled={disabled || busy} onClick={() => { void act(onResume); }}>{busy ? 'Sending…' : waiting ? 'I’ve done that — continue' : 'Continue task'}</button>
    <form onSubmit={event => { event.preventDefault(); if (text.trim()) void act(() => onReply(text.trim())); }}>
      <label>Or tell Ambient what changed<textarea aria-label="Update for this task" placeholder="I opened the PDF in the Gmail tab…" value={text} maxLength={12000} onChange={event => setText(event.target.value)}/></label>
      <button type="submit" className="plain" disabled={disabled || busy || !text.trim()}>Send update &amp; continue</button>
    </form>
    {error && <p role="alert" className="popup-error">{error}</p>}
  </section>;
}
