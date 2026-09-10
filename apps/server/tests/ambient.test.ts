import test from "node:test";
import assert from "node:assert/strict";
import { Ambient } from "../src/ambient.js";
import { Store } from "../src/store.js";
import {
  defaultAmbientPreferences,
  type PageContext,
  type Suggestion,
  type Workspace,
} from "@close/shared";
import type {
  AmbientDecision,
  AmbientDriver,
  AmbientRequest,
} from "../src/ambient-agent.js";

const workspace: Workspace = {
  id: "finance",
  bridgeId: "browser",
  name: "Finance",
  paused: false,
  tabIds: ["1"],
  pausedTabIds: [],
  tabScopes: { "1": "https://mail.google.com/mail/u/0/" },
  searchFrom: "2026-08-01",
  searchTo: "2026-08-31",
  createdAt: "2026-09-10",
  activeTaskId: null,
  contexts: {},
  dismissed: {},
  summary: "",
};
const page = (text = "Invoice A", visitId = "doc|initial"): PageContext => ({
  tabId: "1",
  url: "https://mail.google.com/mail/u/0/#invoice-a",
  title: "Invoice A",
  documentId: "doc",
  frameId: 0,
  pageVersion: 1,
  app: "gmail",
  workflow: "message",
  source: "user",
  vendor: "",
  text,
  visitId,
  observedAt: new Date().toISOString(),
});
const quiet = (summary = "Remember invoice A."): AmbientDecision => ({
  decision: "quiet",
  summary,
  reason: "Nothing requiring an interruption.",
  instructionId: "",
  tabId: "",
  entityKey: "",
  title: "",
  detail: "",
  options: [],
});
const offer = (): AmbientDecision => ({
  ...quiet(),
  decision: "offer",
  instructionId: "invoices",
  tabId: "1",
  entityKey: "invoice-a",
  title: "Review invoice A?",
  detail: "An invoice is open.",
  options: [
    {
      kind: "task",
      label: "Check NetSuite",
      prompt: "Check whether it exists.",
    },
    {
      kind: "task",
      label: "Review evidence",
      prompt: "Review the email evidence.",
    },
  ],
});
async function setup(driver: AmbientDriver) {
  const store = await Store.open(null),
    offers: Suggestion[] = [];
  const ambient = new Ambient(
    store,
    driver,
    "test",
    true,
    () => {},
    (s) => offers.push(s),
  );
  ambient.update(workspace, true, false);
  return {
    store,
    ambient,
    offers,
    close: () => {
      ambient.cancel();
      store.close();
    },
  };
}

test("ambient memory persists visits and summaries; DOM changes and extension reloads are not extra visits", async () => {
  const seen: AmbientRequest[] = [];
  const { ambient, store, close } = await setup(async (r) => {
    seen.push(r);
    return quiet();
  });
  ambient.observe(page());
  await ambient.evaluate();
  ambient.observe(page());
  await ambient.evaluate();
  assert.equal(seen.length, 1);
  ambient.observe(page("Invoice A updated"));
  await ambient.evaluate();
  assert.equal(seen[1].events[0].visitCount, 1);
  for (let i = 2; i <= 5; i++) {
    ambient.observe(page("Invoice A updated", `doc|activation-${i}`));
    await ambient.evaluate();
  }
  assert.equal(ambient.status?.visits[0].count, 5);
  ambient.cancel();
  const restored = new Ambient(
    store,
    async (r) => {
      seen.push(r);
      return quiet();
    },
    "test",
    true,
    () => {},
    () => {},
  );
  restored.update(workspace, true, false);
  assert.equal(restored.status?.summary, "Remember invoice A.");
  restored.observe(page("Invoice A updated"));
  await restored.evaluate();
  assert.equal(restored.status?.visits[0].count, 5);
  restored.cancel();
  close();
});

test("execution cancels ambient inference, ignores observations while active, and baselines its changes", async () => {
  let resolve!: (value: AmbientDecision) => void;
  const requests: AmbientRequest[] = [];
  const { ambient, offers, close } = await setup((r) => {
    requests.push(r);
    return new Promise((done) => {
      resolve = done;
    });
  });
  ambient.observe(page());
  const pending = ambient.evaluate();
  ambient.update(workspace, true, true);
  assert.equal(requests[0].signal.aborted, true);
  ambient.observe(page("Agent changed field", "agent-doc"));
  resolve(offer());
  await pending;
  assert.equal(offers.length, 0);
  assert.equal(ambient.status?.status, "task_active");
  ambient.update(workspace, true, false);
  ambient.observe(page("Agent changed field", "agent-doc"));
  await ambient.evaluate();
  assert.equal(requests.length, 1);
  assert.equal(ambient.status?.visits[0].count, 1);
  ambient.observe(page("User changed field", "user-doc"));
  const next = ambient.evaluate();
  assert.equal(requests.length, 2);
  resolve(quiet());
  await next;
  close();
});

