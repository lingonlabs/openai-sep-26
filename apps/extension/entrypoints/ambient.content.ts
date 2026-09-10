import { PageRuntime, commandError } from "@close/browser";
import { supportedApp, type Workspace } from "@close/shared";
export default defineContentScript({
  matches: [
    "https://11816061-sb1.app.netsuite.com/*",
    "https://mail.google.com/*",
    "https://docs.google.com/spreadsheets/*",
    "http://127.0.0.1:4318/demo/*",
  ],
  runAt: "document_idle",
  main(ctx) {
    const app = supportedApp(
      location.href,
      "https://11816061-sb1.app.netsuite.com",
      "http://127.0.0.1:4318",
    );
    if (!app) return;
    let runtime: PageRuntime | null = null,
      workspace: Workspace | null = null,
      host: HTMLElement | null = null,
      status = "watching";
    const aborters = new Map<string, AbortController>();
    const icon = () => {
      if (host) return;
      host = document.createElement("div");
      host.dataset.closeCopilotUi = "true";
      host.style.cssText =
        "position:fixed;right:22px;bottom:22px;z-index:2147483647;";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML =
        '<style>button{border:1px solid #9bb69b;border-radius:50%;background:#224e40;color:#eaf3db;box-shadow:0 6px 25px #14362733;width:48px;height:48px;cursor:grab;font:22px system-ui;position:relative}button:focus{outline:3px solid #c5dbb0;outline-offset:3px}i{position:absolute;right:1px;top:1px;width:9px;height:9px;border-radius:50%;background:#aaca7a;border:2px solid #f7faf0}</style><button aria-label="Open Close Copilot" title="Close Copilot · watching selected tab">✦<i></i></button>';
      const button = shadow.querySelector("button")!;
      let start: { x: number; y: number; left: number; top: number } | null =
          null,
        moved = false;
      button.onpointerdown = (e) => {
        const r = host!.getBoundingClientRect();
        start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
        moved = false;
        button.setPointerCapture(e.pointerId);
      };
      button.onpointermove = (e) => {
        if (!start) return;
        const dx = e.clientX - start.x,
          dy = e.clientY - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
        if (moved) {
          host!.style.right = "auto";
          host!.style.bottom = "auto";
          host!.style.left =
            Math.max(0, Math.min(innerWidth - 50, start.left + dx)) + "px";
          host!.style.top =
            Math.max(0, Math.min(innerHeight - 50, start.top + dy)) + "px";
        }
      };
      button.onpointerup = () => {
        start = null;
      };
      button.onclick = () => {
        if (!moved)
          void chrome.runtime.sendMessage({ type: "close.open-panel" });
      };
      document.body.append(host);
    };
    const unwatch = () => {
      runtime?.unwatch();
      host?.remove();
      host = null;
    };
    chrome.runtime.onMessage.addListener((message, _sender, respond) => {
      if (message.type === "close.watch") {
        const next = message.workspace as Workspace | null;
        if (!next) {
          workspace = null;
          unwatch();
          respond({ ok: true });
          return false;
        }
        const same = workspace?.id === next.id && !!host;
        workspace = next;
        if (!runtime) runtime = new PageRuntime(document, message.tabId, app);
        if (!same) {
          icon();
          runtime.watch(
            (context) =>
              void chrome.runtime
                .sendMessage({ type: "close.context", context })
                .catch(() => {}),
          );
        }
        respond({ ok: true });
      } else if (message.type === "close.status") {
        status = message.status;
        const b = host?.shadowRoot?.querySelector("button");
        if (b) {
          b.title = "Close Copilot · " + status;
          b.setAttribute("aria-label", "Open Close Copilot · " + status);
          const dot = b.querySelector("i")!;
          dot.style.background =
            status === "working"
              ? "#e7c27f"
              : status === "suggestion"
                ? "#f3d466"
                : "#aaca7a";
        }
        respond({ ok: true });
      } else if (message.type === "close.cancel") {
        runtime?.cancel(message.taskId);
        aborters.get(message.taskId)?.abort();
        respond({ ok: true });
      } else if (message.type === "close.command") {
        const command = message.command;
        if (
          !workspace ||
          workspace.id !== command.workspaceId ||
          workspace.paused ||
          !workspace.tabIds.includes(command.tabId) ||
          workspace.pausedTabIds.includes(command.tabId) ||
          !runtime
        ) {
          respond(
            commandError(
              command,
              "WORKSPACE_UNAVAILABLE",
              "The page is no longer watched.",
            ),
          );
          return false;
        }
        let controller = aborters.get(command.taskId);
        if (!controller) {
          controller = new AbortController();
          aborters.set(command.taskId, controller);
        }
        void runtime.execute(command, controller.signal).then(respond);
        return true;
      }
      return false;
    });
    void chrome.runtime.sendMessage({ type: "close.ready" }).catch(() => {});
    ctx.onInvalidated(unwatch);
  },
});
