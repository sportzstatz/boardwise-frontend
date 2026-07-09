import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installPerformanceDom() {
  document.body.innerHTML = `
    <div class="performance-scope">
      <button type="button" data-performance-scope-button="official" aria-pressed="true">Official</button>
      <button type="button" data-performance-scope-button="tracking" aria-pressed="false">Tracking</button>
    </div>
    <div class="performance-range">
      <button type="button" data-range-days="30" aria-pressed="false">30d</button>
      <button type="button" data-range-days="90" aria-pressed="false">90d</button>
      <button type="button" data-range-days="available" aria-pressed="false">Available</button>
    </div>
    <div id="performance-filter-summary">
      <button type="button" data-filter-shortcut="sport">MLB</button>
      <button type="button" data-filter-shortcut="dates">Available range</button>
      <button type="button" data-filter-shortcut="markets">All markets</button>
      <button type="button" data-filter-shortcut="book">All books</button>
      <button type="button" data-filter-reset>Reset</button>
    </div>
    <button id="advanced-filter-toggle" type="button" aria-expanded="false" aria-controls="advanced-filters">Advanced filters</button>
    <section id="advanced-filters" hidden>
    <form id="filter-form">
      <select id="f-performance-scope" name="performance_scope">
        <option value="official">Official</option>
        <option value="tracking">Tracking</option>
      </select>
      <select id="f-sport" name="sport"></select>
      <button id="f-market-toggle" type="button" aria-expanded="false" aria-controls="f-market-menu">All markets</button>
      <div id="f-market-menu" hidden></div>
      <input id="f-market" name="market_keys" type="hidden">
      <select id="f-book" name="bookmaker_key"></select>
      <select id="f-confidence" name="confidence_bucket"></select>
      <select id="f-prob-bucket" name="model_probability_bucket"></select>
      <select id="f-wise-bucket" name="wise_choice_bucket"></select>
      <select id="f-model-version" name="model_version"></select>
      <select id="f-model-family" name="model_family"></select>
      <select id="f-mode" name="prediction_mode"></select>
      <input id="f-start" name="start_date" type="date">
      <input id="f-end" name="end_date" type="date">
      <input id="f-min-prob" name="min_model_probability" type="number">
      <input id="f-max-prob" name="max_model_probability" type="number">
      <input id="f-settled" name="settled_only" type="checkbox" checked>
      <button id="reset-filters" type="button">Reset</button>
    </form>
    </section>
    <select id="group-by"><option value="wise_choice_bucket">Wise Choice tier</option><option value="date">Date</option></select>
    <section id="loading"></section>
    <section id="error" hidden></section>
    <section id="empty-summary" hidden></section>
    <section id="kpi-grid" hidden></section>
    <div id="chart-hero-value"></div>
    <div id="chart-roi-pill"></div>
    <div id="chart-eyebrow"></div>
    <h2 id="breakdown-heading"></h2>
    <div id="breakdown-primary-heading"></div>
    <div id="breakdown-range-heading"></div>
    <div id="breakdown-health-heading"></div>
    <table id="breakdown-table"><tbody></tbody></table>
    <div id="breakdown-cards"></div>
    <section id="breakdown-empty" hidden></section>
    <table id="picks-table"><tbody></tbody></table>
    <div id="picks-cards"></div>
    <p id="picks-summary"></p>
    <section id="picks-empty" hidden></section>
    <div id="chart-container"><div id="chart-tooltip"></div></div>
    <section id="chart-empty" hidden></section>
    <div id="chart-meta"></div>
    <table id="book-comparison-table"><tbody></tbody></table>
    <div id="book-comparison-cards"></div>
    <section id="book-comparison-empty" hidden></section>
    <div id="book-comparison-summary"></div>
    <div id="book-cmp-books"></div>
    <input id="book-cmp-same" type="checkbox">
  `;
}

