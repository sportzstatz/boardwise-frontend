// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../fixtures");
const FROZEN_NOW = new Date("2026-06-18T12:00:00-05:00").valueOf();
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function fixture(name) {
  return JSON.parse(await readFile(resolve(FIXTURE_DIR, name), "utf8"));
}

async function mockBoard(page, payload, { authenticated = true } = {}) {
  await page.addInitScript((now) => {
    Date.now = () => now;
  }, FROZEN_NOW);

  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated,
        user: authenticated ? { email: "pro@example.com" } : null,
        plan: authenticated ? "pro" : "guest",
        features: { mlb_board_basic: true, mlb_board_advanced: authenticated },
      }),
    });
  });

  await page.route("**/api/v1/boards/mlb/**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
  });
}

async function renderDetail(page, payload, query = "?game_pk=777001", opts = {}) {
  await mockBoard(page, payload, opts);
  await page.goto(`/mlb/game/${query}`);
  await expect(page.locator("#gd-loading")).toBeHidden();
  await expect(page.locator("#gd-detail")).toBeVisible();
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe("MLB game detail accessibility", () => {
  test("Pro detail has no automated WCAG A/AA violations", async ({ page }) => {
    await renderDetail(page, await fixture("mlb-game-detail-payload.json"));
    await expectNoA11yViolations(page);
  });

  test("Free detail has no automated WCAG A/AA violations", async ({ page }) => {
    await renderDetail(
      page,
      await fixture("mlb-game-detail-preview-payload.json"),
      "?game_pk=777001",
      { authenticated: false }
    );
    await expectNoA11yViolations(page);
  });

  test("Pro detail mobile has no automated WCAG A/AA violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderDetail(page, await fixture("mlb-game-detail-payload.json"));
    await expectNoA11yViolations(page);
  });

  test("Free detail mobile has no automated WCAG A/AA violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderDetail(
      page,
      await fixture("mlb-game-detail-preview-payload.json"),
      "?game_pk=777001",
      { authenticated: false }
    );
    await expectNoA11yViolations(page);
  });

  test("detail team logos are decorative and probability bars are named", async ({ page }) => {
    await renderDetail(page, await fixture("mlb-game-detail-payload.json"));

    await expect(page.locator(".gd-hero .tot-team-logo")).toHaveCount(2);
    await expect(page.locator(".gd-hero .tot-team-logo").first()).toHaveAttribute("alt", "");
    await expect(page.locator(".gd-hero .tot-bar")).toHaveAttribute("role", "img");
    await expect(page.locator(".gd-hero .tot-bar")).toHaveAttribute("aria-label", /Toronto Blue Jays .*Boston Red Sox/);
  });
});
