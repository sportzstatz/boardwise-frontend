// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../fixtures");
const FROZEN_NOW = new Date("2026-05-29T12:00:00-05:00").valueOf();

async function fixture(name) {
  return JSON.parse(await readFile(resolve(FIXTURE_DIR, name), "utf8"));
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

async function renderBoard(page, payload) {
  await mockBoardPayload(page, payload);
  await page.goto("/mlb/");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#games")).toBeVisible();
  await expect(page.locator(".tile")).toHaveCount(1);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await waitForTeamMarks(page);
}

async function mockLandingPage(page) {
  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false, user: null, plan: "guest", features: {} }),
    });
  });
  await page.route("**/api/v1/public/landing/mlb", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
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
              moneyline_text: "+106",
            },
            home: {
              team_name: "Boston Red Sox",
              short_name: "Red Sox",
              abbr: "BOS",
              win_probability: 0.541,
              win_probability_text: "54.1%",
              moneyline_text: "-124",
            },
            pick: {
              selection_text: "Red Sox -1.5",
              sportsbook: "FanDuel",
              price_text: "-205",
              model_probability: 0.734,
              model_probability_text: "73.4%",
              probability_edge: 0.091,
              edge_text: "+9.1%",
              expected_value_per_unit: 0.09,
              ev_text: "+0.09u",
              is_official: true,
            },
          },
        },
        results: {
          target_date: "2026-06-21",
          is_yesterday: true,
          fully_settled: true,
          model_family: "classic_mlb",
          summary: { record: "6-2", units_won: 4.31, roi: 0.187 },
          highlights: [{
            published_pick_id: 1234,
            game_label: "Yankees at Orioles",
            selection_text: "Yankees ML",
            bookmaker_abbr: "DK",
            price_text: "-138",
            result_status: "win",
            units_won: 0.72,
          }],
        },
      }),
    });
  });
}

async function mockLoginPage(page) {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: "window.turnstile = { reset() {} };" });
  });
  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false, user: null, plan: "guest", features: {} }),
    });
  });
}