function filtersPayload() {
  return {
    sports: ["mlb"],
    markets: ["h2h", "spreads", "totals", "nrfi_yrfi"],
    bookmakers: [],
    confidence_buckets: [],
    model_probability_buckets: [],
    wise_choice_buckets: [],
    model_versions: [],
    model_families: ["obsidian_steed"],
    prediction_modes: ["probable"],
    performance_scopes: ["official", "tracking"],
    visibility: {
      public_sports: ["mlb"],
      min_visible_dates: { mlb: "2026-04-29" },
      floor_applied: true,
      start_date_applied: "2026-04-29",
    },
  };
}

function emptySummary() {
  return {
    pick_count: 0,
    settled_count: 0,
    pending_count: 0,
    record: "0-0-0",
    units_won: 0,
    units_risked: 0,
    roi: null,
    clv_coverage: null,
    clv_count: 0,
  };
}

function installMockApi(calls) {
  window.BoardWiseApi = /** @type {any} */ ({
    getPerformanceFilters: vi.fn().mockResolvedValue(filtersPayload()),
    getPerformanceSummary: vi.fn((query) => {
      calls.push(["summary", query]);
      return Promise.resolve({ summary: emptySummary(), visibility: filtersPayload().visibility });
    }),
    getPerformanceBreakdown: vi.fn((query) => {
      calls.push(["breakdown", query]);
      return Promise.resolve({ group_by: "wise_choice_bucket", groups: [], visibility: filtersPayload().visibility });
    }),
    getPerformancePicks: vi.fn((query) => {
      calls.push(["picks", query]);
      return Promise.resolve({ picks: [], visibility: filtersPayload().visibility });
    }),
    getPerformanceBookComparison: vi.fn((query) => {
      calls.push(["book", query]);
      return Promise.resolve({ rows: [], visibility: filtersPayload().visibility });
    }),
  });
}

function installDeniedPerformanceApi(status = 401) {
  const error = Object.assign(new Error(`${status} denied`), { status });
  window.BoardWiseApi = /** @type {any} */ ({
    getPerformanceFilters: vi.fn().mockRejectedValue(error),
    getPerformanceSummary: vi.fn(),
    getPerformanceBreakdown: vi.fn(),
    getPerformancePicks: vi.fn(),
    getPerformanceBookComparison: vi.fn(),
  });
}

function installAuthState(features) {
  const state = {
    authenticated: Boolean(features),
    user: features ? { email: "admin@example.test", display_name: "Admin" } : null,
    plan: features && features.performance_summary ? "admin" : "free",
    features: features || {},
  };
  window.BoardWiseAuth = /** @type {any} */ ({
    loadAuthState: vi.fn().mockResolvedValue(state),
    hasFeature: (s, key) => Boolean(s && s.features && s.features[key]),
  });
  return state;
}

// Default: an admin context so the concealed startup guard passes and the
// existing init() behavior is exercised. Non-admin redirect is covered by its
// own tests.
function installAdminAuth() {
  return installAuthState({
    performance_summary: true,
    performance_breakdown: true,
    performance_picks: true,
    performance_book_comparison: true,
    mlb_board_basic: true,
    mlb_board_advanced: true,
  });
}

// jsdom does not allow spying on the non-configurable window.location.replace,
// so stub the whole location object. vi.unstubAllGlobals() (afterEach) restores
// it. The fields init() reads (search/href/origin/pathname) are populated.
function stubLocation() {
  const replace = vi.fn();
  vi.stubGlobal("location", {
    href: "http://localhost/performance/",
    origin: "http://localhost",
    protocol: "http:",
    host: "localhost",
    hostname: "localhost",
    port: "",
    pathname: "/performance/",
    search: "",
    hash: "",
    replace,
    assign: vi.fn(),
    reload: vi.fn(),
  });
  return replace;
}

function checkedMarketValues() {
  return Array.from(document.querySelectorAll("#f-market-menu input[type='checkbox']"))
    .filter((el) => el instanceof HTMLInputElement && el.checked)
    .map((el) => el instanceof HTMLInputElement ? el.value : "");
}

