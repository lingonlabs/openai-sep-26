import { z } from "zod";

export const PROTOCOL_VERSION = 1;
export const Id = z.string().min(1).max(100);
export const AppKindSchema = z.enum(["netsuite", "gmail", "sheets"]);
export type AppKind = z.infer<typeof AppKindSchema>;
export const TabSchema = z.object({
  id: Id,
  title: z.string().max(500),
  url: z.string().url().max(4000),
  app: AppKindSchema,
  active: z.boolean(),
  connected: z.boolean(),
  synthetic: z.boolean(),
});
export type BrowserTab = z.infer<typeof TabSchema>;
export const ContextSchema = z.object({
  tabId: Id,
  frameId: z.number().int().nonnegative(),
  documentId: Id,
  pageVersion: z.number().int().nonnegative(),
  url: z.string().url().max(4000),
  title: z.string().max(500),
  app: AppKindSchema,
  workflow: z.enum([
    "bill_form",
    "bill_list",
    "inbox",
    "message",
    "vendors",
    "other",
  ]),
  vendor: z.string().max(300).nullable(),
  observedAt: z.string(),
  source: z.enum(["initial", "user", "agent"]),
});
export type PageContext = z.infer<typeof ContextSchema>;
export const ElementSchema = z.object({
  id: Id,
  role: z.string().max(50),
  label: z.string().max(500),
  tag: z.string().max(30),
  value: z.string().max(5000).nullable(),
  inputType: z.string().max(50).nullable(),
  href: z.string().max(4000).nullable(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).max(200),
  disabled: z.boolean(),
  readOnly: z.boolean(),
  blocked: z.boolean(),
});
export type PageElement = z.infer<typeof ElementSchema>;
export const ObservationSchema = z.object({
  context: ContextSchema,
  text: z.string().max(40000),
  elements: z.array(ElementSchema).max(350),
  limitations: z.array(z.string()),
});
export type Observation = z.infer<typeof ObservationSchema>;
export const AmountSchema = z.string().regex(/^(0|[1-9]\d{0,10})\.\d{2}$/);
export const BillValuesSchema = z.object({
  vendor: z.string().min(1).max(300),
  invoiceNumber: z.string().min(1).max(150),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().nullable(),
  amount: AmountSchema,
  currency: z.string().length(3),
  memo: z.string().max(1000),
});
export type BillValues = z.infer<typeof BillValuesSchema>;
export const ActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inspect") }),
  z.object({ kind: z.literal("click"), elementId: Id }),
  z.object({
    kind: z.literal("fill"),
    elementId: Id,
    value: z.string().max(5000),
  }),
  z.object({
    kind: z.literal("select"),
    elementId: Id,
    value: z.string().max(500),
  }),
  z.object({
    kind: z.literal("key"),
    elementId: Id,
    key: z.enum(["Enter", "Escape", "Tab", "ArrowDown", "ArrowUp"]),
  }),
  z.object({ kind: z.literal("scroll"), direction: z.enum(["up", "down"]) }),
  z.object({ kind: z.literal("screenshot") }),
  z.object({ kind: z.literal("prepare_bill"), values: BillValuesSchema }),
]);
export type BrowserAction = z.infer<typeof ActionSchema>;
export const CommandSchema = z.object({
  type: z.literal("browser.command"),
  commandId: Id,
  workspaceId: Id,
  taskId: Id,
  tabId: Id,
  frameId: z.number().int().nonnegative(),
  phase: z.enum(["investigate", "prepare", "chat"]),
  expectedDocumentId: Id.nullable(),
  expectedPageVersion: z.number().int().nonnegative().nullable(),
  action: ActionSchema,
});
export type BrowserCommand = z.infer<typeof CommandSchema>;
export const CommandResultSchema = z.discriminatedUnion("status", [
  z.object({
    type: z.literal("browser.result"),
    commandId: Id,
    workspaceId: Id,
    taskId: Id,
    status: z.literal("ok"),
    observation: ObservationSchema,
    screenshot: z.string().max(2_000_000).optional(),
    changes: z
      .array(z.object({ field: z.string(), from: z.string(), to: z.string() }))
      .optional(),
  }),
  z.object({
    type: z.literal("browser.result"),
    commandId: Id,
    workspaceId: Id,
    taskId: Id,
    status: z.literal("error"),
    code: z.string(),
    message: z.string(),
    outcome: z.enum(["not_executed", "unknown"]),
    observation: ObservationSchema.optional(),
  }),
]);
export type CommandResult = z.infer<typeof CommandResultSchema>;
export const ClientMessageSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("hello"),
      protocolVersion: z.literal(PROTOCOL_VERSION),
      token: z.string().min(32).max(300),
      clientId: Id,
      role: z.enum(["browser", "ui"]),
      name: z.string().max(100),
      synthetic: z.boolean(),
    }),
    z.object({
      type: z.literal("browser.inventory"),
      tabs: z.array(TabSchema).max(100),
    }),
    z.object({
      type: z.literal("browser.context"),
      workspaceId: Id,
      context: ContextSchema,
    }),
    z.object({
      type: z.literal("ui.request"),
      requestId: Id,
      action: z.string().max(60),
      payload: z.unknown(),
    }),
    z.object({ type: z.literal("heartbeat") }),
  ])
  .or(CommandResultSchema);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface Workspace {
  id: string;
  name: string;
  bridgeId: string;
  tabIds: string[];
  pausedTabIds: string[];
  paused: boolean;
  searchFrom: string;
  searchTo: string;
  createdAt: string;
  activeTaskId: string | null;
  contexts: Record<string, PageContext>;
  dismissed: Record<string, number>;
  summary: string;
}
export interface Suggestion {
  id: string;
  workspaceId: string;
  tabId: string;
  documentId: string;
  contextKey: string;
  title: string;
  description: string;
  status: "pending" | "accepted" | "dismissed" | "stale";
  createdAt: string;
}
export type TaskStatus =
  "running" | "completed" | "failed" | "stopped" | "interrupted";
