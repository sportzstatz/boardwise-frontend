import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

const WISE_BOUNDARY_CASES = JSON.parse(
  readFileSync("tests/fixtures/wise_choice_boundaries.json", "utf8")
);

function installMlbDom() {
  document.body.innerHTML = `
    <div id="meta"></div>
    <section id="status-note"></section>
    <section id="loading"></section>
    <section id="games"></section>
    <section id="error"></section>
    <div id="page-subtitle">Forecasts render from the BoardWise public API. When matched odds are present, each tile shows a best available bet card and market-level dropdowns with both sides of every market.</div>
    <form id="date-form"><input id="board-date" name="date" type="date"></form>
    <div id="ev-filters"></div>
    <div id="prob-filters"></div>
    <section id="quick-guide"></section>
    <section id="obsidian-hero" aria-labelledby="obsidian-hero-title" hidden></section>
    <div id="model-selector" hidden></div>
    <div id="board-view-toggle"></div>
    <div id="best-card-toggle"></div>
  `;
}

function getObsidianHero() {
  return /** @type {HTMLElement | null} */ (document.querySelector("#obsidian-hero"));
}

function payload(modelFamily = "obsidian_steed", overrides = {}) {
  const visualBranding = overrides.visual_branding ?? (
    modelFamily === "obsidian_steed"
      ? {
        family: "obsidian_steed",
        display_name: "Obsidian Steed",
        variant: "shadow",
        hero_enabled: true,
        shadow_treatment_enabled: true,
        requires_games: true,
        public_enabled: false,
      }
      : {
        family: "classic_mlb",
        display_name: "Classic MLB",
        variant: "classic",
        hero_enabled: false,
        shadow_treatment_enabled: false,
        requires_games: true,
        public_enabled: false,
      }
  );
  const trackerMarkets = overrides.tracker_markets ?? {
    enabled: false,
    has_markets: false,
    public: false,
    status: "disabled",
    official_allowed: false,
    tracking_only: true,
    counts: {
      games_with_tracker_markets: 0,
      outcomes: 0,
      first_inning_outcomes: 0,
    },
    markets: [],
  };
  return {
    target_date: "2026-05-27",
    generated_at: "2026-05-27 12:00 PM",
    game_count: overrides.game_count ?? 0,
    betting_game_count: 0,
    recommendation_count: 0,
    books_seen: [],
    games: overrides.games || [],
    access: overrides.access,
    model_metadata: {
      default_model_family: "classic_mlb",
      selected_model_family: modelFamily,
      available_model_families: overrides.available_model_families || [
        { key: "obsidian_steed", label: "Obsidian Steed", available: true },
        { key: "classic_mlb", label: "Classic MLB", available: true },
      ],
      selected_model_available: true,
      visual_branding: visualBranding,
      tracker_markets: trackerMarkets,
      model_versions: [],
    },
  };
}

function previewGame(id, label) {
  return {
    game_pk: id,
    game_label: label,
    away_team_abbr: "AWY",
    home_team_abbr: "HOM",
    away_pitcher: "Away Starter",
    home_pitcher: "Home Starter",
    lineup_status_away: "projected",
    lineup_status_home: "confirmed",
    commence_time: "Wed 7:10 PM CT",
    venue: "Test Park",
    favorite_team: "Home",
    favorite_prob_text: "56.0%",
    board_state_label: "Board Live",
  };
}

async function loadMlbBoardScript(getMlbBoard) {
  vi.resetModules();
  installMlbDom();
  window.BoardWiseApi = /** @type {any} */ ({ getMlbBoard });
  await import("../assets/js/wise-choice.js");
  await import("../assets/js/mlb-team-branding.js");
  await import("../assets/js/mlb-board.js");
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.BoardWiseApi;
  delete window.BoardWiseWiseChoice;
  delete window.BoardWiseMlbBranding;
  delete (/** @type {any} */ (window)).__BoardWiseMlbTestHooks;
  delete (/** @type {any} */ (window)).__BoardWiseMlbBrandingTestHooks;
  document.body.innerHTML = "";
  document.body.className = "";
  delete document.body.dataset.obsidianVariant;
  window.history.replaceState({}, "", "/");
});

