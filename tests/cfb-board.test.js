import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

const FULL = JSON.parse(readFileSync("tests/fixtures/cfb-forecast-beta-payload.json", "utf8"));

function installDom() {
  document.body.innerHTML = `
    <h1 id="cfb-title">College Football</h1>
    <span id="cfb-slate"></span><span id="cfb-updated"></span>
    <section id="cfb-controls" hidden><select id="cfb-week"></select>
      <fieldset><div data-filter-group="classification"></div></fieldset>
      <fieldset><div data-filter-group="state"></div></fieldset>
      <button id="cfb-reset-filters" type="button">Reset</button></section>
    <section id="cfb-board-summary" hidden><strong id="cfb-match-count"></strong>
      <span id="cfb-selected-filters"></span><span id="cfb-state-summary"></span>
      <span id="cfb-next-kickoff"></span></section>
    <section id="cfb-loading" aria-busy="true"></section><section id="cfb-error" hidden></section>
    <section id="cfb-access" hidden></section><section id="cfb-games" hidden></section>`;
}

function auth(plan) {
  const authenticated = plan !== "guest";
  return {
    authenticated, plan, user: authenticated ? { display_name: `${plan} member` } : null,
    features: { cfb_board_basic: authenticated, cfb_forecast_beta: ["founder", "admin"].includes(plan) },
  };
}

function landing(enabled = true) {
  return {
    sport: "cfb", beta_enabled: enabled, label: "Experimental Forecast Beta",
    audience: "founder_admin", game_count: 1, complete_game_count: 1,
    degraded_game_count: 0, unavailable_game_count: 0,
    next_kickoff: "2026-08-29T16:00:00Z", last_safe_update: "2026-08-27T18:30:00Z",
    upgrade: { required_feature: "cfb_forecast_beta", path: "/pricing/" },
  };
}

function branding() {
  const brand = (key) => ({ logo: `/assets/img/cfb/teams/${key}.png`, primary: "#7A0019", secondary: "#FFFFFF", probabilityColor: "#7A0019" });
  return { teams: { "cfb-66": brand("cfb-66"), "cfb-2306": brand("cfb-2306") }, fallback: { primary: "#667085", secondary: "#D0D5DD", probabilityColor: "#344054" } };
}

async function load(plan, board = FULL, enabled = true) {
  vi.resetModules();
  installDom();
  window.BoardWiseCfbBranding = branding();
  const state = auth(plan);
  window.BoardWiseAuth = /** @type {any} */ ({
    loadAuthState: vi.fn().mockResolvedValue(state),
    hasFeature: (candidate, key) => Boolean(candidate?.features?.[key]),
  });
  window.BoardWiseApi = /** @type {any} */ ({
    getCfbLanding: vi.fn().mockResolvedValue(landing(enabled)),
    getCfbBoard: vi.fn().mockResolvedValue(board),
  });
  await import("../assets/js/cfb-board.js");
  await vi.waitFor(() => expect(document.getElementById("cfb-loading")?.hidden).toBe(true));
  return window.BoardWiseApi;
}

function copyGame(overrides = {}) {
  const game = structuredClone(FULL.games[0]);
  Object.assign(game, overrides);
  return game;
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/cfb/");
  delete window.BoardWiseApi;
  delete window.BoardWiseAuth;
  delete window.BoardWiseCfbBranding;
  delete window.__BoardWiseCfbTestHooks;
  document.body.innerHTML = "";
});