export interface Task {
  id: string;
  workspaceId: string;
  kind: "investigate" | "prepare" | "chat";
  status: TaskStatus;
  title: string;
  startedAt: string;
  finishedAt: string | null;
  summary: string;
  parentTaskId: string | null;
  actionCount: number;
  error: string | null;
  candidateId: string | null;
}
export interface Evidence {
  id: string;
  taskId: string;
  workspaceId: string;
  tabId: string;
  url: string;
  title: string;
  app: AppKind;
  capturedAt: string;
  text: string;
  hash: string;
  observation: Observation;
}
export interface Finding extends BillValues {
  id: string;
  workspaceId: string;
  taskId: string;
  status: "recorded" | "candidate" | "vendor_review" | "needs_review";
  reason: string;
  evidenceIds: string[];
  matchedRecordId: string | null;
  onboarding: "approved" | "pending" | "unknown";
  preparedAt: string | null;
  searchLimitations: string[];
}
export interface Activity {
  id: string;
  workspaceId: string;
  taskId: string | null;
  at: string;
  message: string;
  level: "info" | "success" | "error";
}
export interface ChatMessage {
  id: string;
  workspaceId: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  taskId: string | null;
}
export interface BridgeView {
  id: string;
  name: string;
  synthetic: boolean;
  connected: boolean;
  tabs: BrowserTab[];
  activeWorkspaceId: string | null;
}
export interface AppState {
  mode: "live" | "demo";
  model: string;
  apiConfigured: boolean;
  bridges: BridgeView[];
  workspaces: Workspace[];
  suggestions: Suggestion[];
  tasks: Task[];
  findings: Finding[];
  activities: Activity[];
  messages: ChatMessage[];
}
export type ServerMessage =
  | { type: "welcome"; clientId: string; state: AppState }
  | { type: "state"; state: AppState }
  | {
      type: "ui.response";
      requestId: string;
      ok: boolean;
      data?: unknown;
      error?: string;
    }
  | { type: "browser.watch"; workspace: Workspace | null; tabs: BrowserTab[] }
  | { type: "browser.cancel"; workspaceId: string; taskId: string }
  | { type: "browser.focus"; tabId: string }
  | BrowserCommand
  | { type: "error"; message: string }
  | { type: "heartbeat" };

export function normalize(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
export function toCents(value: string): bigint {
  AmountSchema.parse(value);
  return BigInt(value.replace(".", ""));
}
export function contextKey(context: PageContext) {
  return [
    context.documentId,
    context.workflow,
    normalize(context.vendor ?? ""),
  ].join("|");
}
export function moneyLabel(amount: string, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(amount),
  );
}
export function supportedApp(
  url: string,
  sandboxOrigin: string,
  localOrigin: string,
): AppKind | null {
  try {
    const u = new URL(url);
    if (u.origin === localOrigin && u.pathname.startsWith("/demo/netsuite"))
      return "netsuite";
    if (
      u.origin === localOrigin &&
      (u.pathname.startsWith("/demo/gmail") ||
        u.pathname.startsWith("/demo/invoice"))
    )
      return "gmail";
    if (u.origin === localOrigin && u.pathname.startsWith("/demo/vendors"))
      return "sheets";
    if (u.origin === sandboxOrigin && u.protocol === "https:")
      return "netsuite";
    if (u.origin === "https://mail.google.com") return "gmail";
    if (
      u.origin === "https://docs.google.com" &&
      u.pathname.startsWith("/spreadsheets/")
    )
      return "sheets";
  } catch {}
  return null;
}

