import { test, expect } from "@playwright/test";
const token = "test-pairing-token-".repeat(4);
test("selected workspace investigates sources, prepares a bill and never saves", async ({
  page,
}) => {
  await page.goto("/#pair=" + token);
  await expect(page.locator(".model-dot i")).not.toHaveClass("offline");
  if (
    await page
      .getByRole("button", { name: "New workspace", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "New workspace", exact: true })
      .click();
  await expect(
    page.getByText("Invoice inbox · Demo Gmail", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start watching" }).click();
  await expect(
    page.getByText("Check Gmail for invoices that need recording?", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check invoices", exact: true })
    .click();
  const marlow = page
    .locator(".finding-card")
    .filter({
      has: page.getByRole("heading", { name: "Marlow Design", exact: true }),
    });
  await expect(marlow).toBeVisible({ timeout: 45000 });
  await expect(page.locator(".finding-card")).toHaveCount(3);
  await expect(
    page.getByText("Already recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Vendor onboarding pending", { exact: true }),
  ).toBeVisible();
  await marlow.getByRole("button", { name: /Invoice details/ }).click();
  await marlow.getByRole("button", { name: "Source 1", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Invoice number: MD-2608",
  );
  await page.getByRole("button", { name: "Close evidence" }).click();
  await marlow.getByRole("button", { name: "Prepare bill for review" }).click();
  await expect(
    page.getByText("Prepared, verified, and still unsaved.", { exact: true }),
  ).toBeVisible();
  const ns = page.frameLocator('iframe[title="NetSuite · New Bill"]');
  await expect(
    ns.getByRole("textbox", { name: "Invoice number", exact: true }),
  ).toHaveValue("MD-2608");
  await expect(
    ns.getByRole("textbox", { name: "Amount", exact: true }),
  ).toHaveValue("4250.00");
  await expect(
    ns.getByRole("combobox", { name: "Vendor", exact: true }),
  ).toHaveValue("marlow");
  await expect(
    ns.getByRole("combobox", { name: "Expense account", exact: true }),
  ).toHaveValue("");
  await expect(ns.locator("body")).not.toHaveAttribute("data-saved", "true");
  await page.screenshot({
    path: "test-results/ambient-prepared.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByText("Workspace paused", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(
    page.getByText("Watching selected tabs", { exact: true }),
  ).toBeVisible();
});
test("dismissal suppresses suggestion and tab pause stays scoped", async ({
  page,
}) => {
  await page.goto("/#pair=" + token);
  await expect(page.locator(".model-dot i")).not.toHaveClass("offline");
  if (
    await page
      .getByRole("button", { name: "New workspace", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "New workspace", exact: true })
      .click();
  await page.getByRole("button", { name: "Start watching" }).click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(page.locator(".suggestion-card")).toHaveCount(0);
  await page.getByRole("button", { name: /3 selected tabs/ }).click();
  await page
    .getByRole("button", {
      name: "Pause Invoice inbox · Demo Gmail",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Resume Invoice inbox · Demo Gmail",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Watching selected tabs", { exact: true }),
  ).toBeVisible();
});
