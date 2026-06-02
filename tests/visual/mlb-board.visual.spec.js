// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../fixtures");
const FROZEN_NOW = new Date("2026-05-29T12:00:00-05:00").valueOf();

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
  await expect(page.locator(".tile")).toHaveCount(1);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

test.describe("MLB board visual baselines", () => {
  test("Classic", async ({ page }) => {
    await renderBoard(page, await fixture("mlb-classic-payload.json"));

    await expect(page.locator("#obsidian-hero")).toBeHidden();
    await expect(page.locator("body")).not.toHaveClass(/obsidian-treatment/);
    await expect(page.locator(".tracker-market-dropdown")).toHaveCount(0);
    await expect(page.locator(".market-dropdown .summary-label", { hasText: "Money Line" })).toBeVisible();
    await expect(page.locator(".market-dropdown .summary-label", { hasText: "Total Runs" })).toBeVisible();

    await expect(page).toHaveScreenshot("mlb-classic.png", { fullPage: true });
  });

  test("Obsidian shadow-only", async ({ page }) => {
    await renderBoard(
      page,
      await fixture("mlb-obsidian-shadow-payload.json"),
      "?model=obsidian_steed"
    );

    await expect(page.locator("#obsidian-hero")).toBeVisible();
    await expect(page.locator("#obsidian-hero")).toContainText("Obsidian Steed Shadow");
    await expect(page.locator("body")).toHaveClass(/obsidian-treatment/);
    await expect(page.locator("body")).toHaveAttribute("data-obsidian-variant", "shadow");
    await expect(page.locator("body")).not.toContainText("Next-generation MLB model powering today's board.");

    await expect(page).toHaveScreenshot("mlb-obsidian-shadow.png", { fullPage: true });
  });

  test("Obsidian public", async ({ page }) => {
    await renderBoard(
      page,
      await fixture("mlb-obsidian-public-payload.json"),
      "?model=obsidian_steed"
    );

    await expect(page.locator("#obsidian-hero")).toBeVisible();
    await expect(page.locator("#obsidian-hero")).toContainText("Obsidian Steed");
    await expect(page.locator("#obsidian-hero")).toContainText("Next-generation MLB model powering today's board.");
    await expect(page.locator("body")).toHaveClass(/obsidian-treatment/);
    await expect(page.locator("body")).toHaveAttribute("data-obsidian-variant", "public");
    await expect(page.locator("body")).not.toContainText("Obsidian Steed Shadow");

    await expect(page).toHaveScreenshot("mlb-obsidian-public.png", { fullPage: true });
  });

  test("Tracker-market-present", async ({ page }) => {
    await renderBoard(page, await fixture("mlb-tracker-market-present-payload.json"));

    await expect(page.locator(".tracker-market-dropdown")).toHaveCount(1);
    await page.locator(".tracker-market-dropdown").evaluateAll((dropdowns) => {
      for (const dropdown of dropdowns) dropdown.setAttribute("open", "");
    });
    await expect(page.locator(".tracker-market-dropdown .summary-label", { hasText: "1st Inning O/U" })).toHaveCount(0);
    await expect(page.locator(".tracker-market-dropdown .summary-label", { hasText: "NRFI/YRFI" })).toBeVisible();
    await expect(page.getByText("Tracking Only").first()).toBeVisible();
    await expect(page.getByText("Tracking-only market. Not included in official record or public performance.").first()).toBeVisible();
    await expect(page.locator(".best-card")).not.toContainText("YRFI");

    await expect(page).toHaveScreenshot("mlb-tracker-market-present.png", { fullPage: true });
  });
});
