import {
  BridgeClient,
  commandError,
  inspectAfterNavigation,
} from "@close/browser";
import {
  supportedApp,
  withinScope,
  taskProgress,
  type BrowserCommand,
  type BrowserTab,
  type Workspace,
  type AppState,
} from "@close/shared";
const sandbox = "https://11816061-sb1.app.netsuite.com",
  local = "http://127.0.0.1:4318";
export default defineBackground(() => {
  let client: BridgeClient | null = null,
    workspace: Workspace | null = null,
    connected = false,
    state: AppState | null = null;
  const selected = new Set<number>(),
    cancelled = new Set<string>(),
    handled = new Set<string>();
  const grants = new Map<
    string,
    { command: BrowserCommand; url: string; used: boolean }
  >();
  let queue = Promise.resolve(),
    syncQueue = Promise.resolve(),
    inventoryTimer: ReturnType<typeof setTimeout> | undefined;
  let startup = Promise.resolve();
  chrome.runtime.onStartup.addListener(() => {
    startup = chrome.storage.local.set({
      closeBrowserSessionId: crypto.randomUUID(),
    });
    void startup.then(connect);
  });
  const active = (c: BrowserCommand) =>
    connected &&
    workspace?.id === c.workspaceId &&
    !workspace.paused &&
    workspace.activeTaskId === c.taskId &&
    selected.has(Number(c.tabId)) &&
    !workspace.pausedTabIds.includes(c.tabId) &&
    !cancelled.has(c.taskId);
  const inventory = async () => {
    const tabs: BrowserTab[] = [];
    for (const t of await chrome.tabs.query({})) {
      const app = supportedApp(t.url ?? "", sandbox, local);
      if (!app || !t.id || !t.url) continue;
      tabs.push({
        id: String(t.id),
        title: t.title || app,
        url: t.url,
        app,
        active: !!t.active,
        connected: t.status === "complete",
        synthetic: false,
      });
    }
    client?.send({ type: "browser.inventory", tabs });
  };
  const refresh = () => {
    clearTimeout(inventoryTimer);
    inventoryTimer = setTimeout(() => void inventory(), 200);
  };
  const status = async () => {
    const ambient = state?.ambient?.find(
      (a) => a.workspaceId === workspace?.id,
    );
    for (const id of selected) {
      const task = state?.tasks.find((t) => t.id === workspace?.activeTaskId);
      const suggestion = state?.suggestions.find(
        (s) =>
          s.workspaceId === workspace?.id &&
          s.tabId === String(id) &&
          s.status === "pending",
      );
      const paused =
        workspace?.paused || workspace?.pausedTabIds.includes(String(id));
      await chrome.tabs
        .sendMessage(id, {
          type: "close.status",
          status: paused
            ? "paused"
            : task
              ? "working"
              : suggestion
                ? "suggestion"
                : "watching",
          suggestion: paused ? null : suggestion,
          progress: task ? taskProgress(task, state?.activities ?? []) : "",
          ambientEnabled:
            ambient?.preferences.enabled !== false &&
            (ambient?.preferences.instructions.some((i) => i.enabled) ?? true),
          ambientEpoch: ambient?.epoch,
        })
        .catch(() => {});
    }
  };
  const syncNow = async () => {
    const next = new Set(
      workspace && !workspace.paused ? workspace.tabIds.map(Number) : [],
    );
    for (const id of new Set([...selected, ...next])) {
      try {
        if (next.has(id)) {
          const tab = await chrome.tabs.get(id),
            scope = workspace?.tabScopes?.[String(id)];
          if (!tab.url || (scope && !withinScope(tab.url, scope))) {
            next.delete(id);
          } else {
            const alive = await chrome.tabs
              .sendMessage(id, { type: "close.ping" })
              .catch(() => null);
            if (!alive?.ok && tab.status === "complete")
              await chrome.scripting.executeScript({
                target: { tabId: id },
                files: ["content-scripts/ambient.js"],
              });
          }
        }
        if (
          !workspace ||
          workspace.paused ||
          !workspace.tabIds.includes(String(id))
        )
          next.delete(id);
        await chrome.tabs.sendMessage(id, {
          type: "close.watch",
          workspace: next.has(id) ? workspace : null,
          tabId: String(id),
        });
      } catch {
        /* Loading tabs will be retried by the inventory update. */
      }
    }
    selected.clear();
    for (const id of next) selected.add(id);
    await status();
  };
  const sync = () => {
    syncQueue = syncQueue.then(syncNow).catch(() => {});
    return syncQueue;
  };
  const execute = async (command: BrowserCommand) => {
    if (handled.has(command.commandId)) {
      client?.send(
        commandError(
          command,
          "DUPLICATE_COMMAND",
          "Actions are never replayed.",
        ),
      );
      return;
    }
    handled.add(command.commandId);
    if (handled.size > 2000) handled.delete(handled.values().next().value!);
    await sync();
    if (!active(command)) {
      client?.send(
        commandError(
          command,
          "WORKSPACE_UNAVAILABLE",
          "This task or tab is no longer active.",
        ),
      );
      return;
    }
    let sourceUrl: string | undefined;
    const grant = crypto.randomUUID();
    try {
      sourceUrl = (await chrome.tabs.get(Number(command.tabId))).url;
      if (
        !sourceUrl ||
        !command.scope ||
        !withinScope(sourceUrl, command.scope)
      )
        throw new Error("Selected account changed");
      grants.set(grant, { command, url: sourceUrl, used: false });
      const result = await chrome.tabs.sendMessage(
        Number(command.tabId),
        { type: "close.command", command, grant },
        { frameId: command.frameId },
      );
      client?.send(result);
    } catch {
      const observation = sourceUrl
        ? await inspectAfterNavigation(command, sourceUrl, {
            tab: () => chrome.tabs.get(Number(command.tabId)).catch(() => null),
            inspect: (c) =>
              chrome.tabs.sendMessage(
                Number(command.tabId),
                { type: "close.command", command: c },
                { frameId: command.frameId },
              ),
            active: () => active(command),
          }).catch(() => null)
        : null;
      client?.send(
        observation ??
          commandError(
            command,
            "CONTENT_DISCONNECTED",
            "The selected page disconnected. Inspect it before retrying.",
            "unknown",
          ),
      );
    } finally {
      grants.delete(grant);
    }
  };
  const connect = async () => {
    await startup;
    client?.close();
    connected = false;
    const stored = await chrome.storage.local.get([
      "closeToken",
      "closeBrowserId",
      "closeBrowserSessionId",
    ]);
    if (typeof stored.closeToken !== "string") return;
    const browserId =
      typeof stored.closeBrowserId === "string"
        ? stored.closeBrowserId
        : crypto.randomUUID();
    const sessionId =
      typeof stored.closeBrowserSessionId === "string"
        ? stored.closeBrowserSessionId
        : crypto.randomUUID();
    await chrome.storage.local.set({
      closeBrowserId: browserId,
      closeBrowserSessionId: sessionId,
    });
    client = new BridgeClient("ws://127.0.0.1:4318/bridge", {
      type: "hello",
      protocolVersion: 1,
      token: stored.closeToken,
      clientId: browserId,
      role: "browser",
      name: "Chrome demo profile",
      synthetic: false,
      sessionId,
    });
    client.onConnection = (value) => {
      connected = value;
      if (value) void inventory();
      else {
        workspace = null;
        void sync();
      }
    };
    client.onMessage = async (message) => {
      if (message.type === "browser.watch") {
        workspace = message.workspace;
        await sync();
      } else if (message.type === "browser.focus") {
        const tab = await chrome.tabs
          .get(Number(message.tabId))
          .catch(() => null);
        if (tab && workspace?.tabIds.includes(message.tabId)) {
          await chrome.windows.update(tab.windowId, { focused: true });
          await chrome.tabs.update(tab.id!, { active: true });
        }
      } else if (message.type === "browser.cancel") {
        cancelled.add(message.taskId);
        for (const tabId of selected)
          void chrome.tabs
            .sendMessage(tabId, {
              type: "close.cancel",
              taskId: message.taskId,
            })
            .catch(() => {});
      } else if (message.type === "state" || message.type === "welcome") {
        state = message.state;
        const w = state.workspaces.find((w) => w.id === workspace?.id);
        if (w) workspace = w;
        await status();
      } else if (message.type === "browser.command") {
        queue = queue.then(() => execute(message)).catch(() => {});
      }
    };
    client.connect();
  };
  const native = async (
    grant: string,
    sender: chrome.runtime.MessageSender,
  ) => {
    const permitted = grants.get(grant);
    if (!permitted || permitted.used)
      throw new Error("Native action expired or already attempted");
    const { command, url } = permitted,
      tabId = Number(command.tabId);
    if (
      sender.tab?.id !== tabId ||
      (sender.frameId ?? 0) !== command.frameId ||
      !active(command)
    )
      throw new Error("Native action outside active tab");
    const verify = async () => {
      if (!active(command)) throw new Error("Task stopped");
      const tab = await chrome.tabs.get(tabId);
      if (tab.url !== url || !withinScope(tab.url, command.scope!))
        throw new Error("Page changed before native action");
      const result = await chrome.tabs.sendMessage(
        tabId,
        { type: "close.native-check", grant },
        { frameId: command.frameId },
      );
      if (!result?.ok) throw new Error(result?.error ?? "Target changed");
    };
    permitted.used = true;
    const action = command.action;
    if (!["key", "screenshot", "navigate"].includes(action.kind))
      throw new Error("Unsupported native action");
    if (action.kind === "navigate") {
      await verify();
      await chrome.tabs.update(tabId, { url: action.url });
      return { ok: true };
    }
    let attached = false;
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      attached = true;
      await verify();
      if (action.kind === "screenshot") {
        const shot = (await chrome.debugger.sendCommand(
          { tabId },
          "Page.captureScreenshot",
          { format: "png", captureBeyondViewport: false },
        )) as { data: string };
        await verify();
        const screenshot = `data:image/png;base64,${shot.data}`;
        if (screenshot.length > 8_000_000)
          throw new Error(
            "Screenshot is too large. Reduce the browser window and retry.",
          );
        return { ok: true, screenshot };
      }
      if (action.kind === "key") {
        const code = {
          Enter: 13,
          Tab: 9,
          Escape: 27,
          ArrowDown: 40,
          ArrowUp: 38,
        }[action.key];
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
          type: "keyDown",
          key: action.key,
          code: action.key,
          windowsVirtualKeyCode: code,
        });
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
          type: "keyUp",
          key: action.key,
          code: action.key,
          windowsVirtualKeyCode: code,
        });
        return { ok: true };
      }
      throw new Error("Unsupported native action");
    } finally {
      if (attached) await chrome.debugger.detach({ tabId }).catch(() => {});
    }
  };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      message.type === "close.context" &&
      workspace &&
      !workspace.paused &&
      sender.tab?.id &&
      workspace.tabIds.includes(String(sender.tab.id)) &&
      !workspace.pausedTabIds.includes(String(sender.tab.id))
    ) {
      client?.send({
        type: "browser.context",
        workspaceId: workspace.id,
        context: {
          ...message.context,
          tabId: String(sender.tab.id),
          url: sender.url ?? message.context.url,
        },
      });
      respond({ ok: true });
    } else if (message.type === "close.native") {
      void native(message.grant, sender).then(respond, (e) =>
        respond({ ok: false, error: String(e) }),
      );
      return true;
    } else if (
      message.type === "close.presence-action" &&
      workspace &&
      sender.tab?.id &&
      selected.has(sender.tab.id)
    ) {
      const allowed = [
        "suggestion.accept",
        "suggestion.dismiss",
        "task.stop",
        "tab.pause",
        "tab.remove",
        "workspace.pause",
      ];
      if (!allowed.includes(message.action)) {
        respond({ ok: false });
        return false;
      }
      if (message.action === "suggestion.accept")
        void chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
      if (
        message.action.startsWith("suggestion.") &&
        !state?.suggestions.some(
          (s) =>
            s.id === message.payload?.suggestionId &&
            s.tabId === String(sender.tab!.id) &&
            s.workspaceId === workspace!.id,
        )
      ) {
        respond({ ok: false });
        return false;
      }
      void client
        ?.request(message.action, {
          ...message.payload,
          workspaceId: workspace.id,
          tabId: String(sender.tab.id),
        })
        .then(
          () => respond({ ok: true }),
          (e) => respond({ ok: false, error: String(e) }),
        );
      return true;
    } else if (message.type === "close.ready") {
      void sync();
      refresh();
      respond({ ok: true });
    } else if (message.type === "close.open-panel" && sender.tab?.id) {
      void chrome.sidePanel.open({ tabId: sender.tab.id }).then(
        () => respond({ ok: true }),
        () => respond({ ok: false }),
      );
      return true;
    } else if (
      message.type === "close.connect" &&
      sender.url?.startsWith(chrome.runtime.getURL(""))
    ) {
      void connect().then(() => respond({ ok: true }));
      return true;
    } else if (
      message.type === "close.disconnect" &&
      sender.url?.startsWith(chrome.runtime.getURL(""))
    ) {
      client?.close();
      workspace = null;
      void sync();
      respond({ ok: true });
    }
    return false;
  });
  chrome.tabs.onUpdated.addListener(refresh);
  chrome.tabs.onRemoved.addListener(refresh);
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    refresh();
    if (selected.has(tabId) && !workspace?.activeTaskId)
      void chrome.tabs
        .sendMessage(tabId, { type: "close.activated" })
        .catch(() => {});
  });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void connect();
});
