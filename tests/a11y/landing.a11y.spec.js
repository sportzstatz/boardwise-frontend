// @ts-check
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function landingSnapshot() {
  return {
    sport: "mlb",
    timezone: "America/Chicago",
    generated_at: "2026-06-22T07:05:02-05:00",
    board: {
      target_date: "2026-06-22",
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
        record: "6-2",
        units_won: 4.31,
        roi: 0.187,
      },
      highlights: [
        {
          published_pick_id: 1234,
          game_label: "Yankees at Orioles",
          selection_text: "Yankees ML",
          bookmaker_abbr: "DK",
          price_text: "-138",
          result_status: "win",
          units_won: 0.72,
        },
        {
          published_pick_id: 1235,
          game_label: "Mets at Phillies",
          selection_text: "Mets +1.5",
          bookmaker_abbr: "FD",
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
        user: authenticated ? { email: "founder@example.test", display_name: "Founder" } : null,
        plan: authenticated ? "founder_beta" : "guest",
        features: {
          mlb_board_basic: mlb,
          performance_summary: false,
        },
      }),
    });
  });
  await page.route("**/api/v1/public/landing/mlb", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(landingSnapshot()) });
  });
  await page.route("**/api/v1/boards/nhl/current", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ games: [] }) });
  });
}

async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function expectLandingSemantics(page) {
  await expect(page.locator("#landing-preview")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#proof")).toBeVisible();
  await expect(page.locator(".landing-results-summary")).toHaveJSProperty("tagName", "DL");
  await expect(page.locator(".landing-board-card__icon[aria-hidden='true']")).toHaveCount(4);
  await expect(page.locator(".landing-preview__bar")).toHaveAttribute("aria-label", /Blue Jays 45\.9%/);
  await expect(page.locator(".landing-result-card__status").first()).toHaveText("Win");
  await expect(page.locator(".landing-result-card__status").nth(1)).toHaveText("Loss");
  const hiddenFocusableCount = await page.locator("[aria-hidden='true'] a, [aria-hidden='true'] button, [aria-hidden='true'] input, [aria-hidden='true'] select, [aria-hidden='true'] textarea, [aria-hidden='true'] [tabindex]:not([tabindex='-1'])").count();
  expect(hiddenFocusableCount).toBe(0);
}

test.describe("landing accessibility", () => {
  test("guest page has no automated WCAG A/AA violations", async ({ page }) => {
    await mockLanding(page);
    await page.goto("/");
    await expectLandingSemantics(page);
    await expectNoA11yViolations(page);
  });

  test("authenticated page has no automated WCAG A/AA violations", async ({ page }) => {
    await mockLanding(page, { authenticated: true, mlb: true });
    await page.goto("/");
    await expect(page.locator("[data-auth-initials]").first()).toHaveText("FO");
    await expectLandingSemantics(page);
    await expectNoA11yViolations(page);
  });
});
