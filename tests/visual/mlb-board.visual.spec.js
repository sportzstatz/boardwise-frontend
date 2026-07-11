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

async function waitForTeamMarks(page) {
  await page.waitForFunction(() => {
    const marks = [...document.querySelectorAll(".tot-team-logo-mark, .tot-team-mark")];
    return marks.length > 0 && marks.every((mark) => {
      const img = mark.querySelector("img[data-team-logo]");
      const fallback = mark.querySelector(".tot-team-fallback");
      if (!fallback) return false;
      if (!img) return window.getComputedStyle(fallback).display !== "none";
      if (img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0) return true;
      return mark.classList.contains("logo-failed") && window.getComputedStyle(fallback).display !== "none";
    });
  });
}

function collisionPayload(basePayload) {
  const payload = structuredClone(basePayload);
  const official = {
    selection_text: "Cardinals Moneyline",
    label: "Cardinals Moneyline",
    sportsbook: "BookA",
    odds_text: "-125",
    model_probability_text: "52.8%",
    market_probability_text: "50.4%",
    edge_text: "+2.4%",
    ev_text: "+0.04u",
    is_official: true,
  };
  payload.games[0] = {
    ...payload.games[0],
    game_label: "Reds at Cardinals",
    away_team: "Cincinnati Reds",
    home_team: "St. Louis Cardinals",
    away_team_abbr: "CIN",
    home_team_abbr: "STL",
    away_pitcher: "Away Starter",
    home_pitcher: "Home Starter",
    lineup_status_away: "projected",
    lineup_status_home: "confirmed",
    away_win_prob_text: "47.2%",
    home_win_prob_text: "52.8%",
    favorite_team: "St. Louis Cardinals",
    favorite_prob_text: "52.8%",
    best_card_options: { wise_choice: official },
    recommendations: [official],
    market_dropdowns: [
      {
        title: "Money Line",
        market_key: "h2h",
        options: [
          official,
          {
            selection_text: "Cincinnati Reds Moneyline",
            label: "Reds Moneyline",
            sportsbook: "BookA",
            odds_text: "+115",
            model_probability_text: "47.2%",
            market_probability_text: "49.6%",
            edge_text: "-2.4%",
          },
        ],
      },
    ],
  };
  return payload;
}

function freeBoardPayload(basePayload) {
  const payload = structuredClone(basePayload);
  payload.access = {
    level: "preview",
    card_access: "full",
    preview: true,
    full_access: false,
    max_preview_games: 2,
    preview_game_count: payload.games.length,
    required_feature: "mlb_board_advanced",
    upgrade_path: "/pricing/",
  };
  return payload;
}

