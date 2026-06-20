import { afterEach, describe, expect, it, vi } from "vitest";

async function loadGates() {
  vi.resetModules();
  delete window.BoardWiseGates;
  await import("../assets/js/gates.js");
  return window.BoardWiseGates;
}

afterEach(() => {
  vi.resetModules();
  delete window.BoardWiseAuth;
  delete window.BoardWiseGates;
  document.body.innerHTML = "";
});

describe("feature gates", () => {
  it("hides feature-visible links until the feature is entitled", async () => {
    document.body.innerHTML = `
      <a id="performance-link" href="/performance/" data-feature-visible="performance_summary" hidden>Performance</a>
      <a id="mlb-link" href="/mlb/">MLB</a>
    `;
    window.BoardWiseAuth = {
      guestState: {
        authenticated: false,
        user: null,
        plan: "guest",
        features: { performance_summary: false },
      },
      loadAuthState: vi.fn().mockResolvedValue({
        authenticated: false,
        features: { performance_summary: false },
      }),
      hasFeature: (state, featureKey) => Boolean(state.features[featureKey]),
      displayName: () => "Sign in",
      initials: () => "A",
    };

    const gates = await loadGates();
    await gates.applyFeatureGates();

    expect(document.querySelector("#performance-link")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector("#mlb-link")?.hasAttribute("hidden")).toBe(false);
  });

  it("reveals feature-visible links for entitled accounts", async () => {
    document.body.innerHTML = `
      <a id="performance-link" href="/performance/" data-feature-visible="performance_summary" hidden>Performance</a>
    `;
    window.BoardWiseAuth = {
      guestState: {
        authenticated: false,
        user: null,
        plan: "guest",
        features: { performance_summary: false },
      },
      loadAuthState: vi.fn().mockResolvedValue({
        authenticated: true,
        features: { performance_summary: true },
      }),
      hasFeature: (state, featureKey) => Boolean(state.features[featureKey]),
      displayName: () => "Admin",
      initials: () => "AD",
    };

    const gates = await loadGates();
    await gates.applyFeatureGates();

    expect(document.querySelector("#performance-link")?.hasAttribute("hidden")).toBe(false);
  });

  it("populates authenticated account labels and initials", async () => {
    document.body.innerHTML = `
      <a id="account-link" href="/account/" data-auth-authenticated hidden>
        <span data-auth-label>Account</span>
        <span data-auth-initials>A</span>
      </a>
    `;
    window.BoardWiseAuth = {
      loadAuthState: vi.fn().mockResolvedValue({
        authenticated: true,
        user: { display_name: "William Mayer", email: "william@example.test" },
        features: {},
      }),
      hasFeature: (state, featureKey) => Boolean(state.features[featureKey]),
      displayName: () => "William Mayer",
      initials: () => "WM",
      guestState: {
        authenticated: false,
        user: null,
        plan: "guest",
        features: {},
      },
    };

    const gates = await loadGates();
    await gates.applyFeatureGates();

    expect(document.querySelector("#account-link")?.hasAttribute("hidden")).toBe(false);
    expect(document.querySelector("[data-auth-label]")?.textContent).toBe("William Mayer");
    expect(document.querySelector("[data-auth-initials]")?.textContent).toBe("WM");
  });
});
