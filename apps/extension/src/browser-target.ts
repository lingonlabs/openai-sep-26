// Validate the inspected control, rather than unrelated page-wide mutations.
// Keep the DOM node reference: a visually identical replacement still requires inspection.
export function isSheetNameBox(element: HTMLElement, url: string): boolean {
  const page = new URL(url);
  return page.hostname === 'docs.google.com' && page.pathname.startsWith('/spreadsheets/') && element.tagName === 'INPUT'
    && (element.getAttribute('id') === 't-name-box' || /^name box$/i.test(element.getAttribute('aria-label') ?? ''));
}
export function isCellAddress(value: string): boolean { return /^\$?[A-Z]{1,3}\$?[1-9][0-9]{0,6}$/i.test(value); }

export function isSearchField(element: HTMLElement, label: string, hostname: string): boolean {
  if (!['INPUT', 'TEXTAREA'].includes(element.tagName) && !element.isContentEditable) return false;
  return element.getAttribute('type') === 'search' || element.getAttribute('role') === 'searchbox'
    || !!element.closest('[role="search"]')
    || (hostname === 'mail.google.com' && element.getAttribute('name') === 'q')
    || /\b(search|filter|find)\b/i.test(label);
}

export function targetFingerprint(element: HTMLElement, label: string): string {
  return JSON.stringify({
    label, tag: element.tagName,
    attributes: ['type', 'role', 'href', 'name', 'id', 'disabled', 'readonly', 'aria-disabled', 'contenteditable']
      .map(name => element.getAttribute(name)),
    value: 'value' in element ? String(element.value) : element.isContentEditable ? element.textContent : null,
    form: element.closest('form')?.getAttribute('action') ?? null,
    searchRegion: !!element.closest('[role="search"]'),
  });
}

export function assertFreshTarget(input: {
  requestedVersion: string | null; inspectionVersion: string;
  inspectedUrl: string; currentUrl: string;
  connected: boolean; visible: boolean; before: string; after: string;
}): void {
  if (!input.requestedVersion || input.requestedVersion !== input.inspectionVersion || input.inspectedUrl !== input.currentUrl)
    throw new Error('Page or inspection changed. Inspect again before acting.');
  if (!input.connected || !input.visible || input.before !== input.after)
    throw new Error('Target changed since inspection. Inspect the page again.');
}