async function mockBoardPayload(page, payload) {
  const limitedBoard = payload?.access?.level === "preview";
  await page.addInitScript((now) => {
    Date.now = () => now;
  }, FROZEN_NOW);

  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: limitedBoard,
        user: limitedBoard ? { email: "free@example.test", display_name: "Free Member" } : null,
        plan: limitedBoard ? "free" : "guest",
        features: {
          mlb_board_basic: true,
          nhl_board_basic: true,
          mlb_board_advanced: false,
          performance_summary: !limitedBoard,
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
  await waitForTeamMarks(page);
}

test.describe("MLB board visual baselines", () => {
  test("Free complete card", async ({ page }) => {
    await renderBoard(page, freeBoardPayload(await fixture("mlb-game-detail-payload.json")));

    await expect(page.locator(".best-card")).toBeVisible();
    await expect(page.locator(".market-dropdown")).toHaveCount(4);
    await expect(page.locator("#date-form")).toBeHidden();
    await expect(page.locator("#model-selector")).toBeHidden();
    await expect(page.locator(".tot-detail-link")).toHaveAttribute("href", "/mlb/game/?game_pk=777001");
    await expect(page.locator(".preview-upgrade-copy")).toContainText("two complete MLB cards daily");
    await expect(page).toHaveScreenshot("mlb-free-complete-card.png", { fullPage: true });
  });

  test("Classic", async ({ page }) => {
    await renderBoard(page, await fixture("mlb-classic-payload.json"));

    await expect(page.locator("#obsidian-hero")).toBeHidden();
    await expect(page.locator("body")).not.toHaveClass(/obsidian-treatment/);
    await expect(page.locator(".tracker-market-dropdown")).toHaveCount(0);
    await expect(page.locator(".market-summary-selection", { hasText: "Money Line" })).toBeVisible();
    await expect(page.locator(".market-summary-selection", { hasText: "Total Runs" })).toBeVisible();

    await expect(page).toHaveScreenshot("mlb-classic.png", { fullPage: true });
  });

  test("Classic mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderBoard(page, await fixture("mlb-classic-payload.json"));

    await expect(page.locator(".tot-mobile-bar").first()).toBeVisible();
    await expect(page.locator(".best-card")).toBeVisible();
    await expect(page.locator(".market-summary-head")).toBeHidden();
    await expect(page.locator(".market-summary-selection").first()).toBeVisible();
    await expect(page.locator(".market-summary-row").first().locator(".market-summary-call")).toBeHidden();
    await expect(page.locator(".market-summary-row").first().locator(".market-summary-edge")).toBeVisible();
    await page.locator(".market-dropdown:not(.tracker-market-dropdown)").first().evaluate((dropdown) => {
      dropdown.setAttribute("open", "");
    });
    await expect(page.locator(".market-dropdown:not(.tracker-market-dropdown) .option-badge.official").first()).toBeVisible();
    await expect(page).toHaveScreenshot("mlb-classic-mobile.png", { fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("Color-collision mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderBoard(page, collisionPayload(await fixture("mlb-classic-payload.json")));

    await expect(page.locator(".tot-side.away")).toHaveAttribute("style", /--team-fill:#000000/);
    await expect(page.locator(".tot-side.home")).toHaveAttribute("style", /--team-fill:#C41E3A/);
    await expect(page.locator(".market-summary-row").first().locator(".market-summary-call")).toBeHidden();
    await expect(page.locator(".market-summary-row").first().locator(".market-summary-edge")).toBeVisible();
    await expect(page).toHaveScreenshot("mlb-color-collision-mobile.png", { fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
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
    await expect(page.locator("#obsidian-hero")).not.toContainText("Next-generation MLB model powering today's board.");
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
    await expect(page.locator(".tracker-market-dropdown .market-summary-selection", { hasText: "1st Inning O/U" })).toHaveCount(0);
    await expect(page.locator(".tracker-market-dropdown .market-summary-selection", { hasText: "NRFI/YRFI" })).toBeVisible();
    await expect(page.getByText("Tracking Only").first()).toBeVisible();
    await expect(page.getByText("Tracking-only market. Not included in official record or public performance.").first()).toBeVisible();
    await expect(page.locator(".best-card")).not.toContainText("YRFI");

    await expect(page).toHaveScreenshot("mlb-tracker-market-present.png", { fullPage: true });
  });

  test("Tracker-market-present mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderBoard(page, await fixture("mlb-tracker-market-present-payload.json"));

    await expect(page.locator(".tot-mobile-bar").first()).toBeVisible();
    await expect(page.locator(".tracker-market-dropdown")).toHaveCount(1);
    await page.locator(".tracker-market-dropdown").evaluateAll((dropdowns) => {
      for (const dropdown of dropdowns) dropdown.setAttribute("open", "");
    });
    await expect(page.getByText("Tracking Only").first()).toBeVisible();
    await expect(page).toHaveScreenshot("mlb-tracker-market-present-mobile.png", { fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("Classic board has no horizontal overflow across required widths", async ({ page }) => {
    for (const width of [320, 375, 390, 430, 720, 1024, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await renderBoard(page, await fixture("mlb-classic-payload.json"));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, `overflow at ${width}px`).toBe(false);
    }
  });
});
