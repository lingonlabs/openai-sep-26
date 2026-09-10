import { test, expect } from "@playwright/test";

test("standing instructions produce choices; declining does not execute and a custom request does", async ({
  page,
}) => {
  await page.goto("/#pair=" + "test-pairing-token-".repeat(4));
  await page.getByRole("button", { name: "Start watching" }).click();
  await expect(
    page.getByText("Watching selected tabs", { exact: true }),
  ).toBeVisible();
  const dismiss = page.getByRole("button", { name: "Not now", exact: true });
  await expect(dismiss).toBeVisible();
  await dismiss.click();
  await page
    .getByRole("button", { name: "Help me with…", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove instruction 3" }).click();
  await page.getByRole("button", { name: "Remove instruction 2" }).click();
  await page
    .getByLabel("Help instruction 1")
    .fill("Offer test choices for this synthetic workspace");
  await page
    .getByRole("button", { name: "Save instructions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose a synthetic review" }),
  ).toBeVisible({ timeout: 25000 });
  await page
    .getByRole("radio", { name: "No help needed", exact: true })
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a synthetic review" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Activity & task history [1-9]/ }),
  ).toHaveCount(0);
  await page.getByText("What Close Copilot remembers", { exact: true }).click();
  await expect(page.locator(".ambient-memory").first()).toContainText(
    "Remembered the synthetic workspace.",
  );
  await page
    .getByRole("button", { name: "Clear remembered context", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose a synthetic review" }),
  ).toBeVisible({ timeout: 25000 });
  await page
    .getByLabel("Something else to help with")
    .fill("Explain this synthetic workspace.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Explain this synthetic workspace.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".chat-markdown").last()).toContainText(
    "This is the deterministic test mode",
  );
  await page
    .getByRole("button", {
      name: "Activity & task history 1 tasks",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Continue task", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Help me with…", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Help me with…", exact: true })
    .click();
  await expect(page.getByLabel("Help instruction 1")).toHaveValue(
    "Offer test choices for this synthetic workspace",
  );
  await page.getByLabel("Enable ambient help in this workspace").uncheck();
  await page
    .getByRole("button", { name: "Save instructions", exact: true })
    .click();
  await expect(
    page.getByText("Ambient monitoring paused", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await page
    .locator(".copilot-panel")
    .screenshot({ path: ".local/integration-help.png" });
});
