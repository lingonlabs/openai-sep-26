import { test, expect } from "@playwright/test";
const token = "test-pairing-token-".repeat(4);
async function openSetup(page: any) {
  await page.goto("/#pair=" + token);
  await page.getByRole("button", { name: "Start watching" }).click();
  await expect(
    page.getByText("Watching selected tabs", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vendor setup", exact: true }).click();
  return page.getByRole("region", { name: "Vendor setup", exact: true });
}
test("vendor creation requires review and explicit approval, saves once, and leaves bills unsaved", async ({
  page,
}) => {
  const panel = await openSetup(page);
  await panel.getByLabel("Vendor company name").fill("Juniper Studio");
  await panel
    .getByLabel("Vendor email (optional)")
    .fill("accounts@juniper.example");
  await panel
    .getByRole("button", { name: "Check vendor and prepare review" })
    .click();
  await expect(
    panel.getByRole("button", {
      name: "Create vendor in NetSuite",
      exact: true,
    }),
  ).toBeEnabled();
  const ns = page.frameLocator('iframe[title="NetSuite · New Bill"]');
  await expect(ns.getByLabel("Company Name", { exact: true })).toHaveValue(
    "Juniper Studio",
  );
  await expect(ns.locator("body")).not.toHaveAttribute(
    "data-vendor-save-count",
    "1",
  );
  await expect(ns.locator("body")).not.toHaveAttribute("data-saved", "true");
  await panel
    .getByRole("button", { name: "Create vendor in NetSuite", exact: true })
    .click();
  await expect(
    panel.getByText(/was created and its saved record was verified/),
  ).toBeVisible();
  await expect(ns.locator("body")).toHaveAttribute(
    "data-vendor-save-count",
    "1",
  );
  await expect(ns.locator("body")).not.toHaveAttribute("data-saved", "true");
  await expect(
    panel.getByRole("button", {
      name: "Create vendor in NetSuite",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    ns.getByRole("heading", { name: "Vendor: Juniper Studio" }),
  ).toBeVisible();
});
test("existing vendors are surfaced, placeholders are rejected, and declining never saves", async ({
  page,
}) => {
  const panel = await openSetup(page);
  await panel
    .getByLabel("Vendor company name")
    .fill("[Exact existing NetSuite vendor name]");
  await expect(
    panel.getByRole("button", { name: "Check vendor and prepare review" }),
  ).toBeDisabled();
  await panel.getByLabel("Vendor company name").fill("Marlow Design");
  await panel
    .getByRole("button", { name: "Check vendor and prepare review" })
    .click();
  await expect(
    panel.getByText(/Existing or similar vendor found: Marlow Design/),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Create vendor in NetSuite",
      exact: true,
    }),
  ).toHaveCount(0);
  await panel.getByLabel("Vendor company name").fill("Cedar Test Vendor");
  await panel
    .getByRole("button", { name: "Check vendor and prepare review" })
    .click();
  await expect(
    panel.getByRole("button", {
      name: "Create vendor in NetSuite",
      exact: true,
    }),
  ).toBeEnabled();
  await panel.getByRole("button", { name: "Not now", exact: true }).click();
  const ns = page.frameLocator('iframe[title="NetSuite · New Bill"]');
  await expect(ns.locator("body")).not.toHaveAttribute(
    "data-vendor-save-count",
    "1",
  );
  await expect(ns.getByLabel("Company Name", { exact: true })).toHaveValue(
    "Cedar Test Vendor",
  );
});
test("changing reviewed vendor details invalidates approval before Save", async ({
  page,
}) => {
  const panel = await openSetup(page);
  await panel.getByLabel("Vendor company name").fill("Spruce Test Vendor");
  await panel
    .getByRole("button", { name: "Check vendor and prepare review" })
    .click();
  await expect(
    panel.getByRole("button", {
      name: "Create vendor in NetSuite",
      exact: true,
    }),
  ).toBeEnabled();
  const ns = page.frameLocator('iframe[title="NetSuite · New Bill"]');
  await ns.getByLabel("Email", { exact: true }).fill("changed@spruce.example");
  await panel
    .getByRole("button", { name: "Create vendor in NetSuite", exact: true })
    .click();
  await expect(panel.getByText(/Vendor details changed/)).toBeVisible();
  await expect(ns.locator("body")).not.toHaveAttribute(
    "data-vendor-save-count",
    "1",
  );
  await panel.getByRole("button", { name: "Refresh vendor review" }).click();
  await expect(
    panel.getByRole("button", {
      name: "Create vendor in NetSuite",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    panel.getByText("changed@spruce.example", { exact: true }).first(),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Create vendor in NetSuite", exact: true })
    .click();
  await expect(
    panel.getByText(/was created and its saved record was verified/),
  ).toBeVisible();
  await expect(ns.locator("body")).toHaveAttribute(
    "data-vendor-save-count",
    "1",
  );
});
