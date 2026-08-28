// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "../fixtures/cfb-forecast-beta-payload.json");

async function render(page, mode = "full") {
  const payload = JSON.parse(await readFile(FIXTURE, "utf8"));
  if (mode === "preview") {
    payload.access = "preview";
    delete payload.games[0].forecast;
    delete payload.games[0].markets;
    delete payload.games[0].model_details;
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
    body: JSON.stringify({ sport: "cfb", beta_enabled: true, game_count: 1, last_safe_update: payload.release.released_at }),
  }));
  await page.route("**/api/v1/boards/cfb/current", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) }));
  await page.goto("/cfb/");
  await expect(page.locator("#cfb-loading")).toBeHidden();
  await expect(page.locator(".cfb-game-card")).toBeVisible();
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
}

test.describe("CFB forecast beta visual baselines", () => {
  test("Founder complete card", async ({ page }) => {
    await render(page);
    await page.locator('[data-market="winner"]').evaluate((node) => node.setAttribute("open", ""));
    await page.locator(".cfb-model-details").evaluate((node) => node.setAttribute("open", ""));
    await expect(page).toHaveScreenshot("cfb-founder-complete-card.png", { fullPage: true });
  });

  test("Founder mobile card", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await render(page);
    await expect(page).toHaveScreenshot("cfb-founder-mobile-card.png", { fullPage: true });
  });

  test("Free locked card", async ({ page }) => {
    await render(page, "preview");
    await expect(page.locator(".cfb-accordion")).toHaveCount(0);
    await expect(page).toHaveScreenshot("cfb-free-locked-card.png", { fullPage: true });
  });
});
