import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAuthStateScript() {
  vi.resetModules();
  delete window.BoardWiseApi;
  delete window.BoardWiseAuth;
  delete window.BOARDWISE_API_BASE;
  await import("../assets/js/api-client.js");
  await import("../assets/js/auth-state.js");
  return window.BoardWiseAuth;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.BoardWiseApi;
  delete window.BoardWiseAuth;
  delete window.BOARDWISE_API_BASE;
});

function jsonResponse(body, { status = 200, statusText = "OK" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => JSON.stringify(body),
  };
}

describe("auth-state", () => {
  it("falls back to guest state when /api/v1/me is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const auth = await loadAuthStateScript();
    const state = await auth.loadAuthState({ force: true });

    expect(state.authenticated).toBe(false);
    expect(state.plan).toBe("guest");
    expect(state.features.mlb_board_basic).toBe(false);
    expect(state.features.nhl_board_basic).toBe(false);
    expect(state.features.performance_summary).toBe(false);
    expect(state.features.performance_picks).toBe(false);
    expect(auth.displayName(state)).toBe("Sign in");
  });

  it("normalizes authenticated state and feature flags from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          authenticated: true,
          user: {
            email: "founder@example.test",
            display_name: "Founder"
          },
          plan: "founder",
          features: {
            mlb_board_basic: true,
            mlb_board_advanced: true
          }
        })
      )
    );

    const auth = await loadAuthStateScript();
    const state = await auth.loadAuthState({ force: true });

    expect(state.authenticated).toBe(true);
    expect(state.plan).toBe("founder");
    expect(state.features.mlb_board_basic).toBe(true);
    expect(state.features.mlb_board_advanced).toBe(true);
    expect(auth.hasFeature(state, "mlb_board_advanced")).toBe(true);
    expect(auth.displayName(state)).toBe("Founder");
    expect(auth.initials(state)).toBe("FO");
  });

  it("builds initials from display name, email local-part, then fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          jsonResponse({
            authenticated: true,
            user: { email: "william@example.test", display_name: "William Mayer" },
            features: {},
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            authenticated: true,
            user: { email: "solo@example.test", display_name: "" },
            features: {},
          })
        )
    );

    const auth = await loadAuthStateScript();
    const named = await auth.loadAuthState({ force: true });
    const emailOnly = await auth.loadAuthState({ force: true });

    expect(auth.initials(named)).toBe("WM");
    expect(auth.initials(emailOnly)).toBe("SO");
    expect(auth.initials(auth.guestState)).toBe("A");
  });

  it("dedupes concurrent requests so callers share one auth state", async () => {
    /** @type {(value?: unknown) => void} */
    let resolveFetch = () => {};
    const gate = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(
      gate.then(() =>
        jsonResponse({
          authenticated: true,
          user: { email: "admin@example.test", display_name: "Admin" },
          plan: "admin",
          features: { performance_summary: true },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const auth = await loadAuthStateScript();
    // Two concurrent callers (a page's own bootstrap + the shared apply-gates
    // pass) before the request resolves.
    const p1 = auth.loadAuthState();
    const p2 = auth.loadAuthState();
    resolveFetch();
    const [s1, s2] = await Promise.all([p1, p2]);

    // One /api/v1/me request; both callers get the SAME state object, so a
    // second auth check can never diverge and re-hide what the first revealed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(s1).toBe(s2);
    expect(s1.features.performance_summary).toBe(true);
  });
});
