import { afterEach, describe, expect, it, vi } from "vitest";

function installPerformanceDom() {
  document.body.innerHTML = `
    <form id="filter-form">
      <select id="f-performance-scope" name="performance_scope">
        <option value="official">Official</option>
        <option value="tracking">Tracking</option>
      </select>
      <select id="f-sport" name="sport"></select>
      <select id="f-market" name="market_key"></select>
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  delete window.BoardWiseApi;
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

describe("performance page", () => {
  it("loads tracking performance as Obsidian beta rows", async () => {
    window.history.replaceState(
      {},
      "",
      "/performance/?performance_scope=tracking&model_family=classic_mlb"
    );
    installPerformanceDom();

    const calls = [];
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
    expect(document.querySelector("#f-market")?.textContent).toContain("NRFI/YRFI");
    expect(document.querySelector("#f-market")?.textContent).not.toContain("first_inning_total");
  });
});
