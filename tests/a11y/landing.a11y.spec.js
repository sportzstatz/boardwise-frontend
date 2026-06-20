// @ts-check
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function mockLanding(page, { authenticated = false, mlb = false } = {}) {
  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated,
        user: authenticated ? { email: "founder@example.test", display_name: "Founder" } : null,
        plan: authenticated ? "founder_beta" : "guest",
        features: {
          mlb_board_basic: mlb,
          performance_summary: false,
        },
      }),
    });
  });
  await page.route("**/api/v1/boards/nhl/current", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ games: [] }) });
  });
  await page.route("**/api/v1/boards/mlb/current", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ games: [{ id: 1 }] }) });
  });
}

async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe("landing accessibility", () => {
  test("guest page has no automated WCAG A/AA violations", async ({ page }) => {
    await mockLanding(page);
    await page.goto("/");
    await expect(page.locator(".landing-preview__label")).toHaveText("Illustrative");
    await expectNoA11yViolations(page);
  });

  test("authenticated page has no automated WCAG A/AA violations", async ({ page }) => {
    await mockLanding(page, { authenticated: true, mlb: true });
    await page.goto("/");
    await expect(page.locator("[data-auth-initials]").first()).toHaveText("FO");
    await expectNoA11yViolations(page);
  });
});
