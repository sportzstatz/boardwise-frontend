import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

const FULL_PAYLOAD = JSON.parse(
  readFileSync("tests/fixtures/mlb-game-detail-payload.json", "utf8")
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isHidden(selector) {
  return (/** @type {HTMLElement | null} */ (document.querySelector(selector)))?.hidden;
}

function installDetailDom() {
  document.body.innerHTML = `
    <div class="nav-row">
      <a class="nav-link" href="/account/" data-auth-authenticated data-auth-label hidden>Account</a>
    </div>
    <main class="gd-shell-frame">
      <div id="gd-back" class="gd-game-top-band"></div>
      <section id="gd-loading" class="loading-panel">Loading…</section>
      <section id="gd-error" class="error-panel" hidden></section>
      <section id="gd-detail" hidden></section>
    </main>
  `;
}

async function loadDetailScript(getMlbBoard) {
  vi.resetModules();
  installDetailDom();
  window.BoardWiseApi = /** @type {any} */ ({ getMlbBoard });
  await import("../assets/js/wise-choice.js");
  await import("../assets/js/mlb-team-branding.js");
  await import("../assets/js/mlb-game-detail.js");
}

function previewPayload(games) {
  return {
    target_date: "2026-06-18",
    generated_at: "2026-06-18 12:00 PM CT",
    game_count: games.length,
    betting_game_count: games.length,
    recommendation_count: 0,
    access: {
      level: "preview",
      preview: true,
      full_access: false,
      max_preview_games: 2,
      required_feature: "mlb_board_advanced",
      upgrade_path: "/pricing/",
    },
    model_metadata: {
      default_model_family: "classic_mlb",
      selected_model_family: "classic_mlb",
    },
    games,
  };
}

const PREVIEW_GAME = {
  game_pk: 777001,
  game_label: "Blue Jays at Red Sox",
  away_team: "Toronto Blue Jays",
  home_team: "Boston Red Sox",
  away_team_abbr: "TOR",
  home_team_abbr: "BOS",
  commence_time: "12:35 PM CDT",
  venue: "Fenway Park",
  favorite_team: "Red Sox",
  favorite_prob_text: "54.1%",
  away_pitcher: "Trey Yesavage",
  home_pitcher: "Sonny Gray",
  lineup_status_away: "projected",
  lineup_status_home: "confirmed",
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.BoardWiseApi;
  delete window.BoardWiseWiseChoice;
  delete window.BoardWiseMlbBranding;
  delete (/** @type {any} */ (window)).__BoardWiseGameDetailTestHooks;
  delete (/** @type {any} */ (window)).__BoardWiseMlbBrandingTestHooks;
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

describe("mlb game detail", () => {
  it("renders the full Pro detail for the requested game", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const getMlbBoard = vi.fn().mockResolvedValue(clone(FULL_PAYLOAD));

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    expect(getMlbBoard).toHaveBeenCalledWith("", { model: undefined });
    const detail = document.querySelector("#gd-detail");
    const text = detail?.textContent || "";
    // Hero: both win probabilities, both pitchers
    expect(text).toContain("45.9");
    expect(text).toContain("54.1");
    expect(text).toContain("Trey Yesavage");
    expect(text).toContain("Sonny Gray");
    // Wise Choice banner
    expect(detail?.querySelector(".gd-wise")?.textContent).toContain("Red Sox +1.5");
    expect(detail?.querySelector(".gd-wise")?.textContent).toContain("73.4%");
    expect(detail?.querySelector(".gd-wise")?.textContent).toContain("+9.1%");
    // Tier is derived from the option's Wise Choice status, not hard-coded.
    expect(detail?.querySelector(".gd-wise")?.textContent).toContain("Official · Strong");
    expect(detail?.querySelector(".gd-wise")?.textContent).not.toContain("Official · Playable");
    // Full markets with both sides + official badge
    expect(text).toContain("Run Line");
    expect(text).toContain("Money Line");
    expect(text).toContain("Total Runs");
    expect(detail?.querySelector(".gd-mkt-option.official")).not.toBeNull();
    // Model breakdown
    expect(text).toContain("Model Breakdown");
    expect(text).toContain("Red Sox 4.0 · Blue Jays 4.2");
    expect(text).toContain("Calibrated WP");
    // Pitching matchup section
    expect(text).toContain("Pitching Matchup");
    // Coming soon honesty
    expect(text).toContain("Player Props");
    expect(text).toContain("Soon");
    // Pro plan badge + title
    expect(document.querySelector("#gd-back .gd-plan.pro")).not.toBeNull();
    expect(document.title).toContain("Blue Jays at Red Sox");
    expect(document.querySelector("#gd-heading")?.textContent).toBe("Blue Jays at Red Sox");
    // no raw leakage
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("[object Object]");
  });

  it("renders shared team branding in the detail hero", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const payload = clone(FULL_PAYLOAD);
    const getMlbBoard = vi.fn().mockResolvedValue(payload);

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const game = payload.games[0];
    const expected = window.BoardWiseMlbBranding?.resolveMatchupBranding(game);
    const awaySide = /** @type {HTMLElement} */ (document.querySelector(".gd-hero .tot-side.away"));
    const homeSide = /** @type {HTMLElement} */ (document.querySelector(".gd-hero .tot-side.home"));
    const awayLogo = /** @type {HTMLImageElement} */ (awaySide.querySelector("[data-team-logo]"));
    const bar = /** @type {HTMLElement} */ (document.querySelector(".gd-hero .tot-bar"));

    expect(awayLogo.getAttribute("src")).toBe("/assets/img/mlb/team-logos/tor.svg");
    expect(awayLogo.getAttribute("alt")).toBe("");
    expect(awayLogo.getAttribute("width")).toBe("184");
    expect(awayLogo.getAttribute("height")).toBe("132");
    expect(awayLogo.closest(".tot-team-logo-mark")).not.toBeNull();
    expect(awayLogo.closest(".tot-team-mark")).toBeNull();
    expect(document.querySelector(".tot-team-mark.has-logo")).toBeNull();
    expect(awaySide.style.getPropertyValue("--team-fill")).toBe(expected?.away.fill);
    expect(homeSide.style.getPropertyValue("--team-fill")).toBe(expected?.home.fill);
    expect(bar.style.getPropertyValue("--away-team-fill")).toBe(expected?.away.fill);
    expect(bar.style.getPropertyValue("--home-team-fill")).toBe(expected?.home.fill);
    expect(bar.getAttribute("aria-label")).toBe("Toronto Blue Jays 45.9%, Boston Red Sox 54.1%");
  });

  it("renders the gated Free detail without premium market data", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const getMlbBoard = vi.fn().mockResolvedValue(previewPayload([clone(PREVIEW_GAME)]));

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const detail = document.querySelector("#gd-detail");
    const text = detail?.textContent || "";
    // Hero still renders (teams, derived probs from favorite)
    expect(text).toContain("Trey Yesavage");
    expect(text).toContain("54.1");
    // Upsell + locked rows, Free badge
    expect(detail?.querySelector(".gd-upsell")).not.toBeNull();
    expect(text).toContain("Go Pro");
    expect(text).toContain("Full Markets");
    expect(text).toContain("Wise Choice");
    expect(document.querySelector("#gd-back .gd-plan.free")).not.toBeNull();
    // Must NOT fetch-and-hide premium data: no real odds/edge rendered
    expect(detail?.querySelector(".gd-wise")).toBeNull();
    expect(detail?.querySelector(".gd-mkt-option")).toBeNull();
    expect(detail?.querySelector(".gd-section-nav")).toBeNull();
    expect(text).not.toContain("Odds");
    expect(text).not.toContain("Edge");
    expect(text).not.toContain("EV");
    expect(text).not.toContain("-205");
    expect(text).not.toContain("+9.1%");
  });

  it("keeps logo fallback from revealing premium data in preview detail", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const getMlbBoard = vi.fn().mockResolvedValue(previewPayload([clone(PREVIEW_GAME)]));

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const img = /** @type {HTMLImageElement} */ (document.querySelector(".gd-hero .tot-side.away [data-team-logo]"));
    img.dispatchEvent(new Event("error"));
    const mark = /** @type {HTMLElement} */ (img.closest(".tot-team-logo-mark"));
    expect(mark.classList.contains("logo-failed")).toBe(true);
    expect(mark.querySelector(".tot-team-fallback")?.textContent).toBe("TOR");
    const detail = document.querySelector("#gd-detail");
    const text = detail?.textContent || "";
    expect(detail?.querySelector(".gd-wise")).toBeNull();
    expect(detail?.querySelector(".gd-mkt-option")).toBeNull();
    expect(text).not.toContain("Odds");
    expect(text).not.toContain("Edge");
    expect(text).not.toContain("EV");
  });

  it("shows a Pro gate when the requested game is missing from a preview board", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=999999");
    const getMlbBoard = vi.fn().mockResolvedValue(previewPayload([clone(PREVIEW_GAME)]));

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(isHidden("#gd-error")).toBe(false));

    const error = document.querySelector("#gd-error");
    expect(error?.textContent).toContain("requires Pro access");
    expect(error?.querySelector("a.button.primary")?.getAttribute("href")).toBe("/pricing/");
  });

  it("shows a not-found message when a full board lacks the game", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=424242");
    const getMlbBoard = vi.fn().mockResolvedValue(clone(FULL_PAYLOAD));

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(isHidden("#gd-error")).toBe(false));

    expect(document.querySelector("#gd-error")?.textContent).toContain("couldn't find that game");
  });

  it("shows sign-in copy for unauthenticated access", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("401"), { status: 401 });
    const getMlbBoard = vi.fn().mockRejectedValue(error);

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(isHidden("#gd-error")).toBe(false));

    expect(document.querySelector("#gd-error")?.textContent).toContain("Sign in");
    expect(document.querySelector("#gd-error a.button.primary")?.getAttribute("href")).toBe("/login/");
  });

  it("shows Pro-access copy for paid-only views", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001&date=2026-06-18");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("403"), { status: 403 });
    const getMlbBoard = vi.fn().mockRejectedValue(error);

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(isHidden("#gd-error")).toBe(false));

    expect(document.querySelector("#gd-error")?.textContent).toContain("requires Pro access");
  });

  it("forwards the model param and falls back once when rejected", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001&model=not_a_real_model");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const badRequest = Object.assign(new Error("400"), { status: 400 });
    const getMlbBoard = vi
      .fn()
      .mockRejectedValueOnce(badRequest)
      .mockResolvedValueOnce(clone(FULL_PAYLOAD));

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(2));

    expect(getMlbBoard).toHaveBeenNthCalledWith(1, "", { model: "not_a_real_model" });
    expect(getMlbBoard).toHaveBeenNthCalledWith(2, "", { model: undefined });
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));
  });

  it("derives win probabilities from the favorite when explicit fields are absent", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const getMlbBoard = vi.fn().mockResolvedValue(previewPayload([clone(PREVIEW_GAME)]));

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect((/** @type {any} */ (window)).__BoardWiseGameDetailTestHooks).toBeTruthy());

    const hooks = (/** @type {any} */ (window)).__BoardWiseGameDetailTestHooks;
    const probs = hooks.winProbs({
      favorite_team: "Red Sox",
      home_team: "Boston Red Sox",
      away_team: "Toronto Blue Jays",
      favorite_prob_text: "54.1%",
    });
    expect(probs.home).toBeCloseTo(54.1, 1);
    expect(probs.away).toBeCloseTo(45.9, 1);
  });

  it("preserves date and model on the back-to-board link", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001&date=2026-06-18&model=classic_mlb");
    const getMlbBoard = vi.fn().mockResolvedValue(clone(FULL_PAYLOAD));

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const href = document.querySelector("#gd-back .gd-back-link")?.getAttribute("href") || "";
    expect(href).toContain("/mlb/");
    expect(href).toContain("date=2026-06-18");
    expect(href).toContain("model=classic_mlb");
  });
});
