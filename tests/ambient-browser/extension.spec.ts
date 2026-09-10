import { test, expect, chromium } from "@playwright/test";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
test("packaged Chrome extension observes selected tabs and prepares without saving", async () => {
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
    await panel.getByRole("button", { name: "Start watching" }).click();
    await expect(
      netsuite.getByRole("button", { name: /Open Close Copilot/ }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Check invoices", exact: true })
      .click();
    await expect(panel.locator(".finding-card")).toHaveCount(3, {
      timeout: 45000,
    });
    const candidate = panel
      .locator(".finding-card")
      .filter({
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
    await panel.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      netsuite.getByRole("button", { name: /Open Close Copilot/ }),
    ).toHaveCount(0);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
