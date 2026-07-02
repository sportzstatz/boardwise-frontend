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

async function mockDetailApis(page, { board, props, authenticated = true }) {
  await page.addInitScript((now) => {
    Date.now = () => now;
  }, FROZEN_NOW);

  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated,
        user: authenticated ? { email: "founder@example.com" } : null,
        plan: authenticated ? "founder" : "guest",
        features: { mlb_board_basic: true, mlb_board_advanced: authenticated },
      }),
    });
  });

  await page.route("**/api/v1/boards/mlb/**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(board) });
  });

  await page.route("**/api/v1/mlb/games/**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(props) });
  });
}

async function renderDetail(page, options, query = "?game_pk=777001") {
  await mockDetailApis(page, options);
  await page.goto(`/mlb/game/${query}`);
  await expect(page.locator("#gd-loading")).toBeHidden();
  await expect(page.locator("#gd-detail")).toBeVisible();
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

async function founderPayloads() {
  return {
    board: await fixture("mlb-game-detail-payload.json"),
    props: await fixture("mlb-game-props-payload.json"),
    authenticated: true,
  };
}

async function freePayloads() {
  return {
    board: await fixture("mlb-game-detail-preview-payload.json"),
    props: await fixture("mlb-game-props-summary-payload.json"),
    authenticated: false,
  };
}

async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe("MLB game detail v2 accessibility", () => {
  test("Founder detail (Player Props tab) has no automated WCAG A/AA violations", async ({ page }) => {
    await renderDetail(page, await founderPayloads());
    await expect(page.locator('[data-gd2-panel="props"]')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("Founder Markets and Model tabs have no automated WCAG A/AA violations", async ({ page }) => {
    await renderDetail(page, await founderPayloads());
    await page.locator('[data-gd2-tab="markets"]').click();
    await expect(page.locator(".gd2-mkt-option").first()).toBeVisible();
    await expectNoA11yViolations(page);
    await page.locator('[data-gd2-tab="model"]').click();
    await expect(page.locator(".gd2-stat-card").first()).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("Founder detail mobile has no automated WCAG A/AA violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderDetail(page, await founderPayloads());
    await expect(page.locator(".gd2-seg")).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("Free lock panel has no automated WCAG A/AA violations", async ({ page }) => {
    await renderDetail(page, await freePayloads());
    await expect(page.locator('[data-gd2-panel="props"] .gd2-lock')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("Free lock panel mobile has no automated WCAG A/AA violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderDetail(page, await freePayloads());
    await expect(page.locator('[data-gd2-panel="props"] .gd2-lock')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("team marks are decorative and probability bars are named", async ({ page }) => {
    await renderDetail(page, await founderPayloads());

    // Hero: two decorative team logos and the named win-probability bar
    await expect(page.locator(".gd-hero .tot-team-logo")).toHaveCount(2);
    await expect(page.locator(".gd-hero .tot-team-logo").first()).toHaveAttribute("alt", "");
    await expect(page.locator(".gd-hero .tot-bar")).toHaveAttribute("role", "img");
    await expect(page.locator(".gd-hero .tot-bar")).toHaveAttribute("aria-label", /Toronto Blue Jays .*Boston Red Sox/);

    // Props: pitcher-card marks decorative, every prop bar named
    await expect(page.locator(".gd2-team-mark").first()).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(".gd2-team-mark img[data-team-logo]").first()).toHaveAttribute("alt", "");
    const bars = page.locator(".gd2-bar");
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThan(0);
    for (let index = 0; index < barCount; index += 1) {
      await expect(bars.nth(index)).toHaveAttribute("role", "img");
      await expect(bars.nth(index)).toHaveAttribute("aria-label", /Model probability the bet cashes: /);
    }

    // Color is never the only pick signal: gold Pick pill text present
    await expect(page.locator(".gd2-pick-pill").first()).toHaveText("Pick");
  });
});
