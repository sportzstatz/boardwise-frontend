import { afterEach, describe, expect, it, vi } from "vitest";

function installAccountDom() {
  document.body.innerHTML = `
    <span id="account-avatar" data-auth-initials>A</span>
    <span id="account-name" data-auth-label>Checking account...</span>
    <p id="account-email"></p>
    <span id="account-plan"></span>
    <span id="account-auth-state"></span>
    <p id="account-status"></p>
    <div id="account-actions"></div>
    <div id="account-access-list"></div>
  `;
}

function installAuth(state) {
  window.BoardWiseAuth = {
    loadAuthState: vi.fn().mockResolvedValue(state),
    hasFeature: vi.fn((authState, key) => Boolean(authState?.features?.[key])),
    displayName: vi.fn((authState) => {
      if (authState?.authenticated && authState.user) {
        return authState.user.display_name || authState.user.email || "Account";
      }
      return "Sign in";
    }),
    initials: vi.fn((authState) => authState?.authenticated ? "AU" : "A"),
    guestState: {
      authenticated: false,
      user: null,
      plan: "guest",
      features: {},
    },
  };
  window.BoardWiseGates = {
    applyFeatureGates: vi.fn().mockResolvedValue(state),
    gateCard: vi.fn(),
  };
  window.BoardWiseApi = /** @type {any} */ ({
    logout: vi.fn().mockResolvedValue({ ok: true }),
  });
}

async function renderAccount(state) {
  vi.resetModules();
  installAccountDom();
  installAuth(state);
  await import("../assets/js/account.js");
  await vi.waitFor(() => {
    expect(document.querySelector("#account-status")?.textContent).not.toBe("");
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  delete window.BoardWiseAuth;
  delete window.BoardWiseGates;
  delete window.BoardWiseApi;
  document.body.innerHTML = "";
});

describe("account page", () => {
  it("renders a guest account state with sign-in actions and locked products", async () => {
    await renderAccount({
      authenticated: false,
      user: null,
      plan: "guest",
      features: {},
    });

    expect(document.querySelector("#account-name")?.textContent).toBe("Sign in");
    expect(document.querySelector("#account-email")?.textContent).toBe("Sign in to manage BoardWise access.");
    expect(document.querySelector("#account-plan")?.textContent).toBe("Guest access");
    expect(document.querySelector("#account-auth-state")?.textContent).toBe("Guest mode");
    expect(document.querySelector("#account-status")?.textContent).toContain("browsing as a guest");
    expect(document.querySelector("#account-actions")?.textContent).toContain("Sign in");
    expect(document.querySelector("#account-actions")?.textContent).toContain("View Founder access");
    // Performance is concealed Admin-only: a guest sees only the mlb + nhl
    // locked cards, never a "Performance & ROI" card or a link toward it.
    expect(document.querySelectorAll(".account-access-card.is-locked")).toHaveLength(2);
    expect(document.querySelector('[data-access-card="performance"]')).toBeNull();
    expect(document.querySelector("#account-access-list")?.textContent).not.toContain("Performance");
    expect(document.querySelector('[data-access-card="mlb"] .account-access-action')?.getAttribute("href")).toBe(
      "/login/?return_to=%2Fmlb%2F"
    );
    expect(window.BoardWiseGates.applyFeatureGates).toHaveBeenCalledTimes(1);
  });

  it("conceals the performance access card from an authenticated non-admin (Founder)", async () => {
    await renderAccount({
      authenticated: true,
      user: { email: "founder@example.test", display_name: "Founder", member_since: "2025" },
      plan: "founder",
      features: {
        account_profile: true,
        mlb_board_basic: true,
        mlb_board_advanced: true,
      },
    });

    expect(document.querySelector('[data-access-card="performance"]')).toBeNull();
    expect(document.querySelector("#account-access-list")?.textContent).not.toContain("Performance");
    // The non-concealed MLB card is still present (full access for Founder).
    expect(document.querySelector('[data-access-card="mlb"]')).not.toBeNull();
  });

  it("renders authenticated profile and product links without the feature-access section", async () => {
    await renderAccount({
      authenticated: true,
      user: { email: "admin@example.test", display_name: "Admin User", member_since: "2024" },
      plan: "admin",
      features: {
        account_profile: true,
        mlb_board_basic: true,
        mlb_board_advanced: true,
        performance_summary: true,
        performance_picks: true,
      },
    });

    expect(document.querySelector("#account-name")?.textContent).toBe("Admin User");
    expect(document.querySelector("#account-avatar")?.textContent).toBe("AU");
    expect(document.querySelector("#account-email")?.textContent).toBe("admin@example.test");
    expect(document.querySelector("#account-plan")?.textContent).toBe("Admin access");
    expect(document.querySelector("#account-auth-state")?.textContent).toBe("Member since 2024");
    expect(document.querySelector("#account-status")?.textContent).toContain("full MLB board");
    expect(document.querySelector("#account-actions")?.textContent).not.toContain("Open MLB board");
    expect(document.querySelector("#account-actions")?.textContent).not.toContain("Open performance");
    expect(document.querySelector("#logout-button")).not.toBeNull();
    expect(document.querySelector('[data-access-card="mlb"] .account-access-status')?.textContent).toBe("Full access");
    expect(document.querySelector('[data-access-card="performance"] .account-access-status')?.textContent).toBe("Available");
    expect(document.querySelector('[data-access-card="nhl"] .account-access-status')?.textContent).toBe("Off-season · returns Oct 2026");
    expect(document.querySelector('[data-access-card="nhl"] .account-access-action')).toBeNull();
    expect(document.querySelector('[data-access-card="performance"] .account-access-action')?.getAttribute("href")).toBe(
      "/performance/"
    );
    expect(document.querySelector('[data-access-card="nhl"] .account-lock-mark')).not.toBeNull();
    expect(document.querySelector("#feature-list")).toBeNull();
  });
});
