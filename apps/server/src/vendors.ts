import { setTimeout as delay } from "node:timers/promises";
import { type Task, type VendorDraft, type Workspace } from "@close/shared";
import { savedVendorUrl } from "../../../packages/browser/src/vendor.js";
import { BrowserBroker } from "./broker.js";
import { CloseAgents } from "./agents.js";
import { Store } from "./store.js";

export class VendorSetup {
  constructor(
    private store: Store,
    private broker: BrowserBroker,
    private agents: CloseAgents,
  ) {}
  private put(draft: VendorDraft) {
    this.store.put("vendorDraft", draft.id, draft);
  }
  verifyCheck(draft: VendorDraft) {
    const evidence =
      draft.checkEvidenceId &&
      this.store.get<any>("evidence", draft.checkEvidenceId);
    const check =
      evidence &&
      this.store
        .all<any>("command")
        .filter(
          (c) =>
            c.taskId === evidence.taskId &&
            c.tabId === draft.tabId &&
            c.action?.kind === "check_vendor" &&
            c.action.name === draft.values.name,
        )
        .at(-1);
    if (
      !evidence ||
      evidence.workspaceId !== draft.workspaceId ||
      Date.now() - Date.parse(evidence.capturedAt) > 10 * 60 * 1000 ||
      check?.status !== "ok" ||
      check.result?.vendorCheck?.complete !== true ||
      check.result.vendorCheck.matches.length
    )
      throw new Error(
        "A fresh vendor check with no existing or similar matches is required.",
      );
  }
  private fail(draft: VendorDraft, error: unknown, creating = false) {
    const current = this.store.get<VendorDraft>("vendorDraft", draft.id)!;
    if (current.status === "creating" || current.status === "checking") {
      current.status = creating ? "unknown" : "failed";
      current.message = error instanceof Error ? error.message : String(error);
      this.put(current);
    }
  }
  async plan(
    draft: VendorDraft,
    task: Task,
    workspace: Workspace,
    signal: AbortSignal,
  ) {
    try {
      const result = await this.agents.setupVendor(
        task,
        workspace,
        draft,
        signal,
      );
      signal.throwIfAborted();
      draft.tabId = result.tabId ?? null;
      draft.checkEvidenceId = result.checkEvidenceId ?? null;
      draft.preparedEvidenceId = result.preparedEvidenceId ?? null;
      draft.review = result.review ?? null;
      draft.reviewedAt = result.review ? new Date().toISOString() : null;
      if (result.check?.matches.length) {
        draft.status = "existing";
        draft.message =
          "Existing or similar vendor found: " +
          result.check.matches.map((m) => m.name).join(", ") +
          ". Review the existing record before creating another.";
        draft.recordUrl = result.check.matches[0]?.url ?? null;
      } else if (!result.check?.complete || !result.review) {
        draft.status = "needs_input";
        draft.message =
          result.summary ||
          result.check?.reason ||
          "Open the complete Vendors list so the existing vendors can be checked.";
      } else {
        draft.status = result.review.missing.length ? "needs_input" : "ready";
        draft.message = result.review.missing.length
          ? "Complete these fields in NetSuite, then refresh the review: " +
            result.review.missing.join(", ")
          : "Vendor draft prepared. Review the details and decide whether to create it in NetSuite.";
      }
      this.put(draft);
      return draft.message;
    } catch (error) {
      this.fail(draft, error);
      throw error;
    }
  }
  async refresh(draft: VendorDraft, task: Task, signal: AbortSignal) {
    try {
      if (!draft.review || draft.status === "existing")
        throw new Error("Start a new vendor check before refreshing a review.");
      this.verifyCheck(draft);
      if (!draft.tabId || !draft.checkEvidenceId)
        throw new Error("Check existing vendors before preparing a review.");
      const evidence = this.store.get<any>("evidence", draft.checkEvidenceId);
      if (
        !evidence ||
        Date.now() - Date.parse(evidence.capturedAt) > 10 * 60 * 1000
      )
        throw new Error(
          "The vendor check has expired. Start a new vendor check.",
        );
      const current = await this.broker.command(
        task,
        draft.tabId,
        { kind: "inspect" },
        signal,
      );
      if (current.status === "error") throw new Error(current.message);
      this.broker.record(task, current);
      const result = await this.broker.command(
        task,
        draft.tabId,
        { kind: "prepare_vendor", values: draft.values },
        signal,
      );
      if (result.status === "error") throw new Error(result.message);
      signal.throwIfAborted();
      draft.preparedEvidenceId = this.broker.record(task, result)!.id;
      if (!result.vendorReview)
        throw new Error(
          "The browser did not return a vendor review. Reload the extension.",
        );
      draft.review = result.vendorReview;
      draft.reviewedAt = new Date().toISOString();
      draft.status = draft.review.missing.length ? "needs_input" : "ready";
      draft.message = draft.review.missing.length
        ? "Complete required fields: " + draft.review.missing.join(", ")
        : "Review refreshed. Approve these details to create the vendor.";
      this.put(draft);
      return draft.message;
    } catch (error) {
      this.fail(draft, error);
      throw error;
    }
  }
  async commit(draft: VendorDraft, task: Task, signal: AbortSignal) {
    draft.commitTaskId = task.id;
    this.put(draft);
    let saveAttempted = false;
    try {
      this.verifyCheck(draft);
      const current = await this.broker.command(
        task,
        draft.tabId!,
        { kind: "inspect" },
        signal,
      );
      if (current.status === "error") throw new Error(current.message);
      this.broker.record(task, current);
      saveAttempted = true;
      const result = await this.broker.command(
        task,
        draft.tabId!,
        {
          kind: "create_vendor",
          draftId: draft.id,
          values: draft.values,
          review: draft.review!,
        },
        signal,
      );
      if (result.status === "error" && result.outcome === "not_executed") {
        draft.status = "needs_input";
        draft.message = result.message;
        this.put(draft);
        throw new Error(result.message);
      }
      let observation = result.status === "ok" ? result.observation : null;
      if (result.status === "ok") this.broker.record(task, result);
      // Saving is attempted once. An interrupted reply is resolved only by
      // reading the resulting page; an uncertain save is never replayed.
      for (let attempt = 0; attempt < 4; attempt++) {
        signal.throwIfAborted();
        const recordUrl =
          observation && savedVendorUrl(observation, draft.values);
        if (recordUrl) {
          draft.status = "created";
          draft.recordUrl = recordUrl;
          draft.message = `Vendor ${draft.values.name} was created and its saved record was verified. Invoice, onboarding, and bill review remain separate steps.`;
          this.put(draft);
          return draft.message;
        }
        await delay(350, undefined, { signal });
        const read = await this.broker.command(
          task,
          draft.tabId!,
          { kind: "inspect" },
          signal,
        );
        if (read.status === "ok") {
          observation = read.observation;
          this.broker.record(task, read);
        }
      }
      throw new Error(
        "The vendor save could not be verified. Check NetSuite for the record before taking any further creation action. It will not be retried automatically.",
      );
    } catch (error) {
      this.fail(draft, error, saveAttempted);
      throw error;
    }
  }
}