export const InvestigationSchema = z.object({
  summary: z.string(),
  limitations: z.array(z.string()),
  invoices: z.array(
    BillValuesSchema.extend({ evidenceIds: z.array(z.string()) }),
  ),
  recordedBills: z.array(
    z.object({
      recordId: z.string(),
      vendor: z.string(),
      invoiceNumber: z.string(),
      amount: AmountSchema,
      currency: z.string(),
      evidenceIds: z.array(z.string()),
    }),
  ),
  vendors: z.array(
    z.object({
      vendor: z.string(),
      status: z.enum(["approved", "pending", "unknown"]),
      evidenceIds: z.array(z.string()),
    }),
  ),
});
export type Investigation = z.infer<typeof InvestigationSchema>;
export const SuggestionOutputSchema = z.object({
  offer: z.boolean(),
  title: z.string(),
  description: z.string(),
});
export const PrepareOutputSchema = z.object({
  summary: z.string(),
  verified: z.boolean(),
  remainingReview: z.array(z.string()),
});

export function assessInvoices(
  extraction: Investigation,
  evidence: Evidence[],
  workspaceId: string,
  taskId: string,
): Finding[] {
  const known = new Map(evidence.map((e) => [e.id, e]));
  const check = (ids: string[], tokens: string[], app?: AppKind) => {
    if (!ids.length || ids.some((id) => !known.has(id)))
      throw new Error("Finding cites missing source evidence");
    if (app && !ids.some((id) => known.get(id)!.app === app))
      throw new Error("Finding cites the wrong application");
    const text = ids
      .map((id) => known.get(id)!.text)
      .join("\n")
      .toLowerCase()
      .replace(/[,\s$€£]/g, "");
    for (const token of tokens)
      if (token && !text.includes(token.toLowerCase().replace(/[,\s$€£]/g, "")))
        throw new Error(
          "Finding fields are not supported by the cited observations",
        );
  };
  for (const bill of extraction.recordedBills)
    check(
      bill.evidenceIds,
      [
        bill.recordId,
        bill.vendor,
        bill.invoiceNumber,
        bill.amount,
        bill.currency,
      ],
      "netsuite",
    );
  for (const vendor of extraction.vendors)
    check(vendor.evidenceIds, [
      vendor.vendor,
      ...(vendor.status === "unknown" ? [] : [vendor.status]),
    ]);
  const seen = new Set<string>();
  return extraction.invoices.flatMap((invoice) => {
    check(
      invoice.evidenceIds,
      [invoice.vendor, invoice.invoiceNumber, invoice.amount, invoice.currency],
      "gmail",
    );
    const key = [
      normalize(invoice.vendor),
      normalize(invoice.invoiceNumber),
      invoice.currency,
      invoice.amount,
    ].join("|");
    if (seen.has(key)) return [];
    seen.add(key);
    const similar = extraction.recordedBills.filter(
      (b) =>
        normalize(b.vendor) === normalize(invoice.vendor) &&
        normalize(b.invoiceNumber) === normalize(invoice.invoiceNumber),
    );
    const exact = similar.find(
      (b) =>
        b.currency === invoice.currency &&
        toCents(b.amount) === toCents(invoice.amount),
    );
    const vendor = extraction.vendors.find(
      (v) => normalize(v.vendor) === normalize(invoice.vendor),
    );
    const contradictory = extraction.invoices.some(
      (other) =>
        normalize(other.vendor) === normalize(invoice.vendor) &&
        normalize(other.invoiceNumber) === normalize(invoice.invoiceNumber) &&
        (other.currency !== invoice.currency ||
          other.amount !== invoice.amount),
    );
    const status = contradictory
      ? "needs_review"
      : exact
        ? "recorded"
        : similar.length
          ? "needs_review"
          : vendor?.status === "pending"
            ? "vendor_review"
            : "candidate";
    const reason = contradictory
      ? "Invoice evidence disagrees on amount or currency. Resolve the conflicting sources before preparing."
      : exact
        ? `Matches ${exact.recordId}: vendor, invoice number, currency, and amount agree.`
        : similar.length
          ? "A matching vendor and invoice number has a different amount or currency. Review before preparing."
          : vendor?.status === "pending"
            ? "Vendor onboarding is pending. Resolve it before preparing the bill."
            : "No matching bill was found in the records checked. Review the evidence before preparing.";
    return [
      {
        ...invoice,
        id: crypto.randomUUID(),
        workspaceId,
        taskId,
        status,
        reason,
        evidenceIds: [
          ...new Set([
            ...invoice.evidenceIds,
            ...(exact?.evidenceIds ?? similar.flatMap((b) => b.evidenceIds)),
            ...(vendor?.evidenceIds ?? []),
            ...(!exact
              ? evidence
                  .filter(
                    (e) =>
                      e.app === "netsuite" &&
                      e.observation?.context.workflow === "bill_list",
                  )
                  .slice(-3)
                  .map((e) => e.id)
              : []),
          ]),
        ],
        matchedRecordId: exact?.recordId ?? null,
        onboarding: vendor?.status ?? "unknown",
        preparedAt: null,
        searchLimitations: extraction.limitations,
      } as Finding,
    ];
  });
}