describe("mlb-board model selector", () => {
  it("renders free preview payloads as two sanitized cards", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 2,
        access: {
          level: "preview",
          preview: true,
          full_access: false,
          max_preview_games: 2,
          preview_game_count: 2,
          required_feature: "mlb_board_advanced",
          upgrade_path: "/pricing/",
        },
        games: [
          previewGame(1, "One at Home"),
          previewGame(2, "Two at Home"),
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);

    await vi.waitFor(() => expect(document.querySelectorAll(".preview-tile").length).toBe(2));
    expect(document.querySelector("#games")?.textContent).toContain("Full MLB board requires Pro access");
    expect(document.querySelector("#games")?.textContent).toContain("your 2 MLB cards for today");
    expect(document.querySelector("#games a.button")?.getAttribute("href")).toBe("/pricing/");
    expect(/** @type {HTMLElement | null} */ (document.querySelector("#model-selector"))?.hidden).toBe(true);
    expect(/** @type {HTMLElement | null} */ (document.querySelector("#best-card-toggle"))?.style.display).toBe("none");
  });

  it("falls back to the pricing path for unsafe preview upgrade links", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        access: {
          level: "preview",
          preview: true,
          full_access: false,
          max_preview_games: 2,
          upgrade_path: "https://evil.example/phish",
        },
        games: [],
      })
    );

    await loadMlbBoardScript(getMlbBoard);

    await vi.waitFor(() => expect(document.querySelector("#games a.button")?.textContent).toBe("Upgrade"));
    expect(document.querySelector("#games a.button")?.getAttribute("href")).toBe("/pricing/");
  });

  it("falls back to the pricing path for protocol-relative preview upgrade links", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        access: {
          level: "preview",
          preview: true,
          full_access: false,
          max_preview_games: 2,
          upgrade_path: "//evil.example/phish",
        },
        games: [],
      })
    );

    await loadMlbBoardScript(getMlbBoard);

    await vi.waitFor(() => expect(document.querySelector("#games a.button")?.textContent).toBe("Upgrade"));
    expect(document.querySelector("#games a.button")?.getAttribute("href")).toBe("/pricing/");
  });

  it("shows sign-in copy for unauthenticated MLB access", async () => {
    window.history.replaceState({}, "", "/mlb/");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("401 Unauthorized"), { status: 401 });
    const getMlbBoard = vi.fn().mockRejectedValue(error);

    await loadMlbBoardScript(getMlbBoard);

    await vi.waitFor(() => {
      expect(document.querySelector("#error")?.textContent).toContain("Sign in to view the MLB board");
    });
  });

  it("shows pro-access copy for paid-only MLB views", async () => {
    window.history.replaceState({}, "", "/mlb/?date=2026-05-27");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("403 Forbidden"), { status: 403 });
    const getMlbBoard = vi.fn().mockRejectedValue(error);

    await loadMlbBoardScript(getMlbBoard);

    await vi.waitFor(() => {
      expect(document.querySelector("#error")?.textContent).toContain("requires Pro access");
    });
  });

  it("uses the model URL state when loading the board", async () => {
    window.history.replaceState({}, "", "/mlb/?model=obsidian_steed");
    const getMlbBoard = vi.fn().mockResolvedValue(payload("obsidian_steed"));

    await loadMlbBoardScript(getMlbBoard);

    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalled());
    expect(getMlbBoard).toHaveBeenCalledWith("", { model: "obsidian_steed" });
    expect(document.querySelector(".model-selector-button.active")?.textContent).toContain("Obsidian Steed");
  });

  it("uses Classic MLB from URL state when requested", async () => {
    window.history.replaceState({}, "", "/mlb/?model=classic_mlb");
    const getMlbBoard = vi.fn().mockResolvedValue(payload("classic_mlb"));

    await loadMlbBoardScript(getMlbBoard);

    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalled());
    expect(getMlbBoard).toHaveBeenCalledWith("", { model: "classic_mlb" });
    expect(document.querySelector(".model-selector-button.active")?.textContent).toContain("Classic MLB");
  });

  it("writes model URL state when toggled", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi
      .fn()
      .mockResolvedValueOnce(payload("classic_mlb"))
      .mockResolvedValueOnce(payload("obsidian_steed"));

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    const obsidianButton = /** @type {HTMLButtonElement} */ (
      document.querySelector('[data-model-family="obsidian_steed"]')
    );
    obsidianButton.click();

    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(2));
    expect(new URL(window.location.href).searchParams.get("model")).toBe("obsidian_steed");
    expect(getMlbBoard).toHaveBeenLastCalledWith("", { model: "obsidian_steed" });
  });

  it("does not load unavailable model options", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        available_model_families: [
          { key: "obsidian_steed", label: "Obsidian Steed", available: false },
          { key: "classic_mlb", label: "Classic MLB", available: true },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    const obsidianButton = /** @type {HTMLButtonElement} */ (
      document.querySelector('[data-model-family="obsidian_steed"]')
    );
    expect(obsidianButton.disabled).toBe(true);
    obsidianButton.click();

    expect(getMlbBoard).toHaveBeenCalledTimes(1);
    expect(new URL(window.location.href).searchParams.get("model")).toBeNull();
  });

  it("uses API badge text in the model selector when available", async () => {
    window.history.replaceState({}, "", "/mlb/?model=obsidian_steed");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("obsidian_steed", {
        game_count: 1,
        games: [{ game_label: "Away at Home", model_version: "obsidian_steed_smoke_v1" }],
        available_model_families: [
          {
            key: "obsidian_steed",
            label: "Obsidian Steed",
            available: true,
            visibility_status: "shadow",
            badge: "Registry badge X1",
          },
          {
            key: "classic_mlb",
            label: "Classic MLB",
            available: true,
            visibility_status: "classic",
            badge: "Legacy baseline",
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    const obsidianButton = document.querySelector('[data-model-family="obsidian_steed"]');
    expect(obsidianButton?.textContent).toContain("Registry badge X1");
    const badgeTags = obsidianButton?.querySelectorAll(".model-tag") ?? [];
    expect([...badgeTags].map((tag) => tag.textContent)).toEqual(["Registry badge X1"]);
  });

  it("renders only the model families the API advertises", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        available_model_families: [
          { key: "classic_mlb", label: "Classic MLB", available: true },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    expect(document.querySelector('[data-model-family="obsidian_steed"]')).toBeNull();
    expect(document.querySelectorAll("#model-selector [data-model-family]")).toHaveLength(1);
    expect(document.querySelector('[data-model-family="classic_mlb"]')).not.toBeNull();
    expect(new URL(window.location.href).searchParams.get("model")).toBeNull();
  });

  it("hides the model selector when the API advertises no model families", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", { available_model_families: [] })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    const selector = /** @type {HTMLElement | null} */ (document.querySelector("#model-selector"));
    expect(selector?.hidden).toBe(true);
    expect(selector?.innerHTML).toBe("");
  });

  it("renders a novel model family straight from API metadata", async () => {
    window.history.replaceState({}, "", "/mlb/?model=thunder_tusk");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("thunder_tusk", {
        game_count: 1,
        games: [{ game_label: "Away at Home", model_version: "thunder_tusk_smoke_v1" }],
        visual_branding: {
          family: "thunder_tusk",
          display_name: "Thunder Tusk",
          variant: "shadow",
          hero_enabled: false,
          shadow_treatment_enabled: false,
          requires_games: true,
          public_enabled: false,
        },
        available_model_families: [
          {
            key: "thunder_tusk",
            label: "Thunder Tusk",
            available: true,
            visibility_status: "shadow",
            status: "shadow",
            badge: "Simulation engine",
          },
          { key: "classic_mlb", label: "Classic MLB", available: true, visibility_status: "classic", badge: "Legacy baseline" },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    expect(getMlbBoard).toHaveBeenCalledWith("", { model: "thunder_tusk" });
    const buttons = document.querySelectorAll("#model-selector [data-model-family]");
    expect([...buttons].map((button) => button.getAttribute("data-model-family"))).toEqual([
      "thunder_tusk",
      "classic_mlb",
    ]);
    const novelButton = document.querySelector('[data-model-family="thunder_tusk"]');
    expect(novelButton?.classList.contains("active")).toBe(true);
    expect(novelButton?.textContent).toContain("Thunder Tusk");
    expect(novelButton?.textContent).toContain("Simulation engine");
    expect(new URL(window.location.href).searchParams.get("model")).toBe("thunder_tusk");
  });

  it("falls back to the default board once when the API rejects the model param", async () => {
    window.history.replaceState({}, "", "/mlb/?model=not_a_real_model");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const badRequest = Object.assign(new Error("400 Bad Request"), { status: 400 });
    const getMlbBoard = vi
      .fn()
      .mockRejectedValueOnce(badRequest)
      .mockResolvedValueOnce(payload("classic_mlb"));

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(2));

    expect(getMlbBoard).toHaveBeenNthCalledWith(1, "", { model: "not_a_real_model" });
    expect(getMlbBoard).toHaveBeenNthCalledWith(2, "", { model: undefined });
    expect(new URL(window.location.href).searchParams.get("model")).toBeNull();
    expect(document.querySelector(".model-selector-button.active")?.textContent).toContain("Classic MLB");
  });

  it("does not loop when the model fallback also fails", async () => {
    window.history.replaceState({}, "", "/mlb/?model=not_a_real_model");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const badRequest = Object.assign(new Error("400 Bad Request"), { status: 400 });
    const getMlbBoard = vi.fn().mockRejectedValue(badRequest);

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => {
      expect(document.querySelector("#error")?.textContent).toContain("Could not load the MLB board");
    });

    expect(getMlbBoard).toHaveBeenCalledTimes(2);
  });

  it("normalizes the URL when the API resolves a family the metadata does not list", async () => {
    window.history.replaceState({}, "", "/mlb/?model=retired_family");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        available_model_families: [
          { key: "classic_mlb", label: "Classic MLB", available: true },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    expect(getMlbBoard).toHaveBeenCalledWith("", { model: "retired_family" });
    expect(new URL(window.location.href).searchParams.get("model")).toBe("classic_mlb");
  });

  it("normalizes the URL when the API selects a different family than an advertised-but-unavailable request", async () => {
    window.history.replaceState({}, "", "/mlb/?model=obsidian_steed");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        available_model_families: [
          { key: "classic_mlb", label: "Classic MLB", available: true },
          {
            key: "obsidian_steed",
            label: "Obsidian Steed",
            available: false,
            visibility_status: "shadow",
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    expect(getMlbBoard).toHaveBeenCalledWith("", { model: "obsidian_steed" });
    expect(new URL(window.location.href).searchParams.get("model")).toBe("classic_mlb");
  });

  it("hides shadow-only model options from the public Classic page", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        available_model_families: [
          { key: "classic_mlb", label: "Classic MLB", status: "classic" },
          {
            key: "obsidian_steed",
            label: "Obsidian Steed",
            status: "new_model",
            visibility_status: "shadow",
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    expect(document.querySelector('[data-model-family="classic_mlb"]')).not.toBeNull();
    expect(document.querySelector('[data-model-family="obsidian_steed"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Obsidian Steed");
  });

  it("shows Obsidian shadow hero only when selected payload enables it", async () => {
    window.history.replaceState({}, "", "/mlb/?model=obsidian_steed");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("obsidian_steed", {
        game_count: 1,
        games: [{ game_label: "Away at Home", model_version: "obsidian_steed_smoke_v1" }],
        visual_branding: {
          family: "obsidian_steed",
          display_name: "Obsidian Steed",
          variant: "shadow",
          hero_enabled: true,
          shadow_treatment_enabled: true,
          requires_games: true,
          public_enabled: false,
        },
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getObsidianHero()?.hidden).toBe(false));

    const hero = getObsidianHero();
    expect(hero?.getAttribute("aria-labelledby")).toBe("obsidian-hero-title");
    expect(hero?.querySelector("h2#obsidian-hero-title")?.textContent).toBe("Obsidian Steed Shadow");
    expect(hero?.textContent).toContain("Obsidian Steed Shadow");
    expect(hero?.textContent).toContain("Tracking model under review before public grading.");
    expect(hero?.textContent).not.toContain("Next-generation MLB model");
    expect(document.body.classList.contains("obsidian-treatment")).toBe(true);
    expect(document.body.dataset.obsidianVariant).toBe("shadow");
  });

  it("shows Obsidian public hero copy only for public variant", async () => {
    window.history.replaceState({}, "", "/mlb/?model=obsidian_steed");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("obsidian_steed", {
        game_count: 1,
        games: [{ game_label: "Away at Home", model_version: "obsidian_steed_public_v1" }],
        visual_branding: {
          family: "obsidian_steed",
          display_name: "Obsidian Steed",
          variant: "public",
          hero_enabled: true,
          shadow_treatment_enabled: false,
          requires_games: true,
          public_enabled: true,
        },
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getObsidianHero()?.hidden).toBe(false));

    const hero = getObsidianHero();
    expect(hero?.textContent).toContain("Obsidian Steed");
    expect(hero?.textContent).not.toContain("Next-generation MLB model powering today's board.");
    expect(hero?.querySelector(".obsidian-hero-copy")).toBeNull();
    expect(hero?.textContent).not.toContain("Shadow");
    expect(document.body.dataset.obsidianVariant).toBe("public");
  });

  it("does not show Obsidian hero or treatment for Classic", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [{ game_label: "Away at Home", model_version: "ensemble_probable_v1" }],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    expect(getObsidianHero()?.hidden).toBe(true);
    expect(getObsidianHero()?.textContent).toBe("");
    expect(document.body.classList.contains("obsidian-treatment")).toBe(false);
    expect(document.body.dataset.obsidianVariant).toBeUndefined();
  });

  it("does not show Obsidian hero or treatment on empty Obsidian boards", async () => {
    window.history.replaceState({}, "", "/mlb/?model=obsidian_steed");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("obsidian_steed", {
        game_count: 0,
        games: [],
        visual_branding: {
          family: "obsidian_steed",
          display_name: "Obsidian Steed",
          variant: "shadow",
          hero_enabled: true,
          shadow_treatment_enabled: true,
          requires_games: true,
          public_enabled: false,
        },
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    expect(getObsidianHero()?.hidden).toBe(true);
    expect(document.body.classList.contains("obsidian-treatment")).toBe(false);
    expect(document.body.textContent).not.toContain("Obsidian Steed Shadow");
  });

  it("does not show Obsidian treatment when metadata disables the hero", async () => {
    window.history.replaceState({}, "", "/mlb/?model=obsidian_steed");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("obsidian_steed", {
        game_count: 1,
        games: [{ game_label: "Away at Home", model_version: "obsidian_steed_smoke_v1" }],
        visual_branding: {
          family: "obsidian_steed",
          display_name: "Obsidian Steed",
          variant: "shadow",
          hero_enabled: false,
          shadow_treatment_enabled: true,
          requires_games: true,
          public_enabled: false,
        },
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    expect(getObsidianHero()?.hidden).toBe(true);
    expect(document.body.classList.contains("obsidian-treatment")).toBe(false);
  });

  it("keeps Classic quick guide and subtitle unchanged when trackers are absent", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [{ game_label: "Away at Home", model_version: "ensemble_probable_v1" }],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getMlbBoard).toHaveBeenCalledTimes(1));

    expect(document.querySelector("#page-subtitle")?.textContent).toBe(
      "Forecasts render from the BoardWise public API. When matched odds are present, each tile shows a best available bet card and market-level dropdowns with both sides of every market."
    );
    expect(document.querySelector("#quick-guide")?.textContent).toContain("Market Dropdowns");
    expect(document.querySelector("#quick-guide")?.textContent).toContain("Money Line, Run Line, and Total dropdowns show both sides of every market.");
    expect(document.querySelector("#quick-guide")?.textContent).not.toContain("1st Inning Trackers");
    expect(document.querySelector("#quick-guide")?.textContent).not.toContain("Obsidian Steed");
  });

  it("does not style Verify as a strong card by default", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const verifyPick = {
      selection_text: "Verify Side",
      sportsbook: "BookA",
      odds_text: "+120",
      wise_choice_score: 25,
      wise_choice_bucket_key: "elite_verify_25_plus",
      wise_choice_bucket_label: "25+ - Verify",
      wise_choice_status: "Verify",
      is_official: true,
    };
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [
          {
            game_label: "Away at Home",
            commence_time: "7:05 PM",
            venue: "Test Park",
            favorite_team: "Home",
            favorite_prob_text: "55.0%",
            best_card_options: { wise_choice: verifyPick },
            recommendations: [verifyPick],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tile")).not.toBeNull());

    expect(document.querySelector(".tile.strong")).toBeNull();
    expect(document.body.textContent).toContain("Verify Line");
  });

  it("renders tracker markets separately from official and Wise Choice buckets", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const officialPick = {
      selection_text: "Home Moneyline",
      label: "Home Moneyline",
      sportsbook: "BookA",
      odds_text: "-120",
      wise_choice_score: 9,
      wise_choice_bucket_key: "pass_8_14",
      wise_choice_bucket_label: "8-14 - Playable",
      wise_choice_status: "Playable",
      is_official: true,
    };
    const trackingPick = {
      selection_text: "YRFI",
      label: "YRFI",
      sportsbook: "BookT",
      odds_text: "+100",
      wise_choice_score: 12,
      wise_choice_bucket_key: "pass_8_14",
      wise_choice_bucket_label: "8-14 - Playable",
      wise_choice_status: "Playable",
      is_official: true,
      tracking_only: true,
    };
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        tracker_markets: {
          enabled: true,
          has_markets: true,
          public: false,
          status: "shadow_tracking",
          official_allowed: false,
          tracking_only: true,
          counts: {
            games_with_tracker_markets: 1,
            outcomes: 2,
            first_inning_outcomes: 2,
          },
          market_keys: ["nrfi_yrfi"],
          markets: [
            { key: "nrfi_yrfi", label: "NRFI/YRFI", period: "first_inning", tracking_only: true },
          ],
        },
        games: [
          {
            game_label: "Away at Home",
            commence_time: "7:05 PM",
            venue: "Test Park",
            favorite_team: "Home",
            favorite_prob_text: "55.0%",
            best_card_options: { wise_choice: trackingPick, best_value: officialPick },
            recommendations: [trackingPick, officialPick],
            market_dropdowns: [
              {
                title: "Money Line",
                market_key: "h2h",
                options: [trackingPick, officialPick],
              },
            ],
            tracker_market_dropdowns: [
              {
                market_key: "first_inning_total",
                title: "first_inning_total",
                tracking_only: true,
                outcomes: [
                  {
                    side: "over",
                    label: "Over 0.5",
                    model_probability_text: "31.2%",
                    market_probability_text: "29.5%",
                    tracking_only: true,
                  },
                ],
              },
              {
                market_key: "nrfi_yrfi",
                title: "raw yes/no tracker",
                tracking_only: true,
                outcomes: [
                  {
                    side: "yrfi",
                    label: "YRFI",
                    model_probability_text: "31.2%",
                    tracking_only: true,
                  },
                  {
                    side: "nrfi",
                    label: "NRFI",
                    model_probability_text: "68.8%",
                    tracking_only: true,
                  },
                ],
              },
              {
                market_key: "first_inning_moneyline",
                title: "raw first inning side",
                tracking_only: true,
                outcomes: [
                  {
                    side: "home",
                    label: "Home 1st Inning",
                    model_probability_text: "51.0%",
                    tracking_only: true,
                  },
                ],
              },
              {
                market_key: "first_inning_spread",
                title: "raw first inning run line",
                tracking_only: true,
                outcomes: [
                  {
                    side: "home",
                    label: "Home -0.5 1st",
                    model_probability_text: "44.0%",
                    tracking_only: true,
                  },
                ],
              },
            ],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tracker-market-dropdown")).not.toBeNull());

    expect(document.querySelectorAll(".tracker-market-dropdown")).toHaveLength(1);
    expect(document.querySelector("#page-subtitle")?.textContent).toBe(
      "Compare official MLB picks, market dropdowns, and tracking-only first-inning signals from the BoardWise public API."
    );
    expect(document.querySelector("#quick-guide")?.textContent).toContain("1st Inning Trackers");
    expect(document.querySelector("#quick-guide")?.textContent).toContain("NRFI/YRFI is a tracking-only first-inning model signal. It is not an official pick and is not included in public performance.");
    expect(document.body.textContent).toContain("Money Line");
    expect(document.body.textContent).not.toContain("1st Inning O/U");
    expect(document.body.textContent).toContain("NRFI/YRFI");
    expect(document.body.textContent).not.toContain("1st Inning Moneyline");
    expect(document.body.textContent).not.toContain("1st Inning Run Line");
    expect(document.body.textContent).not.toContain("Home 1st Inning");
    expect(document.body.textContent).not.toContain("Home -0.5 1st");
    expect(document.body.textContent).not.toContain("first_inning_total");
    expect(document.body.textContent).not.toContain("raw yes/no tracker");
    expect(document.body.textContent).not.toContain("Over 0.5");
    expect(document.body.textContent).toContain("YRFI");
    expect(document.body.textContent).toContain("NRFI");
    expect(document.body.textContent).toContain("Tracking Only");
    expect(document.body.textContent).toContain("Tracking-only market. Not included in official record or public performance.");
    expect(document.querySelector(".tracker-market-dropdown .option-badge.official")).toBeNull();
    expect(document.querySelector(".best-card")?.textContent).toContain("Home Moneyline");
    expect(document.querySelector(".best-card")?.textContent).not.toContain("YRFI");
    const wiseChoiceButton = /** @type {HTMLElement | null} */ (document.querySelector('[data-best-card-sort="wise_choice"]'));
    wiseChoiceButton?.click();
    expect(document.querySelector(".bet-pill-list")?.textContent).toContain("Home Moneyline");
    expect(document.querySelector(".bet-pill-list")?.textContent).not.toContain("YRFI");
  });

  it("renders full-board Wise Choice from an official recommendation when the explicit card is absent", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const officialPick = {
      selection_text: "Away Moneyline",
      label: "Away Moneyline",
      sportsbook: "BookA",
      odds_text: "+115",
      wise_choice_score: 16,
      wise_choice_bucket_key: "medium_high_14_20",
      wise_choice_bucket_label: "14-20 - Strong",
      wise_choice_status: "Strong",
      is_official: true,
    };
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [
          {
            game_label: "Away at Home",
            commence_time: "7:05 PM",
            venue: "Test Park",
            favorite_team: "Away",
            favorite_prob_text: "54.0%",
            best_card_options: {},
            recommendations: [officialPick],
            market_dropdowns: [],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".best-card")).not.toBeNull());

    const bestCardText = document.querySelector(".best-card")?.textContent || "";
    expect(bestCardText).toContain("Wise Choice");
    expect(bestCardText).toContain("Away Moneyline");
    expect(bestCardText).toContain("BookA");
    expect(bestCardText).toContain("+115");
    expect(bestCardText).toContain("Official");
    expect(bestCardText).not.toContain("No best-bet recommendation");
  });

  it("keeps no-recommendation full-board games in the graceful no-pick state", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [
          {
            game_label: "Away at Home",
            best_card_options: {},
            recommendations: [],
            market_dropdowns: [],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tile")).not.toBeNull());

    const bodyText = document.body.textContent || "";
    expect(bodyText).toContain("No Wise Choice recommendation is available for this game yet.");
    expect(bodyText).not.toContain("undefined");
    expect(bodyText).not.toContain("null");
    expect(bodyText).not.toContain("[object Object]");
  });

  it("does not render tracker dropdowns when tracker metadata is disabled", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        tracker_markets: {
          enabled: false,
          has_markets: true,
          markets: [{ key: "first_inning_total", label: "1st Inning O/U" }],
        },
        games: [
          {
            game_label: "Away at Home",
            market_dropdowns: [
              {
                title: "Total Runs",
                market_key: "totals",
                options: [{ label: "Over 8.5", odds_text: "-110", is_official: false }],
              },
            ],
            tracker_market_dropdowns: [
              {
                market_key: "first_inning_total",
                title: "first_inning_total",
                tracking_only: true,
                outcomes: [{ label: "Over 0.5", tracking_only: true }],
              },
            ],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tile")).not.toBeNull());

    expect(document.querySelector(".tracker-market-dropdown")).toBeNull();
    expect(document.body.textContent).toContain("Total Runs");
    expect(document.body.textContent).not.toContain("1st Inning O/U");
    expect(document.body.textContent).not.toContain("Over 0.5");
  });

  it("does not render first-inning O/U even if an old payload advertises it", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        tracker_markets: {
          enabled: true,
          has_markets: true,
          market_keys: ["first_inning_total"],
          markets: [{ key: "first_inning_total", label: "1st Inning O/U" }],
        },
        games: [
          {
            game_label: "Away at Home",
            market_dropdowns: [],
            tracker_market_dropdowns: [
              {
                market_key: "first_inning_total",
                title: "first_inning_total",
                tracking_only: true,
                outcomes: [
                  { label: "Over 0.5", tracking_only: true },
                  { label: "Under 0.5", tracking_only: true },
                ],
              },
            ],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tile")).not.toBeNull());

    expect(document.querySelector(".tracker-market-dropdown")).toBeNull();
    expect(document.querySelector("#quick-guide")?.textContent).not.toContain("1st Inning Trackers");
    expect(document.body.textContent).not.toContain("1st Inning O/U");
    expect(document.body.textContent).not.toContain("Over 0.5");
    expect(document.body.textContent).not.toContain("Under 0.5");
  });

  it("does not render tracker dropdowns when tracker metadata says no markets exist", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        tracker_markets: {
          enabled: true,
          has_markets: false,
          markets: [{ key: "nrfi_yrfi", label: "NRFI/YRFI" }],
        },
        games: [
          {
            game_label: "Away at Home",
            market_dropdowns: [
              {
                title: "Money Line",
                market_key: "h2h",
                options: [{ label: "Home Moneyline", odds_text: "-120", is_official: true }],
              },
            ],
            tracker_market_dropdowns: [
              {
                market_key: "nrfi_yrfi",
                title: "raw yes/no tracker",
                tracking_only: true,
                outcomes: [{ label: "YRFI", tracking_only: true }],
              },
            ],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tile")).not.toBeNull());

    expect(document.querySelector(".tracker-market-dropdown")).toBeNull();
    expect(document.querySelector("#quick-guide")?.textContent).not.toContain("1st Inning Trackers");
    expect(document.body.textContent).toContain("Money Line");
    expect(document.body.textContent).not.toContain("NRFI/YRFI");
    expect(document.body.textContent).not.toContain("YRFI");
  });

  it("adds Obsidian shadow quick-guide copy only when the treatment is visible", async () => {
    window.history.replaceState({}, "", "/mlb/?model=obsidian_steed");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("obsidian_steed", {
        game_count: 1,
        games: [{ game_label: "Away at Home", model_version: "obsidian_steed_smoke_v1" }],
        visual_branding: {
          family: "obsidian_steed",
          display_name: "Obsidian Steed",
          variant: "shadow",
          hero_enabled: true,
          shadow_treatment_enabled: true,
          requires_games: true,
          public_enabled: false,
        },
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getObsidianHero()?.hidden).toBe(false));

    const guideText = document.querySelector("#quick-guide")?.textContent;
    expect(guideText).toContain("Obsidian Steed Shadow");
    expect(guideText).toContain("A next-generation MLB model is visible for review while official performance remains separated from Classic public results.");
    expect(guideText).not.toContain("The selected MLB model powers this board");
  });

  it("adds Obsidian public quick-guide copy only for public treatment", async () => {
    window.history.replaceState({}, "", "/mlb/?model=obsidian_steed");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("obsidian_steed", {
        game_count: 1,
        games: [{ game_label: "Away at Home", model_version: "obsidian_steed_public_v1" }],
        visual_branding: {
          family: "obsidian_steed",
          display_name: "Obsidian Steed",
          variant: "public",
          hero_enabled: true,
          shadow_treatment_enabled: false,
          requires_games: true,
          public_enabled: true,
        },
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(getObsidianHero()?.hidden).toBe(false));

    const guideText = document.querySelector("#quick-guide")?.textContent;
    expect(guideText).toContain("Obsidian Steed");
    expect(guideText).toContain("The selected MLB model powers this board, with official picks and tracker-only markets clearly separated.");
    expect(guideText).not.toContain("A next-generation MLB model is visible");
  });

  it("labels moneyline odds by side for shared-nickname matchups", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [
          {
            game_label: "White Sox at Red Sox",
            away_team: "Chicago White Sox",
            home_team: "Boston Red Sox",
            away_team_abbr: "CWS",
            home_team_abbr: "BOS",
            away_win_prob_text: "47.0%",
            home_win_prob_text: "53.0%",
            commence_time: "7:05 PM",
            venue: "Fenway Park",
            favorite_team: "Red Sox",
            favorite_prob_text: "53.0%",
            best_card_options: {},
            recommendations: [],
            market_dropdowns: [
              {
                title: "Money Line",
                market_key: "h2h",
                options: [
                  { selection_text: "Red Sox Moneyline", label: "Red Sox Moneyline", odds_text: "-150" },
                  { selection_text: "White Sox Moneyline", label: "White Sox Moneyline", odds_text: "+130" },
                ],
              },
            ],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tot-side.away")).not.toBeNull());

    const away = document.querySelector(".tot-side.away")?.textContent || "";
    const home = document.querySelector(".tot-side.home")?.textContent || "";
    expect(away).toContain("ML +130");
    expect(away).not.toContain("-150");
    expect(home).toContain("ML -150");
    expect(home).not.toContain("+130");
  });

  it("styles the away side as favored when away has the higher explicit probability", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [
          {
            game_label: "Mets at Cubs",
            away_team: "New York Mets",
            home_team: "Chicago Cubs",
            away_team_abbr: "NYM",
            home_team_abbr: "CHC",
            away_win_prob_text: "61.0%",
            home_win_prob_text: "39.0%",
            best_card_options: {},
            recommendations: [],
            market_dropdowns: [],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tot-side.away")).not.toBeNull());

    expect(document.querySelector(".tot-side.away")?.classList.contains("is-favored")).toBe(true);
    expect(document.querySelector(".tot-side.home")?.classList.contains("is-underdog")).toBe(true);
  });

  it("falls back to favorite_team for favored styling when explicit probabilities are absent", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [
          {
            game_label: "Mets at Cubs",
            away_team: "New York Mets",
            home_team: "Chicago Cubs",
            away_team_abbr: "NYM",
            home_team_abbr: "CHC",
            favorite_team: "Mets",
            favorite_prob_text: "55.5%",
            best_card_options: {},
            recommendations: [],
            market_dropdowns: [],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tot-side.away")).not.toBeNull());

    expect(document.querySelector(".tot-side.away")?.classList.contains("is-favored")).toBe(true);
    expect(document.querySelector(".tot-side.home")?.classList.contains("is-underdog")).toBe(true);
  });

  it("does not automatically favor home when the favorite is unresolved", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [
          {
            game_label: "Away at Home",
            away_team: "Away Club",
            home_team: "Home Club",
            best_card_options: {},
            recommendations: [],
            market_dropdowns: [],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tot-side.home")).not.toBeNull());

    expect(document.querySelector(".tot-side.away")?.classList.contains("is-favored")).toBe(false);
    expect(document.querySelector(".tot-side.home")?.classList.contains("is-favored")).toBe(false);
  });

  it("selects representative market options by official, primary, summary match, then first valid option", async () => {
    const getMlbBoard = vi.fn().mockResolvedValue(payload("classic_mlb"));

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect((/** @type {any} */ (window)).__BoardWiseMlbTestHooks).toBeTruthy());
    const hooks = (/** @type {any} */ (window)).__BoardWiseMlbTestHooks;

    expect(hooks.representativeMarketOption({
      summary_center_text: "Primary side",
      options: [
        { selection_text: "Primary side", is_primary: true },
        { selection_text: "Official side", is_official: true },
      ],
    })?.selection_text).toBe("Official side");
    expect(hooks.representativeMarketOption({
      summary_center_text: "Other side",
      options: [
        { selection_text: "First side" },
        { selection_text: "Primary side", is_primary: true },
      ],
    })?.selection_text).toBe("Primary side");
    expect(hooks.representativeMarketOption({
      summary_center_text: "Under 8.5",
      options: [
        { selection_text: "Over 8.5" },
        { label: "Under 8.5" },
      ],
    })?.label).toBe("Under 8.5");
    expect(hooks.representativeMarketOption({
      summary_center_text: "No match",
      options: [
        { selection_text: "First side" },
        { selection_text: "Second side" },
      ],
    })?.selection_text).toBe("First side");
  });

  it("renders market rows safely when a market has no options", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [
          {
            game_label: "Away at Home",
            market_dropdowns: [{ title: "Money Line", market_key: "h2h", options: [] }],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".market-summary-table")).not.toBeNull());

    expect(document.querySelector(".market-summary-selection")?.textContent).toContain("Money Line");
    expect(document.querySelector(".market-summary-model")?.textContent).toContain("—");
    expect(document.querySelector(".market-summary-call")?.textContent).toContain("Pass");
    expect(document.body.textContent).toContain("No market options are available for this market yet.");
  });

  it("does not infer an Official market call from positive edge alone", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [
          {
            game_label: "Away at Home",
            market_dropdowns: [
              {
                title: "Total Runs",
                summary_center_text: "Under 8.5",
                options: [
                  { selection_text: "Under 8.5", edge_text: "+9.1%", model_probability_text: "55.0%" },
                ],
              },
            ],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".market-summary-call")).not.toBeNull());

    expect(document.querySelector(".market-summary-call")?.textContent).toBe("Pass");
    expect(document.querySelector(".market-summary-call")?.classList.contains("official")).toBe(false);
  });

  it("renders the collapsed Wise Choice card with Win, Edge, and EV only", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const pick = {
      selection_text: "Home Moneyline",
      label: "Home Moneyline",
      sportsbook: "BookA",
      odds_text: "-120",
      wise_choice_score: 16,
      wise_choice_bucket_key: "medium_high_14_20",
      wise_choice_status: "Strong",
      is_official: true,
      model_probability_text: "58.0%",
      market_probability_text: "53.0%",
      edge_text: "+5.0%",
      ev_text: "+0.08u",
    };
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        games: [
          {
            game_label: "Away at Home",
            best_card_options: { wise_choice: pick },
            recommendations: [pick],
            market_dropdowns: [],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".best-card")).not.toBeNull());

    const text = document.querySelector(".best-card")?.textContent || "";
    expect(text).toContain("Win");
    expect(text).toContain("Edge");
    expect(text).toContain("EV");
    expect(text).not.toContain("Odds");
    expect(text).not.toContain("Market Impl");
  });

  it("preserves game_pk, date, and model in board-to-detail links", async () => {
    window.history.replaceState({}, "", "/mlb/?date=2026-05-27&model=classic_mlb");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        target_date: "2026-05-27",
        game_count: 1,
        games: [
          {
            game_pk: 123456,
            game_label: "Away at Home",
            best_card_options: {},
            recommendations: [],
            market_dropdowns: [],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tot-detail-link")).not.toBeNull());

    const href = document.querySelector(".tot-detail-link")?.getAttribute("href") || "";
    expect(href).toContain("/mlb/game/");
    expect(href).toContain("game_pk=123456");
    expect(href).toContain("date=2026-05-27");
    expect(href).toContain("model=classic_mlb");
  });

  it("renders known team logo markup, resolved team colors, and accessible probability bars", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const game = {
      game_pk: 123456,
      game_label: "Reds at Cardinals",
      away_team: "Cincinnati Reds",
      home_team: "St. Louis Cardinals",
      away_team_abbr: "CIN",
      home_team_abbr: "STL",
      away_pitcher: "Away Starter",
      home_pitcher: "Home Starter",
      lineup_status_away: "projected",
      lineup_status_home: "confirmed",
      away_win_prob_text: "47.2%",
      home_win_prob_text: "52.8%",
      market_dropdowns: [
        {
          title: "Money Line",
          market_key: "h2h",
          options: [
            {
              selection_text: "St. Louis Cardinals Moneyline",
              label: "Cardinals Moneyline",
              sportsbook: "BookA",
              odds_text: "-130",
              model_probability_text: "52.8%",
              edge_text: "+4.2%",
              is_official: true,
            },
            {
              selection_text: "Cincinnati Reds Moneyline",
              label: "Reds Moneyline",
              sportsbook: "BookA",
              odds_text: "+120",
              model_probability_text: "47.2%",
              edge_text: "-4.2%",
            },
          ],
        },
      ],
    };
    const getMlbBoard = vi.fn().mockResolvedValue(payload("classic_mlb", {
      game_count: 1,
      games: [game],
    }));

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tile")).not.toBeNull());

    const awaySide = /** @type {HTMLElement} */ (document.querySelector(".tot-side.away"));
    const homeSide = /** @type {HTMLElement} */ (document.querySelector(".tot-side.home"));
    const awayLogo = /** @type {HTMLImageElement} */ (awaySide.querySelector("[data-team-logo]"));
    const homeLogo = /** @type {HTMLImageElement} */ (homeSide.querySelector("[data-team-logo]"));
    expect(awayLogo.getAttribute("src")).toBe("/assets/img/mlb/team-logos/cin.svg");
    expect(homeLogo.getAttribute("src")).toBe("/assets/img/mlb/team-logos/stl.svg");
    expect(awayLogo.getAttribute("alt")).toBe("");
    expect(awayLogo.getAttribute("width")).toBe("184");
    expect(awayLogo.getAttribute("height")).toBe("132");
    expect(awayLogo.closest(".tot-team-logo-mark")).not.toBeNull();
    expect(awayLogo.closest(".tot-team-mark")).toBeNull();
    expect(document.querySelector(".tot-team-mark.has-logo")).toBeNull();
    expect(awaySide.style.getPropertyValue("--team-fill")).toBe("#000000");
    expect(homeSide.style.getPropertyValue("--team-fill")).toBe("#C41E3A");
    expect(awaySide.style.getPropertyValue("--team-prob-light")).not.toBe("");
    expect(homeSide.style.getPropertyValue("--team-prob-light")).not.toBe("");
    expect(awaySide.getAttribute("aria-label")).toContain("Away team Cincinnati Reds");
    expect(awaySide.getAttribute("aria-label")).toContain("Starting pitcher Away Starter");
    expect(awaySide.getAttribute("aria-label")).toContain("Lineup projected");
    expect(awaySide.getAttribute("aria-label")).toContain("Win probability 47.2%");
    expect(awaySide.getAttribute("aria-label")).toContain("Moneyline +120");

    const bar = /** @type {HTMLElement} */ (document.querySelector(".tot-bar"));
    expect(bar.style.getPropertyValue("--away-team-fill")).toBe("#000000");
    expect(bar.style.getPropertyValue("--home-team-fill")).toBe("#C41E3A");
    expect(bar.getAttribute("aria-label")).toBe("Cincinnati Reds 47.2%, St. Louis Cardinals 52.8%");
    expect(/** @type {HTMLElement} */ (document.querySelector(".tot-mobile-bar")).style.getPropertyValue("--away-team-fill")).toBe("#000000");

    const summary = /** @type {HTMLElement} */ (document.querySelector(".market-summary-row"));
    expect(summary.querySelector(".market-summary-selection")).not.toBeNull();
    expect(summary.querySelector(".market-summary-model")).not.toBeNull();
    expect(summary.querySelector(".market-summary-edge")).not.toBeNull();
    expect(summary.querySelector(".market-summary-call")).not.toBeNull();
    expect(summary.querySelector(".market-summary-chevron")).not.toBeNull();
    expect(summary.getAttribute("aria-label")).toContain("Model 52.8%");
    expect(summary.getAttribute("aria-label")).toContain("Edge +4.2%");
    expect(summary.getAttribute("aria-label")).toContain("Official");
  });

  it("falls back to the abbreviation when a known logo fails to load", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(payload("classic_mlb", {
      game_count: 1,
      games: [
        {
          game_label: "Reds at Cardinals",
          away_team: "Cincinnati Reds",
          home_team: "St. Louis Cardinals",
          away_team_abbr: "CIN",
          home_team_abbr: "STL",
          favorite_team: "Cardinals",
          favorite_prob_text: "52.8%",
          market_dropdowns: [],
        },
      ],
    }));

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector("[data-team-logo]")).not.toBeNull());

    const img = /** @type {HTMLImageElement} */ (document.querySelector(".tot-side.away [data-team-logo]"));
    img.dispatchEvent(new Event("error"));
    const mark = /** @type {HTMLElement} */ (img.closest(".tot-team-logo-mark"));
    expect(mark.classList.contains("logo-failed")).toBe(true);
    expect(mark.querySelector(".tot-team-fallback")?.textContent).toBe("CIN");
  });

  it("uses a neutral abbreviation fallback for unknown teams", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(payload("classic_mlb", {
      game_count: 1,
      games: [
        {
          game_label: "Mystery Club at Red Sox",
          away_team: "Mystery Club",
          home_team: "Boston Red Sox",
          away_team_abbr: "ZZZ",
          home_team_abbr: "BOS",
          away_win_prob_text: "45.0%",
          home_win_prob_text: "55.0%",
          market_dropdowns: [],
        },
      ],
    }));

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tot-side.away .tot-team-mark")).not.toBeNull());

    const awayMark = /** @type {HTMLElement} */ (document.querySelector(".tot-side.away .tot-team-mark"));
    expect(awayMark.querySelector("[data-team-logo]")).toBeNull();
    expect(awayMark.querySelector(".tot-team-fallback")?.textContent).toBe("ZZZ");
    expect(/** @type {HTMLElement} */ (document.querySelector(".tot-side.away")).style.getPropertyValue("--team-fill")).toBe("#667085");
  });

  it("keeps tracker-only market summaries out of the Official state", async () => {
    window.history.replaceState({}, "", "/mlb/");
    const getMlbBoard = vi.fn().mockResolvedValue(
      payload("classic_mlb", {
        game_count: 1,
        tracker_markets: {
          enabled: true,
          has_markets: true,
          market_keys: ["nrfi_yrfi"],
          markets: [{ key: "nrfi_yrfi", label: "NRFI/YRFI" }],
        },
        games: [
          {
            game_label: "Away at Home",
            tracker_market_dropdowns: [
              {
                market_key: "nrfi_yrfi",
                outcomes: [
                  { label: "YRFI", is_official: true, tracking_only: true },
                  { label: "NRFI", tracking_only: true },
                ],
              },
            ],
          },
        ],
      })
    );

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect(document.querySelector(".tracker-market-dropdown")).not.toBeNull());

    const trackerSummary = document.querySelector(".tracker-market-dropdown .market-summary-row");
    expect(trackerSummary?.textContent).toContain("Tracking Only");
    expect(trackerSummary?.textContent).not.toContain("Official");
    expect(trackerSummary?.getAttribute("aria-label")).toContain("Tracking Only");
    expect(document.querySelector(".tracker-market-dropdown .market-call-pill.official")).toBeNull();
  });

  it("matches Wise Choice boundary fixture labels", async () => {
    const getMlbBoard = vi.fn().mockResolvedValue(payload("classic_mlb"));

    await loadMlbBoardScript(getMlbBoard);
    await vi.waitFor(() => expect((/** @type {any} */ (window)).__BoardWiseMlbTestHooks).toBeTruthy());

    for (const testCase of WISE_BOUNDARY_CASES) {
      const bucket = (/** @type {any} */ (window)).__BoardWiseMlbTestHooks.wiseBucketForScore(testCase.score);
      expect(bucket.key).toBe(testCase.key);
      expect(bucket.label).toBe(testCase.label);
      expect(bucket.status).toBe(testCase.status);
      expect(bucket.rank).toBe(testCase.rank);
    }
  });
});
