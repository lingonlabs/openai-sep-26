import { useEffect, useState } from 'react';
import { defaultAmbientPreferences, type AmbientPreferences, type AmbientStatus } from '@ambient/shared';
import { Button } from './Button';

export function HelpPanel({ ambient, disabled, onSave, onForget }: {
  ambient?: AmbientStatus; disabled: boolean; onSave: (value: AmbientPreferences) => void; onForget: () => void;
}) {
  const serialized = JSON.stringify(ambient?.preferences ?? defaultAmbientPreferences());
  const [draft, setDraft] = useState<AmbientPreferences>(() => JSON.parse(serialized));
  useEffect(() => setDraft(JSON.parse(serialized)), [serialized]);
  const labels = { watching: 'Watching for useful moments', evaluating: 'Astra is considering the latest changes', paused: 'Ambient monitoring paused', task_active: 'Monitoring paused while the agent works', error: 'Ambient evaluation needs attention' };
  return <section className="help-panel"><div className="eyebrow">YOUR STANDING INSTRUCTIONS</div><h1>Help me with…</h1>
    <p className="help-intro">Tell Ambient when you’d appreciate a hand. It remembers what it has seen, what you’ve dismissed, and how tasks went.</p>
    <div className="ambient-status" role="status"><strong>{labels[ambient?.status ?? 'paused']}</strong>
      <p>{ambient?.status === 'task_active' ? 'Background inspection is stopped. A fresh baseline will be recorded when the task finishes.' : ambient?.reason || 'Save instructions and select tabs to begin.'}</p>
      {ambient?.lastChecked && <small>Last evaluated {new Date(ambient.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>}
      {ambient?.error && <p className="event-error">{ambient.error}</p>}
    </div>
    <form onSubmit={event => { event.preventDefault(); onSave(draft); }}>
      <label className="monitor-toggle"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })}/> Enable ambient help in this workspace</label>
      {draft.instructions.map((instruction,index) => <div className="help-instruction" key={instruction.id}>
        <div><label><input type="checkbox" checked={instruction.enabled} onChange={event => setDraft({ ...draft, instructions: draft.instructions.map(i => i.id === instruction.id ? { ...i, enabled: event.target.checked } : i) })}/> Instruction {index+1}</label>
          <button type="button" aria-label={`Remove instruction ${index+1}`} onClick={() => setDraft({ ...draft, instructions: draft.instructions.filter(i => i.id !== instruction.id) })}>Remove</button></div>
        <textarea aria-label={`Help instruction ${index+1}`} value={instruction.text} maxLength={2000} rows={3} required onChange={event => setDraft({ ...draft, instructions: draft.instructions.map(i => i.id === instruction.id ? { ...i, text: event.target.value } : i) })}/>
      </div>)}
      <div className="help-actions"><Button type="button" variant="secondary" disabled={draft.instructions.length >= 12} onClick={() => setDraft({ ...draft, instructions: [...draft.instructions, { id: crypto.randomUUID(), text: '', enabled: true }] })}>Add instruction</Button><Button disabled={disabled || draft.instructions.some(i => !i.text.trim())}>Save instructions</Button></div>
    </form>
    <p className="small-note">Page text from your selected tabs is sent to Astra when it changes. Monitoring stops during execution. Content hidden in canvases, attachments, or unloaded rows may not be observable.</p>
    <details className="ambient-memory"><summary>What Ambient remembers</summary>
      <p>{ambient?.summary || 'No summary yet. Memory will build as you use this workspace.'}</p>
      {ambient?.visits.map(page => <div className="remembered-page" key={page.url}><span>{page.title}</span><strong>{page.count} observed {page.count === 1 ? 'visit' : 'visits'}</strong></div>)}
      <Button type="button" size="small" variant="secondary" disabled={disabled} onClick={onForget}>Clear remembered context</Button>
    </details>
    <details className="ambient-memory"><summary>Recent observations and decisions</summary>{ambient?.recent.length ? ambient.recent.map((event,index) => <div className="memory-event" key={index}><small>{event.kind} · {new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small><p>{event.text}</p></div>) : <p>No observations yet.</p>}</details>
  </section>;
}
