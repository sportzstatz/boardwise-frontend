(function () {
  const PUBLIC_FEATURES = {
    account_profile: false,
    mlb_board_basic: false,
    mlb_board_advanced: false,
    nhl_board_basic: false,
    performance_summary: false,
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
      cachedState = normaliseState(await window.BoardWiseApi.getMe());
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

  function initials(state) {
    const user = state && state.authenticated && state.user ? state.user : null;
    const source =
      (user && String(user.display_name || "").trim()) ||
      (user && String(user.email || "").split("@")[0].trim()) ||
      "A";
    const words = source
      .split(/[^A-Za-z0-9]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const chars = words.length > 1
      ? words.map((part) => part[0]).join("")
      : (words[0] || "A").slice(0, 2);
    return chars.slice(0, 2).toUpperCase() || "A";
  }

  window.BoardWiseAuth = {
    loadAuthState,
    hasFeature,
    displayName,
    initials,
    guestState,
  };
})();
