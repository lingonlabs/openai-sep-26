import { useState } from "react";
import {
  isPlaceholderVendor,
  type VendorDraft,
  type Finding,
} from "@close/shared";
import { Button } from "./button";
import type { Request } from "./index";

export function VendorSetupPanel({
  workspaceId,
  finding,
  drafts,
  request,
  disabled,
  onEvidence,
}: {
  workspaceId: string;
  finding: Finding | null;
  drafts: VendorDraft[];
  request: Request;
  disabled: boolean;
  onEvidence: (id: string) => void;
}) {
  const [name, setName] = useState(
    finding && !isPlaceholderVendor(finding.vendor) ? finding.vendor : "",
  );
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draft = drafts.filter((d) => d.status !== "dismissed").at(-1);
  const call = async (action: string, payload: unknown) => {
    setBusy(true);
    setError("");
    try {
      await request(action, payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vendor setup failed");
    } finally {
      setBusy(false);
    }
  };
  const locked = disabled || busy;
  return (
    <section className="vendor-setup suggestion-card" aria-label="Vendor setup">
      <div className="eyebrow">VENDOR SETUP</div>
      <h2>A missing vendor? Let’s check.</h2>
      <p>
        Enter the actual company name. I’ll check existing vendors, prepare the
        details, and ask before creating a record in NetSuite.
      </p>
      {finding && (
        <p className="micro">
          For invoice {finding.invoiceNumber}. Creating a vendor leaves invoice
          and onboarding review in place.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void call("vendor.plan", {
            workspaceId,
            findingId: finding?.id ?? null,
            values: { name: name.trim(), email: email.trim() },
          });
        }}
      >
        <label>
          Vendor company name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={300}
            placeholder="Actual vendor or company name"
          />
        </label>
        <label>
          Vendor email (optional)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
          />
        </label>
        <Button disabled={locked || isPlaceholderVendor(name)}>
          Check vendor and prepare review
        </Button>
      </form>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {draft && (
        <div className="vendor-review" aria-label="Vendor creation review">
          <h3>{draft.values.name}</h3>
          <p role="status">{draft.message}</p>
          {draft.review && (
            <>
              <dl>
                {draft.review.fields
                  .filter(
                    (f) => f.value.trim() || f.required || f.checked === true,
                  )
                  .map((f) => (
                    <div key={f.id}>
                      <dt>
                        {f.label}
                        {f.required ? " *" : ""}
                      </dt>
                      <dd>
                        {f.checked === null
                          ? f.displayValue || f.value || "Not provided"
                          : f.checked
                            ? "Yes"
                            : "No"}
                      </dd>
                    </div>
                  ))}
              </dl>
              <details>
                <summary>All reviewed form fields</summary>
                <dl>
                  {draft.review.fields.map((f) => (
                    <div key={f.id}>
                      <dt>{f.label}</dt>
                      <dd>
                        {f.checked === null
                          ? f.displayValue || f.value || "Blank"
                          : f.checked
                            ? "Yes"
                            : "No"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            </>
          )}
          <div className="button-row">
            {draft.checkEvidenceId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEvidence(draft.checkEvidenceId!)}
              >
                Vendor check source
              </Button>
            )}
            {draft.preparedEvidenceId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEvidence(draft.preparedEvidenceId!)}
              >
                Prepared form source
              </Button>
            )}
          </div>
          {draft.status === "ready" && (
            <>
              <p>
                <strong>Create this vendor in NetSuite?</strong> This saves a
                new vendor record with the reviewed details.
              </p>
              <div className="button-row">
                <Button
                  disabled={locked}
                  onClick={() =>
                    void call("vendor.confirm", {
                      draftId: draft.id,
                      approved: true,
                      reviewedAt: draft.reviewedAt,
                    })
                  }
                >
                  Create vendor in NetSuite
                </Button>
                <Button
                  disabled={locked}
                  variant="ghost"
                  onClick={() =>
                    void call("vendor.dismiss", { draftId: draft.id })
                  }
                >
                  Not now
                </Button>
              </div>
            </>
          )}
          {["ready", "needs_input"].includes(draft.status) && draft.review && (
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => void call("vendor.refresh", { draftId: draft.id })}
            >
              Refresh vendor review
            </Button>
          )}
          {draft.status === "unknown" && (
            <p className="notice warning">
              Check NetSuite for the saved vendor. Creation is locked until the
              outcome is resolved.
            </p>
          )}
          {draft.recordUrl && (
            <a href={draft.recordUrl} target="_blank" rel="noreferrer">
              Open vendor record
            </a>
          )}
          {draft.status === "created" && (
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => void call("investigation.start", { workspaceId })}
            >
              Check invoices again
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
