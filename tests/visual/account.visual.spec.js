// @ts-check
import { expect, test } from "@playwright/test";

async function mockAccount(page) {
  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: { email: "admin@example.test", display_name: "Admin User", member_since: "2024" },
        plan: "admin",
        features: {
          account_profile: true,
          mlb_board_basic: true,
          mlb_board_advanced: true,
          performance_summary: true,
          performance_breakdown: true,
          performance_picks: true,
        },
      }),
    });
  });
}

async function renderAccount(page) {
  await mockAccount(page);
  await page.goto("/account/");
  await expect(page.locator("#account-status")).toContainText("Signed in as Admin User");
  await expect(page.locator("#account-name")).toHaveText("Admin User");
  await expect(page.locator("#account-plan")).toHaveText("Admin access");
  await expect(page.locator("[data-access-card]")).toHaveCount(3);
  await expect(page.locator("#account-access-list")).not.toContainText("Checking access");
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

test.describe("account visual baselines", () => {
  test("desktop", async ({ page }) => {
    await renderAccount(page);
    await expect(page.locator('link[href*="/assets/css/account.css?v=20260621-account-banner-footer"]')).toHaveCount(1);
    await expect(page.locator('script[src*="/assets/js/account.js?v=20260621-account-banner-footer"]')).toHaveCount(1);
    await expect(page.locator(".account-identity-card")).toBeVisible();
    await expect(page.locator("#feature-list")).toHaveCount(0);
    await expect(page.locator(".bw-app-banner")).toBeVisible();
    await expect(page.locator(".bw-footer")).toBeVisible();
    await expect(page).toHaveScreenshot("account-desktop.png", { fullPage: true });
  });

  test("mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderAccount(page);
    await expect(page.locator(".account-identity-card")).toBeVisible();
    await expect(page.locator("#feature-list")).toHaveCount(0);
    await expect(page.locator(".bw-app-banner")).toBeVisible();
    await expect(page.locator(".bw-footer")).toHaveCount(1);
    await expect(page).toHaveScreenshot("account-mobile.png");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
