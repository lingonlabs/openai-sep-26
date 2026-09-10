import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type {
  BrowserAction,
  BrowserCommand,
  BrowserTab,
  CommandResult,
  Evidence,
  Observation,
  Task,
  Workspace,
  VendorDraft,
} from "@close/shared";
import { supportedApp } from "@close/shared";
import { Store } from "./store.js";

export interface BrowserConnection {
  id: string;
  name: string;
  synthetic: boolean;
  tabs: BrowserTab[];
  activeWorkspaceId: string | null;
  send: (message: unknown) => void;
}
interface Pending {
  command: BrowserCommand;
  bridgeId: string;
  resolve: (result: CommandResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
}
export class BrowserBroker {
  readonly browsers = new Map<string, BrowserConnection>();
  private pending = new Map<string, Pending>();
  private observations = new Map<string, Observation>();
  onActivity: (workspaceId: string, taskId: string, message: string) => void =
    () => {};
  onChange: () => void = () => {};
  constructor(
    private store: Store,
    private sandboxOrigin: string,
    private localOrigin: string,
  ) {}
  async command(
    task: Task,
    tabId: string,
    action: BrowserAction,
    signal: AbortSignal,
    frameId = 0,
  ): Promise<CommandResult> {
    signal.throwIfAborted();
    const currentTask = this.store.get<Task>("task", task.id);
    const workspace = this.store.get<Workspace>("workspace", task.workspaceId);
    if (
      !workspace ||
      workspace.paused ||
      workspace.activeTaskId !== task.id ||
      currentTask?.status !== "running"
    )
      throw new Error("Task is no longer active");
    if (
      !workspace.tabIds.includes(tabId) ||
      workspace.pausedTabIds.includes(tabId)
    )
      throw new Error("The requested tab is outside the active workspace");
    let browser = this.browsers.get(workspace.bridgeId);
    let tab = browser?.tabs.find((t) => t.id === tabId);
    // A safe navigation can return before Chrome finishes loading. Wait for
    // readiness, without repeating the action that initiated navigation.
    const readyDeadline = Date.now() + 10000;
    while (browser && tab && !tab.connected && Date.now() < readyDeadline) {
      await delay(100, undefined, { signal });
      if (this.store.get<Task>("task", task.id)?.status !== "running")
        throw new Error("Task is no longer active");
      browser = this.browsers.get(workspace.bridgeId);
      tab = browser?.tabs.find((t) => t.id === tabId);
    }
    if (
      !browser ||
      browser.activeWorkspaceId !== workspace.id ||
      !tab?.connected
    )
      throw new Error("The workspace browser is disconnected");
    if (!supportedApp(tab.url, this.sandboxOrigin, this.localOrigin))
      throw new Error("Tab has navigated outside the permitted applications");
    if (
      ["check_vendor", "prepare_vendor"].includes(action.kind) &&
      (task.kind !== "vendor_setup" || tab.app !== "netsuite")
    )
      throw new Error("This task cannot prepare a vendor.");
    if (action.kind === "create_vendor") {
      const draft = this.store.get<VendorDraft>("vendorDraft", action.draftId);
      if (
        task.kind !== "vendor_create" ||
        tab.app !== "netsuite" ||
        !draft ||
        draft.workspaceId !== workspace.id ||
        draft.tabId !== tabId ||
        draft.status !== "creating" ||
        draft.commitTaskId !== task.id ||
        JSON.stringify(draft.values) !== JSON.stringify(action.values) ||
        JSON.stringify(draft.review) !== JSON.stringify(action.review)
      )
        throw new Error(
          "Vendor creation requires the exact, explicitly approved draft.",
        );
      if (
        this.store
          .all<any>("command")
          .some(
            (c) =>
              c.action?.kind === "create_vendor" &&
              c.action.draftId === draft.id &&
              !(
                c.result?.status === "error" &&
                c.result?.outcome === "not_executed"
              ),
          )
      )
        throw new Error(
          "Vendor creation was already attempted. Inspect the result; it will not be repeated.",
        );
    }
    if (
      action.kind === "prepare_bill" &&
      (task.kind !== "prepare" || tab.app !== "netsuite")
    )
      throw new Error("This task cannot prepare bills");
    if (
      action.kind !== "prepare_bill" &&
      task.kind === "prepare" &&
      ["fill", "select"].includes(action.kind)
    )
      throw new Error("Use the approved bill values to prepare the form");
    const key = `${browser.id}/${tabId}/${frameId}`;
    if (action.kind !== "inspect" && !this.observations.has(key))
      await this.command(task, tabId, { kind: "inspect" }, signal, frameId);
    signal.throwIfAborted();
    if (
      this.store.get<Task>("task", task.id)?.status !== "running" ||
      this.store.get<Workspace>("workspace", workspace.id)?.paused
    )
      throw new Error("Task is no longer active");
    const before = this.observations.get(key);
    const storedTask = this.store.get<Task>("task", task.id)!;
    const limit = task.kind === "prepare" ? 12 : 48;
    if (storedTask.actionCount >= limit)
      throw new Error(`Task reached its ${limit}-command limit`);
    storedTask.actionCount++;
    this.store.put("task", task.id, storedTask);
    const command: BrowserCommand = {
      type: "browser.command",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.id,
      taskId: task.id,
      tabId,
      frameId,
      phase: task.kind,
      expectedDocumentId:
        action.kind === "inspect" ? null : before!.context.documentId,
      expectedPageVersion:
        action.kind === "inspect" ? null : before!.context.pageVersion,
      action,
    };
    this.store.put("command", command.commandId, {
      ...command,
      status: "sent",
      sentAt: new Date().toISOString(),
    });
    this.onActivity(
      workspace.id,
      task.id,
      action.kind === "inspect"
        ? `Reading ${tab.title}`
        : action.kind === "prepare_bill"
          ? "Preparing the selected bill fields"
          : `${action.kind === "click" ? "Opening" : action.kind === "fill" ? "Searching" : "Checking"} ${tab.app === "gmail" ? "invoice evidence" : tab.title}`,
    );
    return new Promise((resolve, reject) => {
      const settleError = (message: string) => {
        const p = this.pending.get(command.commandId);
        if (!p) return;
        clearTimeout(p.timer);
        p.cleanup();
        this.pending.delete(command.commandId);
        this.store.put("command", command.commandId, {
          ...command,
          status: "unknown",
          error: message,
        });
        reject(new Error(message));
      };
      const onAbort = () =>
        settleError("Task stopped; an in-flight action may need review.");
      const timer = setTimeout(
        () =>
          settleError(
            "Browser command timed out. Its outcome must be checked before retrying.",
          ),
        15000,
      );
      signal.addEventListener("abort", onAbort, { once: true });
      this.pending.set(command.commandId, {
        command,
        bridgeId: browser.id,
        resolve,
        reject,
        timer,
        cleanup: () => signal.removeEventListener("abort", onAbort),
      });
      browser.send(command);
      this.onChange();
    });
  }
  receive(bridgeId: string, result: CommandResult) {
    const pending = this.pending.get(result.commandId);
    if (!pending || pending.bridgeId !== bridgeId) return;
    if (
      result.workspaceId !== pending.command.workspaceId ||
      result.taskId !== pending.command.taskId
    )
      return;
    if (result.status === "ok") {
      const c = result.observation.context;
      if (
        c.tabId !== pending.command.tabId ||
        c.frameId !== pending.command.frameId ||
        supportedApp(c.url, this.sandboxOrigin, this.localOrigin) !== c.app
      )
        return;
      this.observations.set(
        `${bridgeId}/${c.tabId}/${c.frameId}`,
        result.observation,
      );
    }
    clearTimeout(pending.timer);
    pending.cleanup();
    this.pending.delete(result.commandId);
    this.store.put("command", result.commandId, {
      ...pending.command,
      status: result.status,
      result,
      finishedAt: new Date().toISOString(),
    });
    pending.resolve(result);
  }
  disconnect(bridgeId: string) {
    this.browsers.delete(bridgeId);
    for (const [id, p] of this.pending) {
      if (p.bridgeId !== bridgeId) continue;
      clearTimeout(p.timer);
      p.cleanup();
      p.reject(
        new Error("Browser disconnected. Actions will not be replayed."),
      );
      this.pending.delete(id);
      this.store.put("command", id, {
        ...p.command,
        status: "unknown",
        error: "Browser disconnected",
      });
    }
    for (const key of this.observations.keys())
      if (key.startsWith(bridgeId + "/")) this.observations.delete(key);
  }
  record(task: Task, result: CommandResult): Evidence | null {
    if (result.status !== "ok") return null;
    const observation = result.observation;
    const evidence: Evidence = {
      id: `obs-${crypto.randomUUID()}`,
      taskId: task.id,
      workspaceId: task.workspaceId,
      tabId: observation.context.tabId,
      app: observation.context.app,
      url: observation.context.url,
      title: observation.context.title,
      capturedAt: new Date().toISOString(),
      text: observation.text,
      hash: createHash("sha256")
        .update(JSON.stringify(observation))
        .digest("hex"),
      observation,
    };
    this.store.put("evidence", evidence.id, evidence);
    return evidence;
  }
  evidence(taskId: string) {
    return this.store
      .all<Evidence>("evidence")
      .filter((e) => e.taskId === taskId);
  }
  latest(bridgeId: string, tabId: string, frameId = 0) {
    return this.observations.get(`${bridgeId}/${tabId}/${frameId}`);
  }
  tabs(workspace: Workspace) {
    return (
      this.browsers
        .get(workspace.bridgeId)
        ?.tabs.filter(
          (t) =>
            workspace.tabIds.includes(t.id) &&
            !workspace.pausedTabIds.includes(t.id),
        ) ?? []
    );
  }
}
