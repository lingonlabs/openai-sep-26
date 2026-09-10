import { test, expect, chromium } from "@playwright/test";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
test("extension stays in its own Chrome profile when a synthetic workspace is active", async () => {
  const demoBrowser = await chromium.launch();
  const demo = await demoBrowser.newPage();
  await demo.goto(
    "http://127.0.0.1:4318/#pair=" + "test-pairing-token-".repeat(4),
  );
  await demo.getByRole("button", { name: "Start watching" }).click();
  await expect(
    demo.getByText("Watching selected tabs", { exact: true }),
  ).toBeVisible();
  const profile = await mkdtemp(resolve(tmpdir(), "close-extension-"));
  const extension = resolve("apps/extension/.output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
    viewport: { width: 1280, height: 960 },
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).host;
    const netsuite = await context.newPage();
    await netsuite.goto("http://127.0.0.1:4318/demo/netsuite");
    const gmail = await context.newPage();
    await gmail.goto("http://127.0.0.1:4318/demo/gmail");
    const vendors = await context.newPage();
    await vendors.goto("http://127.0.0.1:4318/demo/vendors");
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel
      .getByLabel("Local pairing token")
      .fill("test-pairing-token-".repeat(4));
    await panel
      .getByRole("button", { name: "Connect local assistant" })
      .click();
    await expect(panel.locator(".model-dot i")).not.toHaveClass("offline");
    await expect(
      panel
        .getByRole("combobox", { name: "Browser", exact: true })
        .locator("option"),
    ).toHaveCount(1);
    await expect(
      panel.getByRole("combobox", { name: "Browser", exact: true }),
    ).not.toContainText("Interactive demo workspace");
    await expect(
      panel.getByRole("button", { name: "New workspace", exact: true }),
    ).toHaveCount(0);
    if (
      await panel
        .getByRole("button", { name: "New workspace", exact: true })
        .isVisible()
    )
      await panel
        .getByRole("button", { name: "New workspace", exact: true })
        .click();
    await expect(
      panel.getByText("Invoice inbox · Demo Gmail", { exact: true }),
    ).toBeVisible();
    await panel
      .getByRole("textbox", { name: "Workspace name" })
      .fill("Chrome-only close");
    await panel.getByRole("button", { name: "Start watching" }).click();
    await expect(
      panel
        .getByRole("combobox", { name: "Current workspace" })
        .locator("option"),
    ).toHaveText(["Chrome-only close"]);
    await panel.reload();
    await expect(
      panel
        .getByRole("combobox", { name: "Current workspace" })
        .locator("option"),
    ).toHaveText(["Chrome-only close"]);
    await expect(
      netsuite.getByRole("button", { name: /Open Close Copilot/ }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Check invoices", exact: true })
      .click();
    await expect(panel.locator(".finding-card")).toHaveCount(3, {
      timeout: 45000,
    });
    const candidate = panel.locator(".finding-card").filter({
      has: panel.getByRole("heading", { name: "Marlow Design", exact: true }),
    });
    await candidate
      .getByRole("button", { name: "Prepare bill for review" })
      .click();
    await expect(
      panel.getByText("Prepared, verified, and still unsaved.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      netsuite.getByRole("textbox", { name: "Invoice number", exact: true }),
    ).toHaveValue("MD-2608");
    await expect(netsuite.locator("body")).not.toHaveAttribute(
      "data-saved",
      "true",
    );
    await panel
      .getByRole("button", { name: "Vendor setup", exact: true })
      .click();
    await panel.getByLabel("Vendor company name").fill("Extension Vendor Test");
    await panel
      .getByRole("button", { name: "Check vendor and prepare review" })
      .click();
    await expect(
      panel.getByRole("button", {
        name: "Create vendor in NetSuite",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      netsuite.getByLabel("Company Name", { exact: true }),
    ).toHaveValue("Extension Vendor Test");
    await expect(netsuite.locator("body")).not.toHaveAttribute(
      "data-vendor-save-count",
      "1",
    );
    await panel
      .getByRole("button", { name: "Create vendor in NetSuite", exact: true })
      .click();
    await expect(
      panel.getByText(/was created and its saved record was verified/).first(),
    ).toBeVisible();
    await expect(netsuite.locator("body")).toHaveAttribute(
      "data-vendor-save-count",
      "1",
    );
    await expect(netsuite.locator("body")).not.toHaveAttribute(
      "data-saved",
      "true",
    );
    await panel.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      netsuite.getByRole("button", { name: /Open Close Copilot/ }),
    ).toHaveCount(0);
  } finally {
    await context.close();
    await demoBrowser.close();
    await rm(profile, { recursive: true, force: true });
  }
});
