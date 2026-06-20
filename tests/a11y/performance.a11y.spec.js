// @ts-check
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const VISIBILITY = { public_sports: ["mlb"], min_visible_dates: { mlb: "2026-04-29" } };

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
        features: { performance_summary: true, mlb_board_basic: true },
      }),
    });
  });
  await page.route("**/api/v1/performance/**", async (route) => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname.endsWith("/filters")) {
      body = {
        sports: ["mlb"],
        markets: ["h2h", "totals"],
        bookmakers: [{ key: "draftkings", title: "DraftKings" }, { key: "fanduel", title: "FanDuel" }],
        confidence_buckets: [{ key: "high", label: "High" }],
        model_probability_buckets: ["55-60"],
        wise_choice_buckets: [{ key: "pass_8_14", label: "Playable" }],
        model_versions: ["2026.06"],
        model_families: ["classic_mlb", "obsidian_steed"],
        prediction_modes: ["probable"],
        performance_scopes: ["official", "tracking"],
        visibility: VISIBILITY,
      };
    } else if (url.pathname.endsWith("/summary")) {
      body = {
        summary: {
          pick_count: 4,
          settled_count: 3,
          pending_count: 1,
          record: "2-1-0",
          units_won: 1.4,
          units_risked: 3,
          roi: 0.466,
          clv_coverage: 0.67,
          clv_count: 2,
          avg_clv_prob_delta: 0.01,
        },
        visibility: VISIBILITY,
      };
    } else if (url.pathname.endsWith("/breakdown")) {
      body = url.searchParams.get("group_by") === "date"
        ? { group_by: "date", groups: [{ group_value: "2026-06-19", units_won: 1.4, units_risked: 3, settled_count: 3, record: "2-1-0" }], visibility: VISIBILITY }
        : { group_by: "wise_choice_bucket", groups: [{ group_key: "pass_8_14", group_value: "Playable", pick_count: 4, record: "2-1-0", units_won: 1.4, units_risked: 3, roi: 0.466, clv_coverage: 0.67, avg_clv_prob_delta: 0.01 }], visibility: VISIBILITY };
    } else if (url.pathname.endsWith("/picks")) {
      body = {
        picks: [{
          target_date: "2026-06-20",
          model_family: "classic_mlb",
          model_version: "2026.06",
          game_label: "Reds at Yankees",
          market_key: "h2h",
          outcome_name: "Reds",
          bookmaker_title: "DraftKings",
          price_american: 168,
          model_probability: 0.714,
          wise_choice_bucket_key: "pass_8_14",
          kelly_fraction: 0.02,
          ev_rating_label: "Positive EV",
          confidence_bucket_label: "High",
          is_settled: false,
        }],
        visibility: VISIBILITY,
      };
    } else if (url.pathname.endsWith("/book-comparison")) {
      body = {
        comparison_mode: "common_pick_set",
        common_pick_count: 2,
        rows: [{ pricing_bookmaker_title: "DraftKings", pick_count: 2, record: "1-1-0", units_risked: 2, units_won: 0.4, roi: 0.2, avg_price_decimal: 1.95, best_price_count: 1, best_price_rate: 0.5, source_book_count: 1 }],
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
}

async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe("performance accessibility", () => {
  test("default admin page has no automated WCAG A/AA violations", async ({ page }) => {
    await renderPerformance(page);
    await expectNoA11yViolations(page);
  });

  test("advanced filters and pick details remain accessible", async ({ page }) => {
    await renderPerformance(page);
    await page.locator("#advanced-filter-toggle").click();
    await page.locator(".pick-details-toggle").first().click();
    await expect(page.locator("#advanced-filters")).toBeVisible();
    await expect(page.locator(".pick-detail-row").first()).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
