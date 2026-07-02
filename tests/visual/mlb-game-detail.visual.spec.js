// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../fixtures");
const FROZEN_NOW = new Date("2026-06-18T12:00:00-05:00").valueOf();
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const LONG_PAGE_SCREENSHOT = { fullPage: true, maxDiffPixelRatio: 0.02 };

async function fixture(name) {
  return JSON.parse(await readFile(resolve(FIXTURE_DIR, name), "utf8"));
}

async function waitForTeamLogos(page) {
  await page.waitForFunction(() => {
    const logos = [...document.querySelectorAll("img[data-team-logo]")];
    if (!logos.length) return true;
    return logos.every((img) => {
      if (!(img instanceof HTMLImageElement)) return false;
      if (img.complete && img.naturalWidth > 0) return true;
      const mark = img.closest("[data-team-logo-mark], .tot-team-logo-mark, .tot-team-mark");
      return Boolean(mark && mark.classList.contains("logo-failed"));
    });
  });
}

async function mockDetailApis(page, { board, props, authenticated }) {
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

async function renderDetail(page, options) {
  await mockDetailApis(page, options);
  await page.goto("/mlb/game/?game_pk=777001");
  await expect(page.locator("#gd-loading")).toBeHidden();
  await expect(page.locator("#gd-detail")).toBeVisible();
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await waitForTeamLogos(page);
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

test.describe("MLB game detail v2 visual baselines", () => {
  test("Founder desktop (Player Props default tab)", async ({ page }) => {
    await renderDetail(page, await founderPayloads());
    await expect(page.locator(".gd-wise")).toBeVisible();
    await expect(page.locator('[data-gd2-panel="props"]')).toBeVisible();
    await expect(page.locator(".gd2-pitcher-card")).toHaveCount(2);
    await expect(page.locator(".gd2-top-play")).toHaveCount(2);
    await expect(page).toHaveScreenshot("gd2-founder-desktop.png", { fullPage: true });
  });

  test("Founder desktop Markets and Model tabs", async ({ page }) => {
    await renderDetail(page, await founderPayloads());
    await page.locator('[data-gd2-tab="markets"]').click();
    await expect(page.locator(".gd2-mkt-option.is-wise")).toBeVisible();
    await expect(page).toHaveScreenshot("gd2-founder-markets.png", { fullPage: true });
    await page.locator('[data-gd2-tab="model"]').click();
    await expect(page.locator(".gd2-stat-card")).toHaveCount(6);
    await expect(page).toHaveScreenshot("gd2-founder-model.png", { fullPage: true });
  });

  test("Founder mobile 390px (segmented props)", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await renderDetail(page, await founderPayloads());

    await expect(page.locator(".gd2-seg")).toBeVisible();
    await expect(page.locator('[data-gd2-seg="ranked"]')).toBeVisible();
    await expect(page.locator(".gd2-top-plays")).toBeHidden();
    await expect(page.locator(".gd2-rank-card").first()).toBeVisible();
    await expect(page).toHaveScreenshot("gd2-founder-mobile.png", LONG_PAGE_SCREENSHOT);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);

    // Segments switch content
    await page.locator('[data-gd2-seg="pitchers"]').click();
    await expect(page.locator(".gd2-pitcher-card").first()).toBeVisible();
    await page.locator('[data-gd2-seg="batters"]').click();
    await expect(page.locator(".gd2-batter-card").first()).toBeVisible();
  });

  test("Free lock panel", async ({ page }) => {
    await renderDetail(page, await freePayloads());
    const lock = page.locator('[data-gd2-panel="props"] .gd2-lock');
    await expect(lock).toBeVisible();
    await expect(lock).toContainText("Player props are Founder access");
    await expect(lock.locator("[data-auth-guest]")).toBeVisible();
    await expect(page).toHaveScreenshot("gd2-free-lock.png", { fullPage: true });
  });

  test("Founder detail has no horizontal overflow across required widths", async ({ page }) => {
    const payloads = await founderPayloads();
    for (const width of [320, 375, 390, 430, 720, 1024, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await renderDetail(page, payloads);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, `overflow at ${width}px`).toBe(false);
    }
  });

  test("Free detail has no horizontal overflow across required widths", async ({ page }) => {
    const payloads = await freePayloads();
    for (const width of [320, 375, 390, 430, 720, 1024, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await renderDetail(page, payloads);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, `overflow at ${width}px`).toBe(false);
    }
  });
});
