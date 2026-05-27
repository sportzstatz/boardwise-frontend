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
      expect.any(Object)
    );
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

  it("loads the NHL dated endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ games: [] }));
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    await api.getNhlBoard("2026-05-18");

    expect(fetch).toHaveBeenCalledWith(
      `${DEFAULT_API_BASE}/api/v1/boards/nhl/2026-05-18`,
      expect.any(Object)
    );
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
    expect(url.pathname).toBe("/api/v1/performance/summary");
    expect(url.searchParams.get("sport")).toBe("mlb");
    expect(url.searchParams.get("official_only")).toBe("true");
    expect(url.searchParams.get("bookmaker_key")).toBe("draftkings,fanduel");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.has("empty")).toBe(false);
  });

  it("serializes the performance model family filter", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ sports: [] }));
    vi.stubGlobal("fetch", fetch);

    const api = await loadApiClient();
    await api.getPerformanceFilters("mlb", { model_family: "obsidian_steed" });

    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/v1/performance/filters");
    expect(url.searchParams.get("sport")).toBe("mlb");
    expect(url.searchParams.get("model_family")).toBe("obsidian_steed");
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

    await expect(api.getNhlBoard()).rejects.toMatchObject({
      name: "BoardWiseApiError",
      status: 503,
      statusText: "Service Unavailable",
      body: { detail: "unavailable" },
    });
  });
});
