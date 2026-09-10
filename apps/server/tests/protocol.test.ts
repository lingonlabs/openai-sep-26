import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { Store, SqliteSession } from "../src/store.js";
import { BrowserBroker } from "../src/broker.js";
import { CloseAgents } from "../src/agents.js";
import { Manager } from "../src/manager.js";
import type { BrowserCommand, Task, Workspace } from "@close/shared";
const options = {
  port: 4318,
  token: "a".repeat(64),
  mode: "demo" as const,
  model: "gpt-6-astra",
  dbPath: null,
  sandboxOrigin: "https://11816061-sb1.app.netsuite.com",
  staticPath: "/nonexistent",
};
test("HTTP rejects hostile origins and hosts, and never exposes a pairing token", async () => {
  const { app } = await createApp(options);
  try {
    const good = await app.inject({
      url: "/health",
      headers: { host: "127.0.0.1:4318" },
    });
    assert.equal(good.statusCode, 200);
    assert.equal(good.body.includes(options.token), false);
    assert.equal(
      (await app.inject({ url: "/health", headers: { host: "evil.example" } }))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: "/health",
          headers: { host: "127.0.0.1:4318", origin: "https://evil.example" },
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
  }
});
test("SQLite sessions persist task items and pop safely", async () => {
  const store = await Store.open(null);
  try {
    const session = new SqliteSession(store, "task-a");
    await session.addItems([{ role: "user", content: "invoice question" }]);
    assert.equal((await session.getItems()).length, 1);
    assert.deepEqual(await session.popItem(), {
      role: "user",
      content: "invoice question",
    });
    assert.equal((await session.getItems()).length, 0);
  } finally {
    store.close();
  }
});
async function harness() {
  const store = await Store.open(null),
    broker = new BrowserBroker(
      store,
      options.sandboxOrigin,
      "http://127.0.0.1:4318",
    ),
    agents = new CloseAgents(store, broker, options),
    manager = new Manager(
      store,
      broker,
      agents,
      options.sandboxOrigin,
      "http://127.0.0.1:4318",
    );
  const commands: BrowserCommand[] = [];
  manager.connected({
    id: "browser",
    name: "Test browser",
    synthetic: true,
    tabs: [],
    activeWorkspaceId: null,
    send: (m) => {
      if ((m as any).type === "browser.command")
        commands.push(m as BrowserCommand);
    },
  });
  manager.inventory("browser", [
    {
      id: "ns",
      title: "New Bill",
      url: "http://127.0.0.1:4318/demo/netsuite",
      app: "netsuite",
      active: true,
      connected: true,
      synthetic: true,
    },
    {
      id: "gmail",
      title: "Inbox",
      url: "http://127.0.0.1:4318/demo/gmail",
      app: "gmail",
      active: false,
      connected: true,
      synthetic: true,
    },
  ]);
  const w = (await manager.request("workspace.create", {
    name: "Test",
    bridgeId: "browser",
    tabIds: ["ns", "gmail"],
    searchFrom: "2026-08-01",
    searchTo: "2026-09-10",
  })) as Workspace;
  return { store, broker, manager, w, commands };
}
test("one active task per workspace; stop cancels in-flight work", async () => {
  const { manager, w, store } = await harness();
  try {
    const task = (await manager.request("investigation.start", {
      workspaceId: w.id,
    })) as Task;
    await assert.rejects(
      manager.request("investigation.start", { workspaceId: w.id }),
      /Another task/,
    );
    await manager.request("task.stop", { workspaceId: w.id });
    assert.equal(store.get<Task>("task", task.id)?.status, "stopped");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(store.get<Workspace>("workspace", w.id)?.activeTaskId, null);
  } finally {
    manager.close();
    store.close();
  }
});
test("broker rejects unselected tabs and does not replay disconnected commands", async () => {
  const { manager, broker, w, store, commands } = await harness();
  try {
    const task = (await manager.request("investigation.start", {
      workspaceId: w.id,
    })) as Task;
    await assert.rejects(
      broker.command(
        task,
        "outside",
        { kind: "inspect" },
        new AbortController().signal,
      ),
      /outside/,
    );
    const sent = commands.length;
    manager.disconnected("browser");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(commands.length, sent);
    assert.equal(store.get<Task>("task", task.id)?.status, "stopped");
    assert.ok(store.all<any>("command").every((c) => c.status === "unknown"));
  } finally {
    manager.close();
    store.close();
  }
});
test("pending and recorded findings cannot be prepared", async () => {
  const { manager, w, store } = await harness();
  try {
    for (const status of ["recorded", "vendor_review", "needs_review"]) {
      store.put("finding", status, { id: status, workspaceId: w.id, status });
      await assert.rejects(
        manager.request("finding.prepare", { findingId: status }),
        /cannot be prepared/,
      );
    }
  } finally {
    manager.close();
    store.close();
  }
});
test("loading a selected tab preserves the task; leaving its app still stops it", async () => {
  const { manager, broker, w, store } = await harness();
  try {
    const task = (await manager.request("investigation.start", {
      workspaceId: w.id,
    })) as Task;
    const tabs = broker.browsers.get("browser")!.tabs;
    manager.inventory(
      "browser",
      tabs.map((t) => ({ ...t, connected: t.id !== "ns" })),
    );
    assert.equal(store.get<Task>("task", task.id)?.status, "running");
    manager.inventory("browser", tabs);
    assert.equal(store.get<Task>("task", task.id)?.status, "running");
    manager.inventory(
      "browser",
      tabs.map((t) =>
        t.id === "ns" ? { ...t, url: "https://example.com/" } : t,
      ),
    );
    assert.equal(store.get<Task>("task", task.id)?.status, "stopped");
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    manager.close();
    store.close();
  }
});
test("the broker waits for a loading page and sends the next inspection only once", async () => {
  const { manager, broker, w, store, commands } = await harness();
  try {
    const task = (await manager.request("investigation.start", {
      workspaceId: w.id,
    })) as Task;
    const tabs = broker.browsers.get("browser")!.tabs;
    manager.inventory(
      "browser",
      tabs.map((t) => ({ ...t, connected: t.id !== "ns" })),
    );
    const count = commands.length;
    const result = broker.command(
      task,
      "ns",
      { kind: "inspect" },
      new AbortController().signal,
    );
    assert.equal(commands.length, count);
    manager.inventory("browser", tabs);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(commands.length, count + 1);
    const command = commands.at(-1)!;
    broker.receive("browser", {
      type: "browser.result",
      commandId: command.commandId,
      workspaceId: w.id,
      taskId: task.id,
      status: "ok",
      observation: {
        context: {
          tabId: "ns",
          frameId: 0,
          documentId: "next-document",
          pageVersion: 1,
          url: tabs[0].url,
          title: "Bills",
          app: "netsuite",
          workflow: "bill_list",
          vendor: null,
          observedAt: new Date().toISOString(),
          source: "agent",
        },
        text: "Bills",
        elements: [],
        limitations: [],
      },
    });
    assert.equal((await result).status, "ok");
    assert.equal(commands.length, count + 1);
  } finally {
    manager.close();
    await new Promise((r) => setTimeout(r, 20));
    store.close();
  }
});
