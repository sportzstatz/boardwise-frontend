// @ts-check
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function mockLogin(page) {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: "window.turnstile = { reset() {} };",
    });
  });
  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false, user: null, plan: "guest", features: {} }),
    });
  });
}

async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe("login accessibility", () => {
  test("default form has no automated WCAG A/AA violations", async ({ page }) => {
    await mockLogin(page);
    await page.goto("/login/");
    await expect(page.locator("#email")).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("error state has no automated WCAG A/AA violations", async ({ page }) => {
    await mockLogin(page);
    await page.goto("/login/");
    await page.locator("#email").fill("founder@example.test");
    await page.locator("#login-consent").check();
    await page.locator("#login-submit").click();
    await expect(page.locator("#login-message")).toHaveText("Complete the human check, then try again.");
    await expectNoA11yViolations(page);
  });
});
