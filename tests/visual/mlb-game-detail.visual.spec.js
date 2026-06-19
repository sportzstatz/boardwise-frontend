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
}

test.describe("MLB game detail visual baselines", () => {
  test("Pro (unlocked)", async ({ page }) => {
    await renderDetail(page, await fixture("mlb-game-detail-payload.json"), true);
    await expect(page.locator(".gd-wise")).toBeVisible();
    await expect(page.locator(".gd-mkt-option.official").first()).toBeVisible();
    await expect(page).toHaveScreenshot("mlb-game-detail-pro.png", { fullPage: true });
  });

  test("Free (gated)", async ({ page }) => {
    await renderDetail(page, await fixture("mlb-game-detail-preview-payload.json"), false);
    await expect(page.locator(".gd-upsell")).toBeVisible();
    await expect(page.locator(".gd-locked-row").first()).toBeVisible();
    await expect(page).toHaveScreenshot("mlb-game-detail-free.png", { fullPage: true });
  });
});
