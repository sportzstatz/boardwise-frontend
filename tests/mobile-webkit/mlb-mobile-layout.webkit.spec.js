// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../fixtures");
const FROZEN_NOW = new Date("2026-05-29T12:00:00-05:00").valueOf();

async function fixture(name) {
  return JSON.parse(await readFile(resolve(FIXTURE_DIR, name), "utf8"));
}

async function mockBoardPayload(page, payload) {
  await page.addInitScript((now) => {
    Date.now = () => now;
  }, FROZEN_NOW);

  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: false,
        user: null,
        plan: "guest",
        features: {
          mlb_board_basic: true,
          nhl_board_basic: true,
          performance_summary: true,
        },
      }),
    });
  });

  await page.route("**/api/v1/boards/mlb/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}

async function waitForTeamMarks(page) {
  await page.waitForFunction(() => {
    const marks = [...document.querySelectorAll(".tot-team-mark")];
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

async function renderBoard(page, payload) {
  await mockBoardPayload(page, payload);
  await page.goto("/mlb/");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#games")).toBeVisible();
  await expect(page.locator(".tile")).toHaveCount(1);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await waitForTeamMarks(page);
}

test.describe("MLB mobile WebKit layout", () => {
  test("keeps market summary columns separated and logo shells nonempty", async ({ page }) => {
    await renderBoard(page, await fixture("mlb-classic-payload.json"));

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const summary = page.locator(".market-dropdown:not(.tracker-market-dropdown) .market-summary-row").first();
    await expect(summary).toBeVisible();
    await expect(summary.locator(".market-summary-call")).toBeHidden();
    await expect(summary.locator(".market-summary-model")).toBeHidden();

    const boxes = await summary.evaluate((row) => {
      const selection = row.querySelector(".market-summary-selection")?.getBoundingClientRect();
      const edge = row.querySelector(".market-summary-edge")?.getBoundingClientRect();
      const chevron = row.querySelector(".market-summary-chevron")?.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      return {
        selection: selection && { left: selection.left, right: selection.right },
        edge: edge && { left: edge.left, right: edge.right },
        chevron: chevron && { left: chevron.left, right: chevron.right },
        row: { left: rowBox.left, right: rowBox.right },
      };
    });

    expect(boxes.selection).not.toBeNull();
    expect(boxes.edge).not.toBeNull();
    expect(boxes.chevron).not.toBeNull();
    expect(boxes.selection.right).toBeLessThanOrEqual(boxes.edge.left + 0.5);
    expect(boxes.edge.right).toBeLessThanOrEqual(boxes.chevron.left + 0.5);
    expect(boxes.edge.left).toBeGreaterThanOrEqual(boxes.row.left);
    expect(boxes.edge.right).toBeLessThanOrEqual(boxes.row.right);

    await summary.click();
    await expect(summary.locator("xpath=..").locator(".option-badge.official").first()).toBeVisible();

    const shellFailures = await page.locator(".tot-team-mark").evaluateAll((marks) => marks.map((mark) => {
      const img = mark.querySelector("img[data-team-logo]");
      const fallback = mark.querySelector(".tot-team-fallback");
      const fallbackVisible = fallback ? window.getComputedStyle(fallback).display !== "none" : false;
      const logoLoaded = img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
      return {
        empty: !logoLoaded && !fallbackVisible,
        failedWithoutFallback: img instanceof HTMLImageElement && img.complete && img.naturalWidth === 0 && !mark.classList.contains("logo-failed"),
      };
    }).filter((result) => result.empty || result.failedWithoutFallback));
    expect(shellFailures).toEqual([]);
  });
});
