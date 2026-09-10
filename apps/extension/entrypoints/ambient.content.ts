import { PageRuntime, commandError } from "@close/browser";
import {
  supportedApp,
  type Workspace,
  type Suggestion,
  type BrowserAction,
} from "@close/shared";
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
    document.querySelector('[data-close-copilot-ui="true"]')?.remove();
    let runtime: PageRuntime | null = null,
      workspace: Workspace | null = null,
      host: HTMLElement | null = null;
    let tabId = "",
      status = "watching",
      suggestion: Suggestion | null = null,
      progress = "",
      expanded = false;
    const aborters = new Map<string, AbortController>();
    const checks = new Map<string, () => void>();
    let ambientEnabled = true,
      ambientEpoch: number | undefined,
      baseline = false,
      monitorSignature = "";
    const monitor = () => {
      if (!runtime) return;
      if (workspace?.activeTaskId || status === "working") baseline = true;
      const enabled =
        workspace &&
        !workspace.paused &&
        !workspace.pausedTabIds.includes(tabId) &&
        !workspace.activeTaskId &&
        status !== "working" &&
        ambientEnabled;
      const signature = JSON.stringify([
        workspace?.id,
        !!enabled,
        ambientEpoch,
      ]);
      if (signature === monitorSignature) return;
      monitorSignature = signature;
      runtime.unwatch();
      if (enabled)
        runtime.watch((context) => {
          const wasBaseline = baseline;
          baseline = false;
          void send({
            type: "close.context",
            context: { ...context, baseline: wasBaseline, ambientEpoch },
          });
        });
    };
    const send = (message: unknown) =>
      chrome.runtime.sendMessage(message).catch(() => {
        unwatch();
      });
    const action = (name: string, payload: object = {}) =>
      send({ type: "close.presence-action", action: name, payload });
    const render = () => {
      if (!host) return;
      const shadow = host.shadowRoot!,
        button = shadow.querySelector<HTMLButtonElement>(".orb")!;
      button.title = "Close Copilot · " + status;
      button.setAttribute("aria-label", "Open Close Copilot · " + status);
      button.querySelector<HTMLElement>("i")!.style.background =
        status === "working"
          ? "#e7c27f"
          : status === "suggestion"
            ? "#f3d466"
            : status === "paused"
              ? "#aaa"
              : "#aaca7a";
      const bubble = shadow.querySelector<HTMLElement>(".bubble")!;
      bubble.replaceChildren();
      bubble.hidden = !expanded && !suggestion && status !== "working";
      const title = document.createElement("strong");
      title.textContent =
        status === "working"
          ? "Following the evidence"
          : (suggestion?.title ?? "Close Copilot");
      const detail = document.createElement("p");
      detail.textContent =
        status === "working"
          ? progress
          : (suggestion?.description ??
            (status === "paused"
              ? "This tab is paused."
              : "Watching the tabs you selected."));
      bubble.append(title, detail);
      const add = (label: string, fn: () => void, primary = false) => {
        const b = document.createElement("button");
        b.textContent = label;
        if (primary) b.className = "primary";
        b.onclick = fn;
        bubble.append(b);
      };
      if (status === "working")
        add("Stop task", () => void action("task.stop"), true);
      else if (suggestion && status !== "paused") {
        add(
          suggestion.options?.length ? "Choose how to help" : "Check invoices",
          () =>
            suggestion?.options?.length
              ? void send({ type: "close.open-panel" })
              : void action("suggestion.accept", {
                  suggestionId: suggestion!.id,
                }),
          true,
        );
        add("Not now", () => {
          void action("suggestion.dismiss", { suggestionId: suggestion!.id });
          suggestion = null;
          expanded = false;
          render();
        });
      }
      add("Open assistant", () => void send({ type: "close.open-panel" }));
      add(
        status === "paused" ? "Resume tab" : "Pause tab",
        () => void action("tab.pause", { paused: status !== "paused" }),
      );
      add(
        "Pause workspace",
        () => void action("workspace.pause", { paused: true }),
      );
      add("Remove tab", () => void action("tab.remove"));
    };
    const icon = () => {
      if (host) return;
      host = document.createElement("div");
      host.dataset.closeCopilotUi = "true";
      host.style.cssText =
        "position:fixed;right:22px;bottom:22px;z-index:2147483647;";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>:host{font:13px/1.5 system-ui;color:#224e40}*{box-sizing:border-box}button{cursor:pointer;font:inherit}button:focus-visible{outline:3px solid #c5dbb0;outline-offset:3px}.orb{border:1px solid #9bb69b;border-radius:50%;background:#224e40;color:#eaf3db;box-shadow:0 6px 25px #14362733;width:48px;height:48px;cursor:grab;font:22px system-ui;position:relative}.orb i{position:absolute;right:1px;top:1px;width:9px;height:9px;border-radius:50%;background:#aaca7a;border:2px solid #f7faf0}.bubble{position:absolute;right:0;bottom:58px;width:290px;max-width:calc(100vw - 24px);padding:18px;background:#fafbf5;border:1px solid #d5dfcf;border-radius:16px;box-shadow:0 8px 30px #14362722}.bubble[hidden]{display:none}.bubble p{font-size:12px;color:#607267;margin:8px 0 12px;overflow-wrap:anywhere}.bubble button{border:0;border-radius:8px;padding:7px 9px;background:transparent;color:#365947;margin:2px}.bubble button.primary{background:#224e40;color:#fafbf5}</style><div class="bubble" hidden></div><button class="orb" aria-label="Open Close Copilot">✦<i></i></button>`;
      const button = shadow.querySelector<HTMLButtonElement>(".orb")!;
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
            Math.max(12, Math.min(innerWidth - 62, start.left + dx)) + "px";
          host!.style.top =
            Math.max(12, Math.min(innerHeight - 62, start.top + dy)) + "px";
          positionBubble();
        }
      };
      button.onpointerup = () => {
        start = null;
        if (moved)
          void chrome.storage.local.set({
            closePresencePosition: {
              left: host!.style.left,
              top: host!.style.top,
            },
          });
      };
      button.onclick = () => {
        if (!moved) {
          expanded = !expanded;
          render();
          void send({ type: "close.open-panel" });
        }
      };
      document.body.append(host);
      void chrome.storage.local.get("closePresencePosition").then((stored) => {
        const p = stored.closePresencePosition as
          { left?: string; top?: string } | undefined;
        if (!host || !p) return;
        host.style.right = "auto";
        host.style.bottom = "auto";
        host.style.left =
          Math.max(
            12,
            Math.min(innerWidth - 62, parseFloat(p.left ?? "") || 12),
          ) + "px";
        host.style.top =
          Math.max(
            12,
            Math.min(innerHeight - 62, parseFloat(p.top ?? "") || 12),
          ) + "px";
        positionBubble();
      });
      render();
    };
    const positionBubble = () => {
      if (!host) return;
      const r = host.getBoundingClientRect(),
        bubble = host.shadowRoot!.querySelector<HTMLElement>(".bubble")!;
      bubble.style.right = r.left < 290 ? "auto" : "0";
      bubble.style.left = r.left < 290 ? "0" : "auto";
      bubble.style.bottom = r.top < 300 ? "auto" : "58px";
      bubble.style.top = r.top < 300 ? "58px" : "auto";
    };
    const unwatch = () => {
      runtime?.unwatch();
      monitorSignature = "";
      host?.remove();
      host = null;
    };
    chrome.runtime.onMessage.addListener((message, _sender, respond) => {
      if (message.type === "close.ping") {
        respond({ ok: true });
        return false;
      }
      if (message.type === "close.watch") {
        const next = message.workspace as Workspace | null;
        if (!next) {
          workspace = null;
          unwatch();
          respond({ ok: true });
          return false;
        }
        const same = workspace?.id === next.id && !!host;
        const wasPaused = workspace?.pausedTabIds.includes(tabId);
        workspace = next;
        tabId = message.tabId;
        if (!runtime) runtime = new PageRuntime(document, tabId, app);
        icon();
        if (next.pausedTabIds.includes(tabId)) {
          runtime.unwatch();
          status = "paused";
        }
        monitor();
        render();
        respond({ ok: true });
      } else if (message.type === "close.status") {
        status = message.status;
        suggestion = message.suggestion ?? null;
        progress = message.progress ?? "";
        ambientEnabled = message.ambientEnabled !== false;
        ambientEpoch = message.ambientEpoch;
        monitor();
        render();
        respond({ ok: true });
      } else if (message.type === "close.activated") {
        runtime?.revisit();
        respond({ ok: true });
      } else if (message.type === "close.cancel") {
        runtime?.cancel(message.taskId);
        aborters.get(message.taskId)?.abort();
        respond({ ok: true });
      } else if (message.type === "close.native-check") {
        try {
          const check = checks.get(message.grant);
          if (!check) throw new Error("Native command expired");
          check();
          respond({ ok: true });
        } catch (e) {
          respond({ ok: false, error: String(e) });
        }
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
        const native = async (action: BrowserAction, verify: () => void) => {
          if (!message.grant) throw new Error("NATIVE_UNAVAILABLE");
          checks.set(message.grant, verify);
          try {
            const result = await chrome.runtime.sendMessage({
              type: "close.native",
              grant: message.grant,
              commandId: command.commandId,
            });
            if (!result?.ok)
              throw new Error(result?.error ?? "Native action failed");
            return result.screenshot;
          } finally {
            checks.delete(message.grant);
          }
        };
        void runtime.execute(command, controller.signal, native).then(respond);
        return true;
      }
      return false;
    });
    void send({ type: "close.ready" });
    ctx.onInvalidated(unwatch);
  },
});
