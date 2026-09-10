import { test, expect, chromium } from "@playwright/test";
import { resolve } from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
test("extension stays in its own Chrome profile when a synthetic workspace is active", async () => {
  test.setTimeout(100000);
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
    let panel = await context.newPage();
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
    await expect(
      netsuite.getByRole("button", { name: "Check invoices", exact: true }),
    ).toBeVisible();
    await netsuite
      .getByRole("button", { name: "Check invoices", exact: true })
      .click();
    await expect
      .poll(
        async () => {
          const error = await panel.locator(".notice.error").allTextContents();
          if (error.length) throw new Error(error.join("; "));
          return panel.locator(".finding-card").count();
        },
        { timeout: 45000 },
      )
      .toBe(3);
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
    await gmail.goto("http://127.0.0.1:4318/demo/gmail");
    await gmail.evaluate(() =>
      document.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Enter")
            document.body.dataset.nativeEnter = String(e.isTrusted);
        },
        true,
      ),
    );
    await panel
      .getByLabel("Ask about this workspace")
      .fill("[Native browser regression]");
    await panel
      .getByRole("button", { name: "Send workspace question" })
      .click();
    await expect
      .poll(
        async () => {
          const errors = await panel.locator(".notice.error").allTextContents();
          if (errors.length) throw new Error(errors.join("; "));
          return panel
            .getByRole("heading", { name: "Native browser checks" })
            .count();
        },
        { timeout: 35000 },
      )
      .toBe(1);
    await expect(gmail.locator("body")).toHaveAttribute(
      "data-native-enter",
      "true",
    );
    await expect(panel.locator(".markdown-table table")).toContainText(
      "Captured",
    );
    await panel
      .getByRole("button", { name: "View source", exact: true })
      .last()
      .click();
    await expect(
      panel.getByRole("img", { name: "Captured source viewport" }),
    ).toBeVisible();
    const captured = await panel
      .getByRole("img", { name: "Captured source viewport" })
      .getAttribute("src");
    await mkdir(".local", { recursive: true });
    await writeFile(
      ".local/integration-native.png",
      Buffer.from(captured!.split(",")[1], "base64"),
    );
    await panel.getByRole("button", { name: "Close evidence" }).click();
    await gmail.getByRole("button", { name: /Open Close Copilot/ }).click();
    await gmail.getByRole("button", { name: "Pause tab", exact: true }).click();
    await expect(
      gmail.getByRole("button", { name: "Resume tab", exact: true }),
    ).toBeVisible();
    await gmail
      .getByRole("button", { name: "Resume tab", exact: true })
      .click();
    await expect(
      gmail.getByRole("button", { name: "Pause tab", exact: true }),
    ).toBeVisible();
    // Match the documented unpacked-extension setup. A command-line load alone
    // does not enable Developer mode, and Chrome disables it on reload otherwise.
    const extensions = await context.newPage();
    await extensions.goto("chrome://extensions");
    await extensions.locator("#devMode").click();
    await extensions.close();
    const closedPanel = panel.waitForEvent("close", { timeout: 15000 });
    await worker.evaluate(() => {
      setTimeout(() => chrome.runtime.reload(), 100);
    });
    await closedPanel;
    panel = await context.newPage();
    // The old pages close before Chrome has finished loading the replacement.
    await expect(async () => {
      await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    }).toPass({ timeout: 15000 });
    await expect(
      panel
        .getByRole("combobox", { name: "Current workspace" })
        .locator("option"),
    ).toHaveText(["Chrome-only close"]);
    await expect(
      netsuite.getByRole("button", { name: /Open Close Copilot/ }),
    ).toBeVisible();
    await panel.setViewportSize({ width: 390, height: 900 });
    if (await panel.getByLabel("Vendor company name").isVisible())
      await panel
        .getByRole("button", { name: "Vendor setup", exact: true })
        .click();
    await expect(panel.locator(".copilot-panel")).toHaveCount(1);
    await expect
      .poll(() => panel.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(390);
    await panel.locator(".copilot-panel").screenshot({
      path: ".local/integration-panel.png",
    });
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
