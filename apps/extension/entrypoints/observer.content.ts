import { detectBillForm, isCommitControl, canReplaceValue, withinScope, type BrowserAction, type BrowserObservation, type Suggestion } from '@ambient/shared';

export default defineContentScript({
  // No automatic matches or broad host grants: the background injects after selection.
  matches: [], registration: 'runtime',
  main() {
    // The background pings before injection. A DOM marker is insufficient after an
    // extension reload: it survives even though the old content context is invalid.
    document.getElementById('ambient-close-presence')?.remove();
    const documentId = crypto.randomUUID();
    let revision = 0, active = false, paused = false, working = false, taskId: string | null = null;
    let suggestion: Suggestion | null = null, lastContext = '', actionUntil = 0, scope = '';
    let refs = new Map<string, { element: HTMLElement; label: string }>();
    let inspectionVersion = '';
    const host = document.createElement('div'); host.id = 'ambient-close-presence';
    const shadow = host.attachShadow({ mode: 'closed' });
    const version = () => `${documentId}:${revision}:${location.href}`;
    const visible = (e: HTMLElement) => !!(e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    const label = (e: HTMLElement) => (e.getAttribute('aria-label') || (e as HTMLInputElement).labels?.[0]?.innerText || e.getAttribute('placeholder') || e.getAttribute('title') || e.innerText || (e as HTMLInputElement).value || '').trim().slice(0, 220);
    const own = (e: Node | null) => e === host || !!(e && host.contains(e));
    const style = document.createElement('style');
    style.textContent = `:host{all:initial;position:fixed;right:0;top:58%;z-index:2147483647;font:13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#20302c}*{box-sizing:border-box}button{font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #edc65e;outline-offset:3px}.orb{border:1px solid #ffffff65;border-right:0;background:#1c4739;color:white;border-radius:15px 0 0 15px;width:43px;height:49px;box-shadow:0 4px 20px #12352725;font-size:22px;position:relative}.orb.paused{background:#6d7773}.dot{position:absolute;right:7px;top:7px;width:6px;height:6px;background:#d7eeba;border-radius:50%}.bubble{position:absolute;right:54px;top:0;width:282px;background:#fffdf8;border:1px solid #dce3d8;border-radius:15px;padding:18px;box-shadow:0 12px 44px #112b3024}.eyebrow{font-size:10px;letter-spacing:.12em;color:#5c7468;text-transform:uppercase;margin-bottom:9px}.title{font-size:15px;font-weight:650;margin:0 0 8px}.detail{font-size:12px;color:#65736b;margin:0 0 16px}.primary{background:#244e3e;color:white;border:0;border-radius:7px;padding:9px 12px}.plain{background:transparent;border:0;color:#68756e;padding:8px}.menu{display:flex;flex-wrap:wrap;gap:5px;border-top:1px solid #e4e7df;margin-top:12px;padding-top:10px}.stop{background:#9b4137;color:white;border:0;border-radius:7px;padding:9px 12px}`;
    shadow.append(style);
    const container = document.createElement('div'); shadow.append(container);
    let expanded = false;
    function send(message: unknown) { return chrome.runtime.sendMessage(message).catch(() => { active = false; host.remove(); }); }
    function button(text: string, className: string, action: () => void) {
      const b = document.createElement('button'); b.textContent = text; b.className = className; b.onclick = action; return b;
    }
    function render() {
      container.replaceChildren(); if (!active) { host.remove(); return; }
      if (!host.isConnected) document.documentElement.append(host);
      const orb = button('✦', 'orb' + (paused ? ' paused' : ''), () => { expanded = !expanded; render(); });
      orb.setAttribute('aria-label', working ? 'Ambient is working. Open controls' : paused ? 'Ambient paused. Open controls' : 'Ambient is watching. Open controls');
      const dot = document.createElement('span'); dot.className = 'dot'; orb.append(dot); container.append(orb);
      // Vertical repositioning without changing the page underneath.
      orb.onpointerdown = e => {
        const start = e.clientY, original = host.getBoundingClientRect().top; let moved = false;
        orb.setPointerCapture(e.pointerId);
        orb.onpointermove = event => { if (Math.abs(event.clientY - start) > 5) moved = true; if (moved) host.style.top = Math.max(12, Math.min(innerHeight - 65, original + event.clientY - start)) + 'px'; };
        orb.onpointerup = () => { orb.onpointermove = null; if (moved) { orb.onclick = e => e.preventDefault(); void send({ type: 'presence:position', top: host.style.top }); } };
      };
      if ((suggestion && !paused) || expanded || working) {
        const bubble = document.createElement('div'); bubble.className = 'bubble';
        const eyebrow = document.createElement('div'); eyebrow.className = 'eyebrow'; eyebrow.textContent = working ? 'Ambient · working' : paused ? 'Ambient · paused' : 'Ambient · close companion';
        const title = document.createElement('p'); title.className = 'title'; title.textContent = working ? 'Checking your workspace' : suggestion?.title ?? (paused ? 'Monitoring is paused' : 'Here when you need a hand');
        const detail = document.createElement('p'); detail.className = 'detail'; detail.textContent = suggestion?.detail ?? 'Only the tabs you selected belong to this workspace.';
        bubble.append(eyebrow, title, detail);
        if (working) bubble.append(button('Stop task', 'stop', () => { void send({ type: 'ui:stop' }); }));
        else if (suggestion && !paused) {
          bubble.append(button('Check invoices', 'primary', () => { void send({ type: 'ui:accept', id: suggestion!.id }); }), button('Dismiss', 'plain', () => { void send({ type: 'ui:dismiss', id: suggestion!.id }); suggestion = null; expanded = false; render(); }));
        }
        bubble.append(button('Open assistant ↗', 'plain', () => { void send({ type: 'panel:open' }); }));
        if (expanded) {
          const menu = document.createElement('div'); menu.className = 'menu';
          menu.append(button(paused ? 'Resume tab' : 'Pause tab', 'plain', () => { void send({ type: 'tab:pause', paused: !paused }); }), button('Pause workspace', 'plain', () => { void send({ type: 'workspace:pause', paused: true }); }), button('Remove tab', 'plain', () => { void send({ type: 'tab:remove' }); })); bubble.append(menu);
        }
        container.append(bubble);
      }
    }
    function inspect(): BrowserObservation {
      refs = new Map();
      const elements: BrowserObservation['elements'] = [];
      for (const e of document.querySelectorAll<HTMLElement>('a[href],button,input,textarea,select,[role="button"],[role="textbox"],[contenteditable="true"],[role="tab"],[role="option"]')) {
        if (!visible(e) || own(e) || (e as HTMLInputElement).type === 'password' || (e as HTMLInputElement).type === 'hidden') continue;
        const ref = `e${elements.length + 1}`; const text = label(e); refs.set(ref, { element: e, label: text });
        elements.push({ ref, tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || '', label: text, value: 'value' in e ? String(e.value).slice(0, 500) : undefined, inputType: e.getAttribute('type') || undefined });
        if (elements.length >= 180) break;
      }
      inspectionVersion = version();
      return { url: location.href, title: document.title, version: inspectionVersion, text: document.body.innerText.slice(0, 24000), elements };
    }
    async function execute(action: BrowserAction): Promise<BrowserObservation> {
      if (!active || paused) throw new Error('Tab is not actively watched.');
      if (action.action === 'inspect' || action.action === 'screenshot') return inspect();
      if (!working || !taskId) throw new Error('No active browser task.');
      if (action.action === 'navigate') throw new Error('Navigation must be handled by the background bridge.');
      if (action.action === 'scroll') { scrollBy({ top: action.text === 'up' ? -innerHeight * .75 : innerHeight * .75 }); return inspect(); }
      if (action.version !== inspectionVersion || action.version !== version()) throw new Error('Page changed since inspection. Inspect again before acting.');
      const target = refs.get(action.ref || ''); const element = target?.element;
      if (!element?.isConnected || !visible(element) || label(element) !== target?.label) throw new Error('Target changed. Inspect the page again.');
      const targetLabel = label(element);
      if (isCommitControl(targetLabel)) throw new Error('This control requires human review. Saving, posting, sending and deleting are disabled.');
      const link = element.closest<HTMLAnchorElement>('a[href]');
      if (link && !link.href.startsWith('javascript:') && !withinScope(link.href, scope)) throw new Error('This link leaves the selected account or page scope.');
      if (/password|bank account|routing number|credit card|security code/i.test(targetLabel)) throw new Error('Sensitive account fields are outside this prototype.');
      actionUntil = Date.now() + 1800;
      if (action.action === 'click') element.click();
      else if (action.action === 'fill') {
        const current = 'value' in element ? String(element.value) : element.textContent ?? '';
        if (!canReplaceValue(targetLabel, current, action.text ?? '')) throw new Error('This field already contains a value. Leave existing user input for human review.');
        if (element instanceof HTMLSelectElement) {
          const option = [...element.options].find(o => o.value === action.text || o.text === action.text);
          if (!option) throw new Error('No matching select option.'); element.value = option.value;
        } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, action.text ?? '');
        } else if (element.isContentEditable) element.textContent = action.text ?? '';
        else throw new Error('This target is not an editable field.');
        element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (action.action === 'press') {
        const key = action.text?.toUpperCase();
        if (!['ENTER', 'TAB', 'ESCAPE'].includes(key ?? '')) throw new Error('Supported keys are ENTER, TAB and ESCAPE.');
        if (key === 'ENTER' && !/search|filter|find/i.test(targetLabel + ' ' + (element.getAttribute('type') ?? ''))) throw new Error('Enter is only permitted in a search field. Use the human review step for forms.');
        element.focus();
        // Native keyboard dispatch is done by the background after this validation.
        return { ...inspect(), text: '[KEY_TARGET_VALIDATED]\n' + document.body.innerText.slice(0, 24000) };
      }
      revision++; return inspect();
    }
    async function observe() {
      if (!active || paused || working || Date.now() < actionUntil) return;
      const heading = [...document.querySelectorAll<HTMLElement>('h1,h2,[role="heading"],.uir-record-type')].filter(visible).map(e => e.textContent).join(' ').slice(0, 1000);
      const hasForm = [...document.querySelectorAll<HTMLElement>('form,input[name*="entity"],input[id*="entity"],input[name*="vendor"]')].some(visible);
      const vendorInput = document.querySelector<HTMLInputElement>('input[name="entity_display"],input[id="entity_display"],input[name="vendor"],input[aria-label="Vendor"]');
      const vendor = vendorInput?.value?.slice(0, 300) ?? '';
      const kind = detectBillForm(location.href, heading, hasForm) ? 'bill_form' : 'page';
      const context = { tabId: 0, url: location.href, title: document.title, version: version(), kind, vendor, observedAt: Date.now() };
      const fingerprint = `${location.href}:${kind}:${vendor}`;
      if (fingerprint === lastContext) return; lastContext = fingerprint;
      await send({ type: 'page:context', context });
    }
    let debounce: ReturnType<typeof setTimeout>;
    new MutationObserver(mutations => {
      if (mutations.every(m => own(m.target) || [...m.addedNodes, ...m.removedNodes].every(n => n === host) && m.type === 'childList')) return;
      revision++; clearTimeout(debounce); debounce = setTimeout(() => { void observe(); }, 650);
    }).observe(document.body ?? document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    document.addEventListener('input', e => { if (!own(e.target as Node)) { revision++; clearTimeout(debounce); debounce = setTimeout(() => { void observe(); }, 600); } }, true);
    setInterval(() => { void observe(); }, 2500);
    chrome.runtime.onMessage.addListener((message, _sender, respond) => {
      if (message.type === 'observer:ping') { respond({ ok: true }); }
      else if (message.type === 'presence') {
        active = message.active; paused = message.paused; working = message.working; taskId = message.taskId; suggestion = message.suggestion; scope = message.scope ?? '';
        if (message.top) host.style.top = message.top;
        if (message.reset) lastContext = '';
        render(); void observe(); respond({ ok: true });
      } else if (message.type === 'execute') {
        void execute(message.action).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: String(error.message ?? error) })); return true;
      }
    });
    void send({ type: 'page:ready' });
  },
});
