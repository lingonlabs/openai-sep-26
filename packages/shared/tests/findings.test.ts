import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessInvoices,
  supportedApp,
  toCents,
  type Evidence,
  type Investigation,
} from "../src/index.js";
const evidence = [
  {
    id: "email",
    app: "gmail",
    text: "Marlow Design Invoice MD-2608 USD 4,250.00",
  },
  {
    id: "bill",
    app: "netsuite",
    text: "BILL-9 Marlow Design MD-2608 USD 4,250.00",
  },
  { id: "vendor", app: "sheets", text: "Marlow Design Pending" },
] as Evidence[];
const extraction = (): Investigation => ({
  summary: "Checked",
  limitations: ["Selected records only"],
  invoices: [
    {
      vendor: "Marlow Design",
      invoiceNumber: "MD-2608",
      invoiceDate: "2026-08-28",
      dueDate: "2026-09-27",
      amount: "4250.00",
      currency: "USD",
      memo: "Design",
      evidenceIds: ["email"],
    },
  ],
  recordedBills: [],
  vendors: [],
});
test("compares exact decimal amounts without floating-point drift", () => {
  assert.equal(toCents("90071992547.99"), 9007199254799n);
  assert.throws(() => toCents("1.001"));
});
test("candidate wording is limited to checked records", () => {
  const [f] = assessInvoices(extraction(), evidence, "w", "t");
  assert.equal(f.status, "candidate");
  assert.match(f.reason, /records checked/);
  assert.equal(f.onboarding, "unknown");
});
test("exact match is recorded, while an amount mismatch needs review", () => {
  const e = extraction();
  e.recordedBills = [
    {
      recordId: "BILL-9",
      vendor: "Marlow Design",
      invoiceNumber: "MD-2608",
      amount: "4250.00",
      currency: "USD",
      evidenceIds: ["bill"],
    },
  ];
  assert.equal(assessInvoices(e, evidence, "w", "t")[0].status, "recorded");
  e.recordedBills[0].amount = "4150.00";
  assert.equal(
    assessInvoices(
      e,
      [
        ...evidence,
        {
          id: "bill",
          app: "netsuite",
          text: "BILL-9 Marlow Design MD-2608 USD 4,150.00",
        } as Evidence,
      ],
      "w",
      "t",
    )[0].status,
    "needs_review",
  );
});
test("pending vendor blocks preparation status", () => {
  const e = extraction();
  e.vendors = [
    { vendor: "Marlow Design", status: "pending", evidenceIds: ["vendor"] },
  ];
  assert.equal(
    assessInvoices(e, evidence, "w", "t")[0].status,
    "vendor_review",
  );
});
test("a literal vendor placeholder cannot become a preparation candidate", () => {
  const e = extraction();
  e.invoices[0].vendor = "[Exact existing NetSuite vendor name]";
  const [finding] = assessInvoices(
    e,
    [
      {
        ...evidence[0],
        text: "[Exact existing NetSuite vendor name] MD-2608 USD 4250.00",
      },
    ],
    "w",
    "t",
  );
  assert.equal(finding.status, "needs_review");
  assert.match(finding.reason, /placeholder/);
});
test("rejects fabricated and unsupported citations and deduplicates invoices", () => {
  const e = extraction();
  e.invoices[0].evidenceIds = ["invented"];
  assert.throws(() => assessInvoices(e, evidence, "w", "t"), /missing source/);
  e.invoices[0].evidenceIds = ["vendor"];
  assert.throws(
    () => assessInvoices(e, evidence, "w", "t"),
    /wrong application/,
  );
  e.invoices[0].evidenceIds = ["email"];
  e.invoices.push({ ...e.invoices[0] });
  assert.equal(assessInvoices(e, evidence, "w", "t").length, 1);
});
test("scope permits exact sandbox and selected apps, not lookalike origins", () => {
  const check = (u: string) =>
    supportedApp(
      u,
      "https://11816061-sb1.app.netsuite.com",
      "http://127.0.0.1:4318",
    );
  assert.equal(
    check("https://11816061-sb1.app.netsuite.com/app/x"),
    "netsuite",
  );
  assert.equal(
    check("https://11816061-sb1.app.netsuite.com.evil.example/app/x"),
    null,
  );
  assert.equal(check("https://mail.google.com/mail/u/0"), "gmail");
  assert.equal(check("https://docs.google.com/document/d/1"), null);
  assert.equal(check("http://127.0.0.1:4318/demo/gmail"), "gmail");
});

test("wire protocol accepts browser hello and both explicit command outcomes", async () => {
  const { ClientMessageSchema } = await import("../src/index.js");
  assert.equal(
    ClientMessageSchema.safeParse({
      type: "hello",
      protocolVersion: 1,
      token: "x".repeat(64),
      clientId: "browser",
      role: "browser",
      name: "Chrome",
      synthetic: false,
    }).success,
    true,
  );
  assert.equal(
    ClientMessageSchema.safeParse({
      type: "browser.result",
      commandId: "c",
      workspaceId: "w",
      taskId: "t",
      status: "error",
      code: "STOPPED",
      message: "Stopped",
      outcome: "not_executed",
    }).success,
    true,
  );
  assert.equal(
    ClientMessageSchema.safeParse({ type: "browser.result", status: "ok" })
      .success,
    false,
  );
});

test("screenshot-only invoice fields stay in human review instead of becoming preparation candidates", () => {
  const visualEvidence = evidence.map((source) =>
    source.id === "email"
      ? {
          ...source,
          text: "Invoice attachment viewer",
          screenshot: "data:image/png;base64,aW1hZ2U=",
        }
      : source,
  );
  const finding = assessInvoices(extraction(), visualEvidence, "w", "t")[0];
  assert.equal(finding.status, "needs_review");
  assert.match(finding.reason, /screenshot/);
  assert.throws(
    () =>
      assessInvoices(
        extraction(),
        visualEvidence.map((source) => ({ ...source, screenshot: undefined })),
        "w",
        "t",
      ),
    /not supported/,
  );
});
