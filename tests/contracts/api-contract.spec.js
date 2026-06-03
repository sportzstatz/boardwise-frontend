// @ts-check
import { expect, test } from "@playwright/test";
import {
  expectArray,
  expectBoolean,
  expectJsonResponse,
  expectNumberLike,
  expectPlainObject,
  expectString,
  expectVisibilityIfPresent,
} from "./contract-helpers.js";

const SPORT = process.env.BOARDWISE_CONTRACT_SPORT || "mlb";

function performanceQuery(overrides = {}) {
  return new URLSearchParams({
    sport: SPORT,
    official_only: "true",
    settled_only: "false",
    ...overrides,
  }).toString();
}

test.describe("BoardWise public API contract", () => {
  test("GET /api/v1/me returns guest/auth state shape", async ({ request }) => {
    const response = await request.get("/api/v1/me");
    const body = await expectJsonResponse(response, "/api/v1/me");

    expectBoolean(body.authenticated, "me.authenticated");
    expectString(body.plan, "me.plan");
    expectPlainObject(body.features, "me.features");

    expectBoolean(body.features.mlb_board_basic, "me.features.mlb_board_basic");
    expectBoolean(body.features.nhl_board_basic, "me.features.nhl_board_basic");
    expectBoolean(
      body.features.performance_summary,
      "me.features.performance_summary"
    );

    if (body.authenticated === false) {
      expect(body.user, "guest user should be null").toBeNull();
    }
  });

  for (const sport of ["mlb", "nhl"]) {
    test(`GET /api/v1/boards/${sport}/current returns board payload shape`, async ({
      request,
    }) => {
      const response = await request.get(`/api/v1/boards/${sport}/current`);
      const body = await expectJsonResponse(response, `${sport} current board`);

      expectArray(body.games, `${sport}.games`);
      expectVisibilityIfPresent(body, `${sport} board`);

      if (
        "game_count" in body &&
        body.game_count !== null &&
        body.game_count !== undefined
      ) {
        expectNumberLike(body.game_count, `${sport}.game_count`);
      }

      if (
        "target_date" in body &&
        body.target_date !== null &&
        body.target_date !== undefined
      ) {
        expectString(body.target_date, `${sport}.target_date`);
      }

      if (body.games.length > 0) {
        expectPlainObject(body.games[0], `${sport}.games[0]`);
      }
    });
  }

  test("GET /api/v1/performance/filters returns dropdown/filter contract", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/performance/filters?sport=${SPORT}`
    );
    const body = await expectJsonResponse(response, "performance filters");

    expectArray(body.markets, "filters.markets");
    expectArray(body.bookmakers, "filters.bookmakers");
    expectArray(body.confidence_buckets, "filters.confidence_buckets");
    expectArray(
      body.model_probability_buckets,
      "filters.model_probability_buckets"
    );
    expectArray(body.wise_choice_buckets, "filters.wise_choice_buckets");
    expectArray(body.model_versions, "filters.model_versions");
    expectArray(body.prediction_modes, "filters.prediction_modes");
    if ("performance_scopes" in body) {
      expectArray(body.performance_scopes, "filters.performance_scopes");
    }
    expectVisibilityIfPresent(body, "performance filters");
  });

  test("GET /api/v1/performance/filters supports tracking scope contract", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/performance/filters?sport=mlb&performance_scope=tracking`
    );
    const body = await expectJsonResponse(response, "tracking performance filters");

    expectArray(body.markets, "tracking filters.markets");
    if ("performance_scopes" in body) {
      expectArray(body.performance_scopes, "tracking filters.performance_scopes");
      expect(body.performance_scopes).toContain("official");
      expect(body.performance_scopes).toContain("tracking");
    }
    expectVisibilityIfPresent(body, "tracking performance filters");

    if (body.markets.length > 0) {
      // The live API may not expose the tracking scope yet while frontend PR
      // checks run. Once API is deployed, tracking filters should include
      // NRFI/YRFI and continue hiding the internal first-inning total market.
      if ("performance_scopes" in body) {
        expect(body.markets).toContain("nrfi_yrfi");
      }
      expect(body.markets).not.toContain("first_inning_total");
    }
  });

  test("GET /api/v1/performance/summary returns KPI contract", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/performance/summary?${performanceQuery()}`
    );
    const body = await expectJsonResponse(response, "performance summary");

    expectPlainObject(body.summary, "summary.summary");
    expectNumberLike(body.summary.pick_count, "summary.pick_count");
    expectNumberLike(body.summary.settled_count, "summary.settled_count");
    expectNumberLike(body.summary.pending_count, "summary.pending_count");
    expectVisibilityIfPresent(body, "performance summary");

    if (body.summary.record !== null && body.summary.record !== undefined) {
      expectString(body.summary.record, "summary.record");
    }
  });

  test("GET /api/v1/performance/summary supports tracking KPI contract", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/performance/summary?${performanceQuery({
        performance_scope: "tracking",
        model_family: "obsidian_steed",
        official_only: "false",
        settled_only: "false",
      })}`
    );
    const body = await expectJsonResponse(response, "tracking performance summary");

    expectPlainObject(body.summary, "tracking summary.summary");
    expectNumberLike(body.summary.pick_count, "tracking summary.pick_count");
    expectNumberLike(body.summary.settled_count, "tracking summary.settled_count");
    expectNumberLike(body.summary.pending_count, "tracking summary.pending_count");
    expectVisibilityIfPresent(body, "tracking performance summary");
  });

  test("GET /api/v1/performance/breakdown returns grouped-row contract", async ({
    request,
  }) => {
    const qs = performanceQuery({
      group_by: "wise_choice_bucket",
      settled_only: "true",
    });

    const response = await request.get(`/api/v1/performance/breakdown?${qs}`);
    const body = await expectJsonResponse(response, "performance breakdown");

    expectString(body.group_by, "breakdown.group_by");
    expectArray(body.groups, "breakdown.groups");
    expectVisibilityIfPresent(body, "performance breakdown");

    if (body.groups.length > 0) {
      const row = body.groups[0];
      expectPlainObject(row, "breakdown.groups[0]");
      expectNumberLike(row.pick_count, "breakdown.groups[0].pick_count");

      if (row.record !== null && row.record !== undefined) {
        expectString(row.record, "breakdown.groups[0].record");
      }
    }
  });

  test("GET /api/v1/performance/picks returns recent-picks contract", async ({
    request,
  }) => {
    const qs = performanceQuery({
      limit: "10",
      active_only: "true",
      dedupe: "true",
      settled_only: "false",
    });

    const response = await request.get(`/api/v1/performance/picks?${qs}`);
    const body = await expectJsonResponse(response, "performance picks");

    expectArray(body.picks, "picks.picks");
    expectVisibilityIfPresent(body, "performance picks");

    if (body.picks.length > 0) {
      const pick = body.picks[0];
      expectPlainObject(pick, "picks.picks[0]");

      if (pick.target_date !== null && pick.target_date !== undefined) {
        expectString(pick.target_date, "picks.picks[0].target_date");
      }

      if (pick.market_key !== null && pick.market_key !== undefined) {
        expectString(pick.market_key, "picks.picks[0].market_key");
      }
    }
  });

  test("GET /api/v1/performance/book-comparison returns book-comparison contract", async ({
    request,
  }) => {
    const qs = performanceQuery({
      pricing_bookmaker_keys: "draftkings,fanduel,betmgm,espnbet",
      require_all_books: "false",
    });

    const response = await request.get(
      `/api/v1/performance/book-comparison?${qs}`
    );
    const body = await expectJsonResponse(response, "book comparison");

    expectArray(body.rows, "bookComparison.rows");
    expectString(body.comparison_mode, "bookComparison.comparison_mode");
    expectVisibilityIfPresent(body, "book comparison");

    if (
      body.common_pick_count !== null &&
      body.common_pick_count !== undefined
    ) {
      expectNumberLike(
        body.common_pick_count,
        "bookComparison.common_pick_count"
      );
    }

    if (body.rows.length > 0) {
      const row = body.rows[0];
      expectPlainObject(row, "bookComparison.rows[0]");
      expectNumberLike(row.pick_count, "bookComparison.rows[0].pick_count");

      if (
        row.pricing_bookmaker_key !== null &&
        row.pricing_bookmaker_key !== undefined
      ) {
        expectString(
          row.pricing_bookmaker_key,
          "bookComparison.rows[0].pricing_bookmaker_key"
        );
      }
    }
  });
});
