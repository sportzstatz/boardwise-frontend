// @ts-check
import { expect, test } from "@playwright/test";
import {
  expectBoolean,
  expectJsonResponse,
  expectNoOperatorLeak,
  expectPlainObject,
  expectString,
} from "./contract-helpers.js";

const SPORT = process.env.BOARDWISE_CONTRACT_SPORT || "mlb";

function keysDeep(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) keysDeep(item, keys);
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    keysDeep(child, keys);
  }
  return keys;
}

function performanceQuery(overrides = {}) {
  return new URLSearchParams({
    sport: SPORT,
    official_only: "true",
    settled_only: "false",
    ...overrides,
  }).toString();
}

async function expectAdminOnlyPerformanceResponse(response, label) {
  // Performance + internal routes are concealed Admin-only: guests and all
  // authenticated non-admins (Free, Founder) receive an indistinguishable
  // 404 — never 401/403, never `required_feature: internal_admin`, and never an
  // upgrade/pricing path. The body must be exactly {"detail": "Not Found"}.
  expect(response.status(), `${label} status`).toBe(404);

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
  expect(body.detail, `${label}.detail`).toBe("Not Found");

  const serialized = JSON.stringify(body).toLowerCase();
  for (const forbidden of [
    "internal_admin",
    "performance",
    "upgrade",
    "pricing",
    "required_feature",
    "authentication_required",
    "entitlement",
  ]) {
    expect(
      serialized.includes(forbidden),
      `${label} body must not reveal "${forbidden}"`
    ).toBe(false);
  }
  expectNoOperatorLeak(body, label);
}

async function expectMlbBasicRequiredResponse(response, label) {
  expect(response.status(), `${label} status`).toBe(401);

  const contentType = response.headers()["content-type"] || "";
  expect(
    contentType,
    `${label} should return JSON content-type`
  ).toContain("application/json");

  const cacheControl = response.headers()["cache-control"] || "";
  expect(cacheControl, `${label} cache-control`).toContain("private");
  expect(cacheControl, `${label} cache-control`).toContain("no-store");
  expect(cacheControl, `${label} cache-control`).toContain("max-age=0");

  const body = await response.json();
  expectPlainObject(body, label);
  expectPlainObject(body.detail, `${label}.detail`);
  expect(body.detail.error, `${label}.detail.error`).toBe(
    "authentication_required"
  );
  expect(body.detail.required_feature, `${label}.detail.required_feature`).toBe(
    "mlb_board_basic"
  );
  expectNoOperatorLeak(body, label);
}

test.describe("BoardWise public API contract", () => {
  test("GET /api/v1/public/landing/mlb is cacheable and marketing-only", async ({
    request,
  }) => {
    const response = await request.get("/api/v1/public/landing/mlb");
    const body = await expectJsonResponse(response, "public MLB landing");

    const cacheControl = response.headers()["cache-control"] || "";
    expect(cacheControl, "public MLB landing cache-control").toContain("public");
    expect(cacheControl, "public MLB landing shared cache").toContain("s-maxage");

    expect(body.sport).toBe("mlb");
    expectPlainObject(body.board, "public MLB landing.board");
    expectBoolean(body.board.available, "public MLB landing.board.available");
    if (body.board.featured !== null) {
      expectPlainObject(body.board.featured, "public MLB landing.board.featured");
      expectPlainObject(body.board.featured.away, "public MLB landing.board.featured.away");
      expectPlainObject(body.board.featured.home, "public MLB landing.board.featured.home");
    }

    const forbiddenKeys = [
      "pick",
      "highlights",
      "selection_text",
      "sportsbook",
      "bookmaker_key",
      "bookmaker_title",
      "bookmaker_abbr",
      "price_american",
      "price_text",
      "odds",
      "model_probability",
      "model_probability_text",
      "win_probability",
      "win_probability_text",
      "moneyline_american",
      "moneyline_text",
      "probability_edge",
      "edge_text",
      "expected_value_per_unit",
      "ev_text",
      "wise_choice_score",
      "wise_choice_status",
      "is_official",
    ];
    const keys = keysDeep(body);
    for (const key of forbiddenKeys) {
      expect(keys.has(key), `public MLB landing must omit ${key}`).toBe(false);
    }

    if (body.results !== null) {
      expectPlainObject(body.results, "public MLB landing.results");
      expectPlainObject(body.results.summary, "public MLB landing.results.summary");
    }
  });

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

  test("GET /api/v1/boards/mlb/current requires MLB basic auth for guests", async ({
    request,
  }) => {
    const response = await request.get("/api/v1/boards/mlb/current");
    await expectMlbBasicRequiredResponse(response, "mlb current board");
  });

  for (const path of [
    "/api/v1/mlb/games/1/props",
    "/api/mlb/game/1/props",
  ]) {
    test(`GET ${path} requires MLB basic auth before date validation`, async ({ request }) => {
      const response = await request.get(`${path}?date=07-03-2026`);
      await expectMlbBasicRequiredResponse(response, `guest props ${path}`);
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

  // Billing routes never leak provider/internal identifiers to guests. The
  // assertions accept both the enabled (401 authentication_required) and the
  // disabled / not-yet-deployed (404) states so this contract holds across
  // billing rollout phases.
  for (const [method, path, label] of [
    ["post", "/api/v1/billing/checkout", "billing checkout"],
    ["get", "/api/v1/billing/status", "billing status"],
    ["post", "/api/v1/billing/portal", "billing portal"],
  ]) {
    test(`${method.toUpperCase()} ${path} is guest-safe`, async ({ request }) => {
      const response =
        method === "get"
          ? await request.get(path)
          : await request.post(path, { data: {} });

      expect([401, 404], `${label} status`).toContain(response.status());

      const contentType = response.headers()["content-type"] || "";
      expect(contentType, `${label} content-type`).toContain("application/json");

      const body = await response.json();
      expectPlainObject(body, label);
      const serialized = JSON.stringify(body).toLowerCase();
      for (const forbidden of ["cus_", "sub_", "price_", "whsec_", "sk_live", "sk_test", "stripe.com"]) {
        expect(
          serialized.includes(forbidden),
          `${label} body must not reveal "${forbidden}"`
        ).toBe(false);
      }
      expectNoOperatorLeak(body, label);
    });
  }
});
