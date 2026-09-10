import { useEffect, useState, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  Layers3,
  LoaderCircle,
  Mail,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Table2,
  Unplug,
  X,
} from "lucide-react";
import {
  moneyLabel,
  taskProgress,
  type AppState,
  type Evidence,
  type Finding,
  type Workspace,
} from "@close/shared";
import { Button, cn } from "./button";
import { Markdown } from "./markdown";
import { VendorSetupPanel } from "./vendor-setup";
import { HelpPanel } from "./help-panel";
import { ActionCard } from "./action-card";
export { Button } from "./button";
export type Request = (action: string, payload?: unknown) => Promise<any>;
export const AppIcon = ({ app, ...props }: { app: string; size?: number }) =>
  app === "gmail" ? (
    <Mail {...props} />
  ) : app === "sheets" ? (
    <Table2 {...props} />
  ) : (
    <Layers3 {...props} />
  );
export function PairingView({
  onConnect,
  busy = false,
  error,
}: {
  onConnect: (token: string) => void;
  busy?: boolean;
  error?: string;
}) {
  const [token, setToken] = useState("");
  return (
    <div className="pairing">
      <div className="brand-symbol">
        <Sparkles size={30} />
      </div>
      <div className="eyebrow">YOUR CLOSE, IN CONTEXT</div>
      <h1>
        A little less searching.
        <br />A clearer close.
      </h1>
      <p>
        Connect the local assistant to the browser tabs you choose. Find
        invoices, check records, and prepare bills with the evidence beside you.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConnect(token.trim());
        }}
      >
        <label htmlFor="pair-token">Local pairing token</label>
        <input
          id="pair-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste the local pairing token"
        />
        <Button disabled={busy || token.trim().length < 32}>
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Unplug size={16} />
          )}
          Connect local assistant
        </Button>
      </form>
      {error && <div className="notice error">{error}</div>}
      <p className="micro">
        The API key stays on the local server. Use the pairing token in{" "}
        <code>.local/relay-token</code>.
      </p>
    </div>
  );
}
export function CopilotPanel({
  state: allBrowserState,
  request,
  connected,
  onDisconnect,
  preferredBridgeId,
}: {
  state: AppState | null;
  request: Request;
  connected: boolean;
  onDisconnect?: () => void;
  preferredBridgeId?: string;
}) {
  // A panel belongs to one browser. Do not let a different profile or the
  // synthetic workbench become its default workspace or its tab picker.
  const state =
    allBrowserState && preferredBridgeId
      ? {
          ...allBrowserState,
          bridges: allBrowserState.bridges.filter(
            (b) => b.id === preferredBridgeId,
          ),
          workspaces: allBrowserState.workspaces.filter(
            (w) => w.bridgeId === preferredBridgeId,
          ),
        }
      : allBrowserState;
  const [workspaceId, setWorkspaceId] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [parentTaskId, setParentTaskId] = useState<string | undefined>();
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [chat, setChat] = useState("");
  const [details, setDetails] = useState(false);
  const [tabSettings, setTabSettings] = useState(false);
  const [view, setView] = useState<"findings" | "conversation">("findings");
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorFinding, setVendorFinding] = useState<Finding | null>(null);
  const w = workspaceId
    ? state?.workspaces.find((w) => w.id === workspaceId)
    : state?.workspaces.find((w) =>
        state.bridges.some(
          (b) =>
            b.activeWorkspaceId === w.id &&
            (!preferredBridgeId || b.id === preferredBridgeId),
        ),
      );
  const bridge = state?.bridges.find((b) => b.id === w?.bridgeId);
  useEffect(() => {
    if (w && !workspaceId) setWorkspaceId(w.id);
  }, [w?.id, workspaceId]);
  const act = async (action: string, payload: unknown = {}) => {
    setError("");
    try {
      return await request(action, payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      return null;
    }
  };
  const findings = state?.findings.filter((f) => f.workspaceId === w?.id) ?? [];
  const suggestions =
    state?.suggestions.filter(
      (s) => s.workspaceId === w?.id && s.status === "pending",
    ) ?? [];
  const tasks = state?.tasks.filter((t) => t.workspaceId === w?.id) ?? [];
  const active = tasks.find((t) => t.id === w?.activeTaskId);
  const last = [...tasks]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .at(-1);
  useEffect(() => {
    if (!active) return;
    setDetails(true);
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active?.id]);
  useEffect(() => {
    setParentTaskId(undefined);
  }, [w?.id]);
  const activities =
    state?.activities.filter((a) => a.workspaceId === w?.id) ?? [];
  const pending = suggestions.at(-1);
  const isActive = bridge?.activeWorkspaceId === w?.id;
  const disabled = !connected || !isActive || w?.paused;
  return (
    <div className="copilot-panel">
      <div className="panel-heading">
        <div className="wordmark">
          <Sparkles size={20} />
          <span>
            close<span className="muted-mark">copilot</span>
          </span>
        </div>
        <div className="model-dot" title={state?.model}>
          <i className={connected ? "" : "offline"} />
          {state?.mode === "live" ? "Astra" : "Test mode"}
        </div>
      </div>
      <div className="panel-body">
        {!connected && (
          <div className="notice warning">
            <Unplug size={15} />
            Browser bridge disconnected. Reconnecting…
          </div>
        )}
        {error && (
          <div role="alert" className="notice error">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={14} />
            </button>
          </div>
        )}
        {(!w || creating || editing) && (
          <WorkspaceBuilder
            key={editing ? w?.id : "new"}
            workspace={editing ? w : undefined}
            state={state}
            request={request}
            onCreated={(id) => {
              setWorkspaceId(id);
              setCreating(false);
              setEditing(false);
            }}
            onCancel={
              w
                ? () => {
                    setCreating(false);
                    setEditing(false);
                  }
                : undefined
            }
          />
        )}
        {w && !creating && !editing && (
          <>
            <div className="workspace-bar">
              <div>
                <div className="eyebrow">WORKSPACE</div>
                <select
                  aria-label="Current workspace"
                  value={w.id}
                  onChange={(e) => {
                    setWorkspaceId(e.target.value);
                    void act("workspace.activate", {
                      workspaceId: e.target.value,
                    });
                  }}
                >
                  {state?.workspaces.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="ghost"
                size="icon"
                title="New workspace"
                aria-label="New workspace"
                onClick={() => setCreating(true)}
              >
                <Plus size={18} />
              </Button>
            </div>
            <div className="workspace-meta">
              <button
                className="text-button"
                onClick={() => setTabSettings(!tabSettings)}
              >
                <Layers3 size={13} />
                {w.tabIds.length} selected tabs
                <ChevronDown size={12} />
              </button>
              <span>
                {bridge?.synthetic
                  ? "Synthetic demo"
                  : bridge
                    ? "Your browser"
                    : "Offline browser"}
              </span>
            </div>
            {tabSettings && (
              <div className="tab-settings">
                {w.tabIds.map((id) => {
                  const t = bridge?.tabs.find((t) => t.id === id),
                    paused = w.pausedTabIds.includes(id);
                  return (
                    <div key={id}>
                      <AppIcon app={t?.app ?? "netsuite"} size={15} />
                      <span title={t?.url}>
                        {t?.title ?? "Disconnected tab"}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${paused ? "Resume" : "Pause"} ${t?.title ?? "tab"}`}
                        onClick={() =>
                          void act("tab.pause", {
                            workspaceId: w.id,
                            tabId: id,
                            paused: !paused,
                          })
                        }
                      >
                        {paused ? <Play size={13} /> : <Pause size={13} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${t?.title ?? "tab"}`}
                        onClick={() =>
                          void act("tab.remove", {
                            workspaceId: w.id,
                            tabId: id,
                          })
                        }
                      >
                        <X size={13} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className={cn("watch-status", w.paused && "paused")}>
              <span>
                <i />
                {active
                  ? "Working on your request"
                  : w.paused
                    ? "Workspace paused"
                    : isActive
                      ? "Watching selected tabs"
                      : "Workspace inactive"}
              </span>
              {!isActive ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void act("workspace.activate", { workspaceId: w.id })
                  }
                >
                  Activate
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void act("workspace.pause", {
                      workspaceId: w.id,
                      paused: !w.paused,
                    })
                  }
                >
                  {w.paused ? <Play size={12} /> : <Pause size={12} />}{" "}
                  {w.paused ? "Resume" : "Pause"}
                </Button>
              )}
            </div>
            {pending &&
              !active &&
              !w.paused &&
              (pending.options?.length ? (
                <ActionCard
                  key={pending.id}
                  suggestion={pending}
                  disabled={!!disabled}
                  onChoose={(option, message) => {
                    setView("conversation");
                    void act("suggestion.accept", {
                      suggestionId: pending.id,
                      ...(option >= 0 ? { option } : { message }),
                    });
                  }}
                  onDismiss={() =>
                    void act("suggestion.dismiss", { suggestionId: pending.id })
                  }
                />
              ) : (
                <section className="suggestion-card">
                  <div className="card-eyebrow">
                    <Sparkles size={14} />A HELPFUL NEXT STEP
                  </div>
                  <h2>{pending.title}</h2>
                  <p>{pending.description}</p>
                  <div className="button-row">
                    <Button
                      disabled={disabled}
                      onClick={() =>
                        void act("suggestion.accept", {
                          suggestionId: pending.id,
                        })
                      }
                    >
                      Check invoices
                      <ArrowRight size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void act("suggestion.dismiss", {
                          suggestionId: pending.id,
                        })
                      }
                    >
                      Not now
                    </Button>
                  </div>
                </section>
              ))}
            {active && (
              <section className="working-card">
                <div className="working-title">
                  <LoaderCircle size={18} className="spin" />
                  <strong>
                    {active.kind === "prepare"
                      ? "Preparing your bill"
                      : active.kind === "vendor_setup"
                        ? "Checking vendor setup"
                        : active.kind === "vendor_create"
                          ? "Creating your approved vendor"
                          : active.kind === "chat"
                            ? "Checking your workspace"
                            : "Following the evidence"}
                  </strong>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void act("task.stop", { workspaceId: w.id })}
                  >
                    <Square size={12} />
                    Stop
                  </Button>
                </div>
                <p role="status">{taskProgress(active, activities)}</p>
                <div className="progress-track">
                  <span />
                </div>
                <div className="micro">
                  {active.actionCount} browser actions ·{" "}
                  {Math.max(
                    0,
                    Math.floor((clock - Date.parse(active.startedAt)) / 1000),
                  )}
                  s elapsed · Only selected tabs
                </div>
              </section>
            )}
            <Button
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={!!active}
            >
              Edit workspace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHelpOpen(!helpOpen)}
            >
              Help me with…
            </Button>
            {helpOpen && (
              <HelpPanel
                key={w.id}
                ambient={state?.ambient?.find((a) => a.workspaceId === w.id)}
                disabled={!connected || !isActive || !!active}
                onSave={(preferences) =>
                  void act("ambient.settings", {
                    workspaceId: w.id,
                    preferences,
                  })
                }
                onForget={() =>
                  void act("ambient.forget", { workspaceId: w.id })
                }
              />
            )}
            <Button
              variant="ghost"
              disabled={!!disabled}
              onClick={() => {
                setVendorOpen(!vendorOpen);
                setVendorFinding(null);
              }}
            >
              Vendor setup
            </Button>
            {(vendorOpen ||
              (state?.vendorDrafts ?? []).some(
                (d) =>
                  d.workspaceId === w.id &&
                  !["dismissed", "failed"].includes(d.status),
              )) && (
              <VendorSetupPanel
                key={`${w.id}/${vendorFinding?.id ?? "manual"}`}
                workspaceId={w.id}
                finding={
                  vendorFinding?.workspaceId === w.id ? vendorFinding : null
                }
                drafts={(state?.vendorDrafts ?? []).filter(
                  (d) => d.workspaceId === w.id,
                )}
                request={request}
                disabled={!!disabled || !!active}
                onEvidence={async (id) => {
                  const source = await act("evidence.get", { id });
                  if (source) setEvidence(source);
                }}
              />
            )}
            {!pending && !active && findings.length === 0 && (
              <section className="empty-state">
                <div className="orbit">
                  <Search size={24} />
                </div>
                <h2>Ready when the work is.</h2>
                <p>
                  Open Add New Bill for a contextual suggestion, or check your
                  selected inbox now.
                </p>
                <Button
                  disabled={disabled}
                  onClick={() =>
                    void act("investigation.start", { workspaceId: w.id })
                  }
                >
                  <Search size={15} />
                  Check invoices
                </Button>
              </section>
            )}
            {findings.length > 0 && (
              <>
                <div className="section-tabs">
                  <button
                    className={view === "findings" ? "selected" : ""}
                    onClick={() => setView("findings")}
                  >
                    Findings <span>{findings.length}</span>
                  </button>
                  <button
                    className={view === "conversation" ? "selected" : ""}
                    onClick={() => setView("conversation")}
                  >
                    Conversation
                  </button>
                  {!active && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Check invoices again"
                      aria-label="Check invoices again"
                      disabled={disabled}
                      onClick={() =>
                        void act("investigation.start", { workspaceId: w.id })
                      }
                    >
                      <Search size={15} />
                    </Button>
                  )}
                </div>
                {view === "findings" && (
                  <>
                    <div className="findings-summary">
                      <span>
                        <b>
                          {
                            findings.filter((f) => f.status === "candidate")
                              .length
                          }
                        </b>{" "}
                        ready to review
                      </span>
                      <span>
                        <b>
                          {
                            findings.filter((f) => f.status === "recorded")
                              .length
                          }
                        </b>{" "}
                        recorded
                      </span>
                      <span>
                        <b>
                          {
                            findings.filter((f) =>
                              ["vendor_review", "needs_review"].includes(
                                f.status,
                              ),
                            ).length
                          }
                        </b>{" "}
                        need attention
                      </span>
                    </div>
                    <div className="date-scope">
                      <Clock3 size={12} />
                      {w.searchFrom} – {w.searchTo}
                      <span>Records checked only</span>
                    </div>
                    {[...findings]
                      .sort(
                        (a, b) =>
                          ({
                            candidate: 0,
                            vendor_review: 1,
                            needs_review: 1,
                            recorded: 2,
                          })[a.status] -
                          {
                            candidate: 0,
                            vendor_review: 1,
                            needs_review: 1,
                            recorded: 2,
                          }[b.status],
                      )
                      .map((f) => (
                        <FindingCard
                          key={f.id}
                          finding={f}
                          disabled={!!active || !!disabled}
                          onPrepare={() =>
                            void act("finding.prepare", { findingId: f.id })
                          }
                          onVendor={() => {
                            setVendorFinding(f);
                            setVendorOpen(true);
                          }}
                          onEvidence={async (id) => {
                            const e = await act("evidence.get", { id });
                            if (e) setEvidence(e);
                          }}
                          onFocus={() => {
                            const tab = bridge?.tabs.find(
                              (t) =>
                                t.app === "netsuite" && w.tabIds.includes(t.id),
                            );
                            if (tab)
                              void act("tab.focus", {
                                workspaceId: w.id,
                                tabId: tab.id,
                              });
                          }}
                        />
                      ))}
                    <details className="scope-details">
                      <summary>Search scope & limitations</summary>
                      <ul>
                        {[
                          ...new Set(
                            findings.flatMap((f) => f.searchLimitations),
                          ),
                        ].map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                      <p>
                        Findings describe the records inspected during this
                        task. Review attachments, pagination, tax and accounting
                        requirements separately where noted.
                      </p>
                    </details>
                  </>
                )}
              </>
            )}
            {(view === "conversation" || findings.length === 0) && (
              <div className="conversation">
                {state?.messages
                  .filter((m) => m.workspaceId === w.id)
                  .slice(-10)
                  .map((m) => (
                    <div key={m.id} className={cn("chat-message", m.role)}>
                      <div className="eyebrow">
                        {m.role === "user" ? "YOU" : "CLOSE COPILOT"}
                      </div>
                      {m.role === "assistant" ? (
                        <Markdown text={m.text} />
                      ) : (
                        <p>{m.text}</p>
                      )}
                    </div>
                  ))}
              </div>
            )}
            {last?.status === "failed" && (
              <div className="notice error">
                <CircleHelp size={17} />
                <div>
                  <strong>Task needs attention</strong>
                  <p>{last.error}</p>
                  {last.kind === "prepare" &&
                    /vendor|UNKNOWN_OPTION/i.test(last.error ?? "") && (
                      <>
                        <p>
                          Would you like me to check the vendor and prepare a
                          new record for your approval if needed?
                        </p>
                        <Button
                          disabled={!!disabled || !!active}
                          variant="secondary"
                          onClick={() => {
                            setVendorFinding(
                              findings.find((f) => f.id === last.candidateId) ??
                                null,
                            );
                            setVendorOpen(true);
                          }}
                        >
                          Resolve vendor
                        </Button>
                      </>
                    )}
                </div>
              </div>
            )}
            {last?.kind === "prepare" && last.status === "completed" && (
              <div className="notice success">
                <ShieldCheck size={18} />
                <div>
                  <strong>Prepared, verified, and still unsaved.</strong>
                  <p>
                    Review the bill in NetSuite, complete account coding and
                    tax, then decide whether to save.
                  </p>
                </div>
              </div>
            )}
            {activities.length > 0 && (
              <section className="activity-section">
                <button
                  className="text-button"
                  onClick={() => setDetails(!details)}
                >
                  {details ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  Activity & task history <span>{tasks.length} tasks</span>
                </button>
                {details && (
                  <>
                    <div className="task-history">
                      {[...tasks]
                        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                        .slice(0, 8)
                        .map((t) => (
                          <div key={t.id}>
                            <strong>{t.title}</strong>
                            <small>
                              {t.status} · {t.actionCount} actions
                            </small>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!!active || !!disabled}
                              onClick={() => {
                                setParentTaskId(t.id);
                                setView("conversation");
                              }}
                            >
                              Continue task
                            </Button>
                          </div>
                        ))}
                    </div>
                    <ol>
                      {activities.slice(-25).map((a) => (
                        <li key={a.id} className={a.level}>
                          <time>
                            {new Date(a.at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </time>
                          <span>
                            {a.status === "working" && (
                              <LoaderCircle size={12} className="spin" />
                            )}{" "}
                            {a.message}
                            {a.status && (
                              <small>
                                {" "}
                                ·{" "}
                                {a.status === "done"
                                  ? "Done"
                                  : a.status === "error"
                                    ? "Failed"
                                    : "In progress"}
                              </small>
                            )}
                            {a.detail && (
                              <p className="activity-detail">{a.detail}</p>
                            )}
                            {a.error && (
                              <p className="activity-error">{a.error}</p>
                            )}
                            {a.evidenceId && (
                              <button
                                className="text-button"
                                onClick={async () => {
                                  const source = await act("evidence.get", {
                                    id: a.evidenceId,
                                  });
                                  if (source) setEvidence(source);
                                }}
                              >
                                View source
                              </button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </section>
            )}
            {parentTaskId && (
              <div className="micro">
                Following up on:{" "}
                {tasks.find((t) => t.id === parentTaskId)?.title}{" "}
                <button
                  className="text-button"
                  onClick={() => setParentTaskId(undefined)}
                >
                  Clear
                </button>
              </div>
            )}
            <form
              className="chat-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!chat.trim()) return;
                const result = await act("chat.send", {
                  workspaceId: w.id,
                  message: chat,
                  parentTaskId,
                });
                if (result) {
                  setChat("");
                  setView("conversation");
                }
              }}
            >
              <input
                aria-label="Ask about this workspace"
                placeholder="Ask about this workspace…"
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                disabled={disabled || !!active}
              />
              <Button
                size="icon"
                disabled={disabled || !!active || !chat.trim()}
                aria-label="Send workspace question"
              >
                <Send size={15} />
              </Button>
            </form>
          </>
        )}
        <footer className="panel-footer">
          <ShieldCheck size={12} />
          <span>Local history · You control the final save</span>
          {onDisconnect && (
            <button title="Disconnect assistant" onClick={onDisconnect}>
              <Unplug size={13} />
            </button>
          )}
        </footer>
      </div>
      {evidence && (
        <div className="modal-backdrop" onClick={() => setEvidence(null)}>
          <section
            className="evidence-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Source evidence"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <div className="eyebrow">SOURCE SNAPSHOT</div>
                <h2>{evidence.title}</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close evidence"
                onClick={() => setEvidence(null)}
              >
                <X size={18} />
              </Button>
            </header>
            <div className="evidence-meta">
              <span>
                <AppIcon app={evidence.app} size={13} />{" "}
                {new Date(evidence.capturedAt).toLocaleString()}
              </span>
              <a href={evidence.url} target="_blank" rel="noreferrer">
                Open source <ExternalLink size={12} />
              </a>
            </div>
            <p className="micro">
              Captured during this task. The live page may have changed.
            </p>
            <pre>{evidence.text}</pre>
            {evidence.screenshot && (
              <img
                className="source-image"
                src={evidence.screenshot}
                alt="Captured source viewport"
              />
            )}
            <div className="micro">
              Snapshot {evidence.id.slice(0, 16)} · SHA-256{" "}
              {evidence.hash.slice(0, 16)}…
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function FindingCard({
  finding: f,
  disabled,
  onPrepare,
  onEvidence,
  onFocus,
  onVendor,
}: {
  finding: Finding;
  disabled: boolean;
  onPrepare: () => void;
  onEvidence: (id: string) => void;
  onFocus: () => void;
  onVendor: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = f.preparedAt
    ? "Prepared · unsaved"
    : f.status === "candidate"
      ? "No matching bill found"
      : f.status === "recorded"
        ? "Already recorded"
        : f.status === "vendor_review"
          ? "Vendor onboarding pending"
          : "Review mismatch";
  return (
    <article
      className={cn("finding-card", f.status, f.preparedAt && "prepared")}
    >
      <div className="finding-status">
        {f.preparedAt ? (
          <CheckCheck size={13} />
        ) : f.status === "recorded" ? (
          <Check size={13} />
        ) : f.status === "candidate" ? (
          <FileText size={13} />
        ) : (
          <Clock3 size={13} />
        )}{" "}
        {status}
      </div>
      <div className="finding-title">
        <h3>{f.vendor}</h3>
        <strong>{moneyLabel(f.amount, f.currency)}</strong>
      </div>
      <div className="finding-subtitle">
        {f.invoiceNumber} <span>·</span> {f.invoiceDate}
      </div>
      <p>{f.reason}</p>
      <button
        className="text-button detail-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Invoice details & {f.evidenceIds.length} source
        {f.evidenceIds.length === 1 ? "" : "s"}
      </button>
      {expanded && (
        <div className="finding-details">
          <dl>
            <dt>Due date</dt>
            <dd>{f.dueDate ?? "Not provided"}</dd>
            <dt>Vendor status</dt>
            <dd>{f.onboarding}</dd>
            <dt>Description</dt>
            <dd>{f.memo}</dd>
          </dl>
          <div className="source-buttons">
            {f.evidenceIds.map((id, i) => (
              <Button
                key={id}
                variant="secondary"
                size="sm"
                onClick={() => onEvidence(id)}
              >
                <FileText size={12} />
                Source {i + 1}
                <ArrowUpRight size={11} />
              </Button>
            ))}
          </div>
        </div>
      )}
      {f.status === "candidate" && !f.preparedAt && (
        <Button
          className="prepare-button"
          disabled={disabled}
          onClick={onPrepare}
        >
          Prepare bill for review
          <ArrowRight size={14} />
        </Button>
      )}
      {f.status !== "recorded" &&
        !f.preparedAt &&
        f.onboarding !== "approved" && (
          <Button
            className="prepare-button"
            variant="secondary"
            disabled={disabled}
            onClick={onVendor}
          >
            Resolve vendor
          </Button>
        )}
      {f.preparedAt && (
        <Button
          variant="secondary"
          className="prepare-button"
          onClick={onFocus}
        >
          Review unsaved bill
          <ArrowUpRight size={14} />
        </Button>
      )}
    </article>
  );
}
function WorkspaceBuilder({
  state,
  request,
  onCreated,
  onCancel,
  workspace,
}: {
  workspace?: Workspace;
  state: AppState | null;
  request: Request;
  onCreated: (id: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(workspace?.name ?? "August close");
  const [bridgeId, setBridgeId] = useState(workspace?.bridgeId ?? "");
  const [selected, setSelected] = useState<string[]>(workspace?.tabIds ?? []);
  const selectionTouched = useRef(!!workspace);
  const [from, setFrom] = useState(workspace?.searchFrom ?? "2026-08-01");
  const [to, setTo] = useState(workspace?.searchTo ?? "2026-09-10");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bridge =
    state?.bridges.find((b) => b.id === bridgeId) ?? state?.bridges[0];
  useEffect(() => {
    if (bridge) {
      setBridgeId(bridge.id);
      setSelected((old) =>
        selectionTouched.current
          ? old.filter((id) => bridge.tabs.some((t) => t.id === id))
          : bridge.tabs.filter((t) => t.connected).map((t) => t.id),
      );
    }
  }, [bridge?.id, bridge?.tabs.map((t) => `${t.id}:${t.connected}`).join(",")]);
  return (
    <section className="workspace-builder">
      <div className="eyebrow">START WITH YOUR CONTEXT</div>
      <h2>Bring the right tabs together.</h2>
      <p>
        Choose a NetSuite bill tab, your invoice inbox, and an optional vendor
        sheet.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const w = await request(
              workspace ? "workspace.update" : "workspace.create",
              {
                workspaceId: workspace?.id,
                name,
                bridgeId: bridge?.id,
                tabIds: selected,
                searchFrom: from,
                searchTo: to,
              },
            );
            onCreated(w.id);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not create workspace",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Workspace name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
        </label>
        <label>
          Browser
          <select
            disabled={!!workspace}
            value={bridge?.id ?? ""}
            onChange={(e) => setBridgeId(e.target.value)}
          >
            {!bridge && <option>No browser connected</option>}
            {state?.bridges.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.synthetic ? " · Synthetic demo" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="tab-choices">
          {bridge?.tabs.map((t) => (
            <label
              key={t.id}
              className={cn("tab-choice", selected.includes(t.id) && "checked")}
            >
              <input
                type="checkbox"
                checked={selected.includes(t.id)}
                onChange={(e) => {
                  selectionTouched.current = true;
                  setSelected(
                    e.target.checked
                      ? [...selected, t.id]
                      : selected.filter((id) => id !== t.id),
                  );
                }}
              />
              <AppIcon app={t.app} size={18} />
              <span>
                <strong>{t.title}</strong>
                <small>
                  {t.app === "netsuite"
                    ? "Bills & records"
                    : t.app === "gmail"
                      ? "Invoice evidence"
                      : "Vendor onboarding"}
                </small>
              </span>
            </label>
          ))}
        </div>
        <div className="date-inputs">
          <label>
            Invoices from
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
            />
          </label>
          <label>
            Through
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </label>
        </div>
        {error && (
          <div role="alert" className="notice error">
            {error}
          </div>
        )}
        <div className="button-row">
          <Button disabled={busy || !bridge || selected.length < 1}>
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            {workspace ? "Save workspace" : "Start watching"}
          </Button>
          {onCancel && (
            <Button variant="ghost" type="button" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
      <p className="micro">
        Only chosen tabs are observed. Selected page content is sent to the
        configured OpenAI API during agent tasks.
      </p>
    </section>
  );
}
