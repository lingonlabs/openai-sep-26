import { BridgeClient, commandError } from "@close/browser";
import { supportedApp, type BrowserTab, type Workspace } from "@close/shared";
const sandbox = "https://11816061-sb1.app.netsuite.com",
  local = "http://127.0.0.1:4318";
export default defineBackground(() => {
  let client: BridgeClient | null = null,
    workspace: Workspace | null = null,
    connected = false;
  const selected = new Set<number>();
  let inventoryTimer: ReturnType<typeof setTimeout> | undefined;
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
  const sync = async () => {
    const next = new Set(
      workspace && !workspace.paused
        ? workspace.tabIds
            .filter((id) => !workspace!.pausedTabIds.includes(id))
            .map(Number)
        : [],
    );
    for (const id of new Set([...selected, ...next])) {
      try {
        await chrome.tabs.sendMessage(id, {
          type: "close.watch",
          workspace: next.has(id) ? workspace : null,
          tabId: String(id),
        });
      } catch {}
    }
    selected.clear();
    for (const id of next) selected.add(id);
  };
  const connect = async () => {
    client?.close();
    connected = false;
    const stored = await chrome.storage.local.get([
      "closeToken",
      "closeBrowserId",
    ]);
    if (typeof stored.closeToken !== "string") return;
    let browserId =
      typeof stored.closeBrowserId === "string" ? stored.closeBrowserId : "";
    if (!browserId) {
      browserId = crypto.randomUUID();
      await chrome.storage.local.set({ closeBrowserId: browserId });
    }
    client = new BridgeClient("ws://127.0.0.1:4318/bridge", {
      type: "hello",
      protocolVersion: 1,
      token: stored.closeToken,
      clientId: browserId,
      role: "browser",
      name: "Chrome demo profile",
      synthetic: false,
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
        for (const tabId of selected)
          void chrome.tabs
            .sendMessage(tabId, {
              type: "close.cancel",
              taskId: message.taskId,
            })
            .catch(() => {});
      } else if (message.type === "state") {
        const w = message.state.workspaces.find((w) => w.id === workspace?.id);
        if (w) workspace = w;
        const status = w?.paused
          ? "paused"
          : w?.activeTaskId
            ? "working"
            : message.state.suggestions.some(
                  (s) => s.workspaceId === w?.id && s.status === "pending",
                )
              ? "suggestion"
              : "watching";
        for (const tabId of selected)
          void chrome.tabs
            .sendMessage(tabId, { type: "close.status", status })
            .catch(() => {});
      } else if (message.type === "browser.command") {
        if (
          !workspace ||
          workspace.id !== message.workspaceId ||
          workspace.paused ||
          !selected.has(Number(message.tabId))
        ) {
          client?.send(
            commandError(
              message,
              "WORKSPACE_UNAVAILABLE",
              "This tab is not selected.",
            ),
          );
          return;
        }
        try {
          const result = await chrome.tabs.sendMessage(
            Number(message.tabId),
            { type: "close.command", command: message },
            { frameId: message.frameId },
          );
          client?.send(result);
        } catch {
          client?.send(
            commandError(
              message,
              "CONTENT_DISCONNECTED",
              "The selected page disconnected. Inspect it before retrying.",
              "unknown",
            ),
          );
        }
      }
    };
    client.connect();
  };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      message.type === "close.context" &&
      workspace &&
      sender.tab?.id &&
      selected.has(sender.tab.id)
    ) {
      client?.send({
        type: "browser.context",
        workspaceId: workspace.id,
        context: message.context,
      });
      respond({ ok: true });
    } else if (message.type === "close.ready") {
      void sync();
      refresh();
      respond({ ok: true });
    } else if (message.type === "close.open-panel" && sender.tab?.id) {
      void chrome.sidePanel
        .open({ tabId: sender.tab.id })
        .then(() => respond({ ok: true }))
        .catch(() => respond({ ok: false }));
      return true;
    } else if (message.type === "close.connect") {
      void connect().then(() => respond({ ok: true }));
      return true;
    } else if (message.type === "close.disconnect") {
      client?.close();
      workspace = null;
      void sync();
      respond({ ok: true });
    }
    return false;
  });
  chrome.tabs.onUpdated.addListener(refresh);
  chrome.tabs.onRemoved.addListener(refresh);
  chrome.tabs.onActivated.addListener(refresh);
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void connect();
});
