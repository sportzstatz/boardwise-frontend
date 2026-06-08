// @ts-check
import { expect, test } from "@playwright/test";
import {
  expectArray,
  expectBoolean,
  expectJsonResponse,
  expectNoOperatorLeak,
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

async function expectAdminOnlyPerformanceResponse(response, label) {
  expect(response.status(), `${label} status`).toBe(401);

  const contentType = response.headers()["content-type"] || "";
  expect(
    contentType,
    `${label} should return JSON content-type`
  ).toContain("application/json");

  expect(response.headers()["cache-control"], `${label} cache-control`).toBe(
    "private, no-store, max-age=0"
  );

  const body = await response.json();
  expectPlainObject(body, label);
  expectPlainObject(body.detail, `${label}.detail`);
  expect(body.detail.error, `${label}.detail.error`).toBe(
    "authentication_required"
  );
  expect(body.detail.required_feature, `${label}.detail.required_feature`).toBe(
    "internal_admin"
  );
  expectNoOperatorLeak(body, label);
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

  test("GET /api/v1/performance/filters requires admin auth", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/performance/filters?sport=${SPORT}`
    );
    await expectAdminOnlyPerformanceResponse(response, "performance filters");
  });

  test("GET /api/v1/performance/filters tracking scope requires admin auth", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/performance/filters?sport=mlb&performance_scope=tracking`
    );
    await expectAdminOnlyPerformanceResponse(
      response,
      "tracking performance filters"
    );
  });

  test("GET /api/v1/performance/summary requires admin auth", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/performance/summary?${performanceQuery()}`
    );
    await expectAdminOnlyPerformanceResponse(response, "performance summary");
  });

  test("GET /api/v1/performance/summary tracking scope requires admin auth", async ({
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
    await expectAdminOnlyPerformanceResponse(
      response,
      "tracking performance summary"
    );
  });

  test("GET /api/v1/performance/breakdown requires admin auth", async ({
    request,
  }) => {
    const qs = performanceQuery({
      group_by: "wise_choice_bucket",
      settled_only: "true",
    });

    const response = await request.get(`/api/v1/performance/breakdown?${qs}`);
    await expectAdminOnlyPerformanceResponse(response, "performance breakdown");
  });

  test("GET /api/v1/performance/picks requires admin auth", async ({
    request,
  }) => {
    const qs = performanceQuery({
      limit: "10",
      active_only: "true",
      dedupe: "true",
      settled_only: "false",
    });

    const response = await request.get(`/api/v1/performance/picks?${qs}`);
    await expectAdminOnlyPerformanceResponse(response, "performance picks");
  });

  test("GET /api/v1/performance/book-comparison requires admin auth", async ({
    request,
  }) => {
    const qs = performanceQuery({
      pricing_bookmaker_keys: "draftkings,fanduel,betmgm,espnbet",
      require_all_books: "false",
    });

    const response = await request.get(
      `/api/v1/performance/book-comparison?${qs}`
    );
    await expectAdminOnlyPerformanceResponse(response, "book comparison");
  });
});
