// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "../fixtures/cfb-forecast-beta-payload.json");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function setup(page, plan = "founder") {
  const payload = JSON.parse(await readFile(FIXTURE, "utf8"));
  await page.route("**/api/v1/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      authenticated: plan !== "guest",
      user: plan === "guest" ? null : { display_name: `${plan} member`, email: `${plan}@example.test` },
      plan,
      features: { cfb_board_basic: plan !== "guest", cfb_forecast_beta: ["founder", "admin"].includes(plan) },
    }),
  }));
  await page.route("**/api/v1/public/landing/cfb", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ sport: "cfb", beta_enabled: true, game_count: 1, last_safe_update: payload.release.released_at }),
  }));
  await page.route("**/api/v1/boards/cfb/current", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(payload),
  }));
  await page.goto("/cfb/");
  await expect(page.locator("#cfb-loading")).toBeHidden();
}

test.describe("CFB forecast beta accessibility", () => {
  test("Founder complete card has no automated WCAG A/AA violations", async ({ page }) => {
    await setup(page);
    await expect(page.locator(".cfb-game-card")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("market and Model Details accordions are keyboard operable", async ({ page }) => {
    await setup(page);
    const summary = page.locator(".cfb-accordion summary").first();
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(summary.locator("xpath=..")).toHaveAttribute("open", "");
  });

  test("mobile card has no automated WCAG A/AA violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
