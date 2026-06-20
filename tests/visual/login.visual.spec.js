// @ts-check
import { expect, test } from "@playwright/test";

async function mockLogin(page) {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        window.turnstile = { reset() {} };
        document.querySelectorAll(".cf-turnstile").forEach((node) => {
          const placeholder = document.createElement("div");
          placeholder.textContent = "Cloudflare Turnstile";
          placeholder.style.cssText = "min-height:64px;border:1px dashed #d9d1c2;border-radius:12px;display:grid;place-items:center;color:#4f5f6f;background:#fff;font:700 13px Archivo, sans-serif;";
          node.appendChild(placeholder);
        });
      `,
    });
  });
  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false, user: null, plan: "guest", features: {} }),
    });
  });
}

test.describe("login visual baselines", () => {
  test("desktop", async ({ page }) => {
    await mockLogin(page);
    await page.goto("/login/");
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await expect(page.locator(".login-turnstile")).toBeVisible();
    await expect(page).toHaveScreenshot("login-desktop.png", { fullPage: true });
  });

  test("mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockLogin(page);
    await page.goto("/login/");
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await expect(page.locator(".login-form-panel")).toBeVisible();
    await expect(page).toHaveScreenshot("login-mobile.png", { fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
