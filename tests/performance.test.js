import { afterEach, describe, expect, it, vi } from "vitest";

function installPerformanceDom() {
  document.body.innerHTML = `
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
    <select id="group-by"><option value="wise_choice_bucket">Wise Tier</option><option value="date">Date</option></select>
    <section id="loading"></section>
    <section id="error" hidden></section>
    <section id="empty-summary" hidden></section>
    <section id="kpi-grid" hidden></section>
    <table id="breakdown-table"><tbody></tbody></table>
    <section id="breakdown-empty" hidden></section>
    <table id="picks-table"><tbody></tbody></table>
    <section id="picks-empty" hidden></section>
    <div id="chart-container"><div id="chart-tooltip"></div></div>
    <section id="chart-empty" hidden></section>
    <div id="chart-meta"></div>
    <table id="book-comparison-table"><tbody></tbody></table>
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
  vi.resetModules();
  delete window.BoardWiseApi;
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

describe("performance page", () => {
  it("shows a clean admin sign-in state when performance is denied", async () => {
    window.history.replaceState({}, "", "/performance/");
    installPerformanceDom();
    installDeniedPerformanceApi(401);

    await import("../assets/js/performance.js");

    await vi.waitFor(() => {
      expect(document.querySelector("#error")?.textContent).toContain(
        "Sign in with an admin account"
      );
    });
    expect(window.BoardWiseApi.getPerformanceSummary).not.toHaveBeenCalled();
    expect(document.querySelector("#loading")?.hasAttribute("hidden")).toBe(true);
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
});
