import { test } from "node:test";
import assert from "node:assert/strict";
import { VendorSetup } from "../src/vendors.js";
import { Store } from "../src/store.js";
import type { BrowserBroker } from "../src/broker.js";
import type { CloseAgents } from "../src/agents.js";
import type { BrowserAction, Task, VendorDraft } from "@close/shared";
for (const verified of [true, false])
  test(`an interrupted vendor save is ${verified ? "verified by reading" : "left uncertain"} without replay`, async () => {
    const store = await Store.open(null);
    const draft: VendorDraft = {
      id: "d",
      workspaceId: "w",
      findingId: null,
      values: { name: "Test Vendor", email: "" },
      status: "creating",
      tabId: "ns",
      checkEvidenceId: "e",
      preparedEvidenceId: "p",
      review: {
        documentId: "doc",
        url: "https://11816061-sb1.app.netsuite.com/app/common/entity/vendor.nl",
        fields: [],
        missing: [],
      },
      message: "",
      createdAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      commitTaskId: null,
      recordUrl: null,
    };
    store.put("vendorDraft", "d", draft);
    store.put("evidence", "e", {
      workspaceId: "w",
      taskId: "check",
      capturedAt: new Date().toISOString(),
    });
    store.put("command", "check", {
      taskId: "check",
      tabId: "ns",
      action: { kind: "check_vendor", name: "Test Vendor" },
      status: "ok",
      result: { vendorCheck: { complete: true, matches: [] } },
    });
    const actions: BrowserAction[] = [];
    let saved = false;
    const broker = {
      command: async (_t: unknown, _tab: unknown, action: BrowserAction) => {
        actions.push(action);
        if (action.kind === "create_vendor") {
          saved = true;
          return {
            status: "error",
            outcome: "unknown",
            message: "Page changed",
          };
        }
        const record = saved && verified;
        return {
          status: "ok",
          observation: {
            context: {
              app: "netsuite",
              workflow: record ? "vendor_record" : "vendor_form",
              url: draft.review!.url + (record ? "?id=999" : ""),
            },
            text: "Company Name: Test Vendor",
          },
        };
      },
      record: () => ({ id: "observed" }),
    } as unknown as BrowserBroker;
    const service = new VendorSetup(store, broker, {} as CloseAgents);
    try {
      const run = service.commit(
        draft,
        { id: "create-task" } as Task,
        new AbortController().signal,
      );
      if (verified) {
        await run;
        assert.equal(
          store.get<VendorDraft>("vendorDraft", "d")!.status,
          "created",
        );
      } else {
        await assert.rejects(run, /could not be verified/);
        assert.equal(
          store.get<VendorDraft>("vendorDraft", "d")!.status,
          "unknown",
        );
      }
      assert.equal(actions.filter((a) => a.kind === "create_vendor").length, 1);
    } finally {
      store.close();
    }
  });
