import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

const NHL_ONE_GAME = JSON.parse(
  readFileSync("tests/fixtures/nhl-one-game-payload.json", "utf8")
);
const NHL_EMPTY = JSON.parse(
  readFileSync("tests/fixtures/nhl-empty-payload.json", "utf8")
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function installNhlDom() {
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
    <div id="board-view-toggle"></div>
    <div id="best-card-toggle"></div>
  `;
}

async function loadNhlBoardScript(getNhlBoard) {
  vi.resetModules();
  installNhlDom();
  window.BoardWiseApi = /** @type {any} */ ({ getNhlBoard });
  await import("../assets/js/wise-choice.js");
  await import("../assets/js/nhl-board.js");
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.BoardWiseApi;
  delete window.BoardWiseWiseChoice;
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

describe("nhl-board Wise Choice fallback", () => {
  it("renders a full-board Wise Choice card from projected public recommendations", async () => {
    window.history.replaceState({}, "", "/nhl/");
    const payload = clone(NHL_ONE_GAME);
    payload.games[0].best_card_options = {};
    const getNhlBoard = vi.fn().mockResolvedValue(payload);

    await loadNhlBoardScript(getNhlBoard);
    await vi.waitFor(() => expect(document.querySelector(".best-card")).not.toBeNull());

    const bestCardText = document.querySelector(".best-card")?.textContent || "";
    expect(bestCardText).toContain("Wise Choices");
    expect(bestCardText).toContain("Boston Bruins moneyline");
    expect(bestCardText).toContain("DraftKings");
    expect(bestCardText).toContain("-125");
    expect(bestCardText).not.toContain("No recommendation is available");
  });

  it("renders the expected empty state for an empty projected NHL payload", async () => {
    window.history.replaceState({}, "", "/nhl/");
    const getNhlBoard = vi.fn().mockResolvedValue(clone(NHL_EMPTY));

    await loadNhlBoardScript(getNhlBoard);
    await vi.waitFor(() => expect(document.querySelector(".empty-state")).not.toBeNull());

    const bodyText = document.body.textContent || "";
    expect(bodyText).toContain("No NHL board rows found");
    expect(bodyText).not.toContain("undefined");
    expect(bodyText).not.toContain("null");
    expect(bodyText).not.toContain("[object Object]");
  });

  it("keeps no-recommendation game payloads in the graceful no-pick state", async () => {
    window.history.replaceState({}, "", "/nhl/");
    const payload = clone(NHL_ONE_GAME);
    payload.recommendation_count = 0;
    payload.official_recommendations = [];
    payload.games[0].best_card_options = {};
    payload.games[0].recommendations = [];
    const getNhlBoard = vi.fn().mockResolvedValue(payload);

    await loadNhlBoardScript(getNhlBoard);
    await vi.waitFor(() => expect(document.querySelector(".tile")).not.toBeNull());

    const bodyText = document.body.textContent || "";
    expect(bodyText).toContain("No recommendation is available for this sort.");
    expect(bodyText).not.toContain("undefined");
    expect(bodyText).not.toContain("null");
    expect(bodyText).not.toContain("[object Object]");
  });
});
