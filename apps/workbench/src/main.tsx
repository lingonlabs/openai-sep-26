import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Sparkles, ArrowUpRight, Monitor, Play, RotateCcw } from "lucide-react";
import { BridgeClient, PageRuntime, commandError } from "@close/browser";
import { CopilotPanel, PairingView, AppIcon, Button } from "@close/ui";
import type {
  AppState,
  AppKind,
  BrowserTab,
  ServerMessage,
  Workspace,
} from "@close/shared";
import "@close/ui/styles.css";
import "./styles.css";
const definitions = [
  {
    id: "demo-netsuite",
    app: "netsuite" as AppKind,
    title: "NetSuite · New Bill",
    path: "/demo/netsuite",
  },
  {
    id: "demo-gmail",
    app: "gmail" as AppKind,
    title: "Gmail · Invoice inbox",
    path: "/demo/gmail",
  },
  {
    id: "demo-vendors",
    app: "sheets" as AppKind,
    title: "Sheets · Vendor onboarding",
    path: "/demo/vendors",
  },
];
function initialToken() {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("pair");
  if (token) {
    localStorage.setItem("close.pairing", token);
    history.replaceState(null, "", location.pathname);
  }
  return token || localStorage.getItem("close.pairing") || "";
}
function Workbench() {
  const [browserId] = useState(() => {
    const id =
      sessionStorage.getItem("close.demo-browser") || crypto.randomUUID();
    sessionStorage.setItem("close.demo-browser", id);
    return id;
  });
  const [token, setToken] = useState(initialToken);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState("demo-netsuite");
  const [pairError, setPairError] = useState("");
  const [tour, setTour] = useState(0);
  const client = useRef<BridgeClient | null>(null);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const runtimes = useRef(new Map<string, PageRuntime>());
  const workspace = useRef<Workspace | null>(null);
  const aborters = useRef(new Map<string, AbortController>());
  const tabs = () =>
    definitions.map((d) => ({
      id: d.id,
      app: d.app,
      title: frames.current.get(d.id)?.contentDocument?.title ?? d.title,
      url:
        frames.current.get(d.id)?.contentWindow?.location.href ??
        location.origin + d.path,
      active: d.id === activeTab,
      connected: runtimes.current.has(d.id),
      synthetic: true,
    }));
  const watch = () => {
    const w = workspace.current;
    for (const [id, runtime] of runtimes.current) {
      runtime.unwatch();
      if (
        w &&
        !w.paused &&
        w.tabIds.includes(id) &&
        !w.pausedTabIds.includes(id)
      )
        runtime.watch((context) =>
          client.current?.send({
            type: "browser.context",
            workspaceId: w.id,
            context,
          }),
        );
    }
  };
  const ready = (id: string) => {
    const frame = frames.current.get(id),
      definition = definitions.find((d) => d.id === id)!;
    if (!frame?.contentDocument) return;
    runtimes.current.get(id)?.unwatch();
    runtimes.current.set(
      id,
      new PageRuntime(frame.contentDocument, id, definition.app),
    );
    client.current?.send({ type: "browser.inventory", tabs: tabs() });
    watch();
  };
  useEffect(() => {
    if (!token) return;
    const bridge = new BridgeClient(
      location.origin.replace("http", "ws") + "/bridge",
      {
        type: "hello",
        protocolVersion: 1,
        token,
        clientId: browserId,
        role: "browser",
        name: "Interactive demo workspace",
        synthetic: true,
      },
    );
    client.current = bridge;
    bridge.onConnection = (value) => {
      setConnected(value);
      if (value) {
        setPairError("");
        bridge.send({ type: "browser.inventory", tabs: tabs() });
      }
    };
    bridge.onMessage = async (message: ServerMessage) => {
      if (message.type === "welcome" || message.type === "state")
        setState(message.state);
      if (message.type === "error") setPairError(message.message);
      if (message.type === "browser.watch") {
        workspace.current = message.workspace;
        watch();
      }
      if (message.type === "browser.cancel") {
        aborters.current.get(message.taskId)?.abort();
        for (const r of runtimes.current.values()) r.cancel(message.taskId);
      }
      if (message.type === "browser.focus") setActiveTab(message.tabId);
      if (message.type === "browser.command") {
        const w = workspace.current,
          r = runtimes.current.get(message.tabId);
        if (
          !w ||
          w.id !== message.workspaceId ||
          w.paused ||
          !w.tabIds.includes(message.tabId) ||
          w.pausedTabIds.includes(message.tabId) ||
          !r
        ) {
          bridge.send(
            commandError(
              message,
              "WORKSPACE_UNAVAILABLE",
              "This selected page is not available.",
            ),
          );
          return;
        }
        let controller = aborters.current.get(message.taskId);
        if (!controller) {
          controller = new AbortController();
          aborters.current.set(message.taskId, controller);
        }
        setActiveTab(message.tabId);
        bridge.send(await r.execute(message, controller.signal));
      }
    };
    bridge.connect();
    const timer = setTimeout(() => {
      if (!state)
        setPairError(
          "If this remains disconnected, check the local server and pairing token.",
        );
    }, 7000);
    return () => {
      clearTimeout(timer);
      bridge.close();
      for (const r of runtimes.current.values()) r.unwatch();
    };
  }, [token]);
  const request = async (action: string, payload?: unknown) => {
    if (!client.current) throw new Error("Connect the assistant first.");
    return client.current.request(action, payload);
  };
  const connect = (value: string) => {
    localStorage.setItem("close.pairing", value);
    setToken(value);
  };
  const disconnect = () => {
    client.current?.close();
    localStorage.removeItem("close.pairing");
    setToken("");
    setState(null);
  };
  const w = state?.workspaces.find((w) => w.id === workspace.current?.id);
  const findings = state?.findings.filter((f) => f.workspaceId === w?.id) ?? [];
  return (
    <div className="workbench">
      <header className="workbench-header">
        <div className="workbench-logo">
          <Sparkles size={24} />
          <span>
            Close Copilot<span className="header-divider">/</span>
            <b>Demo workspace</b>
          </span>
        </div>
        <div className="demo-badge">
          <i />
          {state?.mode === "live" ? "LIVE ASTRA" : "LOCAL DEMO"}
          <span>+ synthetic apps</span>
        </div>
        <button className="tour-link" onClick={() => setTour(tour ? 0 : 1)}>
          <Play size={12} />
          Demo guide
        </button>
      </header>
      <div className="workbench-main">
        <section className="browser-stage">
          <div className="stage-heading">
            <div>
              <div className="eyebrow">AUGUST CLOSE / ACCOUNTS PAYABLE</div>
              <h1>Your workflow, with a second set of eyes.</h1>
            </div>
            <div className="sandbox-label">
              <Monitor size={13} />
              Safe demo environment
            </div>
          </div>
          {tour > 0 && (
            <div className="demo-guide">
              <div>
                <strong>
                  {tour === 1
                    ? "1. Choose the context"
                    : tour === 2
                      ? "2. Follow the evidence"
                      : tour === 3
                        ? "3. Prepare, then review"
                        : "4. The final decision stays with you"}
                </strong>
                <p>
                  {tour === 1
                    ? "Create a workspace with the three demo tabs. The assistant notices Add New Bill and offers to check invoices."
                    : tour === 2
                      ? "Accept Check invoices. Astra reads the inbox, compares recorded bills, and checks vendor onboarding. Expand a finding to inspect its sources."
                      : tour === 3
                        ? "Choose Marlow Design and select Prepare bill for review. Watch the fields fill, then verify the amount, invoice number and date."
                        : "The bill remains unsaved. Review account coding, tax, accounting period and any custom requirements before clicking Save yourself."}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setTour(tour === 4 ? 0 : tour + 1)}
              >
                {tour === 4 ? "Done" : "Next"}
                <ArrowUpRight size={13} />
              </Button>
            </div>
          )}
          <div className="browser-window">
            <div className="browser-tabs">
              {definitions.map((d) => (
                <button
                  key={d.id}
                  className={activeTab === d.id ? "active" : ""}
                  onClick={() => setActiveTab(d.id)}
                >
                  <AppIcon app={d.app} size={14} />
                  <span>
                    {d.app === "netsuite"
                      ? "NetSuite"
                      : d.app === "gmail"
                        ? "Invoice inbox"
                        : "Vendor onboarding"}
                  </span>
                  {w?.tabIds.includes(d.id) && <i />}
                </button>
              ))}
            </div>
            <div className="browser-location">
              <span className="location-dots">•••</span>
              <span>
                demo.local /{" "}
                {definitions
                  .find((d) => d.id === activeTab)
                  ?.path.split("/")
                  .at(-1)}
              </span>
              <span>Synthetic records</span>
            </div>
            <div className="frames">
              {definitions.map((d) => (
                <iframe
                  key={d.id}
                  ref={(el) => {
                    if (el) frames.current.set(d.id, el);
                  }}
                  title={d.title}
                  src={d.path}
                  className={activeTab === d.id ? "active" : ""}
                  onLoad={() => ready(d.id)}
                />
              ))}
            </div>
          </div>
          <div className="stage-footer">
            <span>
              <i />
              Same browser bridge as the Chrome extension
            </span>
            <span>Observe → Investigate → Review → Prepare</span>
          </div>
        </section>
        <aside className="assistant-stage">
          {token ? (
            <CopilotPanel
              preferredBridgeId={browserId}
              state={state}
              connected={connected}
              request={request}
              onDisconnect={disconnect}
            />
          ) : (
            <PairingView onConnect={connect} error={pairError} />
          )}
        </aside>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Workbench />);
