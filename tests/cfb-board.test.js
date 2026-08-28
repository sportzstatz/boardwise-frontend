import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

const FULL = JSON.parse(readFileSync("tests/fixtures/cfb-forecast-beta-payload.json", "utf8"));

function installDom() {
  document.body.innerHTML = `
    <span id="cfb-slate"></span><span id="cfb-updated"></span>
    <section id="cfb-loading"></section><section id="cfb-error" hidden></section>
    <section id="cfb-access" hidden></section><section id="cfb-games" hidden></section>`;
}

function auth(plan) {
  const authenticated = plan !== "guest";
  return {
    authenticated,
    plan,
    user: authenticated ? { display_name: `${plan} member` } : null,
    features: {
      cfb_board_basic: authenticated,
      cfb_forecast_beta: ["founder", "admin"].includes(plan),
    },
  };
}

function landing(enabled = true) {
  return {
    sport: "cfb",
    beta_enabled: enabled,
    label: "Experimental Forecast Beta",
    audience: "founder_admin",
    game_count: 1,
    complete_game_count: 1,
    degraded_game_count: 0,
    unavailable_game_count: 0,
    next_kickoff: "2026-08-29T16:00:00Z",
    last_safe_update: "2026-08-27T18:30:00Z",
    upgrade: { required_feature: "cfb_forecast_beta", path: "/pricing/" },
  };
}

async function load(plan, board = FULL, enabled = true) {
  vi.resetModules();
  installDom();
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

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.BoardWiseApi;
  delete window.BoardWiseAuth;
  delete (/** @type {any} */ (window)).__BoardWiseCfbTestHooks;
  document.body.innerHTML = "";
});

describe("CFB experimental forecast board", () => {
  it("keeps the route dark without requesting a board", async () => {
    const api = await load("founder", FULL, false);
    expect(api.getCfbBoard).not.toHaveBeenCalled();
    expect(document.getElementById("cfb-access")?.textContent).toContain("currently dark");
  });

  it("shows Guest only safe landing counts and sign-in", async () => {
    const api = await load("guest");
    expect(api.getCfbBoard).not.toHaveBeenCalled();
    expect(document.getElementById("cfb-access")?.textContent).toContain("1 current-slate game is available");
    expect(document.querySelector('#cfb-access a[href="/login/?return_to=/cfb/"]')).not.toBeNull();
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
    expect(document.body.textContent).not.toContain("31.4");
  });

  it("renders a complete Founder forecast with three independent market accordions", async () => {
    await load("founder");
    expect(document.querySelectorAll(".cfb-game-card")).toHaveLength(1);
    expect(document.querySelectorAll(".cfb-market")).toHaveLength(3);
    expect(document.querySelectorAll(".cfb-book[aria-label='DraftKings offers']")).toHaveLength(3);
    expect(document.querySelectorAll(".cfb-book[aria-label='FanDuel offers']")).toHaveLength(3);
    expect(document.querySelectorAll(".cfb-model-details")).toHaveLength(1);
    expect(document.body.textContent).toContain("67.2%");
    expect(document.body.textContent).toContain("Recommendations are currently being evaluated in shadow");
    expect(document.body.textContent).toContain("No BoardWise Call is published");
    expect(document.body.textContent).not.toContain("must-not-project");
    expect(document.body.textContent).not.toContain("Wise Choice");
    expect(document.body.textContent).not.toContain("stake size");
    expect(document.body.textContent).not.toContain("robust edge");
  });

  it("does not compare books when the exact lines differ", async () => {
    await load("admin");
    const spread = document.querySelector('[data-market="spread"]');
    expect(spread?.querySelectorAll(".cfb-book--better")).toHaveLength(0);
    const total = document.querySelector('[data-market="total"]');
    expect(total?.querySelectorAll(".cfb-book--better")).toHaveLength(1);
  });

  it("shows degraded and unavailable states without fabricating values", async () => {
    const payload = structuredClone(FULL);
    payload.games[0].data_state = "degraded";
    const unavailable = structuredClone(payload.games[0]);
    unavailable.game_id = 202;
    unavailable.data_state = "unavailable";
    unavailable.forecast = null;
    unavailable.markets = [];
    payload.games.push(unavailable);
    await load("founder", payload);

    expect(document.querySelectorAll(".cfb-warning")).toHaveLength(2);
    expect(document.querySelector("[data-game-id='202']")?.textContent).toContain("no forecast values");
    expect(document.querySelector("[data-game-id='202'] .cfb-probability")).toBeNull();
  });
});
