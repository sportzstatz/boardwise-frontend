import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

function landingPayload(overrides = {}) {
  return {
    sport: "mlb",
    timezone: "America/Chicago",
    generated_at: "2026-06-22T07:05:02-05:00",
    board: {
      target_date: "2026-06-22",
      model_family: "classic_mlb",
      model_display_name: "Classic MLB",
      game_count: 15,
      available: true,
      featured: {
        game_pk: 777001,
        game_label: "Blue Jays at Red Sox",
        commence_time: "12:35 PM CDT",
        venue: "Fenway Park",
        away: {
          team_name: "Toronto Blue Jays",
          short_name: "Blue Jays",
          abbr: "TOR",
          win_probability: 0.459,
          win_probability_text: "45.9%",
          moneyline_american: 106,
          moneyline_text: "+106",
        },
        home: {
          team_name: "Boston Red Sox",
          short_name: "Red Sox",
          abbr: "BOS",
          win_probability: 0.541,
          win_probability_text: "54.1%",
          moneyline_american: -124,
          moneyline_text: "-124",
        },
        pick: {
          selection_text: "Red Sox -1.5",
          sportsbook: "FanDuel",
          price_american: -205,
          price_text: "-205",
          model_probability: 0.734,
          model_probability_text: "73.4%",
          probability_edge: 0.091,
          edge_text: "+9.1%",
          expected_value_per_unit: 0.09,
          ev_text: "+0.09u",
          wise_choice_score: 18.4,
          wise_choice_status: "Strong",
          is_official: true,
        },
      },
    },
    results: {
      target_date: "2026-06-21",
      is_yesterday: true,
      fully_settled: true,
      model_family: "classic_mlb",
      summary: {
        pick_count: 8,
        settled_count: 8,
        wins: 6,
        losses: 2,
        pushes: 0,
        voids: 0,
        record: "6-2",
        units_risked: 23.05,
        units_won: 4.31,
        roi: 0.187,
        roi_pct: 18.7,
      },
      highlights: [
        {
          published_pick_id: 1234,
          game_label: "Yankees at Orioles",
          selection_text: "Yankees ML",
          bookmaker_key: "draftkings",
          bookmaker_title: "DraftKings",
          bookmaker_abbr: "DK",
          price_american: -138,
          price_text: "-138",
          result_status: "win",
          units_won: 0.72,
        },
        {
          published_pick_id: 1236,
          game_label: "Cubs at Reds",
          selection_text: "Under 8.5",
          bookmaker_key: "draftkings",
          bookmaker_title: "DraftKings",
          bookmaker_abbr: "DK",
          price_american: -105,
          price_text: "-105",
          result_status: "win",
          units_won: 0.95,
        },
        {
          published_pick_id: 1235,
          game_label: "Mets at Phillies",
          selection_text: "Mets +1.5",
          bookmaker_key: "fanduel",
          bookmaker_title: "FanDuel",
          bookmaker_abbr: "FD",
          price_american: -110,
          price_text: "-110",
          result_status: "loss",
          units_won: -1,
        },
      ],
    },
    ...overrides,
  };
}

function installLandingDom() {
  document.body.innerHTML = `
    <a id="landing-primary-cta" href="/login/?return_to=/mlb/">View today's MLB board</a>
    <a id="landing-secondary-cta" href="#proof">See yesterday's results</a>
    <a id="landing-cta-primary" href="/login/?return_to=/mlb/">Sign in to view the board</a>
    <a id="landing-cta-secondary" href="/pricing/">View Founder access</a>
    <a id="landing-mlb-card" href="/login/?return_to=/mlb/">
      <span id="landing-mlb-cta">Sign in to open</span>
    </a>
    <div id="landing-hero-status"><span></span><span>Daily MLB model board</span></div>
    <p id="landing-mlb-status"></p>
    <div id="landing-mlb-count" hidden><strong>0</strong><span>games on the board</span></div>
    <article class="landing-board-card landing-board-card--offseason" aria-label="NHL off-season board">
      <p id="landing-nhl-status">Hockey</p>
      <div class="landing-board-card__return">Returns Oct 2026</div>
    </article>
    <div id="landing-preview-loading" class="landing-preview landing-preview--loading" role="status">Loading today's featured matchup...</div>
    <div id="landing-preview" hidden></div>
    <div id="landing-preview-empty" class="landing-preview landing-preview--empty" hidden></div>
    <section id="proof" hidden>
      <p id="landing-results-kicker"></p>
      <h2 id="landing-results-title"></h2>
      <div id="landing-results-cards"></div>
      <a id="landing-results-link" href="/performance/">Results</a>
    </section>
  `;
}

