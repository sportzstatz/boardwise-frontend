// @ts-check
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

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
}

async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe("account accessibility", () => {
  test("authenticated account page has no automated WCAG A/AA violations", async ({ page }) => {
    await renderAccount(page);
    await expectNoA11yViolations(page);
  });
});