describe("CFB experimental forecast board", () => {
  it("keeps the route dark and Guest landing safe without requesting a board", async () => {
    const dark = await load("founder", FULL, false);
    expect(dark.getCfbBoard).not.toHaveBeenCalled();
    expect(document.getElementById("cfb-access")?.textContent).toContain("currently dark");
    const guest = await load("guest");
    expect(guest.getCfbBoard).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("67.2%");
  });

  it("renders Free matchup shells without forecast or market values", async () => {
    const preview = structuredClone(FULL);
    preview.access = "preview";
    delete preview.games[0].forecast;
    delete preview.games[0].markets;
    delete preview.games[0].model_details;
    await load("free", preview);
    expect(document.querySelectorAll(".cfb-game-card")).toHaveLength(1);
    expect(document.querySelectorAll(".cfb-accordion")).toHaveLength(0);
    expect(document.body.textContent).toContain("Founder access is required");
    expect(document.body.textContent).not.toContain("67.2%");
  });

  it("defaults to the authoritative week, FBS, and Complete with URL-safe controls", async () => {
    await load("founder");
    expect(document.querySelector("#cfb-week option")?.textContent).toContain("2026 Season · Week 0");
    expect(document.querySelector('[data-filter="classification"][data-value="fbs"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-filter="state"][data-value="complete"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("cfb-match-count")?.textContent).toBe("1 matching game");
    expect(document.querySelectorAll(".cfb-game-card")).toHaveLength(1);
  });

  it("maps classification pairings without treating unknown as FBS or Other", async () => {
    await load("founder");
    const { classificationBucket } = window.__BoardWiseCfbTestHooks;
    const game = copyGame();
    expect(classificationBucket(game)).toBe("fbs");
    game.model_details.home_classification = "fcs";
    expect(classificationBucket(game)).toBe("fbs-fcs");
    game.model_details.away_classification = "fcs";
    expect(classificationBucket(game)).toBe("fcs");
    game.model_details.away_classification = "ii";
    expect(classificationBucket(game)).toBe("other");
    game.model_details.away_classification = null;
    expect(classificationBucket(game)).toBe("unknown");
  });

  it("combines classification and data-state filters and keeps counts scoped", async () => {
    const payload = structuredClone(FULL);
    const degraded = copyGame({ game_id: 102, data_state: "degraded" });
    const fcs = copyGame({ game_id: 103 });
    fcs.model_details.home_classification = "fcs";
    fcs.model_details.away_classification = "fcs";
    payload.games.push(degraded, fcs);
    await load("founder", payload);
    /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-filter="state"][data-value="degraded"]'))?.click();
    expect(document.querySelectorAll(".cfb-game-card")).toHaveLength(1);
    expect(document.querySelector(".cfb-warning")?.textContent).toContain("LIMITED FORECAST");
    expect(document.querySelector('[data-filter="classification"][data-value="fbs"] span')?.textContent).toBe("2");
    expect(document.querySelector('[data-filter="state"][data-value="degraded"] span')?.textContent).toBe("1");
  });

  it("parses, serializes, and rejects unauthorized URL filters and weeks", async () => {
    await load("founder");
    const { parseFilters, serializeFilters } = window.__BoardWiseCfbTestHooks;
    expect(parseFilters("?week=1&classification=fcs&state=all", [0, 1], 0)).toEqual({ week: 1, classification: "fcs", state: "all" });
    expect(parseFilters("?week=99&classification=unknown&state=bogus", [0], 0)).toEqual({ week: 0, classification: "fbs", state: "complete" });
    expect(parseFilters("", [0, 4], 4)).toEqual({ week: 4, classification: "fbs", state: "complete" });
    expect(serializeFilters({ week: 0, classification: "fbs", state: "complete" }, true)).toBe("week=0&classification=fbs&state=complete");
  });

  it("keeps the selector on the one API-authoritative current slate", async () => {
    const payload = structuredClone(FULL);
    payload.release.week = 4;
    payload.authorized_weeks = [0, 1, 4];
    window.history.replaceState({}, "", "/cfb/?week=1&classification=fcs&state=all");
    const api = await load("founder", payload);
    const selector = /** @type {HTMLSelectElement} */ (document.getElementById("cfb-week"));
    expect(selector.options).toHaveLength(1);
    expect(selector.value).toBe("4");
    expect(selector.disabled).toBe(true);
    expect(document.getElementById("cfb-slate")?.textContent).toContain("Week 4");
    expect(new URL(window.location.href).searchParams.get("week")).toBe("4");
    expect(api.getCfbBoard).toHaveBeenCalledTimes(1);
    expect(api.getCfbBoard).toHaveBeenCalledWith();

    window.history.pushState({}, "", "/cfb/?week=2&classification=fbs&state=complete");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(document.getElementById("cfb-slate")?.textContent).toContain("Week 4");
    expect(new URL(window.location.href).searchParams.get("week")).toBe("4");
    expect(api.getCfbBoard).toHaveBeenCalledTimes(1);
  });

  it("groups by local date and exact kickoff with TBD last and stable matchup sorting", async () => {
    await load("founder");
    const { groupGames, sortGames } = window.__BoardWiseCfbTestHooks;
    const late = copyGame({ game_id: 104, kickoff_utc: "2026-08-29T22:00:00Z" });
    const earlyB = copyGame({ game_id: 105, kickoff_utc: "2026-08-29T16:00:00Z", away_team: { name: "Zulu State" }, home_team: { name: "Home" } });
    const earlyA = copyGame({ game_id: 106, kickoff_utc: "2026-08-29T16:00:00Z", away_team: { name: "Alpha State" }, home_team: { name: "Home" } });
    const tbd = copyGame({ game_id: 107, kickoff_utc: null });
    const sorted = sortGames([tbd, late, earlyB, earlyA]);
    expect(sorted.map((game) => game.game_id)).toEqual([106, 105, 104, 107]);
    const grouped = groupGames([tbd, late, earlyB, earlyA]);
    expect(grouped.at(-1).label).toBe("Kickoff date TBD");
    expect(grouped.at(-1).times[0].label).toBe("Kickoff TBD");
  });

  it("flows the next kickoff into the same date grid without an empty desktop column", async () => {
    const payload = structuredClone(FULL);
    const nextKickoff = "2026-08-29T19:30:00Z";
    payload.games.push(copyGame({ game_id: 109, kickoff_utc: nextKickoff }));
    await load("founder", payload);
    expect(document.querySelectorAll(".cfb-date-group")).toHaveLength(1);
    expect(document.querySelectorAll(".cfb-date-group > .cfb-game-grid")).toHaveLength(1);
    const slots = [...document.querySelectorAll(".cfb-game-slot")];
    expect(slots).toHaveLength(2);
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
    expect(slots.map((slot) => slot.querySelector("h3")?.textContent)).toEqual([
      formatter.format(new Date(FULL.games[0].kickoff_utc)), formatter.format(new Date(nextKickoff)),
    ]);
  });

  it("uses real team names, local logos, and BoardWise probability terminology", async () => {
    await load("founder");
    expect(document.body.textContent).toContain("Iowa State Cyclones");
    expect(document.body.textContent).toContain("Kansas State Wildcats");
    expect(document.body.textContent).toContain("BoardWise probability");
    expect(document.body.textContent).not.toContain("Model probability");
    expect(document.querySelector('img[src="/assets/img/cfb/teams/cfb-66.png"]')).not.toBeNull();
    expect(document.querySelector('img[src="/assets/img/cfb/teams/cfb-2306.png"]')).not.toBeNull();
  });

  it("keeps all markets and Model Details collapsed with compact book tables", async () => {
    await load("founder");
    expect(document.querySelectorAll("details.cfb-market")).toHaveLength(3);
    expect(document.querySelectorAll("details.cfb-accordion[open]")).toHaveLength(0);
    expect(document.querySelectorAll(".cfb-market-table")).toHaveLength(3);
    const winner = /** @type {HTMLDetailsElement} */ (document.querySelector('[data-market="winner"]'));
    winner.open = true;
    winner.dispatchEvent(new Event("toggle"));
    expect(winner.querySelector(".cfb-market-table")).not.toBeNull();
    expect(winner.textContent).toContain("DraftKings");
    expect(winner.textContent).toContain("FanDuel");
  });

  it("summarizes unchanged evaluated lines with their probability and comparable price", async () => {
    const payload = structuredClone(FULL);
    for (const group of payload.games[0].markets) {
      for (const offer of group.offers) offer.original_line = offer.current_line;
    }
    await load("founder", payload);
    expect(document.querySelector('[data-market="winner"] > summary')?.textContent).toContain("Winner· Kansas State Wildcats · 67.2% · -210");
    expect(document.querySelector('[data-market="spread"] > summary')?.textContent).toContain("Spread· Kansas State Wildcats -6.5 · 50.4% · -108");
    expect(document.querySelector('[data-market="total"] > summary')?.textContent).toContain("Total· Over 56 · 49.3% · -105");
    expect(document.body.textContent).not.toContain("best pick");
    expect(document.body.textContent).not.toContain("recommendation row");
  });


  it("withholds moved-line probabilities and ranking while retaining evaluated quote details", async () => {
    await load("founder");
    const spread = document.querySelector('[data-market="spread"]');
    const total = document.querySelector('[data-market="total"]');
    expect(spread?.querySelector("summary")?.textContent).toContain("Current offers");
    expect(total?.querySelector("summary")?.textContent).toContain("Current offers");
    expect(spread?.querySelector("summary")?.textContent).not.toContain("50.4%");
    expect(spread?.querySelector(".cfb-offer-primary")?.textContent).toBe("-6.5 -108");
    expect(spread?.querySelector(".cfb-offer-probability")?.textContent).toContain("—");
    expect(spread?.textContent).toContain("Line moved · probability unavailable at current line");
    const details = spread?.querySelector(".cfb-quote-details");
    expect(details?.textContent).toContain("Evaluated offer -6 -110");
    expect(details?.textContent).toContain("BoardWise probability at evaluated line 50.4%");
    expect(details?.textContent).toContain("Evaluated same-book no-vig 50.0%");
    expect(details?.textContent).toContain("Evaluated quote captured");
    expect(details?.textContent).toContain("Current quote captured");
    expect(document.body.textContent).not.toContain("Opening");
  });

  it("ranks an unchanged offer above a moved offer with a larger old probability", async () => {
    const payload = structuredClone(FULL);
    const offers = payload.games[0].markets.find((group) => group.market === "spread").offers;
    offers[1].original_line = offers[1].current_line;
    await load("founder", payload);
    const summary = document.querySelector('[data-market="spread"] > summary');
    expect(summary?.textContent).toContain("Kansas State Wildcats -7 · 48.8% · -102");
    expect(summary?.textContent).not.toContain("50.4%");
  });

  it("keeps evaluated probabilities available in details with the new withheld contract", async () => {
    const payload = structuredClone(FULL);
    const offers = payload.games[0].markets.find((group) => group.market === "total").offers;
    for (const offer of offers) {
      Object.assign(offer, {
        original_model_probability: offer.model_probability,
        original_push_probability: offer.push_probability,
        original_same_book_no_vig_probability: offer.same_book_no_vig_probability,
        model_probability: null, push_probability: null, same_book_no_vig_probability: null,
        current_probability_state: "line_changed",
      });
    }
    await load("founder", payload);
    const total = document.querySelector('[data-market="total"]');
    expect(total?.querySelector(".cfb-offer-probability")?.textContent).toContain("—");
    expect(total?.querySelector(".cfb-quote-details")?.textContent).toContain("Evaluated offer +55.5 -110");
    expect(total?.querySelector(".cfb-quote-details")?.textContent).toContain("probability at evaluated line 49.3%");
  });

  it.each(["original_line", "current_line", "current_captured_at", "current_price_american"])(
    "does not rank a spread with missing %s", async (missing) => {
      const payload = structuredClone(FULL);
      const offers = payload.games[0].markets.find((group) => group.market === "spread").offers;
      for (const offer of offers) {
        offer.original_line = offer.current_line;
        offer[missing] = null;
      }
      await load("founder", payload);
      expect(document.querySelector('[data-market="spread"] > summary')?.textContent).toContain("Current offers");
      expect(document.querySelector('[data-market="spread"] .cfb-offer-probability')?.textContent).toContain("—");
    },
  );

  it("shows forecast time separately from the newer release time", async () => {
    await load("founder");
    expect(document.querySelector(".cfb-game-card__head")?.textContent).toContain("Forecast as of");
    expect(document.getElementById("cfb-updated")?.textContent).not.toBe("—");
  });

  it("ranks only directly comparable prices and handles positive and negative odds", async () => {
    await load("founder");
    const { betterBookPair, offersComparable } = window.__BoardWiseCfbTestHooks;
    const base = { selection: "x", current_line: -3.5, current_captured_at: "2026-08-28T12:00:00Z", market_state: "complete" };
    expect(betterBookPair({ ...base, bookmaker: "draftkings", current_price_american: 110 }, { ...base, bookmaker: "fanduel", current_price_american: 105 })).toBe("draftkings");
    expect(betterBookPair({ ...base, bookmaker: "draftkings", current_price_american: -110 }, { ...base, bookmaker: "fanduel", current_price_american: -120 })).toBe("draftkings");
    expect(offersComparable({ ...base, current_price_american: -110 }, { ...base, current_line: -2.5, current_price_american: -105 })).toBe(false);
    expect(betterBookPair({ ...base, current_price_american: -110 }, { ...base, current_line: -2.5, current_price_american: -105 })).toBeNull();
  });

  it("condenses unavailable games and translates degraded reasons", async () => {
    const payload = structuredClone(FULL);
    payload.games[0].data_state = "degraded";
    payload.games[0].reason_codes = ["FEATURE_INPUT_MISSING"];
    const unavailable = copyGame({ game_id: 108, data_state: "unavailable", forecast: null, markets: [], reason_codes: ["ODDS_MISSING", "FEATURE_INPUT_MISSING"] });
    payload.games.push(unavailable);
    window.history.replaceState({}, "", "/cfb/?week=0&classification=fbs&state=all");
    await load("founder", payload);
    expect(document.querySelector(".cfb-warning")?.textContent).toContain("LIMITED FORECAST");
    const condensed = document.querySelector("[data-game-id='108']");
    expect(condensed?.classList).toContain("cfb-game-card--condensed");
    expect(condensed?.textContent).toContain("FORECAST UNAVAILABLE");
    expect(condensed?.querySelector(".cfb-probability")).toBeNull();
    expect(condensed?.querySelector(".cfb-accordion")).toBeNull();
  });

  it("restores one market and independent Model Details state within the same week", async () => {
    sessionStorage.setItem("boardwise:cfb:accordions:2026:0", JSON.stringify({ "101": { market: "spread", model: true } }));
    await load("founder");
    expect(document.querySelector('[data-game-id="101"] [data-market="spread"]')?.hasAttribute("open")).toBe(true);
    expect(document.querySelector('[data-game-id="101"] .cfb-model-details')?.hasAttribute("open")).toBe(true);
    expect(document.querySelector('[data-game-id="101"] [data-market="winner"]')?.hasAttribute("open")).toBe(false);
    expect(document.querySelector(".cfb-model-details > summary")?.textContent).toBe("Model Details");
  });

  it("renders withheld values as unavailable and never leaks prohibited product fields", async () => {
    const payload = structuredClone(FULL);
    payload.games[0].forecast.away_win_probability = null;
    payload.games[0].forecast.home_win_probability = null;
    await load("admin", payload);
    expect(document.querySelector(".cfb-probability")?.getAttribute("aria-label")).toContain("unavailable");
    expect(document.querySelectorAll(".cfb-team__prob")[0]?.textContent).toContain("—");
    for (const forbidden of ["must-not-project", "Wise Choice", "stake size", "robust edge", "expected value"]) {
      expect(document.body.textContent).not.toContain(forbidden);
    }
  });

  it("maps quote-state badges to product-safe text", async () => {
    await load("founder");
    const { quoteState } = window.__BoardWiseCfbTestHooks;
    expect(quoteState("complete")).toBe("COMPLETE");
    expect(quoteState("book_missing")).toBe("BOOK MISSING");
    expect(quoteState("private_internal_code")).toBe("INCOMPLETE");
  });
});
