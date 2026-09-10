import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
test("live Astra demonstration — selected tabs to verified unsaved bill", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.LIVE_DEMO !== "1",
    "Explicit opt-in required for a real API run.",
  );
  test.setTimeout(420000);
  const token = readFileSync(".local/relay-token", "utf8").trim();
  let latest: any = null;
  page.on("websocket", (socket) =>
    socket.on("framereceived", (frame) => {
      try {
        const m = JSON.parse(String(frame.payload));
        if (m.state) latest = m.state;
      } catch {}
    }),
  );
  await page.goto("/#pair=" + token);
  await expect(page.locator(".model-dot i")).not.toHaveClass("offline");
  await expect(page.locator(".demo-badge")).toContainText("LIVE ASTRA");
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
  await page
    .getByRole("textbox", { name: "Workspace name" })
    .fill("Julie + Philipp · August close");
  await page.getByRole("button", { name: "Demo guide" }).click();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Start watching" }).click();
  await expect(page.locator(".suggestion-card")).toBeVisible({
    timeout: 45000,
  });
  await page.screenshot({
    path: "recordings/01-contextual-suggestion.png",
    fullPage: true,
  });
  await page.waitForTimeout(2000);
  await page
    .locator(".suggestion-card")
    .getByRole("button", { name: "Check invoices", exact: true })
    .click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".finding-card")).toHaveCount(3, {
    timeout: 240000,
  });
  await expect(
    page.getByText("Already recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Vendor onboarding pending", { exact: true }),
  ).toBeVisible();
  const candidate = page
    .locator(".finding-card")
    .filter({
      has: page.getByRole("heading", { name: "Marlow Design", exact: true }),
    });
  await expect(candidate).toContainText("$4,250.00");
  await page.screenshot({
    path: "recordings/02-investigation-findings.png",
    fullPage: true,
  });
  await candidate.getByRole("button", { name: /Invoice details/ }).click();
  await candidate
    .getByRole("button", { name: "Source 1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("MD-2608");
  await page.screenshot({
    path: "recordings/03-source-evidence.png",
    fullPage: true,
  });
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Close evidence" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await candidate
    .getByRole("button", { name: "Prepare bill for review" })
    .click();
  await expect(
    page.getByText("Prepared, verified, and still unsaved.", { exact: true }),
  ).toBeVisible({ timeout: 120000 });
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
  await expect(ns.locator("body")).not.toHaveAttribute("data-saved", "true");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await candidate.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "recordings/04-prepared-unsaved-bill.png",
    fullPage: true,
  });
  await page.waitForTimeout(5000);
  mkdirSync("recordings", { recursive: true });
  const workspace = latest.workspaces.at(-1);
  const report = {
    ranAt: new Date().toISOString(),
    model: latest.model,
    mode: latest.mode,
    data: "Synthetic browser applications",
    workspace: workspace.name,
    tasks: latest.tasks.filter((t: any) => t.workspaceId === workspace.id),
    findings: latest.findings.filter(
      (f: any) => f.workspaceId === workspace.id,
    ),
    saved: false,
  };
  writeFileSync(
    "recordings/live-demo-result.json",
    JSON.stringify(report, null, 2),
  );
  await testInfo.attach("live-demo-result", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
});