async function mockPerformancePage(page) {
  const visibility = { public_sports: ["mlb"], min_visible_dates: { mlb: "2026-04-29" } };
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
        confidence_buckets: [],
        model_probability_buckets: [],
        wise_choice_buckets: [{ key: "pass_8_14", label: "Playable" }],
        model_versions: ["2026.06"],
        model_families: ["classic_mlb", "obsidian_steed"],
        prediction_modes: ["probable"],
        performance_scopes: ["official", "tracking"],
        visibility,
      };
    } else if (url.pathname.endsWith("/summary")) {
      body = {
        summary: {
          pick_count: 5,
          settled_count: 4,
          pending_count: 1,
          record: "3-1-0",
          units_won: 2.1,
          units_risked: 4,
          roi: 0.525,
          clv_coverage: 0.5,
          clv_count: 2,
          avg_clv_prob_delta: 0.012,
        },
        visibility,
      };
    } else if (url.pathname.endsWith("/breakdown")) {
      body = url.searchParams.get("group_by") === "date"
        ? { group_by: "date", groups: [{ group_value: "2026-06-19", units_won: 2.1, units_risked: 4, settled_count: 4, record: "3-1-0" }], visibility }
        : { group_by: "wise_choice_bucket", groups: [{ group_key: "pass_8_14", group_value: "Playable", pick_count: 5, record: "3-1-0", units_won: 2.1, units_risked: 4, roi: 0.525, clv_coverage: 0.5, avg_clv_prob_delta: 0.012 }], visibility };
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
        visibility,
      };
    } else if (url.pathname.endsWith("/book-comparison")) {
      body = {
        comparison_mode: "common_pick_set",
        common_pick_count: 2,
        rows: [{ pricing_bookmaker_title: "DraftKings", pick_count: 2, record: "1-1-0", units_risked: 2, units_won: 0.4, roi: 0.2, avg_price_decimal: 1.95, best_price_count: 1, best_price_rate: 0.5, source_book_count: 1 }],
        visibility,
      };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function mockAccountPage(page) {
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

test.describe("MLB mobile WebKit layout", () => {
  test("keeps market summary columns separated and direct team logos visible", async ({ page }) => {
    await renderBoard(page, await fixture("mlb-classic-payload.json"));

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const summary = page.locator(".market-dropdown:not(.tracker-market-dropdown) .market-summary-row").first();
    await expect(summary).toBeVisible();
    await expect(summary.locator(".market-summary-call")).toBeHidden();
    await expect(summary.locator(".market-summary-model")).toBeHidden();

    const boxes = await summary.evaluate((row) => {
      const selection = row.querySelector(".market-summary-selection")?.getBoundingClientRect();
      const edge = row.querySelector(".market-summary-edge")?.getBoundingClientRect();
      const chevron = row.querySelector(".market-summary-chevron")?.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      return {
        selection: selection && { left: selection.left, right: selection.right },
        edge: edge && { left: edge.left, right: edge.right },
        chevron: chevron && { left: chevron.left, right: chevron.right },
        row: { left: rowBox.left, right: rowBox.right },
      };
    });

    expect(boxes.selection).not.toBeNull();
    expect(boxes.edge).not.toBeNull();
    expect(boxes.chevron).not.toBeNull();
    expect(boxes.selection.right).toBeLessThanOrEqual(boxes.edge.left + 0.5);
    expect(boxes.edge.right).toBeLessThanOrEqual(boxes.chevron.left + 0.5);
    expect(boxes.edge.left).toBeGreaterThanOrEqual(boxes.row.left);
    expect(boxes.edge.right).toBeLessThanOrEqual(boxes.row.right);

    await summary.click();
    await expect(summary.locator("xpath=..").locator(".option-badge.official").first()).toBeVisible();

    await expect(page.locator(".tot-team-mark.has-logo")).toHaveCount(0);

    const logoMetrics = await page.locator(".tot-team-logo-mark").evaluateAll((marks) => marks.map((mark) => {
      const img = mark.querySelector("img[data-team-logo]");
      const markBox = mark.getBoundingClientRect();
      const imgBox = img instanceof HTMLImageElement ? img.getBoundingClientRect() : null;
      return {
        className: mark.className,
        markWidth: markBox.width,
        markHeight: markBox.height,
        imgWidth: imgBox?.width || 0,
        imgHeight: imgBox?.height || 0,
        logoLoaded: img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0,
      };
    }));

    expect(logoMetrics.length).toBeGreaterThan(0);
    for (const metric of logoMetrics) {
      expect(metric.className).not.toContain("tot-team-mark");
      expect(metric.className).not.toContain("has-logo");
      expect(metric.logoLoaded).toBe(true);
      expect(metric.markWidth).toBeGreaterThanOrEqual(120);
      expect(metric.markHeight).toBeGreaterThanOrEqual(84);
      expect(metric.imgWidth).toBeGreaterThanOrEqual(120);
      expect(metric.imgHeight).toBeGreaterThanOrEqual(84);
    }

    const markFailures = await page.locator(".tot-team-logo-mark, .tot-team-mark").evaluateAll((marks) => marks.map((mark) => {
      const img = mark.querySelector("img[data-team-logo]");
      const fallback = mark.querySelector(".tot-team-fallback");
      const fallbackVisible = fallback ? window.getComputedStyle(fallback).display !== "none" : false;
      const logoLoaded = img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
      return {
        empty: !logoLoaded && !fallbackVisible,
        failedWithoutFallback: img instanceof HTMLImageElement && img.complete && img.naturalWidth === 0 && !mark.classList.contains("logo-failed"),
      };
    }).filter((result) => result.empty || result.failedWithoutFallback));
    expect(markFailures).toEqual([]);
  });

  test("landing redesign has no horizontal overflow and keeps live results usable", async ({ page }) => {
    await mockLandingPage(page);
    await page.goto("/");
    await expect(page.locator("#landing-preview")).toHaveAttribute("data-state", "ready");
    await expect(page.locator("#proof")).toBeVisible();
    await expect(page.getByLabel("NHL off-season board")).toContainText("Off-season");
    await expect(page.locator('a[href="/nhl/"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const previewBox = await page.locator("#landing-preview .landing-preview").boundingBox();
    expect(previewBox).not.toBeNull();
    expect(previewBox.x).toBeGreaterThanOrEqual(0);
    expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(390);
    await expect(page.locator(".landing-result-card").first()).toBeVisible();
  });

  test("login redesign keeps form first and Turnstile inside the card", async ({ page }) => {
    await mockLoginPage(page);
    await page.goto("/login/");
    await expect(page.locator("#login-form")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const boxes = await page.evaluate(() => {
      const form = document.querySelector(".login-form-panel")?.getBoundingClientRect();
      const value = document.querySelector(".login-value-panel")?.getBoundingClientRect();
      const turnstile = document.querySelector(".login-turnstile")?.getBoundingClientRect();
      const card = document.querySelector(".login-card")?.getBoundingClientRect();
      return {
        formTop: form?.top || 0,
        valueTop: value?.top || 0,
        turnstileLeft: turnstile?.left || 0,
        turnstileRight: turnstile?.right || 0,
        cardLeft: card?.left || 0,
        cardRight: card?.right || 0,
      };
    });
    expect(boxes.formTop).toBeLessThan(boxes.valueTop);
    expect(boxes.turnstileLeft).toBeGreaterThanOrEqual(boxes.cardLeft);
    expect(boxes.turnstileRight).toBeLessThanOrEqual(boxes.cardRight);
  });

  test("performance redesign keeps banner, filters, and cards usable", async ({ page }) => {
    await mockPerformancePage(page);
    await page.goto("/performance/");
    await expect(page.locator("#loading")).toBeHidden();
    await expect(page.locator(".bw-app-banner")).toBeVisible();
    await expect(page.locator("#kpi-grid")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.locator("#advanced-filter-toggle").click();
    await expect(page.locator("#advanced-filters")).toBeVisible();
    await expect(page.locator("#f-start")).toBeVisible();
    await expect(page.locator("#breakdown-cards .performance-data-card").first()).toBeVisible();
    await expect(page.locator("#picks-cards .performance-data-card").first()).toBeVisible();
  });

  test("account redesign keeps the profile and access cards usable", async ({ page }) => {
    await mockAccountPage(page);
    await page.goto("/account/");
    await expect(page.locator(".bw-app-banner")).toBeVisible();
    await expect(page.locator(".bw-footer")).toHaveCount(1);
    await expect(page.locator("#feature-list")).toHaveCount(0);
    await expect(page.locator("#account-status")).toContainText("Signed in as Admin User");
    await expect(page.locator("#account-name")).toHaveText("Admin User");
    await expect(page.locator(".account-identity-card")).toBeVisible();
    await expect(page.locator('[data-access-card="mlb"]')).toBeVisible();
    await expect(page.locator("[data-access-card]")).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const boxes = await page.evaluate(() => {
      const card = document.querySelector('[data-access-card="mlb"]')?.getBoundingClientRect();
      const action = document.querySelector('[data-access-card="mlb"] .account-access-action')?.getBoundingClientRect();
      return {
        cardLeft: card?.left || 0,
        cardRight: card?.right || 0,
        actionLeft: action?.left || 0,
        actionRight: action?.right || 0,
      };
    });
    expect(boxes.cardLeft).toBeGreaterThanOrEqual(0);
    expect(boxes.cardRight).toBeLessThanOrEqual(390);
    expect(boxes.actionLeft).toBeGreaterThanOrEqual(boxes.cardLeft);
    expect(boxes.actionRight).toBeLessThanOrEqual(boxes.cardRight);
  });
});
