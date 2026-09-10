import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Suggestion } from '@ambient/shared';
import { Presence, presenceStyles } from './Presence';

// Exercises the actual shadow-root popup with synthetic data and no browser bridge.
export function PresencePreview({ initial }: { initial: Suggestion }) {
  const host = useRef<HTMLDivElement>(null), [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(initial), [working, setWorking] = useState(false);
  const [tick, setTick] = useState(0), [last, setLast] = useState('No action submitted.'), [failPanel, setFailPanel] = useState(false);
  useEffect(() => { setShadow(host.current!.shadowRoot ?? host.current!.attachShadow({ mode: 'open' })); }, []);
  useEffect(() => { const interval = setInterval(() => setTick(value => value + 1), 2000); return () => clearInterval(interval); }, []);
  return <main style={{ padding: 32, maxWidth: 650 }}><h1>Floating assistant preview</h1>
    <p>Synthetic page. Choices exercise the popup without touching accounts. Background updates arrive every two seconds.</p>
    <p role="status">Preview updates: {tick}. {last}</p>
    <label><input type="checkbox" checked={failPanel} onChange={event => setFailPanel(event.target.checked)}/> Simulate a Chrome panel error</label>
    <p><button onClick={() => { setSuggestion({ ...initial, id: crypto.randomUUID() }); setWorking(false); }}>Reset offer</button></p>
    <div ref={host}/>
    {shadow && createPortal(<><style>{presenceStyles}</style><Presence paused={false} monitoring working={working} suggestion={suggestion}
      progress="Reading invoice evidence · synthetic preview" onPosition={top => { host.current!.style.top = top + 'px'; host.current!.style.setProperty('--ambient-top', top + 'px'); }}
      send={async message => {
        const action = message as { type: string; option?: number; text?: string };
        if (action.type === 'panel:open' && failPanel) return { ok: false, error: 'Synthetic Chrome error: side panel could not open.' };
        if (action.type === 'ui:accept') {
          const option = suggestion?.options?.[action.option ?? 0];
          const started = !!action.text || option?.kind !== 'dismiss';
          setLast('Submitted: ' + (action.text || option?.prompt || '')); setWorking(started); setSuggestion(null);
          return { ok: true, started };
        }
        if (action.type === 'ui:dismiss') { setLast('Dismissed without starting a task.'); setSuggestion(null); return { ok: true, started: false }; }
        if (action.type === 'ui:stop') setWorking(false);
        setLast('Action: ' + action.type); return { ok: true };
      }}/></>, shadow)}
  </main>;
}
