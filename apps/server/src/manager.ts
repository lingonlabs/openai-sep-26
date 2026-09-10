import { z } from "zod";
import {
  assessInvoices,
  contextKey,
  supportedApp,
  type Activity,
  type AppState,
  type BrowserTab,
  type ChatMessage,
  type Evidence,
  type Finding,
  type PageContext,
  type Suggestion,
  type Task,
  type Workspace,
  type VendorDraft,
  VendorValuesSchema,
  normalize,
  tabScope,
  withinScope,
  AmbientPreferencesSchema,
} from "@close/shared";
import { BrowserBroker, type BrowserConnection } from "./broker.js";
import { CloseAgents } from "./agents.js";
import { Store } from "./store.js";
import { VendorSetup } from "./vendors.js";
import { Ambient } from "./ambient.js";
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const workspacePayload = z.object({ workspaceId: z.string() });
export class Manager {
  onChange: () => void = () => {};
  private shuttingDown = false;
  private tasks = new Map<string, AbortController>();
  private coordinators = new Map<string, AbortController>();
  readonly ambient = new Map<string, Ambient>();
  private refreshAmbient(browser: BrowserConnection) {
    let ambient = this.ambient.get(browser.id);
    if (!ambient) {
      ambient = new Ambient(
        this.store,
        (r) => this.agents.ambient(r),
        this.agents.options.model,
        this.agents.options.mode === "demo" || !!this.agents.options.apiKey,
        () => {
          if (!this.shuttingDown) this.onChange();
        },
        (suggestion) => {
          this.store.put("suggestion", suggestion.id, suggestion);
          this.onChange();
        },
        () =>
          this.store
            .all<Suggestion>("suggestion")
            .filter((s) => s.status === "pending"),
      );
      this.ambient.set(browser.id, ambient);
    }
    const w = browser.activeWorkspaceId
      ? this.store.get<Workspace>("workspace", browser.activeWorkspaceId)
      : undefined;
    ambient.update(w, true, !!w?.activeTaskId);
    for (const s of this.store
      .all<Suggestion>("suggestion")
      .filter(
        (s) => s.options && s.status === "pending" && s.workspaceId === w?.id,
      )) {
      if (
        Date.now() - Date.parse(s.createdAt) >= 600000 ||
        !w!.tabIds.includes(s.tabId) ||
        w!.pausedTabIds.includes(s.tabId) ||
        browser.tabs.find((t) => t.id === s.tabId)?.url !== s.sourceUrl
      ) {
        s.status = "stale";
        this.store.put("suggestion", s.id, s);
        ambient.record(
          "expired",
          `Offer removed after page/scope change or expiry without a response: ${s.title}`,
          s.workspaceId,
        );
      }
    }
    return ambient;
  }
  constructor(
    readonly store: Store,
    readonly broker: BrowserBroker,
    readonly agents: CloseAgents,
    private sandboxOrigin: string,
    private localOrigin: string,
  ) {
    broker.onActivity = (w, t, m, event) =>
      this.activity(
        w,
        t,
        m,
        event?.status === "error" ? "error" : "info",
        event,
      );
    agents.onDelta = (task, text) => {
      if (this.store.get<Task>("task", task.id)?.status !== "running") return;
      const key = `stream-${task.id}`;
      const previous = this.store.get<ChatMessage>("message", key);
      this.store.put("message", key, {
        id: key,
        workspaceId: task.workspaceId,
        role: "assistant",
        text: (previous?.text ?? "") + text,
        at: previous?.at ?? now(),
        taskId: task.id,
      });
      this.onChange();
    };
    broker.onChange = () => this.onChange();
    for (const task of store.all<Task>("task"))
      if (task.status === "running") {
        task.status = "interrupted";
        task.finishedAt = now();
        task.error = "The local app restarted. No actions were replayed.";
        store.put("task", task.id, task);
      }
    for (const workspace of store.all<Workspace>("workspace")) {
      workspace.activeTaskId = null;
      workspace.contexts = {};
      store.put("workspace", workspace.id, workspace);
    }
    for (const suggestion of store.all<Suggestion>("suggestion"))
      if (suggestion.status === "pending") {
        suggestion.status = "stale";
        store.put("suggestion", suggestion.id, suggestion);
      }
    for (const draft of store.all<VendorDraft>("vendorDraft")) {
      if (draft.status === "creating" || draft.status === "checking") {
        draft.status = draft.status === "creating" ? "unknown" : "failed";
        draft.message =
          "The app restarted. Inspect NetSuite before any further creation attempt; nothing is replayed.";
        store.put("vendorDraft", draft.id, draft);
      }
    }
  }
  state(): AppState {
    for (const browser of this.broker.browsers.values())
      this.refreshAmbient(browser);
    return {
      ambient: [...this.ambient.values()].flatMap((a) =>
        a.status ? [a.status] : [],
      ),
      mode: this.agents.options.mode,
      model: this.agents.options.model,
      apiConfigured: !!this.agents.options.apiKey,
      bridges: [...this.broker.browsers.values()].map((b) => ({
        id: b.id,
        name: b.name,
        synthetic: b.synthetic,
        connected: true,
        tabs: b.tabs,
        activeWorkspaceId: b.activeWorkspaceId,
      })),
      workspaces: this.store.all("workspace"),
      suggestions: this.store.all<Suggestion>("suggestion").slice(-80),
      tasks: this.store
        .all<Task>("task")
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .slice(-80),
      findings: this.store.all<Finding>("finding").slice(-200),
      activities: this.store
        .all<Activity>("activity")
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(-150),
      messages: this.store.all<ChatMessage>("message").slice(-100),
      vendorDrafts: this.store.all<VendorDraft>("vendorDraft").slice(-100),
    };
  }
  activity(
    workspaceId: string,
    taskId: string | null,
    message: string,
    level: Activity["level"] = "info",
    event?: Partial<Activity>,
  ) {
    const previous = event?.commandId
      ? this.store
          .all<Activity>("activity")
          .find((a) => a.commandId === event.commandId)
      : undefined;
    const a: Activity = {
      id: previous?.id ?? id(),
      workspaceId,
      taskId,
      at: previous?.at ?? now(),
      message: previous?.message ?? message,
      level,
      ...previous,
      ...event,
      ...(event?.status === "error" ? { level: "error" as const } : {}),
    };
    this.store.put("activity", a.id, a);
    this.onChange();
  }
  private workspace(workspaceId: string) {
    const w = this.store.get<Workspace>("workspace", workspaceId);
    if (!w) throw new Error("Workspace not found");
    return w;
  }
  private watch(browser: BrowserConnection) {
    this.refreshAmbient(browser);
    const w = browser.activeWorkspaceId
      ? this.store.get<Workspace>("workspace", browser.activeWorkspaceId)
      : undefined;
    if (w) this.store.put("activeWorkspace", browser.id, w.id);
    browser.send({
      type: "browser.watch",
      workspace: w ?? null,
      tabs: browser.tabs,
    });
  }
  connected(browser: BrowserConnection) {
    const previous = this.broker.browsers.get(browser.id);
    if (previous) this.disconnected(browser.id);
    this.broker.browsers.set(browser.id, browser);
    const workspace = this.store
      .all<Workspace>("workspace")
      .filter((w) => w.bridgeId === browser.id)
      .at(-1);
    const remembered = this.store.get<string>("activeWorkspace", browser.id);
    if (workspace)
      browser.activeWorkspaceId =
        this.store.get<Workspace>("workspace", remembered ?? "")?.bridgeId ===
        browser.id
          ? remembered!
          : workspace.id;
    const previousSession = this.store.get<string>(
      "browserSession",
      browser.id,
    );
    if (browser.sessionId) {
      if (previousSession && previousSession !== browser.sessionId) {
        for (const w of this.store
          .all<Workspace>("workspace")
          .filter((w) => w.bridgeId === browser.id)) {
          w.tabIds = [];
          w.pausedTabIds = [];
          w.tabScopes = {};
          w.contexts = {};
          w.paused = true;
          this.store.put("workspace", w.id, w);
          this.activity(
            w.id,
            null,
            "Chrome restarted. Edit workspace to reselect its tabs.",
          );
        }
      }
      this.store.put("browserSession", browser.id, browser.sessionId);
    }
    this.watch(browser);
    this.onChange();
  }
  inventory(bridgeId: string, tabs: BrowserTab[]) {
    const b = this.broker.browsers.get(bridgeId);
    if (!b) return;
    b.tabs = tabs.filter(
      (t) =>
        supportedApp(t.url, this.sandboxOrigin, this.localOrigin) === t.app &&
        t.synthetic === b.synthetic,
    );
    if (b.activeWorkspaceId) {
      const w = this.workspace(b.activeWorkspaceId);
      // Chrome marks a supported tab disconnected while its next page loads.
      // Only a missing/unsupported tab leaves the workspace.
      w.tabScopes ??= {};
      for (const tab of b.tabs)
        if (w.tabIds.includes(tab.id) && !w.tabScopes[tab.id]) {
          const scope = tabScope(tab.url);
          if (scope) w.tabScopes[tab.id] = scope;
        }
      this.store.put("workspace", w.id, w);
      const lost = w.tabIds.filter(
        (t) =>
          !b.tabs.some(
            (x) => x.id === t && withinScope(x.url, w.tabScopes![t] ?? ""),
          ),
      );
      if (lost.length && w.activeTaskId)
        this.stop(
          w.id,
          "A selected tab closed or left the permitted applications.",
        );
      const current = this.workspace(w.id);
      for (const tabId of lost) delete current.contexts[tabId];
      current.tabIds = current.tabIds.filter((t) => !lost.includes(t));
      current.pausedTabIds = current.pausedTabIds.filter((t) =>
        current.tabIds.includes(t),
      );
      this.store.put("workspace", current.id, current);
    }
    this.watch(b);
    this.onChange();
  }
  disconnected(bridgeId: string) {
    for (const w of this.store
      .all<Workspace>("workspace")
      .filter((w) => w.bridgeId === bridgeId)) {
      this.stop(w.id, "Browser disconnected. No actions will be replayed.");
    }
    this.broker.disconnect(bridgeId);
    this.ambient.get(bridgeId)?.update(undefined, false, false);
    this.onChange();
  }
  context(bridgeId: string, workspaceId: string, context: PageContext) {
    const w = this.store.get<Workspace>("workspace", workspaceId),
      b = this.broker.browsers.get(bridgeId);
    if (
      !w ||
      w.bridgeId !== bridgeId ||
      b?.activeWorkspaceId !== w.id ||
      w.paused ||
      w.pausedTabIds.includes(context.tabId) ||
      !w.tabIds.includes(context.tabId)
    )
      return;
    if (
      supportedApp(context.url, this.sandboxOrigin, this.localOrigin) !==
        context.app ||
      !withinScope(
        context.url,
        w.tabScopes?.[context.tabId] ?? tabScope(context.url) ?? "",
      )
    )
      return;
    w.contexts[context.tabId] = context;
    this.store.put("workspace", w.id, w);
    for (const s of this.store
      .all<Suggestion>("suggestion")
      .filter(
        (s) =>
          s.workspaceId === w.id &&
          s.tabId === context.tabId &&
          s.status === "pending",
      )) {
      if (s.contextKey !== contextKey(context)) {
        s.status = "stale";
        this.store.put("suggestion", s.id, s);
        this.ambient
          .get(bridgeId)
          ?.record(
            "expired",
            `Offer removed after page change without a response: ${s.title}`,
            w.id,
          );
      }
    }
    const ambient = this.refreshAmbient(b!);
    if (!w.activeTaskId && context.source !== "agent") ambient.observe(context);
    this.onChange();
    if (
      this.agents.options.mode !== "demo" ||
      context.baseline ||
      !ambient.status?.preferences.enabled ||
      !ambient.status.preferences.instructions.some(
        (i) => i.enabled && i.id === "invoices",
      ) ||
      context.source === "agent" ||
      context.workflow !== "bill_form" ||
      w.activeTaskId ||
      !this.broker.tabs(w).some((t) => t.app === "gmail")
    )
      return;
    const key = contextKey(context);
    if ((w.dismissed[key] ?? 0) > Date.now() - 15 * 60 * 1000) return;
    if (
      this.store
        .all<Suggestion>("suggestion")
        .some(
          (s) =>
            s.workspaceId === w.id &&
            s.contextKey === key &&
            ["pending", "accepted"].includes(s.status),
        )
    )
      return;
    if (this.coordinators.has(w.id)) return;
    const controller = new AbortController();
    this.coordinators.set(w.id, controller);
    const timer = setTimeout(() => controller.abort(), 30000);
    void this.agents
      .suggest(w, context, controller.signal)
      .then((output) => {
        if (this.shuttingDown) return;
        const current = this.workspace(w.id);
        if (
          !output.offer ||
          current.paused ||
          current.activeTaskId ||
          contextKey(current.contexts[context.tabId] ?? context) !== key
        )
          return;
        if ((current.dismissed[key] ?? 0) > Date.now() - 15 * 60 * 1000) return;
        const s: Suggestion = {
          id: id(),
          workspaceId: w.id,
          tabId: context.tabId,
          documentId: context.documentId,
          contextKey: key,
          title: output.title,
          description: output.description,
          status: "pending",
          createdAt: now(),
        };
        this.store.put("suggestion", s.id, s);
        this.onChange();
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          this.activity(
            w.id,
            null,
            "Suggestion unavailable: " + this.error(e),
            "error",
          );
      })
      .finally(() => {
        clearTimeout(timer);
        this.coordinators.delete(w.id);
      });
  }
  private error(error: unknown) {
    return (error instanceof Error ? error.message : String(error))
      .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
      .slice(0, 1200);
  }
  stop(
    workspaceId: string,
    reason = "Stopped by you. Review any fields already prepared.",
  ) {
    const w = this.workspace(workspaceId);
    this.coordinators.get(w.id)?.abort();
    if (w.activeTaskId) {
      const task = this.store.get<Task>("task", w.activeTaskId);
      if (task?.status === "running") {
        task.status = "stopped";
        task.finishedAt = now();
        task.summary = reason;
        this.store.put("task", task.id, task);
        this.tasks.get(task.id)?.abort();
        this.broker.browsers.get(w.bridgeId)?.send({
          type: "browser.cancel",
          workspaceId: w.id,
          taskId: task.id,
        });
        this.activity(w.id, task.id, reason);
        for (const draft of this.store
          .all<VendorDraft>("vendorDraft")
          .filter(
            (d) =>
              d.workspaceId === w.id &&
              ["checking", "creating"].includes(d.status),
          )) {
          draft.status = draft.status === "creating" ? "unknown" : "failed";
          draft.message =
            reason + " Check NetSuite before another creation attempt.";
          this.store.put("vendorDraft", draft.id, draft);
        }
      }
    }
    w.activeTaskId = null;
    this.store.put("workspace", w.id, w);
    this.onChange();
  }
  private start(
    workspace: Workspace,
    kind: Task["kind"],
    title: string,
    candidate?: Finding,
    message?: string,
    run?: (task: Task, signal: AbortSignal) => Promise<string>,
    parent?: Task,
  ) {
    if (workspace.paused) throw new Error("Resume the workspace first.");
    if (workspace.activeTaskId)
      throw new Error(
        "Another task is controlling this workspace. Stop it or wait for completion.",
      );
    const b = this.broker.browsers.get(workspace.bridgeId);
    if (!b || b.activeWorkspaceId !== workspace.id)
      throw new Error(
        "Activate this workspace in its connected browser first.",
      );
    if (this.agents.options.mode === "live" && !this.agents.options.apiKey)
      throw new Error("Configure OPENAI_API_KEY locally and restart the app.");
    const tabs = this.broker.tabs(workspace);
    if (
      !tabs.length ||
      (kind === "investigate" &&
        (!tabs.some((t) => t.app === "netsuite") ||
          !tabs.some((t) => t.app === "gmail")))
    )
      throw new Error("Select connected NetSuite and Gmail tabs.");
    const task: Task = {
      id: id(),
      workspaceId: workspace.id,
      kind,
      status: "running",
      title,
      startedAt: now(),
      finishedAt: null,
      summary: "",
      parentTaskId: parent?.id ?? candidate?.taskId ?? null,
      actionCount: 0,
      error: null,
      candidateId: candidate?.id ?? null,
    };
    this.store.put("task", task.id, task);
    if (parent?.status === "completed") {
      const history = this.store.get<unknown[]>("session", `task:${parent.id}`);
      if (history) this.store.put("session", `task:${task.id}`, history);
    }
    workspace.activeTaskId = task.id;
    this.store.put("workspace", workspace.id, workspace);
    this.refreshAmbient(b);
    const controller = new AbortController();
    this.tasks.set(task.id, controller);
    this.activity(workspace.id, task.id, title);
    this.onChange();
    const timeout = setTimeout(
      () =>
        controller.abort(new Error("Task reached its five-minute time limit.")),
      300000,
    );
    void (async () => {
      let summary = "";
      if (run) {
        summary = await run(task, controller.signal);
        controller.signal.throwIfAborted();
      } else if (kind === "investigate") {
        const extraction = await this.agents.investigate(
          task,
          workspace,
          controller.signal,
        );
        controller.signal.throwIfAborted();
        const evidence = this.broker.evidence(task.id);
        if (
          !evidence.some(
            (e) =>
              e.app === "netsuite" &&
              e.observation.context.workflow === "bill_list",
          )
        )
          throw new Error(
            "The existing-bill list was not inspected. No missing-bill findings can be verified yet. Open the bill list and try again.",
          );
        const findings = assessInvoices(
          extraction,
          evidence,
          workspace.id,
          task.id,
        ).filter(
          (f) =>
            f.invoiceDate >= workspace.searchFrom &&
            f.invoiceDate <= workspace.searchTo,
        );
        for (const old of this.store
          .all<Finding>("finding")
          .filter((f) => f.workspaceId === workspace.id))
          this.store.remove("finding", old.id);
        for (const finding of findings)
          this.store.put("finding", finding.id, finding);
        summary =
          extraction.summary +
          ` ${findings.length} invoice${findings.length === 1 ? "" : "s"} reviewed.`;
      } else if (kind === "prepare") {
        const result = await this.agents.prepare(
          task,
          workspace,
          candidate!,
          controller.signal,
        );
        controller.signal.throwIfAborted();
        if (!result.verified)
          throw new Error(
            result.summary + " " + result.remainingReview.join("; "),
          );
        const current = this.store.get<Finding>("finding", candidate!.id)!;
        current.preparedAt = now();
        this.store.put("finding", current.id, current);
        summary =
          result.summary +
          " Still unsaved. Review: " +
          result.remainingReview.join(", ") +
          ".";
      } else {
        summary = await this.agents.chat(
          task,
          workspace,
          message!,
          controller.signal,
        );
        controller.signal.throwIfAborted();
      }
      if (this.shuttingDown) return;
      const currentTask = this.store.get<Task>("task", task.id)!;
      if (currentTask.status !== "running") return;
      currentTask.status = "completed";
      currentTask.finishedAt = now();
      currentTask.summary = summary;
      this.store.put("task", task.id, currentTask);
      const current = this.workspace(workspace.id);
      current.summary = `${current.summary}\n${kind}: ${summary}`.slice(-5000);
      this.store.put("workspace", current.id, current);
      const chat: ChatMessage = {
        id: `stream-${task.id}`,
        workspaceId: workspace.id,
        role: "assistant",
        text: summary,
        at: now(),
        taskId: task.id,
      };
      this.store.put("message", chat.id, chat);
      this.activity(
        workspace.id,
        task.id,
        kind === "prepare"
          ? "Bill prepared. Review it in NetSuite; it has not been saved."
          : kind.startsWith("vendor_")
            ? summary
            : kind === "chat"
              ? "Workspace answer ready."
              : "Investigation complete — findings and sources are ready.",
        "success",
      );
    })()
      .catch((error) => {
        if (this.shuttingDown) return;
        const current = this.store.get<Task>("task", task.id)!;
        if (current.status !== "running") return;
        current.status = "failed";
        current.finishedAt = now();
        current.error = this.error(error);
        current.summary = "Task stopped before completion.";
        this.store.put("task", current.id, current);
        this.activity(workspace.id, task.id, current.error, "error");
      })
      .finally(() => {
        clearTimeout(timeout);
        this.tasks.delete(task.id);
        if (this.shuttingDown) return;
        const current = this.workspace(workspace.id);
        if (current.activeTaskId === task.id) {
          current.activeTaskId = null;
          this.store.put("workspace", current.id, current);
        }
        const finished = this.store.get<Task>("task", task.id)!;
        this.ambient
          .get(workspace.bridgeId)
          ?.record(
            "task",
            `${finished.status}: ${finished.error || finished.summary}`,
            workspace.id,
          );
        const browser = this.broker.browsers.get(workspace.bridgeId);
        if (browser) this.watch(browser);
        this.onChange();
      });
    return task;
  }
  async request(action: string, raw: unknown) {
    if (action === "ambient.settings" || action === "ambient.forget") {
      const { workspaceId } = workspacePayload.parse(raw),
        w = this.workspace(workspaceId);
      const b = this.broker.browsers.get(w.bridgeId);
      if (!b || b.activeWorkspaceId !== w.id)
        throw new Error("Select this workspace first.");
      const ambient = this.refreshAmbient(b);
      if (action === "ambient.settings")
        ambient.settings(
          z.object({ preferences: AmbientPreferencesSchema }).parse(raw)
            .preferences,
        );
      else ambient.forget();
      for (const s of this.store
        .all<Suggestion>("suggestion")
        .filter((s) => s.workspaceId === w.id && s.status === "pending")) {
        s.status = "stale";
        this.store.put("suggestion", s.id, s);
      }
      this.watch(b);
      this.onChange();
      return;
    }
    if (action === "vendor.plan") {
      const p = z
        .object({
          workspaceId: z.string(),
          findingId: z.string().nullable().optional(),
          values: VendorValuesSchema,
        })
        .parse(raw);
      const w = this.workspace(p.workspaceId);
      if (
        p.findingId &&
        this.store.get<Finding>("finding", p.findingId)?.workspaceId !== w.id
      )
        throw new Error("Finding is outside this workspace.");
      if (
        this.store
          .all<VendorDraft>("vendorDraft")
          .some(
            (d) =>
              normalize(d.values.name) === normalize(p.values.name) &&
              ["creating", "created", "unknown"].includes(d.status),
          )
      )
        throw new Error(
          "This vendor has a completed or uncertain creation attempt. Inspect the existing record before creating another.",
        );
      if (w.activeTaskId)
        throw new Error("Wait for the current task or stop it first.");
      const draft: VendorDraft = {
        id: id(),
        workspaceId: w.id,
        findingId: p.findingId ?? null,
        values: p.values,
        status: "checking",
        tabId: null,
        checkEvidenceId: null,
        preparedEvidenceId: null,
        review: null,
        message: "Checking existing vendors",
        createdAt: now(),
        reviewedAt: null,
        commitTaskId: null,
        recordUrl: null,
      };
      this.store.put("vendorDraft", draft.id, draft);
      try {
        return this.start(
          w,
          "vendor_setup",
          `Checking vendor ${draft.values.name}`,
          undefined,
          undefined,
          (task, signal) =>
            new VendorSetup(this.store, this.broker, this.agents).plan(
              draft,
              task,
              w,
              signal,
            ),
        );
      } catch (e) {
        draft.status = "failed";
        draft.message = this.error(e);
        this.store.put("vendorDraft", draft.id, draft);
        throw e;
      }
    }
    if (
      ["vendor.confirm", "vendor.refresh", "vendor.dismiss"].includes(action)
    ) {
      const p = z
        .object({
          draftId: z.string(),
          approved: z.boolean().optional(),
          reviewedAt: z.string().optional(),
        })
        .parse(raw);
      const draft = this.store.get<VendorDraft>("vendorDraft", p.draftId);
      if (!draft) throw new Error("Vendor review not found.");
      const w = this.workspace(draft.workspaceId);
      if (w.activeTaskId)
        throw new Error("Wait for the current task or stop it first.");
      if (
        ["creating", "created", "unknown", "dismissed", "checking"].includes(
          draft.status,
        )
      )
        throw new Error("This vendor request cannot be repeated.");
      if (action === "vendor.dismiss") {
        draft.status = "dismissed";
        draft.message = "Vendor creation declined. The form remains unsaved.";
        this.store.put("vendorDraft", draft.id, draft);
        this.onChange();
        return;
      }
      if (action === "vendor.confirm") {
        if (
          p.approved !== true ||
          draft.status !== "ready" ||
          !draft.review ||
          draft.review.missing.length ||
          p.reviewedAt !== draft.reviewedAt
        )
          throw new Error(
            "Review and explicitly approve the current vendor details first.",
          );
        const check =
          draft.checkEvidenceId &&
          this.store.get<Evidence>("evidence", draft.checkEvidenceId);
        if (
          !check ||
          Date.now() - Date.parse(check.capturedAt) > 10 * 60 * 1000
        )
          throw new Error(
            "The duplicate check has expired. Start a new vendor check.",
          );
        if (
          this.store
            .all<VendorDraft>("vendorDraft")
            .some(
              (d) =>
                d.id !== draft.id &&
                normalize(d.values.name) === normalize(draft.values.name) &&
                ["creating", "created", "unknown"].includes(d.status),
            )
        )
          throw new Error(
            "Another request already attempted this vendor. Inspect NetSuite first.",
          );
      }
      const previous = draft.status;
      draft.status = action === "vendor.confirm" ? "creating" : "checking";
      this.store.put("vendorDraft", draft.id, draft);
      const service = new VendorSetup(this.store, this.broker, this.agents);
      try {
        return this.start(
          w,
          action === "vendor.confirm" ? "vendor_create" : "vendor_setup",
          action === "vendor.confirm"
            ? `Creating approved vendor ${draft.values.name}`
            : "Refreshing vendor review",
          undefined,
          undefined,
          (task, signal) =>
            action === "vendor.confirm"
              ? service.commit(draft, task, signal)
              : service.refresh(draft, task, signal),
        );
      } catch (e) {
        draft.status = previous;
        this.store.put("vendorDraft", draft.id, draft);
        throw e;
      }
    }
    if (action === "workspace.create" || action === "workspace.update") {
      const p = z
        .object({
          workspaceId: z.string().optional(),
          name: z.string().trim().min(1).max(80),
          bridgeId: z.string(),
          tabIds: z.array(z.string()).min(1).max(12),
          searchFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          searchTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .parse(raw);
      if (p.searchFrom > p.searchTo)
        throw new Error("Start date must precede end date.");
      const b = this.broker.browsers.get(p.bridgeId);
      if (!b) throw new Error("Browser is disconnected.");
      if (
        p.tabIds.some((id) => !b.tabs.some((t) => t.id === id && t.connected))
      )
        throw new Error("Choose only connected tabs.");
      if (b.activeWorkspaceId)
        this.stop(b.activeWorkspaceId, "Switched to another workspace.");
      const previous =
        action === "workspace.update"
          ? this.workspace(p.workspaceId ?? "")
          : undefined;
      if (previous && previous.bridgeId !== p.bridgeId)
        throw new Error("A workspace belongs to its original browser.");
      const w: Workspace = {
        ...previous,
        ...p,
        id: previous?.id ?? id(),
        tabScopes: Object.fromEntries(
          p.tabIds.map((id) => [
            id,
            tabScope(b.tabs.find((t) => t.id === id)!.url)!,
          ]),
        ),
        tabIds: [...new Set(p.tabIds)],
        pausedTabIds: [],
        paused: false,
        createdAt: now(),
        activeTaskId: null,
        contexts: {},
        dismissed: {},
        summary: previous?.summary ?? "",
      };
      this.store.put("workspace", w.id, w);
      b.activeWorkspaceId = w.id;
      this.watch(b);
      this.activity(w.id, null, "Workspace watching selected tabs.");
      return w;
    }
    if (action === "evidence.get") {
      const p = z.object({ id: z.string() }).parse(raw);
      const e = this.store.get<Evidence>("evidence", p.id);
      if (!e) throw new Error("Evidence not found");
      return e;
    }
    if (action === "suggestion.accept" || action === "suggestion.dismiss") {
      const p = z
          .object({
            suggestionId: z.string(),
            option: z.number().int().min(0).max(2).optional(),
            message: z.string().trim().min(1).max(3000).optional(),
          })
          .parse(raw),
        s = this.store.get<Suggestion>("suggestion", p.suggestionId);
      if (!s || s.status !== "pending")
        throw new Error("Suggestion is no longer active.");
      const w = this.workspace(s.workspaceId);
      if (s.options && Date.now() - Date.parse(s.createdAt) > 600000)
        throw new Error(
          "This offer expired. Revisit the page for a fresh offer.",
        );
      if (
        contextKey(
          w.contexts[s.tabId] ??
            ({
              documentId: "",
              workflow: "other",
              vendor: null,
            } as PageContext),
        ) !== s.contextKey
      )
        throw new Error(
          "The page context changed. Use Check invoices to start a fresh investigation.",
        );
      const option = p.option === undefined ? undefined : s.options?.[p.option];
      if (action === "suggestion.accept" && s.options && !option && !p.message)
        throw new Error("Choose how you would like help.");
      if (
        action === "suggestion.dismiss" ||
        (!p.message && option?.kind === "dismiss")
      ) {
        s.status = "dismissed";
        w.dismissed[s.contextKey] = Date.now();
        this.store.put("workspace", w.id, w);
        this.store.put("suggestion", s.id, s);
        this.ambient.get(w.bridgeId)?.dismiss(s, option?.label ?? "Dismissed");
        this.onChange();
        return;
      }
      if (s.options) {
        const message = p.message ?? option!.prompt;
        const task = this.start(
          w,
          "chat",
          "Answering your workspace question",
          undefined,
          message,
        );
        const userMessage: ChatMessage = {
          id: id(),
          workspaceId: w.id,
          role: "user",
          text: message,
          at: now(),
          taskId: task.id,
        };
        this.store.put("message", userMessage.id, userMessage);
        s.status = "accepted";
        this.store.put("suggestion", s.id, s);
        this.ambient.get(w.bridgeId)?.dismiss(s, `Accepted: ${message}`);
        return task;
      }
      const task = this.start(
        w,
        "investigate",
        "Checking Gmail invoices against recorded bills",
      );
      s.status = "accepted";
      this.store.put("suggestion", s.id, s);
      return task;
    }
    if (action === "finding.prepare") {
      const p = z.object({ findingId: z.string() }).parse(raw),
        f = this.store.get<Finding>("finding", p.findingId);
      if (!f || f.status !== "candidate" || f.preparedAt)
        throw new Error("This finding cannot be prepared.");
      if (f.currency !== "USD")
        throw new Error("This version prepares USD bills only.");
      if (
        Date.now() -
          Date.parse(this.store.get<Task>("task", f.taskId)!.finishedAt!) >
        30 * 60 * 1000
      )
        throw new Error(
          "Evidence is older than 30 minutes. Check invoices again before preparing.",
        );
      return this.start(
        this.workspace(f.workspaceId),
        "prepare",
        `Preparing ${f.invoiceNumber} for review`,
        f,
      );
    }
    if (action === "chat.send") {
      const p = z
          .object({
            workspaceId: z.string(),
            message: z.string().trim().min(1).max(4000),
            parentTaskId: z.string().optional(),
          })
          .parse(raw),
        w = this.workspace(p.workspaceId);
      const parent = p.parentTaskId
        ? this.store.get<Task>("task", p.parentTaskId)
        : this.store
            .all<Task>("task")
            .filter(
              (t) =>
                t.workspaceId === w.id &&
                t.kind === "chat" &&
                t.status === "completed",
            )
            .at(-1);
      if (p.parentTaskId && (!parent || parent.workspaceId !== w.id))
        throw new Error("Task is outside this workspace.");
      const task = this.start(
        w,
        "chat",
        "Answering your workspace question",
        undefined,
        p.message,
        undefined,
        parent,
      );
      const m: ChatMessage = {
        id: id(),
        workspaceId: w.id,
        role: "user",
        text: p.message,
        at: now(),
        taskId: task.id,
      };
      this.store.put("message", m.id, m);
      this.onChange();
      return task;
    }
    const p = workspacePayload.parse(raw);
    let w = this.workspace(p.workspaceId);
    if (action === "task.stop") {
      this.stop(w.id);
      return;
    }
    if (action === "investigation.start")
      return this.start(
        w,
        "investigate",
        "Checking Gmail invoices against recorded bills",
      );
    if (action === "workspace.activate") {
      const b = this.broker.browsers.get(w.bridgeId);
      if (!b) throw new Error("Browser is disconnected.");
      if (b.activeWorkspaceId && b.activeWorkspaceId !== w.id)
        this.stop(b.activeWorkspaceId, "Switched workspace.");
      b.activeWorkspaceId = w.id;
      this.watch(b);
    } else if (action === "workspace.pause") {
      const paused = z.object({ paused: z.boolean() }).parse(raw).paused;
      if (paused) this.stop(w.id, "Workspace paused.");
      w = this.workspace(w.id);
      w.paused = paused;
      this.store.put("workspace", w.id, w);
      const b = this.broker.browsers.get(w.bridgeId);
      if (b) this.watch(b);
    } else if (action === "tab.pause" || action === "tab.remove") {
      const { tabId } = z.object({ tabId: z.string() }).parse(raw);
      if (!w.tabIds.includes(tabId))
        throw new Error("Tab is not in this workspace.");
      this.stop(w.id, "Workspace tabs changed.");
      w = this.workspace(w.id);
      if (action === "tab.remove") {
        w.tabIds = w.tabIds.filter((t) => t !== tabId);
        delete w.contexts[tabId];
      } else {
        const { paused } = z.object({ paused: z.boolean() }).parse(raw);
        w.pausedTabIds = paused
          ? [...new Set([...w.pausedTabIds, tabId])]
          : w.pausedTabIds.filter((t) => t !== tabId);
      }
      this.store.put("workspace", w.id, w);
      const b = this.broker.browsers.get(w.bridgeId);
      if (b) this.watch(b);
    } else if (action === "tab.focus") {
      const { tabId } = z.object({ tabId: z.string() }).parse(raw);
      if (!w.tabIds.includes(tabId))
        throw new Error("Tab is outside the workspace.");
      this.broker.browsers
        .get(w.bridgeId)
        ?.send({ type: "browser.focus", tabId });
    } else throw new Error("Unknown action");
    this.onChange();
  }
  close() {
    for (const w of this.store.all<Workspace>("workspace"))
      this.stop(w.id, "Local app shutting down.");
    for (const c of this.coordinators.values()) c.abort();
    for (const ambient of this.ambient.values()) ambient.cancel();
    this.shuttingDown = true;
  }
}
