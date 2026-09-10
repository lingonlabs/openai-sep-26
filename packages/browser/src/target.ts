// Adapted from Philipp's target-control validation (prototype/ambient-local).
export function isSearchField(
  element: HTMLElement,
  label: string,
  app: string,
) {
  if (
    !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) &&
    !element.isContentEditable
  )
    return false;
  return (
    element.getAttribute("type") === "search" ||
    element.getAttribute("role") === "searchbox" ||
    !!element.closest('[role="search"]') ||
    (app === "gmail" &&
      (element.getAttribute("name") === "q" || /^ask gmail$/i.test(label))) ||
    /\b(search|filter|find)\b/i.test(label)
  );
}
export function targetFingerprint(element: HTMLElement, description: unknown) {
  return JSON.stringify({
    description,
    attributes: [
      "type",
      "role",
      "href",
      "name",
      "id",
      "disabled",
      "readonly",
      "aria-disabled",
      "contenteditable",
    ].map((a) => element.getAttribute(a)),
    form: element.closest("form")?.getAttribute("action"),
    searchRegion: !!element.closest('[role="search"]'),
  });
}
