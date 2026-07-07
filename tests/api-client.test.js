import { afterEach, describe, expect, it, vi } from "vitest";

const API_BASE = "https://api.example.test";
const DEFAULT_API_BASE = "https://api.useboardwise.com";

async function loadApiClient(apiBase) {
  vi.resetModules();
  delete window.BoardWiseApi;
  if (apiBase) window.BOARDWISE_API_BASE = apiBase;
  else delete window.BOARDWISE_API_BASE;
  await import("../assets/js/api-client.js");
  return window.BoardWiseApi;
}

function jsonResponse(body, { status = 200, statusText = "OK" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.BoardWiseApi;
  delete window.BOARDWISE_API_BASE;
});

describe("api-client", () => {
  it("uses the BOARDWISE_API_BASE override", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient(API_BASE);
    await api.getMe();

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/v1/me`,
      expect.any(Object)
    );
  });

  it("loads the MLB current endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ games: [] }));
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    await api.getMlbBoard();

    expect(fetch).toHaveBeenCalledWith(
      `${DEFAULT_API_BASE}/api/v1/boards/mlb/current`,
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
      })
    );
  });

  it("keeps MLB board transport on the public v1 contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ games: [] })));

    const api = await loadApiClient();
    const endpointText = Object.values(api.endpoints).join(" ");

    expect(api.endpoints.mlbBoardCurrent).toBe("/api/v1/boards/mlb/current");
    expect(api.endpoints.mlbBoardDate).toBe("/api/v1/boards/mlb/");
    expect(endpointText).not.toContain("/board/payload");
    expect(endpointText).not.toContain("/api/mlb/board");
  });

  it("loads the public MLB landing snapshot without a no-store override", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ sport: "mlb" }));
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    await api.getMlbLanding();

    expect(fetch).toHaveBeenCalledWith(
      `${DEFAULT_API_BASE}/api/v1/public/landing/mlb`,
      expect.objectContaining({
        credentials: "omit",
      })
    );
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("cache");
  });

  it("serializes the MLB model selector", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ games: [] }));
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    await api.getMlbBoard("2026-05-27", { model: "obsidian_steed" });

    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/v1/boards/mlb/2026-05-27");
    expect(url.searchParams.get("model")).toBe("obsidian_steed");
  });

  it("loads game props with cookies, no-store, and an optional date", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ access: "full" }));
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    await api.getMlbGameProps(777001, { date: "2026-06-18" });

    let url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/v1/mlb/games/777001/props");
    expect(url.searchParams.get("date")).toBe("2026-06-18");
    expect(fetch.mock.calls[0][1]).toMatchObject({
      credentials: "include",
      cache: "no-store",
    });

    await api.getMlbGameProps("823765");
    url = new URL(fetch.mock.calls[1][0]);
    expect(url.pathname).toBe("/api/v1/mlb/games/823765/props");
    expect(url.searchParams.get("date")).toBeNull();
  });

  it("does not expose retired NHL board transport", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ games: [] })));

    const api = await loadApiClient();
    const endpointText = Object.values(api.endpoints).join(" ");

    expect(api.getNhlBoard).toBeUndefined();
    expect(endpointText).not.toContain("/api/v1/boards/nhl/");
  });

  it("/me uses credentials include and cache no-store", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ authenticated: false }));
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    await api.getMe();

    expect(fetch).toHaveBeenCalledWith(
      `${DEFAULT_API_BASE}/api/v1/me`,
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
      })
    );
  });

  it("magic-link start sends a JSON body with credentials include", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    await api.startMagicLink({
      email: "founder@example.test",
      return_to: "/performance/",
      turnstile_token: "turnstile-token",
    });

    expect(fetch).toHaveBeenCalledWith(
      `${DEFAULT_API_BASE}/api/v1/auth/magic-link/start`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          email: "founder@example.test",
          return_to: "/performance/",
          turnstile_token: "turnstile-token",
        }),
      })
    );
  });

  it("serializes performance queries", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ summary: {} }));
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    await api.getPerformanceSummary({
      sport: "mlb",
      official_only: true,
      empty: "",
      bookmaker_key: ["draftkings", "fanduel"],
      limit: 100,
    });

    const url = new URL(fetch.mock.calls[0][0]);
    expect(fetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
      })
    );
    expect(url.pathname).toBe("/api/v1/performance/summary");
    expect(url.searchParams.get("sport")).toBe("mlb");
    expect(url.searchParams.get("official_only")).toBe("true");
    expect(url.searchParams.get("bookmaker_key")).toBe("draftkings,fanduel");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.has("empty")).toBe(false);
  });

  it("serializes the performance model family and scope filters", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ sports: [] }));
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    await api.getPerformanceFilters("mlb", {
      model_family: "obsidian_steed",
      performance_scope: "tracking",
    });

    const url = new URL(fetch.mock.calls[0][0]);
    expect(fetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
      })
    );
    expect(url.pathname).toBe("/api/v1/performance/filters");
    expect(url.searchParams.get("sport")).toBe("mlb");
    expect(url.searchParams.get("model_family")).toBe("obsidian_steed");
    expect(url.searchParams.get("performance_scope")).toBe("tracking");
  });

  it("billing checkout posts an empty JSON body with credentials include", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ checkout_url: "https://checkout.stripe.com/c/pay/cs_test", checkout_session_id: "cs_test" })
    );
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    const result = await api.createBillingCheckout();

    expect(result.checkout_url).toBe("https://checkout.stripe.com/c/pay/cs_test");
    expect(fetch).toHaveBeenCalledWith(
      `${DEFAULT_API_BASE}/api/v1/billing/checkout`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({}),
      })
    );
  });

  it("billing status is an authenticated no-store read", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ plan: "free", checkout_available: true, portal_available: false, subscription: null })
    );
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    const result = await api.getBillingStatus();

    expect(result.plan).toBe("free");
    expect(fetch).toHaveBeenCalledWith(
      `${DEFAULT_API_BASE}/api/v1/billing/status`,
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
      })
    );
    expect(fetch.mock.calls[0][1].method).toBe("GET");
  });

  it("billing portal posts with credentials include and no body", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ portal_url: "https://billing.stripe.com/p/session/test" })
    );
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    const result = await api.createBillingPortal();

    expect(result.portal_url).toBe("https://billing.stripe.com/p/session/test");
    expect(fetch).toHaveBeenCalledWith(
      `${DEFAULT_API_BASE}/api/v1/billing/portal`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("throws BoardWiseApiError for non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { detail: "unavailable" },
          { status: 503, statusText: "Service Unavailable" }
        )
      )
    );

    const api = await loadApiClient();

    await expect(api.getMlbBoard()).rejects.toMatchObject({
      name: "BoardWiseApiError",
      status: 503,
      statusText: "Service Unavailable",
      body: { detail: "unavailable" },
    });
  });
});
