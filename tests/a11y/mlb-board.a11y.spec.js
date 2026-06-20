// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../fixtures");
const FROZEN_NOW = new Date("2026-05-29T12:00:00-05:00").valueOf();
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function fixture(name) {
  const raw = await readFile(resolve(FIXTURE_DIR, name), "utf8");
  return JSON.parse(raw);
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

async function renderBoard(page, payload, query = "") {
  await mockBoardPayload(page, payload);
  await page.goto(`/mlb/${query}`);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#games")).toBeVisible();
}

async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function tabUntilFocused(page, locator, maxTabs = 40) {
  const target = locator.first();
  for (let index = 0; index < maxTabs; index += 1) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error("Expected element was not reachable with keyboard tab navigation.");
}

async function expectVisibleFocus(locator) {
  const outline = await locator.first().evaluate((el) => {
    const styles = window.getComputedStyle(el);
    return {
      style: styles.outlineStyle,
      width: Number.parseFloat(styles.outlineWidth),
    };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThan(0);
}

test.describe("MLB board accessibility", () => {
  for (const [name, fixtureName, query] of [
    ["Classic", "mlb-classic-payload.json", ""],
    ["Obsidian shadow", "mlb-obsidian-shadow-payload.json", "?model=obsidian_steed"],
    ["Obsidian public", "mlb-obsidian-public-payload.json", "?model=obsidian_steed"],
    ["Tracker market present", "mlb-tracker-market-present-payload.json", ""],
  ]) {
    test(`${name} has no automated WCAG A/AA violations`, async ({ page }) => {
      await renderBoard(page, await fixture(fixtureName), query);
      if (name === "Tracker market present") {
        await page.locator(".tracker-market-dropdown").evaluateAll((dropdowns) => {
          for (const dropdown of dropdowns) dropdown.setAttribute("open", "");
        });
      }
      await expectNoA11yViolations(page);
    });
  }

  test("keyboard reaches date and model controls without trapping focus", async ({ page }) => {
    await renderBoard(
      page,
      await fixture("mlb-obsidian-shadow-payload.json"),
      "?model=obsidian_steed"
    );

    const dateInput = page.locator("#board-date");
    await tabUntilFocused(page, dateInput);
    await expect(dateInput).toBeFocused();
    await expectVisibleFocus(dateInput);

    const obsidianButton = page.locator('[data-model-family="obsidian_steed"]');
    await tabUntilFocused(page, obsidianButton);
    await expect(obsidianButton).toBeFocused();
    await expectVisibleFocus(obsidianButton);

    await page.keyboard.press("Tab");
    await expect(obsidianButton).not.toBeFocused();
  });

  test("keyboard opens tracker details and keeps focus visible", async ({ page }) => {
    await renderBoard(page, await fixture("mlb-tracker-market-present-payload.json"));

    const firstTrackerSummary = page.locator(".tracker-market-dropdown summary").first();
    const firstTrackerDetails = page.locator(".tracker-market-dropdown").first();
    await tabUntilFocused(page, firstTrackerSummary);
    await expect(firstTrackerSummary).toBeFocused();
    await expectVisibleFocus(firstTrackerSummary);

    await page.keyboard.press("Enter");
    await expect(firstTrackerDetails).toHaveAttribute("open", "");
  });

  test("Classic mobile has no automated WCAG A/AA violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderBoard(page, await fixture("mlb-classic-payload.json"));
    await expectNoA11yViolations(page);
  });

  test("team logos are decorative and probability bars are named", async ({ page }) => {
    await renderBoard(page, await fixture("mlb-classic-payload.json"));

    await expect(page.locator(".tot-team-logo")).toHaveCount(2);
    await expect(page.locator(".tot-team-logo").first()).toHaveAttribute("alt", "");
    await expect(page.locator(".tot-bar").first()).toHaveAttribute("role", "img");
    await expect(page.locator(".tot-bar").first()).toHaveAttribute("aria-label", /New York Mets .*Chicago Cubs/);
  });

  test("mobile market summaries preserve hidden call and model context in the accessible name", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderBoard(page, await fixture("mlb-classic-payload.json"));

    const summary = page.locator(".market-dropdown:not(.tracker-market-dropdown) .market-summary-row").first();
    await tabUntilFocused(page, summary);
    await expect(summary).toBeFocused();
    await expectVisibleFocus(summary);
    await expect(summary.locator(".market-summary-model")).toBeHidden();
    await expect(summary.locator(".market-summary-call")).toBeHidden();
    const ariaLabel = await summary.getAttribute("aria-label");
    expect(ariaLabel).toContain("Model 57.4%");
    expect(ariaLabel).toContain("Edge +3.3%");
    expect(ariaLabel).toContain("Official");
    expect(ariaLabel).toContain("Expand market details");

    await page.keyboard.press("Enter");
    await expect(summary.locator("xpath=..").locator(".option-badge.official").first()).toBeVisible();
  });

  test("hidden Obsidian hero is not keyboard focusable on Classic", async ({ page }) => {
    await renderBoard(page, await fixture("mlb-classic-payload.json"));

    await expect(page.locator("#obsidian-hero")).toBeHidden();
    for (let index = 0; index < 30; index += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.id)).not.toBe("obsidian-hero");
    }
  });
});
