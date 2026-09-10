import { detectBillForm, isCommitControl, canReplaceValue, withinScope, type BrowserAction, type BrowserObservation, type Suggestion } from '@ambient/shared';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Presence, presenceStyles } from '../src/components/Presence';
import { assertFreshTarget, targetFingerprint, isSearchField } from '../src/browser-target';

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
    let refs = new Map<string, { element: HTMLElement; fingerprint: string }>();
    let inspectionVersion = '', inspectedUrl = '', progress = '';
    let ambientEnabled = false, ambientEpoch = 0, baselineNeeded = false, visitId = 'initial';
    let lastObservedUrl = location.href, lastKind = '', popupError = '';
    let monitoring = false, poll: ReturnType<typeof setInterval> | undefined;
    const host = document.createElement('div'); host.id = 'ambient-close-presence';
    const shadow = host.attachShadow({ mode: 'closed' });
    const version = () => `${documentId}:${revision}:${location.href}`;
    const visible = (e: HTMLElement) => !!(e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    const label = (e: HTMLElement) => (e.getAttribute('aria-label') || (e as HTMLInputElement).labels?.[0]?.innerText || e.getAttribute('placeholder') || e.getAttribute('title') || e.innerText || (e as HTMLInputElement).value || '').trim().slice(0, 220);
    const own = (e: Node | null) => e === host || !!(e && host.contains(e));
    const style = document.createElement('style'); style.textContent = presenceStyles; shadow.append(style);
    const container = document.createElement('div'); shadow.append(container);
    const root = createRoot(container);
    function send(message: unknown) { return chrome.runtime.sendMessage(message); }
    function render() {
      if (!active) { host.remove(); return; }
      if (!host.isConnected) document.documentElement.append(host);
      host.style.setProperty('--ambient-top', host.style.top || '58vh');
      root.render(createElement(Presence, { paused, working, monitoring: ambientEnabled, suggestion, progress, error: popupError,
        send, onPosition: (top: number) => { host.style.top = top + 'px'; host.style.setProperty('--ambient-top', top + 'px'); },
      }));
    }
    function inspect(): BrowserObservation {
      refs = new Map();
      const elements: BrowserObservation['elements'] = [];
      const controls = 'a[href],button,input,textarea,select,[role="button"],[role="link"],[role="textbox"],[contenteditable="true"],[role="tab"],[role="option"]';
      // Gmail opens conversations from table rows, not ordinary anchor/button elements.
      const messageRows = location.hostname === 'mail.google.com' ? ',tr.zA,[role="main"] [role="row"]' : '';
      for (const e of document.querySelectorAll<HTMLElement>(controls + messageRows)) {
        if (!visible(e) || own(e) || (e as HTMLInputElement).type === 'password' || (e as HTMLInputElement).type === 'hidden') continue;
        const ref = `e${elements.length + 1}`; const text = label(e); refs.set(ref, { element: e, fingerprint: targetFingerprint(e, text) });
        elements.push({ ref, tag: e.tagName.toLowerCase(), role: isSearchField(e, text, location.hostname) ? 'searchbox' : e.getAttribute('role') || '', label: text, value: 'value' in e ? String(e.value).slice(0, 500) : undefined, inputType: e.getAttribute('type') || undefined });
        if (elements.length >= 180) break;
      }
      revision++; inspectionVersion = version(); inspectedUrl = location.href;
      return { url: location.href, title: document.title, version: inspectionVersion, text: document.body.innerText.slice(0, 24000), elements };
    }
    async function execute(action: BrowserAction): Promise<BrowserObservation> {
      if (!active || paused) throw new Error('Tab is not actively watched.');
      if (action.action === 'inspect' || action.action === 'screenshot') return inspect();
      if (!working || !taskId) throw new Error('No active browser task.');
      if (action.action === 'navigate') throw new Error('Navigation must be handled by the background bridge.');
      if (action.action === 'scroll') { scrollBy({ top: action.text === 'up' ? -innerHeight * .75 : innerHeight * .75 }); return inspect(); }
      const target = refs.get(action.ref || ''); const element = target?.element;
      if (!element || !target) throw new Error('Target is not in the latest inspection. Inspect the page again.');
      assertFreshTarget({ requestedVersion: action.version, inspectionVersion, inspectedUrl, currentUrl: location.href,
        connected: element.isConnected, visible: visible(element), before: target.fingerprint, after: targetFingerprint(element, label(element)) });
      if (element.matches(':disabled,[readonly],[aria-disabled="true"]')) throw new Error('This control is disabled or read-only.');
      const targetLabel = label(element);
      if (isCommitControl(targetLabel)) throw new Error('This control requires human review. Saving, posting, sending and deleting are disabled.');
      const link = element.closest<HTMLAnchorElement>('a[href]');
      if (link && !link.href.startsWith('javascript:') && !withinScope(link.href, scope)) throw new Error('This link leaves the selected account or page scope.');
      if (/password|bank account|routing number|credit card|security code/i.test(targetLabel)) throw new Error('Sensitive account fields are outside this prototype.');
      actionUntil = Date.now() + 1800;
      if (action.action === 'click') element.click();
      else if (action.action === 'fill') {
        const current = 'value' in element ? String(element.value) : element.textContent ?? '';
        if (!canReplaceValue(isSearchField(element, targetLabel, location.hostname) ? 'Search' : targetLabel, current, action.text ?? '')) throw new Error('This field already contains a value. Leave existing user input for human review.');
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
        if (key === 'ENTER' && !isSearchField(element, targetLabel, location.hostname)) throw new Error('Enter is only permitted in a search field. Use the human review step for forms.');
        element.focus();
        // Native keyboard dispatch is done by the background after this validation.
        return { ...inspect(), text: '[KEY_TARGET_VALIDATED]\n' + document.body.innerText.slice(0, 24000) };
      }
      revision++; return inspect();
    }
    async function observe() {
      if (!active || paused || working || !ambientEnabled || Date.now() < actionUntil) return;
      const heading = [...document.querySelectorAll<HTMLElement>('h1,h2,[role="heading"],.uir-record-type')].filter(visible).map(e => e.textContent).join(' ').slice(0, 1000);
      const hasForm = [...document.querySelectorAll<HTMLElement>('form,input[name*="entity"],input[id*="entity"],input[name*="vendor"]')].some(visible);
      const vendorInput = document.querySelector<HTMLInputElement>('input[name="entity_display"],input[id="entity_display"],input[name="vendor"],input[aria-label="Vendor"]');
      const vendor = vendorInput?.value?.slice(0, 300) ?? '';
      const kind = detectBillForm(location.href, heading, hasForm) ? 'bill_form' : 'page';
      if (location.href !== lastObservedUrl || (lastKind && lastKind !== kind)) visitId = crypto.randomUUID();
      lastObservedUrl = location.href; lastKind = kind;
      const text = [heading, vendor ? `Selected vendor: ${vendor}` : '', document.body.innerText].filter(Boolean).join('\n').slice(0, 16000);
      const context = { tabId: 0, url: location.href, title: document.title, version: version(), visitId, kind, vendor, text, baseline: baselineNeeded, ambientEpoch, observedAt: Date.now() };
      const fingerprint = JSON.stringify([location.href, visitId, kind, vendor, text]);
      if (fingerprint === lastContext) return; lastContext = fingerprint;
      baselineNeeded = false; await send({ type: 'page:context', context }).catch(() => { active = false; host.remove(); });
    }
    let debounce: ReturnType<typeof setTimeout>;
    const onInput = (e: Event) => { if (!own(e.target as Node)) { revision++; clearTimeout(debounce); debounce = setTimeout(() => { void observe(); }, 1200); } };
    const observer = new MutationObserver(mutations => {
      if (mutations.every(m => own(m.target) || [...m.addedNodes, ...m.removedNodes].every(n => n === host) && m.type === 'childList')) return;
      revision++; clearTimeout(debounce); debounce = setTimeout(() => { void observe(); }, 1200);
    });
    function setMonitoring() {
      const enabled = active && !paused && !working && ambientEnabled;
      if (enabled === monitoring) return;
      monitoring = enabled;
      if (enabled) {
        observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
        document.addEventListener('input', onInput, true);
        poll = setInterval(() => { void observe(); }, 5000);
      } else {
        observer.disconnect(); document.removeEventListener('input', onInput, true);
        clearTimeout(debounce); if (poll) clearInterval(poll); poll = undefined;
      }
    }
    chrome.runtime.onMessage.addListener((message, _sender, respond) => {
      if (message.type === 'observer:ping') { respond({ ok: true }); }
      else if (message.type === 'ambient:activated') {
        if (!working && active) { visitId = crypto.randomUUID(); lastContext = ''; void observe(); } respond({ ok: true });
      } else if (message.type === 'presence') {
        if (message.working || message.baseline) baselineNeeded = true;
        if (message.ambientEpoch !== ambientEpoch) lastContext = '';
        ambientEpoch = message.ambientEpoch ?? 0; ambientEnabled = !!message.ambientEnabled;
        active = message.active; paused = message.paused; working = message.working; taskId = message.taskId; suggestion = message.suggestion; scope = message.scope ?? ''; progress = message.progress ?? ''; popupError = message.error ?? '';
        if (message.top) host.style.top = message.top;
        if (message.reset) lastContext = '';
        render(); setMonitoring(); void observe(); respond({ ok: true });
      } else if (message.type === 'execute') {
        void execute(message.action).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: String(error.message ?? error) })); return true;
      }
    });
    void send({ type: 'page:ready' }).catch(() => { active = false; host.remove(); });
  },
});
