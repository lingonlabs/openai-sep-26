import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/demo/netsuite");
  await page.addScriptTag({ url: "/runtime-test.js" });
  await page.evaluate(() => {
    (window as any).runtime = new (window as any).TestRuntime(
      document,
      "ns",
      "netsuite",
    );
  });
});
const run = async (page: any, action: any, options: any = {}) =>
  page.evaluate(
    async ({ action, options }: any) => {
      const r = (window as any).runtime,
        o = r.inspect();
      return r.execute(
        {
          type: "browser.command",
          commandId: crypto.randomUUID(),
          workspaceId: "w",
          taskId: "t",
          tabId: "ns",
          frameId: 0,
          phase: "investigate",
          expectedDocumentId: o.context.documentId,
          expectedPageVersion: o.context.pageVersion,
          action,
          ...options,
        },
        new AbortController().signal,
      );
    },
    { action, options },
  );
test("blocks saving, arbitrary field edits, and stale page actions", async ({
  page,
}) => {
  const info = await page.evaluate(() => {
    const o = (window as any).runtime.inspect();
    return {
      save: o.elements.find((e: any) => e.label === "Save").id,
      invoice: o.elements.find((e: any) => e.label === "Invoice number").id,
      ...o.context,
    };
  });
  expect((await run(page, { kind: "click", elementId: info.save })).code).toBe(
    "ACTION_BLOCKED",
  );
  expect(
    (
      await run(page, {
        kind: "fill",
        elementId: info.invoice,
        value: "unsafe",
      })
    ).code,
  ).toBe("ACTION_BLOCKED");
  await page
    .getByRole("textbox", { name: "Invoice number", exact: true })
    .fill("USER-EDIT");
  expect(
    (
      await run(
        page,
        { kind: "click", elementId: info.save },
        { expectedPageVersion: info.pageVersion },
      )
    ).code,
  ).toBe("STALE_PAGE");
  await expect(page.locator("body")).not.toHaveAttribute("data-saved", "true");
});
test("validates all fields before edits and refuses unknown vendors", async ({
  page,
}) => {
  const values = {
    vendor: "Beacon Office",
    invoiceNumber: "BO-8820",
    invoiceDate: "2026-08-30",
    dueDate: "2026-09-29",
    amount: "860.00",
    currency: "USD",
    memo: "Supplies",
  };
  const result = await run(
    page,
    { kind: "prepare_bill", values },
    { phase: "prepare" },
  );
  expect(result.code).toBe("UNKNOWN_OPTION");
  await expect(
    page.getByRole("textbox", { name: "Invoice number", exact: true }),
  ).toHaveValue("");
});
test("prepares and verifies exact fields; duplicate command does not replay", async ({
  page,
}) => {
  const action = {
    kind: "prepare_bill",
    values: {
      vendor: "Marlow Design",
      invoiceNumber: "MD-2608",
      invoiceDate: "2026-08-28",
      dueDate: "2026-09-27",
      amount: "4250.00",
      currency: "USD",
      memo: "Design",
    },
  };
  const result = await run(page, action, {
    phase: "prepare",
    commandId: "one-command",
  });
  expect(result.status).toBe("ok");
  expect(result.changes).toHaveLength(6);
  expect(
    (await run(page, action, { phase: "prepare", commandId: "one-command" }))
      .code,
  ).toBe("DUPLICATE_COMMAND");
  await expect(
    page.getByRole("textbox", { name: "Amount", exact: true }),
  ).toHaveValue("4250.00");
  await expect(page.locator("body")).not.toHaveAttribute("data-saved", "true");
});
test("stop invalidates queued commands for that task", async ({ page }) => {
  await page.evaluate(() => (window as any).runtime.cancel("t"));
  expect((await run(page, { kind: "inspect" })).code).toBe("TASK_STOPPED");
});

test("refuses to overwrite existing bill details or assume currency", async ({
  page,
}) => {
  const action = {
    kind: "prepare_bill",
    values: {
      vendor: "Marlow Design",
      invoiceNumber: "MD-2608",
      invoiceDate: "2026-08-28",
      dueDate: "2026-09-27",
      amount: "4250.00",
      currency: "USD",
      memo: "Design",
    },
  };
  await page
    .getByRole("textbox", { name: "Invoice number", exact: true })
    .fill("MY-UNSAVED-BILL");
  expect((await run(page, action, { phase: "prepare" })).code).toBe(
    "FORM_NOT_EMPTY",
  );
  await expect(
    page.getByRole("textbox", { name: "Invoice number", exact: true }),
  ).toHaveValue("MY-UNSAVED-BILL");
  await expect(
    page.getByRole("combobox", { name: "Vendor", exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("textbox", { name: "Invoice number", exact: true })
    .fill("");
  await page
    .getByRole("textbox", { name: "Currency", exact: true })
    .evaluate((element: HTMLInputElement) => (element.value = "EUR"));
  expect((await run(page, action, { phase: "prepare" })).code).toBe(
    "CURRENCY_UNVERIFIED",
  );
});
test("a human interaction interrupts preparation and reports partial outcome", async ({
  page,
}) => {
  const action = {
    kind: "prepare_bill",
    values: {
      vendor: "Marlow Design",
      invoiceNumber: "MD-2608",
      invoiceDate: "2026-08-28",
      dueDate: "2026-09-27",
      amount: "4250.00",
      currency: "USD",
      memo: "Design",
    },
  };
  const executing = run(page, action, { phase: "prepare" });
  await expect(
    page.getByRole("combobox", { name: "Vendor", exact: true }),
  ).toHaveValue("marlow");
  await page
    .getByRole("textbox", { name: "Invoice number", exact: true })
    .click();
  const result = await executing;
  expect(result.status).toBe("error");
  expect(result.code).toBe("USER_INTERRUPTED");
  expect(result.outcome).toBe("unknown");
  await expect(page.locator("body")).not.toHaveAttribute("data-saved", "true");
});
