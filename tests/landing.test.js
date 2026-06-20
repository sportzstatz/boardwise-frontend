import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

function installLandingDom() {
  document.body.innerHTML = `
    <a id="landing-primary-cta" href="/login/?return_to=/mlb/">View today's MLB board</a>
    <a id="landing-cta-primary" href="/login/?return_to=/mlb/">Sign in to view the board</a>
    <a id="landing-cta-secondary" href="/pricing/">Join the beta</a>
    <a id="landing-proof-cta" href="#how">Learn how scoring works</a>
    <a id="landing-mlb-card" href="/login/?return_to=/mlb/">
      <span id="landing-mlb-cta">Sign in to open</span>
    </a>
    <div id="landing-hero-status"><span></span><span>Daily MLB model board</span></div>
    <p id="landing-mlb-status"></p>
    <div id="landing-mlb-count" hidden><strong>0</strong><span>games on the board</span></div>
    <p id="landing-nhl-status"></p>
    <div id="landing-nhl-count" hidden><strong>0</strong><span>games on the board</span></div>
  `;
}

async function loadLanding({ auth, api }) {
  vi.resetModules();
  installLandingDom();
  window.BoardWiseAuth = {
    loadAuthState: vi.fn().mockResolvedValue(auth),
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
  window.BoardWiseApi = api;
  await import("../assets/js/landing.js");
  await vi.waitFor(() => expect(window.BoardWiseAuth.loadAuthState).toHaveBeenCalled());
  await Promise.resolve();
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  delete window.BoardWiseAuth;
  delete window.BoardWiseApi;
  delete window.BoardWiseLanding;
  document.body.innerHTML = "";
});

describe("landing page", () => {
  it("keeps guest CTA gated and does not call gated MLB or performance APIs", async () => {
    const api = {
      getMlbBoard: vi.fn(),
      getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
      getPerformanceSummary: vi.fn(),
      getPerformanceBreakdown: vi.fn(),
      getPerformancePicks: vi.fn(),
    };

    await loadLanding({
      auth: { authenticated: false, features: {} },
      api,
    });

    expect(api.getMlbBoard).not.toHaveBeenCalled();
    expect(api.getPerformanceSummary).not.toHaveBeenCalled();
    expect(api.getPerformanceBreakdown).not.toHaveBeenCalled();
    expect(api.getPerformancePicks).not.toHaveBeenCalled();
    expect(document.querySelector("#landing-primary-cta")?.getAttribute("href")).toBe("/login/?return_to=/mlb/");
    expect(document.querySelector("#landing-mlb-card")?.getAttribute("href")).toBe("/login/?return_to=/mlb/");
  });

  it("points authorized MLB accounts at the board and hydrates a count", async () => {
    const api = {
      getMlbBoard: vi.fn().mockResolvedValue({ games: [{ id: 1 }, { id: 2 }] }),
      getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
    };

    await loadLanding({
      auth: { authenticated: true, features: { mlb_board_basic: true } },
      api,
    });

    expect(document.querySelector("#landing-primary-cta")?.getAttribute("href")).toBe("/mlb/");
    expect(document.querySelector("#landing-mlb-card")?.getAttribute("href")).toBe("/mlb/");
    expect(document.querySelector("#landing-mlb-cta")?.textContent).toBe("Open board");
    expect(document.querySelector("#landing-mlb-count")?.hasAttribute("hidden")).toBe(false);
    expect(document.querySelector("#landing-mlb-count strong")?.textContent).toBe("2");
    expect(document.querySelector("#landing-hero-status")?.textContent).toContain("2 MLB games");
  });

  it("keeps generic MLB content when authorized hydration fails", async () => {
    const api = {
      getMlbBoard: vi.fn().mockRejectedValue(new Error("denied")),
      getNhlBoard: vi.fn().mockResolvedValue({ games: [] }),
    };

    await loadLanding({
      auth: { authenticated: true, features: { mlb_board_basic: true } },
      api,
    });

    expect(document.querySelector("#landing-mlb-count")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector("#landing-mlb-status")?.textContent).toBe("Today's model board");
  });

  it("does not break the page when NHL count hydration fails", async () => {
    const api = {
      getMlbBoard: vi.fn(),
      getNhlBoard: vi.fn().mockRejectedValue(new Error("offline")),
    };

    await loadLanding({
      auth: { authenticated: false, features: {} },
      api,
    });

    expect(document.querySelector("#landing-nhl-count")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector("#landing-nhl-status")?.textContent).toBe("Current hockey board");
  });

  it("does not hardcode a personal account name in the shipped landing HTML", async () => {
    const html = await readFile(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).not.toContain("William Mayer");
    expect(html).not.toContain(">WM<");
  });
});
