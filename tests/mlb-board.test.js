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
    <form id="date-form"><input id="board-date" name="date" type="date"></form>
    <div id="ev-filters"></div>
    <div id="prob-filters"></div>
    <section id="quick-guide"></section>
    <div id="model-selector" hidden></div>
    <div id="board-view-toggle"></div>
    <div id="best-card-toggle"></div>
  `;
}

function payload(modelFamily = "obsidian_steed", overrides = {}) {
  return {
    target_date: "2026-05-27",
    generated_at: "2026-05-27 12:00 PM",
    game_count: overrides.game_count ?? 0,
    betting_game_count: 0,
    recommendation_count: 0,
    books_seen: [],
    games: overrides.games || [],
    model_metadata: {
      default_model_family: "classic_mlb",
      selected_model_family: modelFamily,
      available_model_families: overrides.available_model_families || [
        { key: "obsidian_steed", label: "Obsidian Steed", available: true },
        { key: "classic_mlb", label: "Classic MLB", available: true },
      ],
      selected_model_available: true,
      model_versions: [],
    },
  };
}

async function loadMlbBoardScript(getMlbBoard) {
  vi.resetModules();
  installMlbDom();
  window.BoardWiseApi = /** @type {any} */ ({ getMlbBoard });
  await import("../assets/js/mlb-board.js");
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.BoardWiseApi;
  delete (/** @type {any} */ (window)).__BoardWiseMlbTestHooks;
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

describe("mlb-board model selector", () => {
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
