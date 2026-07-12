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
    <p id="account-billing-notice" hidden></p>
    <div id="account-billing-body"></div>
  `;
}

function installAuth(state, apiOverrides = {}) {
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
    ...apiOverrides,
  });
}

async function renderAccount(state, apiOverrides = {}) {
  vi.resetModules();
  installAccountDom();
  installAuth(state, apiOverrides);
  await import("../assets/js/account.js");
  await vi.waitFor(() => {
    expect(document.querySelector("#account-status")?.textContent).not.toBe("");
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  delete window.BoardWiseAuth;
  delete window.BoardWiseGates;
  delete window.BoardWiseApi;
  delete window.BoardWiseNavigate;
  document.body.innerHTML = "";
  window.history.pushState({}, "", "/account/");
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

  it("describes Free MLB access as two complete cards daily", async () => {
    await renderAccount({
      authenticated: true,
      user: { email: "free@example.test", display_name: "Free Member", member_since: "2026" },
      plan: "free",
      features: {
        account_profile: true,
        mlb_board_basic: true,
        mlb_board_advanced: false,
      },
    });

    expect(document.querySelector("#account-status")?.textContent).toContain("two complete MLB cards daily");
    expect(document.querySelector('[data-access-card="mlb"] .account-access-status')?.textContent).toBe(
      "Two complete cards daily"
    );
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

  it("founder billing opens the Stripe Customer Portal from Manage billing", async () => {
    const founderState = {
      authenticated: true,
      user: { email: "founder@example.test", display_name: "Founder", member_since: "2025" },
      plan: "founder",
      features: { account_profile: true, mlb_board_basic: true, mlb_board_advanced: true },
    };
    const createBillingPortal = vi.fn().mockResolvedValue({
      portal_url: "https://billing.stripe.com/p/session/test",
    });
    const navigate = vi.fn();
    window.BoardWiseNavigate = navigate;

    await renderAccount(founderState, { createBillingPortal });

    const billingBody = document.querySelector("#account-billing-body");
    expect(billingBody?.textContent).toContain("BoardWise Founder");
    expect(billingBody?.textContent).toContain("$24.99/month");
    expect(billingBody?.textContent).not.toContain("Contact billing support");

    const manage = /** @type {HTMLButtonElement} */ (document.getElementById("account-manage-billing"));
    expect(manage).not.toBeNull();
    expect(manage.tagName).toBe("BUTTON");

    manage.click();
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("https://billing.stripe.com/p/session/test");
    });
    expect(createBillingPortal).toHaveBeenCalledTimes(1);
  });

  it("founder billing surfaces a support fallback when the portal is unavailable", async () => {
    const founderState = {
      authenticated: true,
      user: { email: "founder@example.test", display_name: "Founder", member_since: "2025" },
      plan: "founder",
      features: { account_profile: true },
    };
    const createBillingPortal = vi.fn().mockRejectedValue(
      Object.assign(new Error("404"), { status: 404 })
    );
    const navigate = vi.fn();
    window.BoardWiseNavigate = navigate;

    await renderAccount(founderState, { createBillingPortal });

    const manage = /** @type {HTMLButtonElement} */ (document.getElementById("account-manage-billing"));
    manage.click();

    await vi.waitFor(() => {
      const notice = document.getElementById("account-billing-notice");
      expect(notice?.hasAttribute("hidden")).toBe(false);
      expect(notice?.textContent).toContain("billing portal is unavailable");
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("refuses a non-Stripe portal redirect returned by the API", async () => {
    const founderState = {
      authenticated: true,
      user: { email: "founder@example.test", display_name: "Founder", member_since: "2025" },
      plan: "founder",
      features: { account_profile: true, mlb_board_basic: true, mlb_board_advanced: true },
    };
    const createBillingPortal = vi.fn().mockResolvedValue({
      portal_url: "https://billing.stripe.com.attacker.example/session",
    });
    const navigate = vi.fn();
    window.BoardWiseNavigate = navigate;

    await renderAccount(founderState, { createBillingPortal });
    document.getElementById("account-manage-billing")?.click();

    await vi.waitFor(() => {
      expect(document.getElementById("account-billing-notice")?.textContent).toContain(
        "billing portal is unavailable"
      );
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("finalizes checkout success by polling billing status until founder access lands", async () => {
    const freeState = {
      authenticated: true,
      user: { email: "buyer@example.test", display_name: "Buyer", member_since: "2026" },
      plan: "free",
      features: { account_profile: true },
    };
    const founderState = {
      ...freeState,
      plan: "founder",
      features: { account_profile: true, mlb_board_basic: true, mlb_board_advanced: true },
    };

    vi.useFakeTimers();
    vi.resetModules();
    window.history.pushState({}, "", "/account/?checkout=success");
    installAccountDom();
    installAuth(freeState, {
      getBillingStatus: vi
        .fn()
        .mockResolvedValueOnce({ plan: "free", checkout_available: true, portal_available: false, subscription: null })
        .mockResolvedValue({ plan: "founder", checkout_available: false, portal_available: true, subscription: { status: "active" } }),
    });
    window.BoardWiseAuth.loadAuthState = vi
      .fn()
      .mockResolvedValueOnce(freeState)
      .mockResolvedValue(founderState);

    await import("../assets/js/account.js");
    await vi.advanceTimersByTimeAsync(0);

    const notice = document.getElementById("account-billing-notice");
    expect(notice?.textContent).toContain("Finalizing Founder access");

    await vi.advanceTimersByTimeAsync(1500); // poll 1: still free
    await vi.advanceTimersByTimeAsync(1500); // poll 2: founder

    expect(window.BoardWiseAuth.loadAuthState).toHaveBeenCalledTimes(2);
    expect(document.querySelector("#account-billing-body")?.textContent).toContain("BoardWise Founder");
    expect(notice?.textContent).toContain("Founder access is active");
  });

  it("shows a syncing message when checkout success has not reconciled in time", async () => {
    const freeState = {
      authenticated: true,
      user: { email: "buyer@example.test", display_name: "Buyer", member_since: "2026" },
      plan: "free",
      features: { account_profile: true },
    };

    vi.useFakeTimers();
    vi.resetModules();
    window.history.pushState({}, "", "/account/?checkout=success");
    installAccountDom();
    installAuth(freeState, {
      getBillingStatus: vi.fn().mockResolvedValue({ plan: "free", checkout_available: true, portal_available: false, subscription: null }),
    });

    await import("../assets/js/account.js");
    await vi.advanceTimersByTimeAsync(0);

    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(1500);
    }

    const notice = document.getElementById("account-billing-notice");
    expect(notice?.textContent).toContain("Access is still syncing");
    expect(window.BoardWiseApi.getBillingStatus).toHaveBeenCalledTimes(10);
  });
});
