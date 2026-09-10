import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BridgeClient } from "@close/browser";
import { CopilotPanel, PairingView } from "@close/ui";
import type { AppState } from "@close/shared";
import "@close/ui/styles.css";
const style = document.createElement("style");
style.textContent = "html,body,#root{height:100%;margin:0;min-width:320px}";
document.head.append(style);
function Panel() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const client = useRef<BridgeClient | null>(null);
  useEffect(() => {
    void chrome.storage.local.get(["closeToken"]).then((data) => {
      setToken(typeof data.closeToken === "string" ? data.closeToken : "");
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!token) return;
    const bridge = new BridgeClient("ws://127.0.0.1:4318/bridge", {
      type: "hello",
      protocolVersion: 1,
      token,
      clientId: crypto.randomUUID(),
      role: "ui",
      name: "Chrome side panel",
      synthetic: false,
    });
    client.current = bridge;
    bridge.onConnection = setConnected;
    bridge.onMessage = (m) => {
      if (m.type === "welcome" || m.type === "state") setState(m.state);
      if (m.type === "error") setError(m.message);
    };
    bridge.connect();
    return () => bridge.close();
  }, [token]);
  const pair = async (value: string) => {
    await chrome.storage.local.set({ closeToken: value });
    await chrome.runtime.sendMessage({ type: "close.connect" });
    setToken(value);
  };
  const disconnect = async () => {
    await chrome.storage.local.remove("closeToken");
    await chrome.runtime.sendMessage({ type: "close.disconnect" });
    setToken("");
    setState(null);
  };
  if (!ready) return null;
  return token ? (
    <CopilotPanel
      state={state}
      connected={connected}
      request={(a, p) => client.current!.request(a, p)}
      onDisconnect={() => void disconnect()}
    />
  ) : (
    <PairingView onConnect={(value) => void pair(value)} error={error} />
  );
}
createRoot(document.getElementById("root")!).render(<Panel />);
