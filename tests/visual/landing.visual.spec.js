// @ts-check
import { expect, test } from "@playwright/test";

function landingSnapshot() {
  return {
    sport: "mlb",
    timezone: "America/Chicago",
    generated_at: "2026-06-22T07:05:02-05:00",
    board: {
      target_date: "2026-06-18",
      model_family: "classic_mlb",
      model_display_name: "Classic MLB",
      game_count: 15,
      available: true,
      featured: {
        game_pk: 777001,
        game_label: "Blue Jays at Red Sox",
        commence_time: "12:35 PM CDT",
        venue: "Fenway Park",
        away: {
          team_name: "Toronto Blue Jays",
          short_name: "Blue Jays",
          abbr: "TOR",
          win_probability: 0.459,
          win_probability_text: "45.9%",
          moneyline_american: 106,
          moneyline_text: "+106",
        },
        home: {
          team_name: "Boston Red Sox",
          short_name: "Red Sox",
          abbr: "BOS",
          win_probability: 0.541,
          win_probability_text: "54.1%",
          moneyline_american: -124,
          moneyline_text: "-124",
        },
        pick: {
          selection_text: "Red Sox -1.5",
          sportsbook: "FanDuel",
          price_american: -205,
          price_text: "-205",
          model_probability: 0.734,
          model_probability_text: "73.4%",
          probability_edge: 0.091,
          edge_text: "+9.1%",
          expected_value_per_unit: 0.09,
          ev_text: "+0.09u",
          wise_choice_score: 18.4,
          wise_choice_status: "Strong",
          is_official: true,
        },
      },
    },
    results: {
      target_date: "2026-06-21",
      is_yesterday: true,
      fully_settled: true,
      model_family: "classic_mlb",
      summary: {
        pick_count: 8,
        settled_count: 8,
        wins: 6,
        losses: 2,
        pushes: 0,
        voids: 0,
        record: "6-2",
        units_risked: 23.05,
        units_won: 4.31,
        roi: 0.187,
        roi_pct: 18.7,
      },
      highlights: [
        {
          published_pick_id: 1234,
          game_label: "Yankees at Orioles",
          selection_text: "Yankees ML",
          bookmaker_key: "draftkings",
          bookmaker_title: "DraftKings",
          bookmaker_abbr: "DK",
          price_american: -138,
          price_text: "-138",
          result_status: "win",
          units_won: 0.72,
        },
        {
          published_pick_id: 1235,
          game_label: "Brewers at Cubs",
          selection_text: "Brewers -1.5",
          bookmaker_key: "fanduel",
          bookmaker_title: "FanDuel",
          bookmaker_abbr: "FD",
          price_american: 145,
          price_text: "+145",
          result_status: "win",
          units_won: 1.45,
        },
        {
          published_pick_id: 1236,
          game_label: "Mariners at Athletics",
          selection_text: "Under 8.5",
          bookmaker_key: "betmgm",
          bookmaker_title: "BetMGM",
          bookmaker_abbr: "MGM",
          price_american: -105,
          price_text: "-105",
          result_status: "win",
          units_won: 0.95,
        },
        {
          published_pick_id: 1237,
          game_label: "Mets at Phillies",
          selection_text: "Mets +1.5",
          bookmaker_key: "espnbet",
          bookmaker_title: "ESPN BET",
          bookmaker_abbr: "ESPN BET",
          price_american: -110,
          price_text: "-110",
          result_status: "loss",
          units_won: -1,
        },
      ],
    },
  };
}

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

  await page.route("**/api/v1/public/landing/mlb", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(landingSnapshot()),
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
    await page.addStyleTag({ content: "html, body { min-height: 1903px; }" });
    await expect(page.locator("#landing-preview")).toHaveAttribute("data-state", "ready");
    await expect(page.locator("#proof")).toBeVisible();
    await expect(page.locator(".landing-preview__label")).toHaveText("Official");
    await expect(page.getByLabel("NHL off-season board")).toContainText("Off-season");
    await expect(page.locator('a[href="/nhl/"]')).toHaveCount(0);
    await expect(page).toHaveScreenshot("landing-desktop.png", {
      fullPage: true,
      maxDiffPixels: 35_000,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockLanding(page);
    await page.goto("/");
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await expect(page.locator("#landing-preview")).toHaveAttribute("data-state", "ready");
    await expect(page.locator("#proof")).toBeVisible();
    await expect(page.locator(".landing-preview__label")).toHaveText("Official");
    await expect(page.getByLabel("NHL off-season board")).toContainText("Off-season");
    await expect(page.locator('a[href="/nhl/"]')).toHaveCount(0);
    await expect(page).toHaveScreenshot("landing-mobile.png", { fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