test("dismissal and completed work persist, with workspace isolation", async () => {
  const { ambient, store, offers, close } = await setup(async () => offer());
  ambient.observe(page());
  await ambient.evaluate();
  assert.equal(offers.length, 1);
  ambient.dismiss(offers[0]);
  ambient.observe(page("Invoice A changed"));
  await ambient.evaluate();
  assert.equal(offers.length, 1);
  ambient.update({ ...workspace, id: "another" }, true, false);
  assert.equal(ambient.status?.summary, "");
  assert.equal(ambient.status?.recent.length, 0);
  ambient.record("task", "Completed invoice A", "finance");
  assert.equal(ambient.status?.recent.length, 0);
  ambient.update(workspace, true, false);
  assert.ok(ambient.status?.recent.some((e) => e.kind === "task"));
  assert.ok(store.get("ambientMemory", "finance"));
  close();
});

test("stale offers and out-of-scope observations cannot become suggestions", async () => {
  let resolve!: (value: AmbientDecision) => void;
  let calls = 0;
  const { ambient, offers, close } = await setup(() => {
    calls++;
    return new Promise((done) => {
      resolve = done;
    });
  });
  ambient.observe({ ...page(), tabId: "999" });
  await ambient.evaluate();
  assert.equal(calls, 0);
  ambient.observe(page());
  const pending = ambient.evaluate();
  ambient.observe(page("Different content"));
  resolve(offer());
  await pending;
  assert.equal(offers.length, 0);
  close();
});

test("standing instructions and pause control persist and cancel pending evaluations", async () => {
  let calls = 0;
  const { ambient, store, close } = await setup(async () => {
    calls++;
    return quiet();
  });
  ambient.observe(page());
  ambient.settings({
    enabled: false,
    instructions: defaultAmbientPreferences().instructions,
  });
  await ambient.evaluate();
  assert.equal(calls, 0);
  ambient.observe(page("changed"));
  await ambient.evaluate();
  assert.equal(calls, 0);
  const prefs = {
    enabled: true,
    instructions: [
      { id: "custom", text: "Help with invoice A", enabled: true },
    ],
  };
  ambient.settings(prefs);
  ambient.observe(page());
  await ambient.evaluate();
  assert.equal(calls, 1);
  assert.deepEqual(store.get("ambientPreferences", "finance"), prefs);
  ambient.forget();
  assert.equal(ambient.status?.summary, "");
  assert.deepEqual(ambient.status?.preferences, prefs);
  close();
});

test("first observations explicitly lack a prior baseline; model offers must reference enabled instructions", async () => {
  let request!: AmbientRequest;
  const { ambient, offers, close } = await setup(async (r) => {
    request = r;
    return { ...offer(), instructionId: "not-authorized" };
  });
  ambient.observe(page());
  await ambient.evaluate();
  assert.equal(request.events[0].previousText, null);
  assert.equal(offers.length, 0);
  close();
});

test("coalescing page updates preserves the new visit and the original comparison baseline", async () => {
  const requests: AmbientRequest[] = [];
  const { ambient, close } = await setup(async (r) => {
    requests.push(r);
    return quiet();
  });
  ambient.observe(page());
  ambient.observe(page("Invoice A loaded"));
  ambient.observe(page("Invoice A loaded with controls"));
  await ambient.evaluate();
  assert.equal(requests[0].events[0].newVisit, true);
  assert.equal(requests[0].events[0].previousText, null);
  assert.equal(requests[0].events[0].text, "Invoice A loaded with controls");
  ambient.observe(page("Invoice A loaded with controls", "doc|return"));
  ambient.observe(page("Invoice A new navigation text", "doc|return"));
  await ambient.evaluate();
  assert.equal(requests[1].events[0].newVisit, true);
  assert.equal(requests[1].events[0].visitCount, 2);
  assert.equal(
    requests[1].events[0].previousText,
    "Invoice A loaded with controls",
  );
  close();
});

test("expired offers permit a new return offer while pending offers and explicit responses suppress repeats", async () => {
  const store = await Store.open(null),
    offers: Suggestion[] = [],
    requests: AmbientRequest[] = [];
  const ambient = new Ambient(
    store,
    async (r) => {
      requests.push(r);
      return offer();
    },
    "test",
    true,
    () => {},
    (s) => offers.push(s),
    () => offers,
  );
  try {
    ambient.update(workspace, true, false);
    ambient.observe(page());
    await ambient.evaluate();
    const first = offers[0];
    ambient.observe(page("Updated invoice"));
    await ambient.evaluate();
    assert.equal(offers.length, 1);
    assert.equal(requests.at(-1)?.pendingSuggestions[0].id, first.id);
    offers.length = 0;
    ambient.record(
      "expired",
      "Offer removed on navigation, without a response.",
    );
    ambient.observe(page("Updated invoice", "doc|return"));
    await ambient.evaluate();
    assert.equal(offers.length, 1);
    assert.notEqual(offers[0].id, first.id);
    assert.equal(requests.at(-1)?.events[0].newVisit, true);
    assert.deepEqual(requests.at(-1)?.pendingSuggestions, []);
    ambient.dismiss(offers[0]);
    offers.length = 0;
    ambient.observe(page("Updated invoice", "doc|return-again"));
    await ambient.evaluate();
    assert.equal(offers.length, 0);
  } finally {
    ambient.cancel();
    store.close();
  }
});
