// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../fixtures");
const FROZEN_NOW = new Date("2026-06-18T12:00:00-05:00").valueOf();

async function fixture(name) {
  return JSON.parse(await readFile(resolve(FIXTURE_DIR, name), "utf8"));
}

async function waitForTeamMarks(page) {
  await page.waitForFunction(() => {
    const marks = [...document.querySelectorAll(".tot-team-logo-mark, .tot-team-mark")];
    return marks.length > 0 && marks.every((mark) => {
      const img = mark.querySelector("img[data-team-logo]");
      const fallback = mark.querySelector(".tot-team-fallback");
      if (!fallback) return false;
      if (!img) return window.getComputedStyle(fallback).display !== "none";
      if (img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0) return true;
      return mark.classList.contains("logo-failed") && window.getComputedStyle(fallback).display !== "none";
    });
  });
}

async function mockBoard(page, payload, authenticated) {
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

async function renderDetail(page, payload, authenticated) {
  await mockBoard(page, payload, authenticated);
  await page.goto("/mlb/game/?game_pk=777001");
  await expect(page.locator("#gd-loading")).toBeHidden();
  await expect(page.locator("#gd-detail")).toBeVisible();
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await waitForTeamMarks(page);
}

test.describe("MLB game detail visual baselines", () => {
  test("Pro (unlocked)", async ({ page }) => {
    await renderDetail(page, await fixture("mlb-game-detail-payload.json"), true);
    await expect(page.locator(".gd-wise")).toBeVisible();
    await expect(page.locator(".gd-mkt-option.official").first()).toBeVisible();
    await expect(page).toHaveScreenshot("mlb-game-detail-pro.png", { fullPage: true });
  });

  test("Pro mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderDetail(page, await fixture("mlb-game-detail-payload.json"), true);

    await expect(page.locator(".gd-hero .tot-mobile-bar")).toBeVisible();
    await expect(page.locator(".gd-section-nav")).toBeVisible();
    await expect(page.locator(".gd-section-chip").first()).toBeVisible();
    const optionBoxes = await page.locator(".gd-market-options").first().locator(".gd-mkt-option").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
    expect(optionBoxes[1]).toBeGreaterThan(optionBoxes[0]);
    await expect(page).toHaveScreenshot("mlb-game-detail-pro-mobile.png", { fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("Free (gated)", async ({ page }) => {
    await renderDetail(page, await fixture("mlb-game-detail-preview-payload.json"), false);
    await expect(page.locator(".gd-upsell")).toBeVisible();
    await expect(page.locator(".gd-locked-row").first()).toBeVisible();
    await expect(page).toHaveScreenshot("mlb-game-detail-free.png", { fullPage: true });
  });

  test("Free mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderDetail(page, await fixture("mlb-game-detail-preview-payload.json"), false);

    await expect(page.locator(".gd-hero .tot-mobile-bar")).toBeVisible();
    await expect(page.locator(".gd-upsell")).toBeVisible();
    await expect(page.locator(".gd-locked-row").first()).toBeVisible();
    await expect(page.locator(".gd-section-nav")).toHaveCount(0);
    await expect(page.locator(".gd-mkt-option")).toHaveCount(0);
    await expect(page.locator("#gd-detail")).not.toContainText("+9.1%");
    await expect(page).toHaveScreenshot("mlb-game-detail-free-mobile.png", { fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("Pro detail has no horizontal overflow across required widths", async ({ page }) => {
    for (const width of [320, 375, 390, 430, 720, 1024, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await renderDetail(page, await fixture("mlb-game-detail-payload.json"), true);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, `overflow at ${width}px`).toBe(false);
    }
  });

  test("Free detail has no horizontal overflow across required widths", async ({ page }) => {
    for (const width of [320, 375, 390, 430, 720, 1024, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await renderDetail(page, await fixture("mlb-game-detail-preview-payload.json"), false);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, `overflow at ${width}px`).toBe(false);
    }
  });
});
