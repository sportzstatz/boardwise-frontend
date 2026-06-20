// @ts-check
import { expect, test } from "@playwright/test";

async function mockLanding(page, { authenticated = false, mlb = false } = {}) {
  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated,
        user: authenticated ? { email: "admin@example.test", display_name: "Admin User" } : null,
        plan: authenticated ? "founder_beta" : "guest",
        features: {
          mlb_board_basic: mlb,
          performance_summary: authenticated,
        },
      }),
    });
  });

  await page.route("**/api/v1/boards/nhl/current", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ games: [{ id: "nhl-1" }] }),
    });
  });

  await page.route("**/api/v1/boards/mlb/current", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ games: [{ id: "mlb-1" }, { id: "mlb-2" }] }),
    });
  });
}

test.describe("landing visual baselines", () => {
  test("desktop", async ({ page }) => {
    await mockLanding(page);
    await page.goto("/");
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await expect(page.locator(".landing-preview__label")).toHaveText("Illustrative");
    await expect(page).toHaveScreenshot("landing-desktop.png", { fullPage: true });
  });

  test("mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockLanding(page);
    await page.goto("/");
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await expect(page.locator(".landing-preview__label")).toHaveText("Illustrative");
    await expect(page).toHaveScreenshot("landing-mobile.png", { fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