/**
 * @param {{ auth?: any; api?: any; branding?: any }} [options]
 */
async function loadLanding({ auth, api, branding } = {}) {
  vi.resetModules();
  installLandingDom();
  const testWindow = /** @type {any} */ (window);
  testWindow.BoardWiseAuth = {
    loadAuthState: vi.fn().mockResolvedValue(auth || { authenticated: false, features: {} }),
    hasFeature: (state, featureKey) => Boolean(state.features && state.features[featureKey]),
    displayName: (state) => state && state.authenticated ? "Account" : "Sign in",
    initials: () => "A",
    guestState: {
      authenticated: false,
      user: null,
      plan: "guest",
      features: {},
    },
  };
  if (branding === "real") {
    await import("../assets/js/mlb-team-branding.js");
  } else {
    testWindow.BoardWiseMlbBranding = branding || {
      resolveMatchupBranding: vi.fn().mockReturnValue({
        away: { fill: "#134A8E", textOnLight: "#134A8E" },
        home: { fill: "#0C2340", textOnLight: "#0C2340" },
      }),
    };
  }
  testWindow.BoardWiseApi = api || {
    getMlbLanding: vi.fn().mockResolvedValue(landingPayload()),
    getMlbBoard: vi.fn(),
    getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
  };
  await import("../assets/js/landing.js");
  await vi.waitFor(() => expect(window.BoardWiseAuth.loadAuthState).toHaveBeenCalled());
  await vi.waitFor(() => expect(document.querySelector("#landing-preview")?.getAttribute("data-state")).toBe("ready"));
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  delete window.BoardWiseAuth;
  delete window.BoardWiseApi;
  delete window.BoardWiseLanding;
  delete window.BoardWiseMlbBranding;
  document.body.innerHTML = "";
});

