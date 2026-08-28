// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "../fixtures/cfb-forecast-beta-payload.json");

async function fixture() {
  return JSON.parse(await readFile(FIXTURE, "utf8"));
}

function secondGame(payload, overrides = {}) {
  const game = structuredClone(payload.games[0]);
  game.game_id = 202;
  game.away_team = { code: "cfb-2294", name: "Iowa Hawkeyes", abbreviation: "IOWA", logo_key: "cfb-2294" };
  game.home_team = { code: "cfb-158", name: "Nebraska Cornhuskers", abbreviation: "NEB", logo_key: "cfb-158" };
  game.venue = "Memorial Stadium";
  Object.assign(game, overrides);
  return game;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {{ mode?: string, payload?: any, query?: string }} [options]
 */
async function render(page, options = {}) {
  const { mode = "full", payload, query = "" } = options;
  const board = payload || await fixture();
  if (mode === "preview") {
    board.access = "preview";
    for (const game of board.games) {
      delete game.forecast;
      delete game.markets;
      delete game.model_details;
      delete game.reason_codes;
    }
  }
  await page.route("**/api/v1/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      authenticated: true,
      user: { display_name: mode === "full" ? "Founder Member" : "Free Member" },
      plan: mode === "full" ? "founder" : "free",
      features: { cfb_board_basic: true, cfb_forecast_beta: mode === "full" },
    }),
  }));
  await page.route("**/api/v1/public/landing/cfb", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ sport: "cfb", beta_enabled: true, game_count: board.games.length, last_safe_update: board.release.released_at }),
  }));
  await page.route("**/api/v1/boards/cfb/current", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(board) }));
  await page.goto(`/cfb/${query}`);
  await expect(page.locator("#cfb-loading")).toBeHidden();
  await expect(page.locator(".cfb-game-card").first()).toBeVisible();
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
}

test.describe("CFB forecast beta visual baselines", () => {
  test("1440 default FBS Complete board uses two cards", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const payload = await fixture();
    payload.games.push(secondGame(payload));
    await render(page, { payload });
    await expect(page.locator(".cfb-game-card")).toHaveCount(2);
    await expect(page).toHaveScreenshot("cfb-1440-default-two-card-board.png", { fullPage: true });
  });

  test("1280 Winner comparison", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const payload = await fixture();
    payload.games.push(secondGame(payload));
    await render(page, { payload });
    await page.locator('[data-game-id="101"] [data-market="winner"] > summary').click();
    await expect(page).toHaveScreenshot("cfb-1280-winner-expanded.png", { fullPage: true });
  });

  test("1024 boundary Spread preserves different lines", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const payload = await fixture();
    payload.games.push(secondGame(payload));
    await render(page, { payload });
    await page.locator('[data-game-id="101"] [data-market="spread"] > summary').click();
    await expect(page.locator('[data-game-id="101"]')).toContainText("DIFFERENT LINES");
    await expect(page).toHaveScreenshot("cfb-1024-spread-different-lines.png", { fullPage: true });
  });

  test("768 Total comparison", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await render(page);
    await page.locator('[data-market="total"] > summary').click();
    await expect(page).toHaveScreenshot("cfb-768-total-expanded.png", { fullPage: true });
  });

  test("390 mobile sticky filters and Model Details", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await render(page);
    await page.locator(".cfb-model-details summary").click();
    await page.locator(".cfb-model-details").evaluate((details) => {
      const controls = document.querySelector("#cfb-controls");
      const offset = controls instanceof HTMLElement ? controls.offsetHeight : 0;
      window.scrollTo(0, details.getBoundingClientRect().top + window.scrollY - offset);
    });
    await expect(page).toHaveScreenshot("cfb-390-model-details.png");
    await page.evaluate(() => window.scrollTo(0, 500));
    await expect(page.locator("#cfb-controls")).toBeVisible();
    await expect(page).toHaveScreenshot("cfb-390-sticky-filters.png");
  });

  test("360 Free locked shell", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await render(page, { mode: "preview" });
    await expect(page.locator(".cfb-accordion")).toHaveCount(0);
    await expect(page).toHaveScreenshot("cfb-360-free-locked-shell.png", { fullPage: true });
  });

  test("degraded and condensed unavailable cards", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const payload = await fixture();
    payload.games[0].data_state = "degraded";
    payload.games[0].reason_codes = ["FEATURE_INPUT_MISSING"];
    payload.games.push(secondGame(payload, { data_state: "unavailable", forecast: null, markets: [], reason_codes: ["ODDS_MISSING", "FEATURE_INPUT_MISSING"] }));
    await render(page, { payload, query: "?week=0&classification=fbs&state=all" });
    await expect(page.locator(".cfb-game-card--condensed")).toHaveCount(1);
    await expect(page).toHaveScreenshot("cfb-degraded-unavailable-variants.png", { fullPage: true });
  });

  test("skeleton reserves the two-card desktop layout", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/v1/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, plan: "founder", features: { cfb_board_basic: true, cfb_forecast_beta: true } }) }));
    await page.route("**/api/v1/public/landing/cfb", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ sport: "cfb", beta_enabled: true, game_count: 2 }) }));
    await page.route("**/api/v1/boards/cfb/current", async () => new Promise(() => {}));
    await page.goto("/cfb/");
    await expect(page.locator("#cfb-loading")).toBeVisible();
    await expect(page.locator(".cfb-skeleton-card")).toHaveCount(2);
    await expect(page).toHaveScreenshot("cfb-skeleton-loading.png", { fullPage: true });
  });

  test("required widths have the intended columns and no page overflow", async ({ page }) => {
    const payload = await fixture();
    payload.games.push(secondGame(payload));
    await render(page, { payload });

    for (const width of [1440, 1280, 1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => {
        const grid = document.querySelector(".cfb-game-grid");
        return {
          columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length : 0,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      expect(layout.columns, `${width}px card columns`).toBe(width >= 1024 ? 2 : 1);
      expect(layout.scrollWidth, `${width}px document overflow`).toBeLessThanOrEqual(layout.clientWidth);
    }
  });
});
