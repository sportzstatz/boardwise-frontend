// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "../fixtures/cfb-forecast-beta-payload.json");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

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

  test("classification and state filters are keyboard operable with announced counts", async ({ page }) => {
    await setup(page);
    const classification = page.locator('[data-filter="classification"][data-value="fbs"]');
    await classification.focus();
    await expect(classification).toBeFocused();
    await expect(classification).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Tab");
    await expect(page.locator('[data-filter="classification"][data-value="fbs-fcs"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".cfb-empty-state")).toBeVisible();
  });

  test("mobile card has no automated WCAG A/AA violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("condensed unavailable card has no automated WCAG A/AA violations", async ({ page }) => {
    const payload = JSON.parse(await readFile(FIXTURE, "utf8"));
    payload.games[0].data_state = "unavailable";
    payload.games[0].forecast = null;
    payload.games[0].markets = [];
    payload.games[0].reason_codes = ["FEATURE_INPUT_MISSING"];
    await page.route("**/api/v1/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, plan: "founder", features: { cfb_board_basic: true, cfb_forecast_beta: true } }) }));
    await page.route("**/api/v1/public/landing/cfb", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ sport: "cfb", beta_enabled: true, game_count: 1 }) }));
    await page.route("**/api/v1/boards/cfb/current", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) }));
    await page.goto("/cfb/?week=0&classification=fbs&state=unavailable");
    await expect(page.locator(".cfb-game-card--condensed")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
