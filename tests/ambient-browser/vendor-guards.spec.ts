import { test, expect } from "@playwright/test";
const values = { name: "Willow Test Vendor", email: "accounts@willow.example" };
const run = async (page: any, action: any, phase = "vendor_setup") =>
  page.evaluate(
    async ({ action, phase }: any) => {
      const runtime = (window as any).runtime,
        observation = runtime.inspect();
      return runtime.execute(
        {
          type: "browser.command",
          commandId: crypto.randomUUID(),
          workspaceId: "w",
          taskId: "t",
          tabId: "ns",
          frameId: 0,
          phase,
          expectedDocumentId: observation.context.documentId,
          expectedPageVersion: observation.context.pageVersion,
          action,
        },
        new AbortController().signal,
      );
    },
    { action, phase },
  );
test.beforeEach(async ({ page }) => {
  await page.goto("/demo/netsuite#vendor-new");
  await page.addScriptTag({ url: "/runtime-test.js" });
  await page.evaluate(() => {
    (window as any).runtime = new (window as any).TestRuntime(
      document,
      "ns",
      "netsuite",
    );
  });
});
test("only a reviewed vendor command can save; generic clicks and bill forms stay blocked", async ({
  page,
}) => {
  const prepared = await run(page, { kind: "prepare_vendor", values });
  expect(prepared.status).toBe("ok");
  const save = prepared.observation.elements.find(
    (e: any) => e.label === "Save",
  ).id;
  expect((await run(page, { kind: "click", elementId: save })).code).toBe(
    "ACTION_BLOCKED",
  );
  const create = {
    kind: "create_vendor",
    draftId: "d",
    values,
    review: prepared.vendorReview,
  };
  expect((await run(page, create, "chat")).code).toBe("ACTION_BLOCKED");
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-vendor-save-count",
    "1",
  );
  await page.getByRole("link", { name: "Add New Bill" }).click();
  await expect(
    page.getByRole("heading", { name: "Add New Bill", exact: true }),
  ).toBeVisible();
  expect((await run(page, create, "vendor_create")).code).toBe(
    "VENDOR_FORM_REQUIRED",
  );
  await expect(page.locator("body")).not.toHaveAttribute("data-saved", "true");
});
test("required vendor fields are reported and block saving before any record is created", async ({
  page,
}) => {
  await page.evaluate(() => {
    const label = document.createElement("label");
    label.textContent = "Custom required field";
    const input = document.createElement("input");
    input.required = true;
    label.append(input);
    document.querySelector("#vendor-form")!.prepend(label);
  });
  const prepared = await run(page, { kind: "prepare_vendor", values });
  expect(prepared.vendorReview.missing).toEqual(["Custom required field"]);
  expect(
    (
      await run(
        page,
        {
          kind: "create_vendor",
          draftId: "d",
          values,
          review: prepared.vendorReview,
        },
        "vendor_create",
      )
    ).code,
  ).toBe("REQUIRED_FIELDS");
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-vendor-save-count",
    "1",
  );
});
test("duplicate checks include similar names and reject incomplete lists", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Vendors", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Vendors", exact: true }),
  ).toBeVisible();
  const check = await run(page, { kind: "check_vendor", name: "Marlow" });
  expect(check.vendorCheck.complete).toBe(true);
  expect(check.vendorCheck.matches[0].name).toBe("Marlow Design");
  await page
    .locator(".card>p")
    .evaluate((el) => (el.textContent = "Vendors · Total: 30 · Page 1 of 3"));
  expect(
    (await run(page, { kind: "check_vendor", name: "New name" })).vendorCheck
      .complete,
  ).toBe(false);
});
