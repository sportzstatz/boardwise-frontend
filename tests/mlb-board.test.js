import { afterEach, describe, expect, it, vi } from "vitest";

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

function payload(modelFamily = "obsidian_steed") {
  return {
    target_date: "2026-05-27",
    generated_at: "2026-05-27 12:00 PM",
    game_count: 0,
    betting_game_count: 0,
    recommendation_count: 0,
    books_seen: [],
    games: [],
    model_metadata: {
      default_model_family: "classic_mlb",
      selected_model_family: modelFamily,
      available_model_families: [
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
});
