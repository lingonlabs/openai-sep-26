import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectAfterNavigation } from "../../../packages/browser/src/index.js";
import type { BrowserCommand, CommandResult } from "@close/shared";

const sourceUrl = "https://11816061-sb1.app.netsuite.com/app/bills";
const command: BrowserCommand = {
  type: "browser.command",
  commandId: "original-click",
  workspaceId: "w",
  taskId: "t",
  tabId: "ns",
  frameId: 0,
  phase: "chat",
  expectedDocumentId: "old",
  expectedPageVersion: 1,
  action: { kind: "click", elementId: "list-link" },
};
const observation = (
  c: BrowserCommand,
  documentId = "new",
  url = sourceUrl,
): CommandResult => ({
  type: "browser.result",
  commandId: c.commandId,
  workspaceId: c.workspaceId,
  taskId: c.taskId,
  status: "ok",
  observation: {
    context: {
      tabId: c.tabId,
      frameId: 0,
      documentId,
      pageVersion: 1,
      url,
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
test("navigation recovery observes a new document without replaying the click", async () => {
  const sent: BrowserCommand[] = [];
  const result = await inspectAfterNavigation(
    command,
    sourceUrl,
    {
      tab: async () => ({ url: sourceUrl, status: "complete" }),
      active: () => true,
      inspect: async (c) => {
        sent.push(c);
        return observation(c, sent.length === 1 ? "old" : "new");
      },
    },
    1000,
  );
  assert.equal(result?.status, "ok");
  assert.equal(result?.commandId, command.commandId);
  assert.equal(sent.length, 2);
  assert.ok(
    sent.every(
      (c) => c.action.kind === "inspect" && c.commandId !== command.commandId,
    ),
  );
  assert.notEqual(sent[0].commandId, sent[1].commandId);
});
test("navigation recovery refuses another origin and stops after cancellation", async () => {
  let reads = 0;
  assert.equal(
    await inspectAfterNavigation(command, sourceUrl, {
      tab: async () => ({ url: "https://example.com/", status: "complete" }),
      active: () => true,
      inspect: async (c) => {
        reads++;
        return observation(c);
      },
    }),
    null,
  );
  let active = true;
  assert.equal(
    await inspectAfterNavigation(command, sourceUrl, {
      tab: async () => ({ url: sourceUrl, status: "complete" }),
      active: () => active,
      inspect: async (c) => {
        active = false;
        return observation(c);
      },
    }),
    null,
  );
  assert.equal(reads, 0);
});
test("a disconnected fill is never treated as successful navigation", async () => {
  assert.equal(
    await inspectAfterNavigation(
      {
        ...command,
        action: { kind: "fill", elementId: "search", value: "invoice" },
      },
      sourceUrl,
      {
        tab: async () => {
          throw new Error("Must not inspect");
        },
        active: () => true,
        inspect: async (c) => observation(c),
      },
    ),
    null,
  );
});
