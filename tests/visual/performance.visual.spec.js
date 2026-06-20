// @ts-check
import { expect, test } from "@playwright/test";

const VISIBILITY = {
  public_sports: ["mlb"],
  min_visible_dates: { mlb: "2026-04-29" },
  floor_applied: true,
  start_date_applied: "2026-04-29",
};

const FILTERS = {
  sports: ["mlb"],
  markets: ["h2h", "spreads", "totals", "nrfi_yrfi"],
  bookmakers: [
    { key: "draftkings", title: "DraftKings" },
    { key: "fanduel", title: "FanDuel" },
    { key: "betmgm", title: "BetMGM" },
    { key: "espnbet", title: "ESPN BET" },
  ],
  confidence_buckets: [{ key: "high", label: "High" }],
  model_probability_buckets: ["50-55", "55-60"],
  wise_choice_buckets: [
    { key: "pass_8_14", label: "Playable" },
    { key: "medium_high_14_20", label: "Strong" },
  ],
  model_versions: ["2026.06"],
  model_families: ["classic_mlb", "obsidian_steed"],
  prediction_modes: ["probable"],
  performance_scopes: ["official", "tracking"],
  visibility: VISIBILITY,
};

const SUMMARY = {
  pick_count: 44,
  settled_count: 38,
  pending_count: 6,
  record: "21-17-0",
  units_won: 5.72,
  units_risked: 38,
  roi: 0.1505,
  clv_coverage: 0.82,
  clv_count: 31,
  avg_clv_prob_delta: 0.012,
};

const GROUPS = [
  { group_key: "medium_high_14_20", group_value: "Strong", pick_count: 14, settled_count: 14, record: "9-5-0", units_won: 4.2, units_risked: 14, roi: 0.3, clv_coverage: 0.86, avg_clv_prob_delta: 0.018 },
  { group_key: "pass_8_14", group_value: "Playable", pick_count: 18, settled_count: 16, record: "9-7-0", units_won: 1.3, units_risked: 16, roi: 0.081, clv_coverage: 0.75, avg_clv_prob_delta: 0.007 },
  { group_key: "pass_3_8", group_value: "Lean", pick_count: 12, settled_count: 8, record: "3-5-0", units_won: -1.1, units_risked: 8, roi: -0.138, clv_coverage: 0.63, avg_clv_prob_delta: -0.004 },
];

const DATE_GROUPS = [
  { group_value: "2026-05-01", units_won: 0.8, units_risked: 2, settled_count: 2, record: "2-0-0" },
  { group_value: "2026-05-08", units_won: -1, units_risked: 3, settled_count: 3, record: "1-2-0" },
  { group_value: "2026-05-15", units_won: 2.4, units_risked: 4, settled_count: 4, record: "3-1-0" },
  { group_value: "2026-05-22", units_won: 1.1, units_risked: 5, settled_count: 5, record: "3-2-0" },
  { group_value: "2026-05-29", units_won: 2.42, units_risked: 6, settled_count: 6, record: "4-2-0" },
];

const PICKS = [
  {
    target_date: "2026-06-20",
    model_family: "classic_mlb",
    model_version: "2026.06",
    game_label: "Cincinnati Reds at New York Yankees",
    market_key: "h2h",
    outcome_name: "Reds",
    bookmaker_title: "DraftKings",
    price_american: 168,
    model_probability: 0.714,
    wise_choice_bucket_key: "medium_high_14_20",
    kelly_fraction: 0.032,
    ev_rating_label: "Positive EV",
    confidence_bucket_label: "High",
    is_settled: false,
  },
  {
    target_date: "2026-06-19",
    model_family: "classic_mlb",
    model_version: "2026.06",
    game_label: "Chicago White Sox at Detroit Tigers",
    market_key: "totals",
    outcome_name: "Under",
    line: 9.5,
    bookmaker_title: "FanDuel",
    price_american: -110,
    model_probability: 0.57,
    wise_choice_bucket_key: "pass_8_14",
    kelly_fraction: 0.018,
    ev_rating_label: "Playable",
    confidence_bucket_label: "Medium",
    is_settled: true,
    result_status: "win",
    units_won: 0.91,
    clv_prob_delta: 0.018,
  },
];

async function mockPerformance(page) {
  await page.addInitScript(() => {
    Date.now = () => new Date("2026-06-20T12:00:00-05:00").valueOf();
  });

  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: { email: "admin@example.test", display_name: "Admin User" },
        plan: "admin",
        features: { performance_summary: true, mlb_board_basic: true },
      }),
    });
  });

  await page.route("**/api/v1/performance/**", async (route) => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname.endsWith("/filters")) {
      body = FILTERS;
    } else if (url.pathname.endsWith("/summary")) {
      body = { summary: SUMMARY, visibility: VISIBILITY };
    } else if (url.pathname.endsWith("/breakdown")) {
      body = url.searchParams.get("group_by") === "date"
        ? { group_by: "date", groups: DATE_GROUPS, visibility: VISIBILITY }
        : { group_by: "wise_choice_bucket", groups: GROUPS, visibility: VISIBILITY };
    } else if (url.pathname.endsWith("/picks")) {
      body = { picks: PICKS, visibility: VISIBILITY };
    } else if (url.pathname.endsWith("/book-comparison")) {
      body = {
        comparison_mode: "common_pick_set",
        common_pick_count: 24,
        rows: [
          { pricing_bookmaker_key: "draftkings", pricing_bookmaker_title: "DraftKings", pick_count: 24, record: "14-10-0", units_risked: 24, units_won: 3.4, roi: 0.142, avg_price_decimal: 1.94, best_price_count: 9, best_price_rate: 0.38, source_book_count: 12 },
          { pricing_bookmaker_key: "fanduel", pricing_bookmaker_title: "FanDuel", pick_count: 24, record: "13-11-0", units_risked: 24, units_won: 1.8, roi: 0.075, avg_price_decimal: 1.91, best_price_count: 7, best_price_rate: 0.29, source_book_count: 8 },
        ],
        visibility: VISIBILITY,
      };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function renderPerformance(page) {
  await mockPerformance(page);
  await page.goto("/performance/");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#kpi-grid")).toBeVisible();
  await expect(page.locator("#chart-container svg")).toBeVisible();
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

test.describe("performance visual baselines", () => {
  test("desktop", async ({ page }) => {
    await renderPerformance(page);
    await expect(page.locator("#breakdown-heading")).toHaveText("By Wise Tier");
    await expect(page).toHaveScreenshot("performance-desktop.png", { fullPage: true });
  });

  test("mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderPerformance(page);
    await expect(page.locator("#breakdown-cards .performance-data-card").first()).toBeVisible();
    await expect(page).toHaveScreenshot("performance-mobile.png", { fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
