import {
  CommandSchema,
  type BrowserCommand,
  type BrowserAction,
  type CommandResult,
  type Observation,
  type PageElement,
  type PageContext,
  type AppKind,
  normalize,
  tabScope,
  withinScope,
} from "@close/shared";
import { checkVendorList, vendorReview, verifyVendorIdentity } from "./vendor";
import { isSearchField, targetFingerprint } from "./target";
export { savedVendorUrl } from "./vendor";

const dangerous =
  /\b(save|submit|post|delete|remove|trash|archive|send|compose|pay|purchase|approve|reject|void|sign out|log out)\b/i;
const sensitive =
  /password|secret|token|credit.?card|routing.?number|bank.?account/i;
const selector =
  'input:not([type="hidden"]):not([type="password"]),textarea,select,button,a[href],[role="button"],[role="link"],[role="option"],[role="tab"],[role="textbox"],[role="combobox"],[role="searchbox"],[contenteditable="true"]';
export class PageRuntime {
  readonly documentId = crypto.randomUUID();
  private version = 0;
  private visitId = `${performance.timeOrigin}|initial`;
  private visitKey = "";
  private inspections = new Map<
    number,
    { url: string; fingerprints: Map<string, string> }
  >();
  private signature = "";
  private seq = 0;
  private ids = new WeakMap<Element, string>();
  private elements = new Map<string, HTMLElement>();
  private agentWorking = false;
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private onContext: ((context: PageContext) => void) | null = null;
  private stoppedTasks = new Set<string>();
  private seenCommands = new Set<string>();
  private listeners: { type: string; fn: EventListener }[] = [];
  constructor(
    readonly doc: Document,
    readonly tabId: string,
    readonly app: AppKind,
    readonly frameId = 0,
  ) {}
  private visible(el: HTMLElement) {
    const win = this.doc.defaultView!;
    const style = win.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      el.getClientRects().length > 0 &&
      !el.closest("[data-close-copilot-ui]")
    );
  }
  private label(el: HTMLElement) {
    return this.rawLabel(el)
      .replace(/\s+/g, " ")
      .replace(/\s*\*\s*$/, "")
      .trim()
      .slice(0, 500);
  }
  private rawLabel(el: HTMLElement) {
    const explicit = el.getAttribute("aria-label");
    if (explicit) return explicit.trim();
    const labelled = el
      .getAttribute("aria-labelledby")
      ?.split(/\s+/)
      .map((id) => this.doc.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (labelled) return labelled;
    const labels =
      "labels" in el
        ? Array.from((el as HTMLInputElement).labels ?? [])
            .map((l) => l.textContent ?? "")
            .join(" ")
            .trim()
        : "";
    if (labels && el.tagName !== "SELECT")
      return labels.replace(/\s+/g, " ").replace(/\s*\*\s*$/, "");
    if (el.tagName === "SELECT" && "labels" in el) {
      const own = Array.from((el as HTMLSelectElement).labels ?? [])
        .map((label) => {
          const clone = label.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll("select,input,textarea")
            .forEach((x) => x.remove());
          return clone.textContent?.trim() ?? "";
        })
        .join(" ");
      if (own) return own;
    }
    if (el.id) {
      const matching = this.doc.querySelector(
        `label[for="${CSS.escape(el.id)}"]`,
      );
      if (matching?.textContent) return matching.textContent.trim();
    }
    const labelledRow = el
      .closest("td")
      ?.previousElementSibling?.textContent?.trim();
    return (
      el.getAttribute("placeholder") ||
      el.getAttribute("title") ||
      el.innerText ||
      (el as HTMLInputElement).value ||
      labelledRow ||
      el.getAttribute("name") ||
      el.id ||
      el.tagName
    )
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 500);
  }
  private describe(el: HTMLElement): PageElement {
    let id = this.ids.get(el);
    if (!id) {
      id = `e${++this.seq}`;
      this.ids.set(el, id);
    }
    this.elements.set(id, el);
    const tag = el.tagName.toLowerCase();
    const inputType = tag === "input" ? (el as HTMLInputElement).type : null;
    const label = this.label(el);
    const isInput =
      ["input", "textarea", "select"].includes(tag) || el.isContentEditable;
    const value = isInput
      ? "value" in el
        ? String((el as HTMLInputElement).value)
        : (el.textContent ?? "")
      : null;
    const role =
      (isSearchField(el, label, this.app)
        ? "searchbox"
        : el.getAttribute("role")) ||
      (tag === "a"
        ? "link"
        : tag === "button"
          ? "button"
          : tag === "select"
            ? "select"
            : isInput
              ? "textbox"
              : "other");
    return {
      id,
      tag,
      role,
      label,
      value: value?.slice(0, 5000) ?? null,
      inputType,
      href: tag === "a" ? (el as HTMLAnchorElement).href : null,
      options:
        tag === "select"
          ? Array.from((el as HTMLSelectElement).options)
              .slice(0, 200)
              .map((o) => ({ label: o.text.trim(), value: o.value }))
          : [],
      disabled:
        !!(el as HTMLInputElement).disabled ||
        el.getAttribute("aria-disabled") === "true",
      readOnly: !!(el as HTMLInputElement).readOnly,
      blocked:
        sensitive.test(label) ||
        ["password", "file", "submit", "reset"].includes(inputType ?? "") ||
        ((tag === "button" || tag === "a" || role === "button") &&
          dangerous.test(label)),
      required:
        !!(el as HTMLInputElement).required ||
        el.getAttribute("aria-required") === "true" ||
        /\*\s*$/.test(this.rawLabel(el)),
      checked: ["checkbox", "radio"].includes(inputType ?? "")
        ? (el as HTMLInputElement).checked
        : null,
    };
  }
  inspect(source: PageContext["source"] = "user"): Observation {
    const bodyText = this.doc.body?.innerText ?? "";
    const controls = Array.from(
      this.doc.querySelectorAll<HTMLElement>(selector),
    ).filter((el) => this.visible(el));
    const elements = controls.slice(0, 350).map((el) => this.describe(el));
    const text = bodyText.replace(/\n{3,}/g, "\n\n").slice(0, 40000);
    const url = this.doc.location.href;
    const title = this.doc.title;
    const fingerprints = new Map(
      elements.map((e) => [
        e.id,
        targetFingerprint(this.elements.get(e.id)!, e),
      ]),
    );
    const current = JSON.stringify({
      url,
      title,
      text,
      elements,
      fingerprints: [...fingerprints],
    });
    if (current !== this.signature) {
      this.signature = current;
      this.version++;
    }
    const vendor =
      elements
        .find((e) => /^(vendor|vendor name)\s*\*?$/i.test(e.label))
        ?.value?.trim() || null;
    const fixture = this.doc.body?.dataset.workflow;
    const pageUrl = new URL(url);
    const vendorPage =
      this.app === "netsuite" && /\/vendor\.nl$/i.test(pageUrl.pathname);
    const billForm =
      this.app === "netsuite" &&
      !pageUrl.searchParams.has("id") &&
      /bill/i.test(title + " " + text.slice(0, 1500)) &&
      elements.some((e) => /^(vendor|vendor name)/i.test(e.label)) &&
      elements.some((e) => /reference|invoice (number|#)/i.test(e.label));
    const workflow = (fixture ||
      (vendorPage
        ? pageUrl.searchParams.has("id") &&
          pageUrl.searchParams.get("e") !== "T"
          ? "vendor_record"
          : "vendor_form"
        : this.app === "netsuite" && /^vendors\b/i.test(title.trim())
          ? "vendor_list"
          : billForm
            ? "bill_form"
            : this.app === "gmail"
              ? elements.some((e) => e.role === "searchbox")
                ? "inbox"
                : "message"
              : this.app === "sheets"
                ? "vendors"
                : /bills/i.test(title + " " + text.slice(0, 1500))
                  ? "bill_list"
                  : "other")) as PageContext["workflow"];
    const visitKey = `${url}|${workflow}`;
    if (visitKey !== this.visitKey) {
      if (this.visitKey)
        this.visitId = `${performance.timeOrigin}|${crypto.randomUUID()}`;
      this.visitKey = visitKey;
    }
    this.inspections.set(this.version, { url, fingerprints });
    if (this.inspections.size > 8)
      this.inspections.delete(this.inspections.keys().next().value!);
    const limitations: string[] = [];
    if (bodyText.length > 40000)
      limitations.push(
        "Visible page text was truncated at 40,000 characters; additional content is not evidence.",
      );
    if (controls.length > 350)
      limitations.push("Only the first 350 visible controls were inspected.");
    if (this.doc.querySelector("iframe"))
      limitations.push("Embedded frames may need separate inspection.");
    return {
      context: {
        tabId: this.tabId,
        frameId: this.frameId,
        documentId: this.documentId,
        visitId: this.visitId,
        pageVersion: this.version,
        url,
        title,
        app: this.app,
        workflow,
        vendor,
        observedAt: new Date().toISOString(),
        source,
        text: text.slice(0, 12000),
      },
      text,
      elements,
      limitations,
    };
  }
  watch(callback: (context: PageContext) => void) {
    this.unwatch();
    this.onContext = callback;
    const emit = (source: PageContext["source"]) => {
      if (this.onContext) this.onContext(this.inspect(source).context);
    };
    const changed = () => {
      clearTimeout(this.timer);
      const source = this.agentWorking ? "agent" : "user";
      this.timer = setTimeout(() => emit(source), 350);
    };
    this.observer = new this.doc.defaultView!.MutationObserver((mutations) => {
      if (
        mutations.every(
          (m) =>
            (m.target as Element).closest?.("[data-close-copilot-ui]") ||
            (m.type === "childList" &&
              [...m.addedNodes, ...m.removedNodes].every(
                (n) => (n as HTMLElement).dataset?.closeCopilotUi,
              )),
        )
      )
        return;
      changed();
    });
    this.observer.observe(this.doc.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-expanded", "aria-selected", "disabled"],
    });
    for (const type of ["input", "change", "click"]) {
      const fn: EventListener = changed;
      this.doc.addEventListener(type, fn, true);
      this.listeners.push({ type, fn });
    }
    emit("initial");
  }
  revisit() {
    if (!this.onContext) return;
    this.visitId = `${performance.timeOrigin}|${crypto.randomUUID()}`;
    this.onContext(this.inspect("user").context);
  }
  unwatch() {
    this.observer?.disconnect();
    this.observer = null;
    clearTimeout(this.timer);
    for (const { type, fn } of this.listeners)
      this.doc.removeEventListener(type, fn, true);
    this.listeners = [];
    this.onContext = null;
  }
  cancel(taskId: string) {
    this.stoppedTasks.add(taskId);
  }
  private target(id: string, before: Observation) {
    const described = before.elements.find((e) => e.id === id),
      element = this.elements.get(id);
    if (!described || !element?.isConnected || !this.visible(element))
      throw new Error("STALE_ELEMENT: Inspect the page again.");
    if (
      described.blocked ||
      described.disabled ||
      sensitive.test(described.label)
    )
      throw new Error(
        "ACTION_BLOCKED: This control cannot be operated by the assistant.",
      );
    return { described, element };
  }
  private write(el: HTMLElement, value: string) {
    if (el.isContentEditable) {
      el.textContent = value;
    } else {
      const win = this.doc.defaultView!;
      const proto =
        el.tagName === "TEXTAREA"
          ? win.HTMLTextAreaElement.prototype
          : el.tagName === "SELECT"
            ? win.HTMLSelectElement.prototype
            : win.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (!setter) throw new Error("UNSUPPORTED_FIELD");
      setter.call(el, value);
    }
    el.dispatchEvent(
      new this.doc.defaultView!.Event("input", { bubbles: true }),
    );
    el.dispatchEvent(
      new this.doc.defaultView!.Event("change", { bubbles: true }),
    );
  }
  async execute(
    raw: BrowserCommand,
    signal: AbortSignal,
    native?: (
      action: BrowserAction,
      verify: () => void,
    ) => Promise<string | void>,
  ): Promise<CommandResult> {
    const command = CommandSchema.parse(raw);
    const base = {
      type: "browser.result" as const,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      taskId: command.taskId,
    };
    let started = false;
    let interrupted = false;
    let nativeKey: { element: HTMLElement; key: string; seen: boolean } | null =
      null;
    const onHuman = (event: Event) => {
      if (!event.isTrusted) return;
      if (
        nativeKey &&
        event.type === "keydown" &&
        event.target === nativeKey.element &&
        (event as KeyboardEvent).key === nativeKey.key &&
        !nativeKey.seen
      ) {
        nativeKey.seen = true;
        return;
      }
      interrupted = true;
    };
    const checkActive = () => {
      signal.throwIfAborted();
      if (this.stoppedTasks.has(command.taskId))
        throw new Error("TASK_STOPPED");
      if (interrupted)
        throw new Error(
          "USER_INTERRUPTED: You interacted with the page. Review any changes already made.",
        );
    };
    for (const type of ["pointerdown", "keydown", "input"])
      this.doc.addEventListener(type, onHuman, true);
    try {
      if (this.seenCommands.has(command.commandId))
        throw new Error("DUPLICATE_COMMAND: Actions are not replayed.");
      this.seenCommands.add(command.commandId);
      if (this.seenCommands.size > 1000)
        this.seenCommands.delete(this.seenCommands.values().next().value!);
      checkActive();
      const action = command.action;
      const previous = this.inspections.get(command.expectedPageVersion ?? -1);
      const before = this.inspect();
      if (command.tabId !== this.tabId || command.frameId !== this.frameId)
        throw new Error("WRONG_TARGET");
      const scope = command.scope ?? tabScope(before.context.url);
      if (!scope || !withinScope(before.context.url, scope))
        throw new Error(
          "OUTSIDE_SCOPE: This page left its selected account or document.",
        );
      if (
        action.kind !== "inspect" &&
        command.expectedDocumentId !== this.documentId
      )
        throw new Error("STALE_PAGE: Inspect the page again before acting.");
      if (action.kind !== "inspect" && action.kind !== "screenshot") {
        if ("elementId" in action) {
          const described = before.elements.find(
            (e) => e.id === action.elementId,
          );
          const element = this.elements.get(action.elementId);
          if (
            !previous ||
            previous.url !== before.context.url ||
            !described ||
            !element?.isConnected ||
            previous.fingerprints.get(action.elementId) !==
              targetFingerprint(element, described)
          )
            throw new Error(
              "STALE_PAGE: The target changed. Inspect the page again before acting.",
            );
        } else if (command.expectedPageVersion !== before.context.pageVersion)
          throw new Error("STALE_PAGE: Inspect the page again before acting.");
      }
      if (action.kind === "inspect")
        return { ...base, status: "ok", observation: before };
      if (action.kind === "screenshot") {
        if (!native)
          throw new Error(
            "SCREENSHOT_UNAVAILABLE: Screenshots require the Chrome extension.",
          );
        const verify = () => {
          checkActive();
          if (!withinScope(this.doc.location.href, scope))
            throw new Error("OUTSIDE_SCOPE");
        };
        const screenshot = await native(action, verify);
        verify();
        if (typeof screenshot !== "string")
          throw new Error("SCREENSHOT_UNAVAILABLE");
        return {
          ...base,
          status: "ok",
          observation: this.inspect("agent"),
          screenshot,
        };
      }
      if (action.kind === "navigate") {
        if (
          !withinScope(action.url, scope) ||
          /[?&](action|mode)=(delete|save|submit|approve)/i.test(action.url) ||
          !before.elements.some((e) => e.href === action.url && !e.blocked)
        )
          throw new Error(
            "ACTION_BLOCKED: Navigate only to a safe link observed in this selected account.",
          );
        const link = before.elements.find(
          (e) => e.href === action.url && !e.blocked,
        )!;
        const { element } = this.target(link.id, before);
        if (
          ["bill_form", "vendor_form"].includes(before.context.workflow) &&
          before.elements.some(
            (e) =>
              e.value?.trim() &&
              /^(invoice number|reference no\.?|company name|vendor name|memo)$/i.test(
                e.label,
              ),
          )
        )
          throw new Error(
            "UNSAVED_FORM: Review the edited form before leaving this page.",
          );
        checkActive();
        started = true;
        if (native) await native(action, checkActive);
        else element.click();
        await new Promise((r) => setTimeout(r, 200));
        checkActive();
        return { ...base, status: "ok", observation: this.inspect("agent") };
      }
      if (action.kind === "check_vendor") {
        if (command.phase !== "vendor_setup" || this.app !== "netsuite")
          throw new Error(
            "ACTION_BLOCKED: Vendor checks require a vendor setup task.",
          );
        return {
          ...base,
          status: "ok",
          observation: before,
          vendorCheck: checkVendorList(this.doc, before, action.name),
        };
      }
      this.agentWorking = true;
      if (action.kind === "prepare_vendor") {
        if (
          command.phase !== "vendor_setup" ||
          this.app !== "netsuite" ||
          before.context.workflow !== "vendor_form" ||
          new URL(before.context.url).searchParams.has("id")
        )
          throw new Error(
            "ACTION_BLOCKED: Open a new, unsaved company vendor form.",
          );
        const edits: { element: HTMLElement; value: string; label: string }[] =
          [];
        for (const [pattern, value] of [
          [/^(company name|vendor name)$/i, action.values.name],
          [/^e-?mail$/i, action.values.email],
        ] as const) {
          if (!value) continue;
          const matches = before.elements.filter(
            (e) =>
              pattern.test(e.label) &&
              e.value !== null &&
              !e.disabled &&
              !e.readOnly &&
              e.role !== "combobox",
          );
          if (matches.length !== 1)
            throw new Error(
              "UNSUPPORTED_VENDOR_FORM: Could not identify a unique company name or email field.",
            );
          const field = matches[0];
          if (
            field.value?.trim() &&
            normalize(field.value) !== normalize(value)
          )
            throw new Error(
              "FORM_NOT_EMPTY: Existing vendor details would be overwritten.",
            );
          if (field.value !== value)
            edits.push({
              element: this.target(field.id, before).element,
              value,
              label: field.label,
            });
        }
        for (const edit of edits) {
          checkActive();
          started = true;
          this.write(edit.element, edit.value);
          await new Promise((r) => setTimeout(r, 90));
        }
        checkActive();
        const after = this.inspect("agent");
        verifyVendorIdentity(after, action.values);
        return {
          ...base,
          status: "ok",
          observation: after,
          vendorReview: vendorReview(after),
          changes: edits.map((e) => ({
            field: e.label,
            from: "",
            to: e.value,
          })),
        };
      }
      if (action.kind === "create_vendor") {
        if (command.phase !== "vendor_create")
          throw new Error(
            "ACTION_BLOCKED: Creating a vendor requires explicit panel approval.",
          );
        verifyVendorIdentity(before, action.values);
        const review = vendorReview(before);
        if (JSON.stringify(review) !== JSON.stringify(action.review))
          throw new Error(
            "REVIEW_CHANGED: Vendor details changed. Refresh and approve the new review.",
          );
        if (review.missing.length)
          throw new Error(
            "REQUIRED_FIELDS: Complete " + review.missing.join(", "),
          );
        const save = before.elements.find(
          (e) =>
            /^save$/i.test(e.label) &&
            !e.disabled &&
            (e.tag === "button" ||
              e.inputType === "submit" ||
              e.role === "button"),
        );
        const button = save && this.elements.get(save.id);
        if (!button || !button.isConnected || !this.visible(button))
          throw new Error("SAVE_UNAVAILABLE: No verified vendor Save control.");
        checkActive();
        started = true;
        button.click();
        await new Promise((r) => setTimeout(r, 200));
        checkActive();
        return { ...base, status: "ok", observation: this.inspect("agent") };
      }
      if (action.kind === "prepare_bill") {
        if (
          command.phase !== "prepare" ||
          this.app !== "netsuite" ||
          before.context.workflow !== "bill_form"
        )
          throw new Error(
            "ACTION_BLOCKED: Bill preparation requires an approved bill task.",
          );
        if (action.values.currency !== "USD")
          throw new Error("UNSUPPORTED_CURRENCY: Review this bill manually.");
        const vendorControl = before.elements.find((e) =>
          /^(vendor|vendor name)$/i.test(e.label),
        );
        if (
          vendorControl?.role === "combobox" &&
          vendorControl.tag !== "select"
        )
          throw new Error(
            "UNSUPPORTED_VENDOR_SELECTOR: This vendor picker needs application-specific selection and verification. No fields were changed.",
          );
        const currency = before.elements.find((e) =>
          /^currency$/i.test(e.label),
        );
        const currencyValue =
          currency?.tag === "select"
            ? currency.options.find((o) => o.value === currency.value)?.label
            : currency?.value;
        if (
          !currencyValue ||
          !["usd", "us dollar", "us dollars", "united states dollar"].includes(
            normalize(currencyValue),
          )
        )
          throw new Error(
            "CURRENCY_UNVERIFIED: Confirm USD on the form before preparing.",
          );
        const patterns: Record<string, RegExp> = {
          vendor: /^(vendor|vendor name)\s*\*?$/i,
          invoiceNumber:
            /^(invoice number|invoice #|reference no\.?|reference number|ref\.? no\.?)\s*\*?$/i,
          invoiceDate: /^(date|invoice date|transaction date)\s*\*?$/i,
          dueDate: /^due date\s*\*?$/i,
          amount: /^(amount|total amount|bill amount)\s*\*?$/i,
          memo: /^memo\s*\*?$/i,
        };
        const planned: {
          field: string;
          id: string;
          value: string;
          from: string;
        }[] = [];
        for (const field of [
          "vendor",
          "invoiceNumber",
          "invoiceDate",
          "amount",
          "memo",
          "dueDate",
        ] as const) {
          const value = action.values[field];
          if (value === null) continue;
          const matches = before.elements.filter(
            (e) =>
              e.value !== null &&
              !e.readOnly &&
              !e.disabled &&
              patterns[field].test(e.label),
          );
          if (matches.length !== 1) {
            if (["memo", "dueDate"].includes(field)) continue;
            throw new Error(
              `AMBIGUOUS_FIELD: Could not identify exactly one ${field} field. Review the form manually.`,
            );
          }
          const e = matches[0];
          let formatted = value;
          if (e.tag === "select") {
            const option = e.options.filter(
              (o) =>
                normalize(o.label) === normalize(value) ||
                normalize(o.value) === normalize(value),
            );
            if (option.length !== 1)
              throw new Error(
                `UNKNOWN_OPTION: ${value} is not a unique existing ${field}.`,
              );
            formatted = option[0].value;
          }
          if (
            field.toLowerCase().includes("date") &&
            e.inputType !== "date" &&
            /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(e.value ?? "")
          ) {
            const [y, m, d] = value.split("-");
            formatted = `${Number(m)}/${Number(d)}/${y}`;
          }
          if (
            ["vendor", "invoiceNumber", "amount", "memo"].includes(field) &&
            e.value &&
            normalize(e.value) !== normalize(formatted) &&
            !(field === "amount" && Number(e.value) === 0)
          )
            throw new Error(
              "FORM_NOT_EMPTY: Existing bill details would be overwritten. Open a blank bill form first.",
            );
          planned.push({
            field,
            id: e.id,
            value: formatted,
            from: e.value ?? "",
          });
        }
        for (const edit of planned) {
          checkActive();
          const { element, described } = this.target(
            edit.id,
            this.inspect("agent"),
          );
          if (described.value !== edit.from)
            throw new Error("STALE_FIELD: The form changed while preparing.");
          started = true;
          this.write(element, edit.value);
          await new Promise((r) => setTimeout(r, 90));
        }
        checkActive();
        const after = this.inspect("agent");
        for (const edit of planned)
          if (
            after.elements.find((e) => e.id === edit.id)?.value !== edit.value
          )
            throw new Error(
              "VERIFY_FAILED: A requested value did not persist.",
            );
        for (const element of before.elements.filter(
          (e) =>
            e.value !== null &&
            !e.readOnly &&
            !planned.some((p) => p.id === e.id),
        )) {
          const later = after.elements.find((e) => e.id === element.id);
          if (later && later.value !== element.value)
            throw new Error("UNEXPECTED_EDIT: An unrelated field changed.");
        }
        return {
          ...base,
          status: "ok",
          observation: after,
          changes: planned.map((p) => ({
            field: p.field,
            from: p.from,
            to: p.value,
          })),
        };
      }
      if (action.kind === "scroll") {
        started = true;
        this.doc.defaultView!.scrollBy({
          top: action.direction === "down" ? 550 : -550,
          behavior: "instant",
        });
      } else {
        const { described, element } = this.target(action.elementId, before);
        if (action.kind === "fill" || action.kind === "select") {
          if (
            command.phase !== "investigate" &&
            command.phase !== "chat" &&
            command.phase !== "vendor_setup"
          )
            throw new Error(
              "ACTION_BLOCKED: Use the reviewed bill-preparation command.",
            );
          if (
            !isSearchField(element, described.label, this.app) ||
            described.readOnly ||
            (!["input", "textarea", "select"].includes(described.tag) &&
              !element.isContentEditable)
          )
            throw new Error(
              "ACTION_BLOCKED: Investigation can type only into search or filter fields.",
            );
          if (
            action.kind === "select" &&
            !described.options.some((o) => o.value === action.value)
          )
            throw new Error("UNKNOWN_OPTION");
          started = true;
          this.write(element, action.value);
        } else if (action.kind === "key") {
          if (
            ["Enter", "ArrowDown", "ArrowUp"].includes(action.key) &&
            !isSearchField(element, described.label, this.app)
          )
            throw new Error(
              "ACTION_BLOCKED: Enter and arrow keys are only permitted in search fields.",
            );
          element.focus();
          const fingerprint = targetFingerprint(element, described);
          const verify = () => {
            checkActive();
            if (
              this.doc.location.href !== before.context.url ||
              this.doc.activeElement !== element ||
              !element.isConnected ||
              fingerprint !== targetFingerprint(element, this.describe(element))
            )
              throw new Error(
                "STALE_TARGET: Keyboard focus or control changed; inspect again.",
              );
          };
          verify();
          started = true;
          if (native) {
            nativeKey = { element, key: action.key, seen: false };
            try {
              await native(action, verify);
            } finally {
              nativeKey = null;
            }
          } else {
            const win = this.doc.defaultView!;
            element.dispatchEvent(
              new win.KeyboardEvent("keydown", {
                key: action.key,
                code: action.key,
                bubbles: true,
                cancelable: true,
              }),
            );
            element.dispatchEvent(
              new win.KeyboardEvent("keyup", {
                key: action.key,
                code: action.key,
                bubbles: true,
                cancelable: true,
              }),
            );
          }
        } else {
          if (described.href) {
            const target = new URL(described.href, before.context.url);
            if (
              !withinScope(target.href, scope) ||
              !["http:", "https:"].includes(target.protocol) ||
              /[?&](action|mode)=(delete|save|submit|approve)/i.test(
                target.href,
              )
            )
              throw new Error(
                "ACTION_BLOCKED: Navigation must stay within this selected application.",
              );
          }
          if (
            element.tagName === "BUTTON" &&
            (element as HTMLButtonElement).type === "submit"
          )
            throw new Error(
              "ACTION_BLOCKED: Form submission is reserved for the user.",
            );
          started = true;
          element.click();
        }
      }
      await new Promise((r) => setTimeout(r, 200));
      checkActive();
      return { ...base, status: "ok", observation: this.inspect("agent") };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Browser action failed";
      return {
        ...base,
        status: "error",
        code: message.split(":")[0],
        message,
        outcome: started ? "unknown" : "not_executed",
      };
    } finally {
      this.agentWorking = false;
      for (const type of ["pointerdown", "keydown", "input"])
        this.doc.removeEventListener(type, onHuman, true);
    }
  }
}

export async function inspectAfterNavigation(
  command: BrowserCommand,
  sourceUrl: string,
  io: {
    tab: () => Promise<{ url?: string; status?: string } | null>;
    inspect: (command: BrowserCommand) => Promise<CommandResult>;
    active: () => boolean;
  },
  timeoutMs = 10000,
): Promise<CommandResult | null> {
  if (
    !["click", "navigate"].includes(command.action.kind) ||
    !command.expectedDocumentId
  )
    return null;
  const source = new URL(sourceUrl);
  if (!["http:", "https:"].includes(source.protocol)) return null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && io.active()) {
    const tab = await io.tab();
    if (
      !tab?.url ||
      !withinScope(tab.url, command.scope ?? tabScope(sourceUrl) ?? "")
    )
      return null;
    if (tab.status === "complete") {
      try {
        const result = await io.inspect({
          ...command,
          commandId: crypto.randomUUID(),
          action: { kind: "inspect" },
          expectedDocumentId: null,
          expectedPageVersion: null,
        });
        if (!io.active()) return null;
        if (
          result.status === "ok" &&
          result.observation.context.documentId !==
            command.expectedDocumentId &&
          result.observation.context.tabId === command.tabId &&
          result.observation.context.frameId === command.frameId &&
          withinScope(
            result.observation.context.url,
            command.scope ?? tabScope(sourceUrl) ?? "",
          )
        ) {
          result.observation.limitations.push(
            "The click reply was interrupted by navigation. This observation verifies the new document; the click was not repeated.",
          );
          return { ...result, commandId: command.commandId };
        }
      } catch {
        // The new document may not have its content script yet. Only reading
        // is retried; the original click is never issued again.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

export function commandError(
  command: BrowserCommand,
  code: string,
  message: string,
  outcome: "not_executed" | "unknown" = "not_executed",
): CommandResult {
  return {
    type: "browser.result",
    commandId: command.commandId,
    workspaceId: command.workspaceId,
    taskId: command.taskId,
    status: "error",
    code,
    message,
    outcome,
  };
}

export class BridgeClient {
  private ws: WebSocket | null = null;
  private pending = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private attempt = 0;
  onMessage: (message: import("@close/shared").ServerMessage) => void =
    () => {};
  onConnection: (connected: boolean) => void = () => {};
  constructor(
    readonly url: string,
    private hello: Extract<
      import("@close/shared").ClientMessage,
      { type: "hello" }
    >,
  ) {}
  connect() {
    this.stopped = false;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.attempt = 0;
      this.send(this.hello);
    };
    this.ws.onmessage = (event) => {
      let message: any;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === "welcome") this.onConnection(true);
      if (message.type === "heartbeat") {
        this.send({ type: "heartbeat" });
        return;
      }
      if (message.type === "ui.response") {
        const p = this.pending.get(message.requestId);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(message.requestId);
          message.ok
            ? p.resolve(message.data)
            : p.reject(new Error(message.error ?? "Request failed"));
        }
        return;
      }
      this.onMessage(message);
    };
    this.ws.onclose = (event) => {
      this.onConnection(false);
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("Browser bridge disconnected"));
      }
      this.pending.clear();
      if (!this.stopped && event.code !== 1008) {
        const wait = Math.min(10000, 500 * 2 ** this.attempt++);
        this.reconnectTimer = setTimeout(() => this.connect(), wait);
      }
    };
    this.ws.onerror = () => {};
  }
  send(message: import("@close/shared").ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(message));
  }
  request<T = unknown>(action: string, payload: unknown = {}): Promise<T> {
    if (this.ws?.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error("Connect to the local relay first"));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Request timed out"));
      }, 12000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.send({ type: "ui.request", requestId, action, payload });
    });
  }
  close() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