describe("landing page", () => {
  it("guest calls the public landing snapshot and not the gated MLB board", async () => {
    const api = {
      getMlbLanding: vi.fn().mockResolvedValue(landingPayload()),
      getMlbBoard: vi.fn(),
      getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
    };

    await loadLanding({ auth: { authenticated: false, features: {} }, api });

    expect(api.getMlbLanding).toHaveBeenCalledTimes(1);
    expect(api.getMlbBoard).not.toHaveBeenCalled();
    expect(api.getNhlBoard).not.toHaveBeenCalled();
    expect(document.querySelector("#landing-primary-cta")?.getAttribute("href")).toBe("/login/?return_to=/mlb/");
    expect(document.querySelector("#landing-mlb-card")?.getAttribute("href")).toBe("/login/?return_to=/mlb/");
  });

  it("renders the current game count for guests", async () => {
    await loadLanding();

    expect(document.querySelector("#landing-mlb-count")?.hasAttribute("hidden")).toBe(false);
    expect(document.querySelector("#landing-mlb-count strong")?.textContent).toBe("15");
    expect(document.querySelector("#landing-hero-status")?.textContent).toContain("15 MLB games on today's board");
  });

  it("renders matchup identity while ignoring stale actionable fields", async () => {
    await loadLanding();

    const preview = document.querySelector("#landing-preview");
    expect(preview?.textContent).toContain("Blue Jays at Red Sox");
    expect(preview?.textContent).toContain("TOR");
    expect(preview?.textContent).toContain("BOS");
    expect(preview?.textContent).toContain("Fenway Park");
    expect(preview?.textContent).toContain("Today's matchup");
    for (const sensitive of [
      "45.9%",
      "54.1%",
      "ML +106",
      "Red Sox -1.5",
      "FanDuel",
      "73.4%",
      "+9.1%",
      "+0.09u",
      "Wise Choice",
      "Official",
      "Preview",
    ]) {
      expect(preview?.textContent).not.toContain(sensitive);
    }
    expect(preview?.querySelector(".landing-preview__bar")).toBeNull();
    expect(preview?.querySelector(".landing-preview__choice")).toBeNull();
  });

  it("renders team logo marks with an abbreviation fallback in the featured matchup", async () => {
    await loadLanding({ branding: "real" });

    const marks = document.querySelectorAll(".landing-preview__team-mark[data-team-logo-mark]");
    expect(marks.length).toBe(2);
    const awayImg = /** @type {HTMLImageElement} */ (marks[0].querySelector("img[data-team-logo]"));
    const homeImg = /** @type {HTMLImageElement} */ (marks[1].querySelector("img[data-team-logo]"));
    expect(awayImg.getAttribute("src")).toBe("/assets/img/mlb/team-logos/tor.svg");
    expect(homeImg.getAttribute("src")).toBe("/assets/img/mlb/team-logos/bos.svg");
    // Logos are decorative; the accessible team name text stays alongside.
    expect(awayImg.getAttribute("alt")).toBe("");
    expect(marks[0].getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("#landing-preview")?.textContent).toContain("Blue Jays");
    // Abbreviation fallback markup is present inside the circle
    expect(marks[0].querySelector(".landing-preview__team-fallback")?.textContent).toBe("TOR");
    expect(marks[1].querySelector(".landing-preview__team-fallback")?.textContent).toBe("BOS");

    // A failed SVG collapses the mark to the colored circle + abbreviation.
    awayImg.dispatchEvent(new Event("error"));
    expect(marks[0].classList.contains("logo-failed")).toBe(true);
  });

  it("keeps the plain circle mark when no logo path is available", async () => {
    await loadLanding();

    const mark = document.querySelector(".landing-preview__team-mark[data-team-logo-mark]");
    expect(mark?.classList.contains("has-logo")).toBe(false);
    expect(mark?.querySelector("img[data-team-logo]")).toBeNull();
    expect(mark?.querySelector(".landing-preview__team-fallback")?.textContent).toBe("TOR");
  });

  it("uses BoardWiseMlbBranding colors for the featured matchup", async () => {
    const branding = {
      resolveMatchupBranding: vi.fn().mockReturnValue({
        away: { fill: "#134A8E", textOnLight: "#134A8E" },
        home: { fill: "#0C2340", textOnLight: "#0C2340" },
      }),
    };

    await loadLanding({ branding });

    expect(branding.resolveMatchupBranding).toHaveBeenCalledWith(expect.objectContaining({
      away_team_abbr: "TOR",
      home_team_abbr: "BOS",
    }));
    const teams = document.querySelectorAll(".landing-preview__team");
    expect(teams[0].getAttribute("style")).toContain("--team-color:#134A8E");
    expect(teams[1].getAttribute("style")).toContain("--team-color:#0C2340");
  });

  it("renders the same neutral matchup when the featured pick is absent", async () => {
    const payload = landingPayload({
      board: {
        ...landingPayload().board,
        featured: {
          ...landingPayload().board.featured,
          pick: null,
        },
      },
    });

    await loadLanding({
      api: {
        getMlbLanding: vi.fn().mockResolvedValue(payload),
        getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
      },
    });

    expect(document.querySelector("#landing-preview")?.textContent).toContain("Today's matchup");
    expect(document.querySelector("#landing-preview .landing-preview__choice")).toBeNull();
  });

  it("selects yesterday result copy when is_yesterday is true", async () => {
    await loadLanding();

    expect(document.querySelector("#landing-results-kicker")?.textContent).toBe("Obsidian Steed · yesterday's results");
    expect(document.querySelector("#landing-results-title")?.textContent).toBe("Results for Jun 21");
    expect(document.querySelector("#landing-secondary-cta")?.textContent).toBe("See yesterday's results");
  });

  it("selects latest result copy when is_yesterday is false", async () => {
    await loadLanding({
      api: {
        getMlbLanding: vi.fn().mockResolvedValue(landingPayload({
          results: {
            ...landingPayload().results,
            target_date: "2026-06-20",
            is_yesterday: false,
          },
        })),
        getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
      },
    });

    expect(document.querySelector("#landing-results-kicker")?.textContent).toBe("Obsidian Steed · latest results");
    expect(document.querySelector("#landing-results-title")?.textContent).toBe("Results for Jun 20");
    expect(document.querySelector("#landing-secondary-cta")?.textContent).toBe("See latest results");
  });

  it("renders only the four aggregate result metrics", async () => {
    await loadLanding();

    const cards = document.querySelectorAll(".landing-result-card");
    expect(cards).toHaveLength(4);
    expect([...document.querySelectorAll(".landing-result-stat__label")].map((card) => card.textContent)).toEqual([
      "Record",
      "Picks",
      "Units",
      "ROI",
    ]);
    expect([...document.querySelectorAll(".landing-result-stat__value")].map((card) => card.textContent)).toEqual([
      "6-2",
      "8",
      "+4.31u",
      "+18.7%",
    ]);
    const proof = document.querySelector("#proof")?.textContent || "";
    expect(proof).not.toContain("Yankees at Orioles");
    expect(proof).not.toContain("Yankees ML");
    expect(proof).not.toContain("DraftKings");
  });

  it("hides the results section when results are null", async () => {
    await loadLanding({
      api: {
        getMlbLanding: vi.fn().mockResolvedValue(landingPayload({ results: null })),
        getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
      },
    });

    expect(document.querySelector("#proof")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector("#landing-results-cards")?.innerHTML).toBe("");
  });

  it.each([
    ["a guest", { authenticated: false, features: {} }],
    [
      "an authenticated non-admin (Founder)",
      { authenticated: true, features: { mlb_board_basic: true, mlb_board_advanced: true } },
    ],
  ])(
    "conceals the tracked-record /performance/ link from %s while keeping the public aggregates",
    async (_label, auth) => {
      await loadLanding({ auth });

      const link = document.querySelector("#landing-results-link");
      // Performance is concealed Admin-only: non-admins must never be linked to
      // or told about the /performance/ dashboard.
      expect(link?.hasAttribute("hidden")).toBe(true);
      expect(link?.getAttribute("href")).toBeNull();
      // The public aggregate snapshot itself still renders (guest-readable).
      expect(document.querySelector("#proof")?.hasAttribute("hidden")).toBe(false);
      expect(document.querySelectorAll(".landing-result-stat")).toHaveLength(4);
    }
  );

  it("shows the tracked-record link only to an admin, deep-linked to /performance/", async () => {
    await loadLanding({
      auth: {
        authenticated: true,
        features: { mlb_board_basic: true, performance_summary: true },
      },
    });

    const link = document.querySelector("#landing-results-link");
    expect(link?.hasAttribute("hidden")).toBe(false);
    const href = link?.getAttribute("href") || "";
    expect(href).toContain("/performance/");
    expect(href).toContain("start_date=2026-06-21");
    // The panel shows Obsidian Steed tracked results, so the admin record link
    // must open the tracking scope, not the official/classic record.
    expect(href).toContain("performance_scope=tracking");
    expect(href).not.toContain("performance_scope=official");
  });

  it("shows a valid aggregate panel when every settled pick lost", async () => {
    const base = landingPayload().results;
    await loadLanding({
      api: {
        getMlbLanding: vi.fn().mockResolvedValue(landingPayload({
          results: {
            ...base,
            summary: {
              ...base.summary,
              wins: 0,
              losses: 8,
              record: "0-8",
              units_won: -8,
              roi: -1,
              roi_pct: -100,
            },
            highlights: [
              { published_pick_id: 9001, game_label: "A at B", selection_text: "Over 8", bookmaker_abbr: "DK", price_text: "-110", result_status: "loss", units_won: -1 },
              { published_pick_id: 9002, game_label: "C at D", selection_text: "Under 9", bookmaker_abbr: "FD", price_text: "-105", result_status: "push", units_won: 0 },
            ],
          },
        })),
        getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
      },
    });

    expect(document.querySelector("#proof")?.hasAttribute("hidden")).toBe(false);
    expect([...document.querySelectorAll(".landing-result-stat__value")].map((card) => card.textContent)).toEqual([
      "0-8",
      "8",
      "-8.00u",
      "-100.0%",
    ]);
    const cta = document.querySelector("#landing-secondary-cta");
    expect(cta?.getAttribute("href")).toBe("#proof");
    expect(cta?.textContent).toBe("See yesterday's results");
  });

  it("does not depend on individual highlights to show aggregates", async () => {
    const base = landingPayload().results;
    await loadLanding({
      api: {
        getMlbLanding: vi.fn().mockResolvedValue(landingPayload({
          results: { ...base, highlights: [] },
        })),
        getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
      },
    });

    expect(document.querySelector("#proof")?.hasAttribute("hidden")).toBe(false);
    expect(document.querySelectorAll(".landing-result-stat")).toHaveLength(4);
  });

  it("keeps zero-valued aggregates visible and derives record/ROI fallbacks", async () => {
    const base = landingPayload().results;
    await loadLanding({
      api: {
        getMlbLanding: vi.fn().mockResolvedValue(landingPayload({
          results: {
            ...base,
            summary: {
              pick_count: 0,
              wins: 0,
              losses: 0,
              record: null,
              units_won: 0,
              roi: 0,
              roi_pct: null,
            },
          },
        })),
        getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
      },
    });

    expect(document.querySelector("#proof")?.hasAttribute("hidden")).toBe(false);
    expect([...document.querySelectorAll(".landing-result-stat__value")].map((card) => card.textContent)).toEqual([
      "0-0",
      "0",
      "+0.00u",
      "0.0%",
    ]);
  });

  it("hides #proof when the aggregate summary is absent", async () => {
    const base = landingPayload().results;
    await loadLanding({
      api: {
        getMlbLanding: vi.fn().mockResolvedValue(landingPayload({
          results: { ...base, summary: null },
        })),
        getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
      },
    });

    expect(document.querySelector("#proof")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector("#landing-results-cards")?.innerHTML).toBe("");
  });

  it("keeps the admin record link available for a valid all-loss aggregate", async () => {
    const base = landingPayload().results;
    await loadLanding({
      auth: { authenticated: true, features: { mlb_board_basic: true, performance_summary: true } },
      api: {
        getMlbLanding: vi.fn().mockResolvedValue(landingPayload({
          results: {
            ...base,
            summary: {
              ...base.summary,
              wins: 0,
              losses: 8,
              record: "0-8",
              units_won: -8,
              roi_pct: -100,
            },
            highlights: [
              { published_pick_id: 9003, game_label: "E at F", selection_text: "Yankees ML", bookmaker_abbr: "DK", price_text: "+120", result_status: "loss", units_won: -1 },
            ],
          },
        })),
        getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
      },
    });

    expect(document.querySelector("#proof")?.hasAttribute("hidden")).toBe(false);
    expect(document.querySelector("#landing-results-link")?.hasAttribute("hidden")).toBe(false);
  });

  it("public snapshot failure leaves the page usable", async () => {
    vi.resetModules();
    installLandingDom();
    const testWindow = /** @type {any} */ (window);
    testWindow.BoardWiseAuth = {
      loadAuthState: vi.fn().mockResolvedValue({ authenticated: false, features: {} }),
      hasFeature: () => false,
      guestState: { authenticated: false, features: {} },
    };
    testWindow.BoardWiseApi = {
      getMlbLanding: vi.fn().mockRejectedValue(new Error("offline")),
      getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
    };

    await import("../assets/js/landing.js");
    await vi.waitFor(() => expect(window.BoardWiseApi.getMlbLanding).toHaveBeenCalled());

    expect(document.querySelector("#landing-preview-empty")?.hasAttribute("hidden")).toBe(false);
    expect(document.querySelector("#proof")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector("#landing-secondary-cta")?.getAttribute("href")).toBe("#how");
    expect(document.querySelector("#landing-secondary-cta")?.textContent).toBe("How the model works");
  });

  it("shipped board card icons contain the approved emoji", async () => {
    const html = await readFile(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain('aria-hidden="true">⚾️</span>');
    expect(html).toContain('aria-hidden="true">🏒</span>');
    expect(html).toContain('aria-hidden="true">🏀</span>');
    expect(html).toContain('aria-hidden="true">🏈</span>');
  });

  it("ships NHL as an off-season non-link card", async () => {
    const html = await readFile(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain('class="landing-board-card landing-board-card--offseason"');
    expect(html).toContain("Off-season");
    expect(html).toContain("Returns Oct 2026");
    // Retired: no "Notify me" CTA — the card is informational only.
    expect(html).not.toContain("Notify me");
    expect(html).not.toContain('href="/nhl/"');
  });

  it("shipped landing HTML has no hardcoded sample teams, picks, or transparency panel copy", async () => {
    const html = await readFile(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).not.toContain("Blue Jays at Red Sox");
    expect(html).not.toContain("Red Sox -1.5");
    expect(html).not.toContain("FanDuel");
    expect(html).not.toContain("Illustrative");
    expect(html).not.toContain("Transparent by design");
    expect(html).not.toContain("Every recommendation is preserved with its posted line.");
  });
});