function setMarketChecked(value, checked = true) {
  const input = /** @type {HTMLInputElement | null} */ (
    document.querySelector(`#f-market-menu input[value="${value}"]`)
  );
  expect(input).not.toBeNull();
  input.checked = checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function lastQuery(calls, name) {
  const matches = calls.filter(([callName]) => callName === name);
  return new URLSearchParams(matches[matches.length - 1][1]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  delete window.BoardWiseApi;
  delete window.BoardWiseAuth;
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

describe("performance page", () => {
  beforeEach(() => {
    // Admin context by default so the concealed startup guard passes and the
    // page initializes. Individual tests override for non-admin behavior.
    installAdminAuth();
  });

  it("shows a clean admin sign-in state when performance is denied", async () => {
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    document.querySelector("#breakdown-table tbody").innerHTML = "<tr><td>ADMIN-SECRET-BREAKDOWN</td></tr>";
    document.querySelector("#picks-table tbody").innerHTML = "<tr><td>SECRET_PICK_TEAM</td></tr>";
    document.querySelector("#book-comparison-table tbody").innerHTML = "<tr><td>SecretBook</td></tr>";
    document.querySelector("#book-comparison-summary").textContent = "Secret book summary";
    document.querySelector("#chart-container").insertAdjacentHTML("beforeend", "<svg><text>SECRET_CHART</text></svg>");
    const tooltip = document.querySelector("#chart-tooltip");
    tooltip.innerHTML = "SECRET_TOOLTIP_UNITS";
    tooltip.classList.add("is-visible");
    installDeniedPerformanceApi(401);

    await import("../assets/js/performance.js");

    await vi.waitFor(() => {
      expect(document.querySelector("#error")?.textContent).toContain(
        "Sign in with an admin account"
      );
    });
    expect(window.BoardWiseApi.getPerformanceSummary).not.toHaveBeenCalled();
    expect(document.querySelector("#breakdown-table tbody")?.innerHTML).toBe("");
    expect(document.querySelector("#picks-table tbody")?.innerHTML).toBe("");
    expect(document.querySelector("#book-comparison-table tbody")?.innerHTML).toBe("");
    expect(document.querySelector("#book-comparison-summary")?.textContent).toBe("");
    expect(document.querySelector("#chart-container svg")).toBeNull();
    expect(document.querySelector("#chart-tooltip")?.innerHTML).toBe("");
    expect(document.querySelector("#chart-tooltip")?.classList.contains("is-visible")).toBe(false);
    expect(document.querySelector("#loading")?.hasAttribute("hidden")).toBe(true);
  });

  it("clears previously rendered performance data after access is denied", async () => {
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    const calls = [];
    installMockApi(calls);
    const api = /** @type {any} */ (window.BoardWiseApi);
    api.getPerformanceSummary.mockResolvedValue({
      summary: { ...emptySummary(), pick_count: 1, settled_count: 1, record: "1-0-0", units_won: 1.2, units_risked: 1, roi: 1.2 },
      visibility: filtersPayload().visibility,
    });
    api.getPerformanceBreakdown.mockImplementation((query) => {
      calls.push(["breakdown", query]);
      const qs = new URLSearchParams(query);
      if (qs.get("group_by") === "date") {
        return Promise.resolve({
          group_by: "date",
          groups: [{ group_value: "2026-05-01", units_won: 1.2, units_risked: 1, settled_count: 1, record: "1-0-0" }],
          visibility: filtersPayload().visibility,
        });
      }
      return Promise.resolve({
        group_by: "wise_choice_bucket",
        groups: [{ group_value: "ADMIN-SECRET-BREAKDOWN", pick_count: 1, record: "1-0-0", units_won: 1.2, roi: 1.2 }],
        visibility: filtersPayload().visibility,
      });
    });
    api.getPerformancePicks.mockResolvedValue({
      picks: [{
        target_date: "2026-05-01",
        model_family: "obsidian_steed",
        game_label: "SECRET_PICK_TEAM at Other",
        market_key: "h2h",
        outcome_name: "SECRET_PICK_TEAM",
        bookmaker_title: "SecretBook",
        price_american: -110,
        model_probability: 0.55,
        is_settled: false,
      }],
      visibility: filtersPayload().visibility,
    });
    api.getPerformanceBookComparison.mockResolvedValue({
      rows: [{ pricing_bookmaker_title: "SecretBook", pick_count: 1, record: "1-0-0", units_risked: 1, units_won: 1.2 }],
      visibility: filtersPayload().visibility,
    });

    await import("../assets/js/performance.js");

    await vi.waitFor(() => {
      expect(document.querySelector("#breakdown-table tbody")?.textContent).toContain("ADMIN-SECRET-BREAKDOWN");
      expect(document.querySelector("#picks-table tbody")?.textContent).toContain("SECRET_PICK_TEAM");
      expect(document.querySelector("#book-comparison-table tbody")?.textContent).toContain("SecretBook");
      expect(document.querySelector("#chart-container svg")).not.toBeNull();
    });

    const tooltip = document.querySelector("#chart-tooltip");
    tooltip.innerHTML = "SECRET_TOOLTIP_UNITS";
    tooltip.classList.add("is-visible");

    const denied = Object.assign(new Error("403 denied"), { status: 403 });
    api.getPerformanceSummary.mockRejectedValue(denied);
    api.getPerformanceBreakdown.mockRejectedValue(denied);
    api.getPerformancePicks.mockRejectedValue(denied);
    document.querySelector("#filter-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(document.querySelector("#error")?.textContent).toContain("admin accounts only");
    });
    expect(document.querySelector("#breakdown-table tbody")?.innerHTML).toBe("");
    expect(document.querySelector("#picks-table tbody")?.innerHTML).toBe("");
    expect(document.querySelector("#book-comparison-table tbody")?.innerHTML).toBe("");
    expect(document.querySelector("#book-comparison-summary")?.textContent).toBe("");
    expect(document.querySelector("#chart-container svg")).toBeNull();
    expect(document.querySelector("#chart-tooltip")?.innerHTML).toBe("");
    expect(document.querySelector("#chart-tooltip")?.classList.contains("is-visible")).toBe(false);
  });

  it("loads tracking performance as Obsidian beta rows", async () => {
    window.history.replaceState(
      {},
      "",
      "/performance/?performance_scope=tracking&model_family=classic_mlb"
    );
    installPerformanceDom();

    const calls = [];
    installMockApi(calls);

    await import("../assets/js/performance.js");

    await vi.waitFor(() => expect(window.BoardWiseApi.getPerformanceSummary).toHaveBeenCalled());

    expect(window.BoardWiseApi.getPerformanceFilters).toHaveBeenCalledWith(
      "mlb",
      expect.objectContaining({
        performance_scope: "tracking",
        model_family: "obsidian_steed",
      })
    );

    const summaryQs = new URLSearchParams(calls.find(([name]) => name === "summary")[1]);
    expect(summaryQs.get("performance_scope")).toBe("tracking");
    expect(summaryQs.get("model_family")).toBe("obsidian_steed");
    expect(summaryQs.get("official_only")).toBe("false");
    expect(/** @type {HTMLSelectElement | null} */ (document.querySelector("#f-performance-scope"))?.value).toBe("tracking");
    expect(document.querySelector("#f-market-menu")?.textContent).toContain("NRFI/YRFI");
    expect(document.querySelector("#f-market-menu")?.textContent).not.toContain("first_inning_total");
  });

  it("hydrates old market_key URLs into the multi-market checkbox state", async () => {
    window.history.replaceState({}, "", "/performance/?market_key=h2h");
    installPerformanceDom();
    const calls = [];
    installMockApi(calls);

    await import("../assets/js/performance.js");

    await vi.waitFor(() => expect(window.BoardWiseApi.getPerformanceSummary).toHaveBeenCalled());

    expect(checkedMarketValues()).toEqual(["h2h"]);
    expect(/** @type {HTMLInputElement | null} */ (document.querySelector("#f-market"))?.value).toBe("h2h");
    expect(window.location.search).toContain("market_keys=h2h");
    expect(window.location.search).not.toContain("market_key=");
    expect(lastQuery(calls, "summary").get("market_keys")).toBe("h2h");
  });

  it("sends paired markets to every performance data request", async () => {
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    const calls = [];
    installMockApi(calls);

    await import("../assets/js/performance.js");
    await vi.waitFor(() => expect(window.BoardWiseApi.getPerformanceSummary).toHaveBeenCalled());

    const initialSummaryCount = calls.filter(([name]) => name === "summary").length;
    setMarketChecked("h2h", true);
    setMarketChecked("totals", true);
    document.querySelector("#filter-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(calls.filter(([name]) => name === "summary").length).toBeGreaterThan(initialSummaryCount);
    });

    for (const endpoint of ["summary", "breakdown", "picks", "book"]) {
      const qs = lastQuery(calls, endpoint);
      expect(qs.get("market_keys")).toBe("h2h,totals");
      expect(qs.get("market_key")).toBeNull();
    }
    expect(document.querySelector("#f-market-toggle")?.textContent).toBe("2 markets selected");
  });

  it("auto-applies market checkbox changes", async () => {
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    const calls = [];
    installMockApi(calls);

    await import("../assets/js/performance.js");
    await vi.waitFor(() => expect(window.BoardWiseApi.getPerformanceSummary).toHaveBeenCalled());

    const initialSummaryCount = calls.filter(([name]) => name === "summary").length;
    setMarketChecked("h2h", true);

    await vi.waitFor(() => {
      expect(calls.filter(([name]) => name === "summary").length).toBeGreaterThan(initialSummaryCount);
    });

    expect(lastQuery(calls, "summary").get("market_keys")).toBe("h2h");
    expect(window.location.search).toContain("market_keys=h2h");
    expect(document.querySelector("#f-market-toggle")?.textContent).toBe("Money Line");
  });

  it("supports tracking selections that pair NRFI/YRFI with full-game markets", async () => {
    window.history.replaceState({}, "", "/performance/?performance_scope=tracking");
    installPerformanceDom();
    const calls = [];
    installMockApi(calls);

    await import("../assets/js/performance.js");
    await vi.waitFor(() => expect(window.BoardWiseApi.getPerformanceSummary).toHaveBeenCalled());

    const initialSummaryCount = calls.filter(([name]) => name === "summary").length;
    setMarketChecked("nrfi_yrfi", true);
    setMarketChecked("h2h", true);
    document.querySelector("#filter-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(calls.filter(([name]) => name === "summary").length).toBeGreaterThan(initialSummaryCount);
    });

    const qs = lastQuery(calls, "summary");
    expect(qs.get("performance_scope")).toBe("tracking");
    expect(qs.get("model_family")).toBe("obsidian_steed");
    expect(qs.get("market_keys")).toBe("h2h,nrfi_yrfi");
  });

  it("reset clears market selections back to all markets", async () => {
    window.history.replaceState({}, "", "/performance/?market_keys=h2h,totals");
    installPerformanceDom();
    const calls = [];
    installMockApi(calls);

    await import("../assets/js/performance.js");
    await vi.waitFor(() => expect(window.BoardWiseApi.getPerformanceSummary).toHaveBeenCalled());

    expect(checkedMarketValues()).toEqual(["h2h", "totals"]);
    const initialSummaryCount = calls.filter(([name]) => name === "summary").length;
    document.querySelector("#reset-filters").dispatchEvent(new Event("click", { bubbles: true }));

    await vi.waitFor(() => {
      expect(calls.filter(([name]) => name === "summary").length).toBeGreaterThan(initialSummaryCount);
    });

    expect(checkedMarketValues()).toEqual([]);
    expect(/** @type {HTMLInputElement | null} */ (document.querySelector("#f-market"))?.value).toBe("");
    expect(document.querySelector("#f-market-toggle")?.textContent).toBe("All markets");
    expect(window.location.search).not.toContain("market_keys=");
  });

  it("top scope buttons synchronize with the canonical scope select", async () => {
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    const calls = [];
    installMockApi(calls);

    await import("../assets/js/performance.js");
    await vi.waitFor(() => expect(window.BoardWiseApi.getPerformanceSummary).toHaveBeenCalled());

    const initialSummaryCount = calls.filter(([name]) => name === "summary").length;
    document.querySelector('[data-performance-scope-button="tracking"]').dispatchEvent(new Event("click", { bubbles: true }));

    await vi.waitFor(() => {
      expect(calls.filter(([name]) => name === "summary").length).toBeGreaterThan(initialSummaryCount);
    });

    expect(/** @type {HTMLSelectElement | null} */ (document.querySelector("#f-performance-scope"))?.value).toBe("tracking");
    expect(document.querySelector('[data-performance-scope-button="tracking"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(lastQuery(calls, "summary").get("performance_scope")).toBe("tracking");
    expect(lastQuery(calls, "summary").get("model_family")).toBe("obsidian_steed");
  });

  it("returning from tracking to official removes the forced tracking model family", async () => {
    window.history.replaceState({}, "", "/performance/?performance_scope=tracking");
    installPerformanceDom();
    const calls = [];
    installMockApi(calls);

    await import("../assets/js/performance.js");
    await vi.waitFor(() => expect(window.BoardWiseApi.getPerformanceSummary).toHaveBeenCalled());

    const initialSummaryCount = calls.filter(([name]) => name === "summary").length;
    document.querySelector('[data-performance-scope-button="official"]').dispatchEvent(new Event("click", { bubbles: true }));

    await vi.waitFor(() => {
      expect(calls.filter(([name]) => name === "summary").length).toBeGreaterThan(initialSummaryCount);
    });

    const qs = lastQuery(calls, "summary");
    expect(qs.get("performance_scope")).toBe("official");
    expect(qs.get("model_family")).toBeNull();
    expect(qs.get("official_only")).toBe("true");
  });

  it("30-day and Available date presets update canonical dates and URL-backed queries", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-20T12:00:00Z").valueOf());
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    const calls = [];
    installMockApi(calls);

    await import("../assets/js/performance.js");
    await vi.waitFor(() => expect(window.BoardWiseApi.getPerformanceSummary).toHaveBeenCalled());

    const initialSummaryCount = calls.filter(([name]) => name === "summary").length;
    document.querySelector('[data-range-days="30"]').dispatchEvent(new Event("click", { bubbles: true }));

    await vi.waitFor(() => {
      expect(calls.filter(([name]) => name === "summary").length).toBeGreaterThan(initialSummaryCount);
    });

    let qs = lastQuery(calls, "summary");
    expect(qs.get("start_date")).toBe("2026-05-22");
    expect(qs.get("end_date")).toBe("2026-06-20");
    expect(document.querySelector('[data-range-days="30"]')?.getAttribute("aria-pressed")).toBe("true");

    const afterThirtyCount = calls.filter(([name]) => name === "summary").length;
    document.querySelector('[data-range-days="available"]').dispatchEvent(new Event("click", { bubbles: true }));

    await vi.waitFor(() => {
      expect(calls.filter(([name]) => name === "summary").length).toBeGreaterThan(afterThirtyCount);
    });

    qs = lastQuery(calls, "summary");
    expect(qs.get("start_date")).toBe("2026-04-29");
    expect(document.querySelector('[data-range-days="available"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders win rate excluding pushes and voids and CLV N/A at zero coverage", async () => {
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    const calls = [];
    installMockApi(calls);
    const api = /** @type {any} */ (window.BoardWiseApi);
    api.getPerformanceSummary.mockResolvedValue({
      summary: {
        pick_count: 5,
        settled_count: 5,
        pending_count: 0,
        record: "2-1-1-1",
        units_won: 1.25,
        units_risked: 5,
        roi: 0.25,
        clv_coverage: 0,
        clv_count: 0,
        avg_clv_prob_delta: null,
      },
      visibility: filtersPayload().visibility,
    });

    await import("../assets/js/performance.js");
    await vi.waitFor(() => expect(document.querySelector("#kpi-grid")?.textContent).toContain("Win rate"));

    const text = document.querySelector("#kpi-grid")?.textContent || "";
    expect(text).toContain("66.7%");
    expect(text).toContain("Pushes/voids excluded");
    expect(text).toContain("Avg CLV");
    expect(text).toContain("No CLV data yet");
  });

  it("advanced filter drawer opens, closes with Escape, and updates aria-expanded", async () => {
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    const calls = [];
    installMockApi(calls);

    await import("../assets/js/performance.js");
    await vi.waitFor(() => expect(window.BoardWiseApi.getPerformanceSummary).toHaveBeenCalled());

    document.querySelector("#advanced-filter-toggle").dispatchEvent(new Event("click", { bubbles: true }));
    expect(document.querySelector("#advanced-filter-toggle")?.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("#advanced-filters")?.hasAttribute("hidden")).toBe(false);

    const sport = document.querySelector("#f-sport");
    sport.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(document.querySelector("#advanced-filter-toggle")?.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("#advanced-filters")?.hasAttribute("hidden")).toBe(true);
  });

  it("redirects a non-admin to home without fetching performance endpoints", async () => {
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    // Mark the app container so we can assert it is never revealed.
    const appRoot = document.createElement("div");
    appRoot.setAttribute("data-performance-app", "");
    appRoot.setAttribute("hidden", "");
    document.body.appendChild(appRoot);

    // Non-admin (Founder): no performance_summary feature.
    installAuthState({ mlb_board_basic: true, mlb_board_advanced: true });
    const calls = [];
    installMockApi(calls);
    const replace = stubLocation();

    await import("../assets/js/performance.js");

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(window.BoardWiseApi.getPerformanceFilters).not.toHaveBeenCalled();
    expect(window.BoardWiseApi.getPerformanceSummary).not.toHaveBeenCalled();
    // The performance application container is never unhidden.
    expect(appRoot.hasAttribute("hidden")).toBe(true);
  });

  it("redirects a guest to home without fetching performance endpoints", async () => {
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    installAuthState(null); // guest
    const calls = [];
    installMockApi(calls);
    const replace = stubLocation();

    await import("../assets/js/performance.js");

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(window.BoardWiseApi.getPerformanceFilters).not.toHaveBeenCalled();
  });

  it("initializes for an admin and reveals the performance app container", async () => {
    // No location stub here: the admin path runs full init(), which manipulates
    // window.history, so the real location/history must stay in place. The guard
    // never calls location.replace for an admin, so staying on /performance/
    // (and the API being called) proves there was no redirect.
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    const appRoot = document.createElement("div");
    appRoot.setAttribute("data-performance-app", "");
    appRoot.setAttribute("hidden", "");
    document.body.appendChild(appRoot);

    installAdminAuth();
    const calls = [];
    installMockApi(calls);

    await import("../assets/js/performance.js");

    await vi.waitFor(() => expect(window.BoardWiseApi.getPerformanceSummary).toHaveBeenCalled());
    expect(window.location.pathname).toBe("/performance/");
    expect(appRoot.hasAttribute("hidden")).toBe(false);
  });
});
