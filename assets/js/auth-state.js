(function () {
  const API_BASE = window.BOARDWISE_API_BASE || "https://api.useboardwise.com";

  const PUBLIC_FEATURES = {
    account_profile: false,
    mlb_board_basic: true,
    mlb_board_advanced: false,
    nhl_board_basic: true,
    performance_summary: true,
    performance_breakdown: false,
    performance_picks: false,
    performance_book_comparison: false,
    saved_picks: false,
    alerts: false,
    export_csv: false,
  };

  const guestState = Object.freeze({
    authenticated: false,
    user: null,
    plan: "guest",
    features: PUBLIC_FEATURES,
  });

  let cachedState = null;

  function normaliseState(payload) {
    const features = Object.assign(
      {},
      PUBLIC_FEATURES,
      payload && payload.features ? payload.features : {}
    );
    return {
      authenticated: Boolean(payload && payload.authenticated),
      user: payload && payload.user ? payload.user : null,
      plan: payload && payload.plan ? String(payload.plan) : "guest",
      features,
    };
  }

  async function loadAuthState(options = {}) {
    if (cachedState && !options.force) return cachedState;
    try {
      const resp = await fetch(`${API_BASE}/api/v1/me`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!resp.ok) {
        cachedState = normaliseState(guestState);
        return cachedState;
      }
      cachedState = normaliseState(await resp.json());
      return cachedState;
    } catch (_err) {
      cachedState = normaliseState(guestState);
      return cachedState;
    }
  }

  function hasFeature(state, featureKey) {
    return Boolean(state && state.features && state.features[featureKey]);
  }

  function displayName(state) {
    if (state && state.authenticated && state.user) {
      return state.user.display_name || state.user.email || "Account";
    }
    return "Sign in";
  }

  window.BoardWiseAuth = {
    loadAuthState,
    hasFeature,
    displayName,
    guestState,
  };
})();