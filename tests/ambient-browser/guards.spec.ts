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
        { kind: "click", elementId: info.invoice },
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
test("Gmail's Ask Gmail field supports search without allowing edits to other fields", async ({
  page,
}) => {
  await page.setContent(
    '<input aria-label="Ask Gmail"><input aria-label="Message body">',
  );
  const ids = await page.evaluate(() => {
    (window as any).runtime = new (window as any).TestRuntime(
      document,
      "ns",
      "gmail",
    );
    return (window as any).runtime.inspect().elements.map((e: any) => e.id);
  });
  expect(
    (
      await run(page, {
        kind: "fill",
        elementId: ids[0],
        value: '"TEST-20260910-01"',
      })
    ).status,
  ).toBe("ok");
  await expect(page.getByLabel("Ask Gmail")).toHaveValue('"TEST-20260910-01"');
  expect(
    (await run(page, { kind: "key", elementId: ids[0], key: "Enter" })).status,
  ).toBe("ok");
  expect(
    (
      await run(page, {
        kind: "fill",
        elementId: ids[1],
        value: "Do not write",
      })
    ).code,
  ).toBe("ACTION_BLOCKED");
  await page.evaluate(() => {
    (window as any).runtime = new (window as any).TestRuntime(
      document,
      "ns",
      "netsuite",
    );
  });
  expect(
    (await run(page, { kind: "fill", elementId: ids[0], value: "wrong app" }))
      .code,
  ).toBe("ACTION_BLOCKED");
});
test("NetSuite required labels are recognized without typing into an unverified vendor picker", async ({
  page,
}) => {
  await page.setContent(`<title>Bill - NetSuite</title>
    <span id="vendor-label">Vendor\n*</span>
    <input aria-labelledby="vendor-label" role="combobox" value=" ">
    <span id="ref-label">Reference No.\n*</span>
    <input aria-labelledby="ref-label">
    <span id="currency-label">Currency\n*</span>
    <input aria-labelledby="currency-label" role="combobox" value="US Dollar">
    <label>Date *<input value="09/10/2026"></label>
    <label>Bill Total<input></label>`);
  const observation = await page.evaluate(() =>
    (window as any).runtime.inspect(),
  );
  expect(observation.context.workflow).toBe("bill_form");
  expect(observation.context.vendor).toBeNull();
  expect(observation.elements.map((e: any) => e.label)).toContain("Currency");
  const result = await run(
    page,
    {
      kind: "prepare_bill",
      values: {
        vendor: "Marlow Design",
        invoiceNumber: "MD-2608",
        invoiceDate: "2026-08-28",
        dueDate: null,
        amount: "4250.00",
        currency: "USD",
        memo: "Design",
      },
    },
    { phase: "prepare" },
  );
  expect(result.code).toBe("UNSUPPORTED_VENDOR_SELECTOR");
  expect(result.outcome).toBe("not_executed");
  await expect(page.getByRole("combobox", { name: "Vendor" })).toHaveValue(" ");
  await expect(
    page.getByRole("textbox", { name: "Reference No." }),
  ).toHaveValue("");
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

test("an unchanged search target survives mailbox updates; changed or replaced controls stop", async ({
  page,
}) => {
  await page.setContent(
    '<div role="search"><input aria-label="Ask Gmail" name="q"></div><p id="count">1 unread</p>',
  );
  const result = await page.evaluate(async () => {
    const r = new (window as any).TestRuntime(document, "ns", "gmail");
    const initial = r.inspect(),
      target = initial.elements[0];
    const command = () => ({
      type: "browser.command",
      commandId: crypto.randomUUID(),
      workspaceId: "w",
      taskId: "t",
      tabId: "ns",
      frameId: 0,
      phase: "chat",
      expectedDocumentId: initial.context.documentId,
      expectedPageVersion: initial.context.pageVersion,
      action: { kind: "fill", elementId: target.id, value: "invoice" },
    });
    document.getElementById("count")!.textContent = "2 unread";
    const stable = await r.execute(command(), new AbortController().signal);
    const changed = await r.execute(command(), new AbortController().signal);
    const current = r.inspect();
    document
      .querySelector("input")!
      .replaceWith(document.querySelector("input")!.cloneNode(true));
    const replaced = await r.execute(
      { ...command(), expectedPageVersion: current.context.pageVersion },
      new AbortController().signal,
    );
    return { stable, changed, replaced };
  });
  expect(result.stable.status).toBe("ok");
  expect(result.changed.code).toBe("STALE_PAGE");
  expect(result.replaced.code).toBe("STALE_PAGE");
});

test("new-bill visits reset after leaving, while existing bill records do not offer new entry", async ({
  page,
}) => {
  const visits = await page.evaluate(() => {
    const r = (window as any).runtime;
    const a = r.inspect().context;
    document.body.dataset.workflow = "bill_list";
    r.inspect();
    document.body.dataset.workflow = "bill_form";
    const b = r.inspect().context;
    delete document.body.dataset.workflow;
    history.replaceState(null, "", "/demo/netsuite?id=123");
    const existing = r.inspect().context;
    return { a, b, existing };
  });
  expect(visits.a.visitId).not.toBe(visits.b.visitId);
  expect(visits.existing.workflow).not.toBe("bill_form");
});

test("direct navigation rejects unobserved links, mutation URLs and leaving edited forms", async ({
  page,
}) => {
  const urls = await page.evaluate(() => {
    const safe = new URL("#recorded", location.href).href;
    const mutation = new URL("?action=delete", location.href).href;
    for (const href of [safe, mutation]) {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = "View record";
      document.body.append(link);
    }
    return {
      safe,
      mutation,
      unobserved: new URL("#unobserved", location.href).href,
    };
  });
  expect(
    (await run(page, { kind: "navigate", url: urls.unobserved })).code,
  ).toBe("ACTION_BLOCKED");
  expect((await run(page, { kind: "navigate", url: urls.mutation })).code).toBe(
    "ACTION_BLOCKED",
  );
  await page
    .getByRole("textbox", { name: "Invoice number", exact: true })
    .fill("USER-DRAFT");
  expect((await run(page, { kind: "navigate", url: urls.safe })).code).toBe(
    "UNSAVED_FORM",
  );
  await expect(
    page.getByRole("textbox", { name: "Invoice number", exact: true }),
  ).toHaveValue("USER-DRAFT");
});
