import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

const FULL_PAYLOAD = JSON.parse(
  readFileSync("tests/fixtures/mlb-game-detail-payload.json", "utf8")
);
const PROPS_PAYLOAD = JSON.parse(
  readFileSync("tests/fixtures/mlb-game-props-payload.json", "utf8")
);
const PROPS_SUMMARY_PAYLOAD = JSON.parse(
  readFileSync("tests/fixtures/mlb-game-props-summary-payload.json", "utf8")
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyPropsPayload() {
  return {
    access: "full",
    game: { game_pk: 777001, date: "2026-06-18", away_abbr: "TOR", home_abbr: "BOS" },
    engine: { family: "eagle_eye", display_name: "Eagle Eye", book: "draftkings" },
    counts: { forecasts: 0, quoted: 0, picks: 0, no_edge: 0 },
    top_plays: [],
    buckets: [],
    pitchers: [],
    batters: { away: { team_abbr: "TOR", players: [] }, home: { team_abbr: "BOS", players: [] } },
    state: "no_props_published",
  };
}

function isHidden(selector) {
  return (/** @type {HTMLElement | null} */ (document.querySelector(selector)))?.hidden;
}

function panel(id) {
  return /** @type {HTMLElement | null} */ (document.querySelector(`[data-gd2-panel="${id}"]`));
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

async function loadDetailScript(getMlbBoard, getMlbGameProps) {
  vi.resetModules();
  installDetailDom();
  window.BoardWiseApi = /** @type {any} */ ({
    getMlbBoard,
    getMlbGameProps: getMlbGameProps || vi.fn().mockResolvedValue(clone(PROPS_PAYLOAD)),
  });
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

describe("mlb game detail v2", () => {
  it("renders the full Founder detail with tabs, defaulting to Player Props", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const getMlbBoard = vi.fn().mockResolvedValue(clone(FULL_PAYLOAD));
    const getMlbGameProps = vi.fn().mockResolvedValue(clone(PROPS_PAYLOAD));

    await loadDetailScript(getMlbBoard, getMlbGameProps);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    expect(getMlbBoard).toHaveBeenCalledWith("", { model: undefined });
    expect(getMlbGameProps).toHaveBeenCalledWith("777001", { date: undefined });

    const detail = document.querySelector("#gd-detail");
    const text = detail?.textContent || "";
    // Hero: both win probabilities, both pitchers
    expect(text).toContain("45.9");
    expect(text).toContain("54.1");
    expect(text).toContain("Trey Yesavage");
    expect(text).toContain("Sonny Gray");
    // Wise Choice banner with tier + top-prop teaser
    const wise = detail?.querySelector(".gd-wise");
    expect(wise?.textContent).toContain("Red Sox +1.5");
    expect(wise?.textContent).toContain("Official · Strong");
    const teaser = wise?.querySelector("[data-gd2-goto-props]");
    expect(teaser?.textContent).toContain("Top prop: Gray Strikeouts U 9.5 · +47.2% EV");
    // Tab bar: exact tabs, two disabled Soon tabs
    const tabLabels = [...(detail?.querySelectorAll(".gd2-tab") || [])].map((el) => el.textContent?.trim());
    expect(tabLabels?.[0]).toBe("Markets");
    expect(tabLabels?.[1]).toBe("Player Props");
    expect(tabLabels?.[2]).toBe("Model");
    expect(tabLabels?.[3]).toContain("Weather & Park");
    expect(tabLabels?.[4]).toContain("Trends");
    const soonTabs = detail?.querySelectorAll(".gd2-tab.is-soon[disabled]");
    expect(soonTabs?.length).toBe(2);
    // Default tab is Player Props because counts.quoted > 0
    expect(panel("props")?.hidden).toBe(false);
    expect(panel("markets")?.hidden).toBe(true);
    expect(panel("model")?.hidden).toBe(true);
    // Props content: buckets, pitcher duel, lineups, no-edge footer
    const props = panel("props");
    expect(props?.textContent).toContain("Prime");
    expect(props?.textContent).toContain("EV ≥ +30% per unit");
    expect(props?.textContent).toContain("The pitcher duel");
    expect(props?.textContent).toContain("Blue Jays · probable starter");
    expect(props?.textContent).toContain("The lineups — batter props");
    expect(props?.textContent).toContain("Toronto — away");
    expect(props?.textContent).toContain("Boston — home");
    // U+2212 minus preserved from the API's quote_short
    expect(props?.textContent).toContain("DK −128");
    // Founder plan badge + title
    expect(document.querySelector("#gd-back .gd-plan.founder")).not.toBeNull();
    expect(document.title).toContain("Blue Jays at Red Sox");
    expect(document.querySelector("#gd-heading")?.textContent).toBe("Blue Jays at Red Sox");
    // no raw leakage
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("[object Object]");
  });

  it("switches tabs: Markets and Model render board-driven content", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    await loadDetailScript(vi.fn().mockResolvedValue(clone(FULL_PAYLOAD)));
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const marketsTab = /** @type {HTMLElement} */ (document.querySelector('[data-gd2-tab="markets"]'));
    marketsTab.click();
    expect(panel("markets")?.hidden).toBe(false);
    expect(panel("props")?.hidden).toBe(true);
    const markets = panel("markets");
    // Group ordering: Money Line first, then Run Line, then Total
    const groupTitles = [...(markets?.querySelectorAll(".gd2-mkt-group-title") || [])].map((el) => el.textContent);
    expect(groupTitles[0]).toBe("Money Line");
    expect(groupTitles[1]).toBe("Run Line");
    expect(groupTitles[2]).toBe("Total Runs");
    // Wise Choice™ tag on the game's wise choice option, Pass elsewhere
    const wiseCard = markets?.querySelector(".gd2-mkt-option.is-wise");
    expect(wiseCard?.textContent).toContain("Red Sox +1.5");
    expect(wiseCard?.querySelector(".gd2-mkt-tag.is-wise")?.textContent).toBe("Wise Choice™");
    const passTags = [...(markets?.querySelectorAll(".gd2-mkt-tag:not(.is-wise)") || [])];
    expect(passTags.length).toBeGreaterThan(0);
    expect(passTags.every((el) => el.textContent === "Pass")).toBe(true);
    expect(markets?.textContent).toContain("Odds");
    expect(markets?.textContent).toContain("-205");

    const modelTab = /** @type {HTMLElement} */ (document.querySelector('[data-gd2-tab="model"]'));
    modelTab.click();
    expect(panel("model")?.hidden).toBe(false);
    const model = panel("model");
    expect(model?.textContent).toContain("Projected score");
    expect(model?.textContent).toContain("Red Sox 4.0 · Blue Jays 4.2");
    expect(model?.querySelectorAll(".gd2-stat-card").length).toBe(6);
    expect(model?.textContent).toContain("Away win prob");
    expect(model?.textContent).toContain("Board state");
    expect(model?.textContent).toContain("20k sim paths");
    // Model version card: game family version + props engine version
    expect(model?.textContent).toContain("ensemble_probable_snapshot_v1");
    expect(model?.textContent).toContain("eagle_eye_props_engine_v0_20260618");
    // Disclaimer with interpolated calibration
    expect(model?.textContent).toContain("rolling calibration is currently identity");
  });

  it("the wise banner teaser jumps to the Player Props tab", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    await loadDetailScript(vi.fn().mockResolvedValue(clone(FULL_PAYLOAD)));
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    /** @type {HTMLElement} */ (document.querySelector('[data-gd2-tab="markets"]')).click();
    expect(panel("props")?.hidden).toBe(true);
    /** @type {HTMLElement} */ (document.querySelector("[data-gd2-goto-props]")).click();
    expect(panel("props")?.hidden).toBe(false);
    expect(document.querySelector('[data-gd2-tab="props"]')?.classList.contains("is-active")).toBe(true);
  });

  it("colors prop bars with resolved team fills and mutes model-only HR rows", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const payload = clone(FULL_PAYLOAD);
    await loadDetailScript(vi.fn().mockResolvedValue(payload));
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const expected = window.BoardWiseMlbBranding?.resolveMatchupBranding(payload.games[0]);
    const pitcherCards = document.querySelectorAll(".gd2-pitcher-card");
    expect(pitcherCards.length).toBe(2);
    // away pitcher card first, top border + bars in away fill
    const awayCard = /** @type {HTMLElement} */ (pitcherCards[0]);
    expect(awayCard.textContent).toContain("Trey Yesavage");
    expect(awayCard.style.borderTopColor.length).toBeGreaterThan(0);
    const awayBar = /** @type {HTMLElement} */ (awayCard.querySelector(".gd2-bar-fill"));
    expect(awayBar.getAttribute("style")?.toUpperCase()).toContain(String(expected?.away.fill).toUpperCase());
    const homeCard = /** @type {HTMLElement} */ (pitcherCards[1]);
    const homeBar = /** @type {HTMLElement} */ (homeCard.querySelector(".gd2-bar-fill"));
    expect(homeBar.getAttribute("style")?.toUpperCase()).toContain(String(expected?.home.fill).toUpperCase());
    // pitcher marks carry the shared logo pattern
    const mark = awayCard.querySelector(".gd2-team-mark[data-team-logo-mark]");
    expect(mark?.querySelector("img[data-team-logo]")?.getAttribute("src")).toBe("/assets/img/mlb/team-logos/tor.svg");
    expect(mark?.querySelector("img[data-team-logo]")?.getAttribute("alt")).toBe("");
    // model-only HR row: muted color-mix fill with a solid fallback, No line columns
    const hrRow = document.querySelector(".gd2-hr-row");
    expect(hrRow?.textContent).toContain("1+ home run");
    expect(hrRow?.textContent).toContain("No line");
    const hrFill = /** @type {HTMLElement} */ (hrRow?.querySelector(".gd2-bar-fill"));
    expect(hrFill.getAttribute("style")).toContain("color-mix");
    // bars are accessible
    const bar = document.querySelector(".gd2-bar");
    expect(bar?.getAttribute("role")).toBe("img");
    expect(bar?.getAttribute("aria-label")).toMatch(/^Model probability the bet cashes: \d/);
  });

  it("a batter with zero quoted rows renders only the model-only HR row", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    await loadDetailScript(vi.fn().mockResolvedValue(clone(FULL_PAYLOAD)));
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const cards = [...document.querySelectorAll(".gd2-batter-card")];
    const clement = cards.find((card) => card.textContent?.includes("Ernie Clement"));
    expect(clement).toBeTruthy();
    expect(clement?.querySelectorAll(".gd2-prop-row").length).toBe(1);
    expect(clement?.querySelector(".gd2-prop-row")?.classList.contains("gd2-hr-row")).toBe(true);
  });

  it("renders only the Prime bucket in Ranked plays, with the duel right after", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    await loadDetailScript(vi.fn().mockResolvedValue(clone(FULL_PAYLOAD)));
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const ranked = /** @type {HTMLElement} */ (document.querySelector(".gd2-ranked"));
    const buckets = [...ranked.querySelectorAll(".gd2-bucket")];
    expect(buckets.length).toBe(1);
    expect(buckets[0].getAttribute("data-bucket-key")).toBe("prime");
    expect(ranked.textContent).not.toContain("Strong");
    expect(ranked.textContent).not.toContain("Playable");
    expect(ranked.textContent).not.toContain("Lean");
    // No filter control, no no-edge footer — the pitcher duel is the next
    // section after ranked.
    expect(document.querySelector("[data-gd2-min-bucket]")).toBeNull();
    expect(document.querySelector(".gd2-no-edge")).toBeNull();
    const rankedSection = ranked.closest("[data-gd2-props-section]");
    expect(rankedSection?.nextElementSibling?.textContent).toContain("The pitcher duel");
  });

  it("shows a quiet note when no Prime plays exist", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const propsPayload = clone(PROPS_PAYLOAD);
    for (const bucket of propsPayload.buckets) {
      if (bucket.key === "prime") bucket.rows = [];
    }
    await loadDetailScript(
      vi.fn().mockResolvedValue(clone(FULL_PAYLOAD)),
      vi.fn().mockResolvedValue(propsPayload)
    );
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const ranked = /** @type {HTMLElement} */ (document.querySelector(".gd2-ranked"));
    expect(ranked.querySelectorAll(".gd2-bucket").length).toBe(0);
    expect(ranked.textContent).toContain("No Prime plays for this game today.");
  });

  it("renders the mobile segmented control and switches props sections", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    await loadDetailScript(vi.fn().mockResolvedValue(clone(FULL_PAYLOAD)));
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const segButtons = document.querySelectorAll("[data-gd2-seg]");
    expect([...segButtons].map((el) => el.textContent)).toEqual(["Ranked", "Pitchers", "Batters"]);
    expect(document.querySelector('[data-gd2-props-section="ranked"]')?.classList.contains("is-seg-active")).toBe(true);
    /** @type {HTMLElement} */ (document.querySelector('[data-gd2-seg="batters"]')).click();
    expect(document.querySelector('[data-gd2-props-section="batters"]')?.classList.contains("is-seg-active")).toBe(true);
    expect(document.querySelector('[data-gd2-props-section="ranked"]')?.classList.contains("is-seg-active")).toBe(false);
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
    expect(awayLogo.closest(".tot-team-logo-mark")).not.toBeNull();
    expect(awaySide.style.getPropertyValue("--team-fill")).toBe(expected?.away.fill);
    expect(homeSide.style.getPropertyValue("--team-fill")).toBe(expected?.home.fill);
    expect(bar.style.getPropertyValue("--away-team-fill")).toBe(expected?.away.fill);
    expect(bar.style.getPropertyValue("--home-team-fill")).toBe(expected?.home.fill);
    expect(bar.getAttribute("aria-label")).toBe("Toronto Blue Jays 45.9%, Boston Red Sox 54.1%");
  });

  it("keeps logo fallback working on the detail hero", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    await loadDetailScript(vi.fn().mockResolvedValue(clone(FULL_PAYLOAD)));
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const img = /** @type {HTMLImageElement} */ (document.querySelector(".gd-hero .tot-side.away [data-team-logo]"));
    img.dispatchEvent(new Event("error"));
    const mark = /** @type {HTMLElement} */ (img.closest(".tot-team-logo-mark"));
    expect(mark.classList.contains("logo-failed")).toBe(true);
    expect(mark.querySelector(".tot-team-fallback")?.textContent).toBe("TOR");
  });

  it("renders the free/guest lock panel from summary counts without leaking premium data", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const getMlbBoard = vi.fn().mockResolvedValue(previewPayload([clone(PREVIEW_GAME)]));
    const getMlbGameProps = vi.fn().mockResolvedValue(clone(PROPS_SUMMARY_PAYLOAD));

    await loadDetailScript(getMlbBoard, getMlbGameProps);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    const detail = document.querySelector("#gd-detail");
    const text = detail?.textContent || "";
    // Hero still renders (teams, derived probs from favorite)
    expect(text).toContain("Trey Yesavage");
    expect(text).toContain("54.1");
    // Default tab is Player Props (summary counts.quoted > 0) with the lock panel
    expect(panel("props")?.hidden).toBe(false);
    const lock = panel("props")?.querySelector(".gd2-lock");
    expect(lock?.textContent).toContain("Player props are Founder access");
    expect(lock?.textContent).toContain(
      "100 model forecasts for this game — 15 quoted by the books, ranked by edge and EV, with two plays above the Prime line today."
    );
    const cta = lock?.querySelector(".gd2-btn-gold");
    expect(cta?.getAttribute("href")).toBe("/pricing/");
    // Sign-in CTA exists for guests only, wired through the gates pattern
    const signIn = lock?.querySelector("[data-auth-guest]");
    expect(signIn?.getAttribute("href")).toBe("/login/");
    // Free plan badge, no wise banner, no premium market numbers
    expect(document.querySelector("#gd-back .gd-plan.free")).not.toBeNull();
    expect(detail?.querySelector(".gd-wise")).toBeNull();
    expect(detail?.querySelector(".gd2-mkt-option")).toBeNull();
    expect(text).not.toContain("-205");
    expect(text).not.toContain("+9.1%");
    // Markets/Model tabs show locked sections
    /** @type {HTMLElement} */ (document.querySelector('[data-gd2-tab="markets"]')).click();
    expect(panel("markets")?.textContent).toContain("Founder access");
  });

  it("keeps the page alive with an inline Props tab error when the props fetch fails", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const propsError = Object.assign(new Error("500"), { status: 500 });
    const getMlbGameProps = vi.fn().mockRejectedValue(propsError);

    await loadDetailScript(vi.fn().mockResolvedValue(clone(FULL_PAYLOAD)), getMlbGameProps);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    // Board content renders; default tab falls back to Markets
    expect(panel("markets")?.hidden).toBe(false);
    expect(document.querySelector(".gd-wise")).not.toBeNull();
    // Props tab carries a quiet inline error, not a blank page
    /** @type {HTMLElement} */ (document.querySelector('[data-gd2-tab="props"]')).click();
    expect(panel("props")?.textContent).toContain("Player props couldn't load");
    expect(isHidden("#gd-error")).toBe(true);
    // No top-prop teaser without props data
    expect(document.querySelector("[data-gd2-goto-props]")).toBeNull();
  });

  it("shows the quiet not-published card when props are empty", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const getMlbGameProps = vi.fn().mockResolvedValue(emptyPropsPayload());

    await loadDetailScript(vi.fn().mockResolvedValue(clone(FULL_PAYLOAD)), getMlbGameProps);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    expect(panel("markets")?.hidden).toBe(false);
    /** @type {HTMLElement} */ (document.querySelector('[data-gd2-tab="props"]')).click();
    expect(panel("props")?.textContent).toContain("No player props have been published for this game yet");
    expect(panel("props")?.textContent).toContain("7:25");
  });

  it("shows a status chip and suppresses the teaser for final games", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const props = clone(PROPS_PAYLOAD);
    props.game.status = "final";
    await loadDetailScript(
      vi.fn().mockResolvedValue(clone(FULL_PAYLOAD)),
      vi.fn().mockResolvedValue(props)
    );
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    expect(document.querySelector("#gd-back .gd2-status-pill")?.textContent).toBe("Final");
    expect(document.querySelector("[data-gd2-goto-props]")).toBeNull();
    // Data stays visible
    expect(panel("props")?.textContent).toContain("The pitcher duel");
  });

  it("shows a Founder gate when the requested game is missing from a preview board", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=999999");
    const getMlbBoard = vi.fn().mockResolvedValue(previewPayload([clone(PREVIEW_GAME)]));

    await loadDetailScript(getMlbBoard, vi.fn().mockResolvedValue(clone(PROPS_SUMMARY_PAYLOAD)));
    await vi.waitFor(() => expect(isHidden("#gd-error")).toBe(false));

    const error = document.querySelector("#gd-error");
    expect(error?.textContent).toContain("requires Founder access");
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = Object.assign(new Error("401"), { status: 401 });
    const getMlbBoard = vi.fn().mockRejectedValue(error);

    await loadDetailScript(getMlbBoard, vi.fn().mockRejectedValue(error));
    await vi.waitFor(() => expect(isHidden("#gd-error")).toBe(false));

    expect(document.querySelector("#gd-error")?.textContent).toContain("Sign in");
    expect(document.querySelector("#gd-error a.button.primary")?.getAttribute("href")).toBe("/login/");
  });

  it("shows Founder-access copy for paid-only views", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001&date=2026-06-18");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("403"), { status: 403 });
    const getMlbBoard = vi.fn().mockRejectedValue(error);

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(isHidden("#gd-error")).toBe(false));

    expect(document.querySelector("#gd-error")?.textContent).toContain("requires Founder access");
  });

  it("forwards the model param, falls back once when rejected, and rewrites the URL", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001&model=not_a_real_model");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const badRequest = Object.assign(new Error("400"), { status: 400 });
    const getMlbBoard = vi
      .fn()
      .mockRejectedValueOnce(badRequest)
      .mockResolvedValueOnce(clone(FULL_PAYLOAD));
    const getMlbGameProps = vi.fn().mockResolvedValue(clone(PROPS_PAYLOAD));

    await loadDetailScript(getMlbBoard, getMlbGameProps);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(2));

    expect(getMlbBoard).toHaveBeenNthCalledWith(1, "", { model: "not_a_real_model" });
    expect(getMlbBoard).toHaveBeenNthCalledWith(2, "", { model: undefined });
    // The props fetch is family-agnostic and must not be re-issued by the retry.
    expect(getMlbGameProps).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));
    // Stale bookmark normalized to the resolved family
    expect(new URL(window.location.href).searchParams.get("model")).toBe("classic_mlb");
  });

  it("drops eagle* model params before fetching and rewrites the URL", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001&model=eagle_eye");
    const getMlbBoard = vi.fn().mockResolvedValue(clone(FULL_PAYLOAD));

    await loadDetailScript(getMlbBoard);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    expect(getMlbBoard).toHaveBeenCalledTimes(1);
    expect(getMlbBoard).toHaveBeenCalledWith("", { model: undefined });
    expect(new URL(window.location.href).searchParams.get("model")).toBe("classic_mlb");
  });

  it("derives win probabilities from the favorite when explicit fields are absent", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001");
    const getMlbBoard = vi.fn().mockResolvedValue(previewPayload([clone(PREVIEW_GAME)]));

    await loadDetailScript(getMlbBoard, vi.fn().mockResolvedValue(clone(PROPS_SUMMARY_PAYLOAD)));
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
    // sPct uses a real minus sign
    expect(hooks.sPct(-0.041)).toBe("−4.1%");
    expect(hooks.sPct(0.472)).toBe("+47.2%");
  });

  it("preserves date and model on the back-to-board link", async () => {
    window.history.replaceState({}, "", "/mlb/game/?game_pk=777001&date=2026-06-18&model=classic_mlb");
    const getMlbBoard = vi.fn().mockResolvedValue(clone(FULL_PAYLOAD));
    const getMlbGameProps = vi.fn().mockResolvedValue(clone(PROPS_PAYLOAD));

    await loadDetailScript(getMlbBoard, getMlbGameProps);
    await vi.waitFor(() => expect(isHidden("#gd-detail")).toBe(false));

    expect(getMlbGameProps).toHaveBeenCalledWith("777001", { date: "2026-06-18" });
    const href = document.querySelector("#gd-back .gd-back-link")?.getAttribute("href") || "";
    expect(href).toContain("/mlb/");
    expect(href).toContain("date=2026-06-18");
    expect(href).toContain("model=classic_mlb");
  });
});
