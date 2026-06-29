const state = {
  payload: null,
  mode: "full_board",
  activeBucket: "all",
  requestedModel: "",
  selectedModel: ""
};

const BEST_CARD_MODES = [
  ["wise_choice", "Wise Choices™"],
  ["best_value", "Best Value"],
  ["best_growth", "Signal Strength"],
  ["full_board", "Full Board"]
];

const WISE_BUCKETS = [
  ["pass_lte_0", "<= 0 - No Edge", "#b42318"],
  ["pass_0_3", "0-3 - Tracker", "#b42318"],
  ["pass_3_8", "3-8 - Lean", "#b42318"],
  ["pass_8_14", "8-14 - Playable", "#b42318"],
  ["medium_high_14_20", "14-20 - Strong", "#86efac"],
  ["high_20_25", "20-25 - Prime", "#669f2a"],
  ["elite_verify_25_plus", "25+ - Verify", "#667085"]
];

const KELLY_BUCKETS = [
  ["kelly_lte_0", "0% or less", "#93370d"],
  ["kelly_0_5", "0-5%", "#b54708"],
  ["kelly_5_10", "5-10%", "#dc6803"],
  ["kelly_10_20", "10-20%", "#0f4c81"],
  ["kelly_20_plus", "20%+", "#156f3c"]
];

// Compliance tooltips surfaced on board metrics (see /performance-methodology/).
const EV_TIP = "Signal strength compares BoardWise model probability to available market prices. It is not personalized stake advice and is not a guarantee.";
const UNIT_TIP = "A unit is a hypothetical tracking measure used for model comparison. It is not a recommendation to wager any amount.";

const TRACKER_MARKET_LABELS = new Map([
  ["first_inning_total", "1st Inning O/U"],
  ["nrfi_yrfi", "NRFI/YRFI"],
  ["first_inning_moneyline", "1st Inning Moneyline"],
  ["first_inning_spread", "1st Inning Run Line"]
]);
const PUBLIC_TRACKER_MARKET_KEYS = new Set(["nrfi_yrfi"]);
const TRACKER_HELPER_TEXT = "Tracking-only market. Not included in official record or public performance.";
const DEFAULT_PAGE_SUBTITLE = "Forecasts render from the BoardWise public API. When matched odds are present, each tile shows a best available bet card and market-level dropdowns with both sides of every market.";
const TRACKER_PAGE_SUBTITLE = "Compare official MLB picks, market dropdowns, and tracking-only first-inning signals from the BoardWise public API.";
const metaEl = document.getElementById("meta");
const statusNoteEl = document.getElementById("status-note");
const loadingEl = document.getElementById("loading");
const gamesEl = document.getElementById("games");
const errorEl = document.getElementById("error");
const subtitleEl = document.getElementById("page-subtitle");
const dateForm = /** @type {HTMLFormElement | null} */ (document.getElementById("date-form"));
const dateInput = /** @type {HTMLInputElement | null} */ (document.getElementById("board-date"));
const evFilters = document.getElementById("ev-filters");
const probFilters = document.getElementById("prob-filters");
const modelSelectorEl = document.getElementById("model-selector");
const obsidianHeroEl = document.getElementById("obsidian-hero");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function wiseStatusText(value) {
  const key = String(value || "").trim();
  const normalized = key.toUpperCase();
  if (key === "pass_lte_0" || normalized === "NO EDGE") return "No Edge";
  if (key === "pass_0_3" || normalized === "TRACKER") return "Tracker";
  if (key === "pass_3_8" || normalized === "LEAN") return "Lean";
  if (key === "pass_8_14" || normalized === "PLAYABLE") return "Playable";
  if (key === "medium_high_14_20" || normalized === "STRONG" || normalized === "MEDIUM-HIGH") return "Strong";
  if (key === "high_20_25" || normalized === "PRIME" || normalized === "HIGH") return "Prime";
  if (key === "elite_verify_25_plus" || normalized === "VERIFY" || normalized === "ELITE / VERIFY") return "Verify";
  return "No Edge";
}

function readTargetDate() {
  const params = new URLSearchParams(window.location.search);
  const date = (params.get("date") || "").trim();
  return isIsoDate(date) ? date : "";
}

function writeTargetDate(date) {
  const url = new URL(window.location.href);
  if (date) url.searchParams.set("date", date);
  else url.searchParams.delete("date");
  window.history.replaceState({}, "", url);
}

function readModelFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const model = (params.get("model") || "").trim();
  // Any syntactically plausible family key is forwarded; the API validates
  // unknown keys (HTTP 400) so new families need no frontend allowlist.
  return /^[a-z][a-z0-9_]{0,63}$/.test(model) ? model : "";
}

function writeModelToUrl(model) {
  const url = new URL(window.location.href);
  if (model) url.searchParams.set("model", model);
  else url.searchParams.delete("model");
  window.history.replaceState({}, "", url);
}

function selectedModelMetadata(payload = state.payload) {
  return payload && payload.model_metadata && typeof payload.model_metadata === "object"
    ? payload.model_metadata
    : {};
}

function getVisualBranding(payload = state.payload) {
  const metadata = selectedModelMetadata(payload);
  return metadata.visual_branding && typeof metadata.visual_branding === "object"
    ? metadata.visual_branding
    : {};
}

function getTrackerMarketMetadata(payload = state.payload) {
  const metadata = selectedModelMetadata(payload);
  return metadata.tracker_markets && typeof metadata.tracker_markets === "object"
    ? metadata.tracker_markets
    : {};
}

function trackerMarketLabelMap(payload = state.payload) {
  const labels = new Map(TRACKER_MARKET_LABELS);
  const markets = getTrackerMarketMetadata(payload).markets;
  if (Array.isArray(markets)) {
    for (const market of markets) {
      if (market?.key && market?.label) labels.set(String(market.key), String(market.label));
    }
  }
  return labels;
}

function advertisedTrackerMarketKeys(payload = state.payload) {
  const trackerMetadata = getTrackerMarketMetadata(payload);
  const markets = trackerMetadata.markets;
  const marketKeys = trackerMetadata.market_keys;
  const keys = [];
  if (Array.isArray(marketKeys)) {
    keys.push(...marketKeys);
  }
  if (Array.isArray(markets)) {
    keys.push(...markets.map((market) => market?.key));
  }
  return new Set(
    keys
      .filter(Boolean)
      .map(String)
      .filter((key) => PUBLIC_TRACKER_MARKET_KEYS.has(key))
  );
}

function trackerMarketLabel(market, payload = state.payload) {
  const key = market?.key || market?.market_key || market?.market_key_canonical;
  const labels = trackerMarketLabelMap(payload);
  if (key && labels.has(String(key))) return labels.get(String(key));
  return market?.label || market?.title || "Tracker";
}

function hasTrackerMarkets(payload = state.payload) {
  const trackerMetadata = getTrackerMarketMetadata(payload);
  return (
    trackerMetadata.enabled === true
    && trackerMetadata.has_markets === true
    && advertisedTrackerMarketKeys(payload).size > 0
  );
}

function accessLevel(payload = state.payload) {
  const access = payload && payload.access && typeof payload.access === "object"
    ? payload.access
    : {};
  return String(access.level || (access.preview ? "preview" : "full"));
}

function isPreviewPayload(payload = state.payload) {
  return accessLevel(payload) === "preview";
}

function shouldShowObsidianTreatment(payload = state.payload) {
  const metadata = selectedModelMetadata(payload);
  const branding = getVisualBranding(payload);
  const games = Array.isArray(payload?.games) ? payload.games : [];

  return (
    metadata?.selected_model_family === "obsidian_steed" &&
    metadata?.selected_model_available !== false &&
    games.length > 0 &&
    branding.family === "obsidian_steed" &&
    branding.hero_enabled === true
  );
}

function obsidianHeroCopy(payload = state.payload) {
  const branding = getVisualBranding(payload);
  const variant = branding.variant || "classic";
  if (variant === "shadow") {
    return [
      "Obsidian Steed Shadow",
      "Tracking model under review before public grading."
    ];
  }
  if (variant === "public") {
    return [
      "Obsidian Steed",
      ""
    ];
  }
  return ["", ""];
}

function renderObsidianHero(payload = state.payload) {
  if (!obsidianHeroEl) return;
  if (!shouldShowObsidianTreatment(payload)) {
    obsidianHeroEl.hidden = true;
    obsidianHeroEl.innerHTML = "";
    obsidianHeroEl.removeAttribute("data-variant");
    return;
  }
  const branding = getVisualBranding(payload);
  const [title, copy] = obsidianHeroCopy(payload);
  obsidianHeroEl.hidden = false;
  obsidianHeroEl.dataset.variant = branding.variant || "shadow";
  const copyHtml = copy ? `<div class="obsidian-hero-copy">${esc(copy)}</div>` : "";
  obsidianHeroEl.innerHTML = `
    <h2 id="obsidian-hero-title" class="obsidian-hero-title">${esc(title)}</h2>
    ${copyHtml}
  `;
}

function applyVisualTreatment(payload = state.payload) {
  const enabled = shouldShowObsidianTreatment(payload);
  document.body.classList.toggle("obsidian-treatment", enabled);
  if (enabled) {
    document.body.dataset.obsidianVariant = getVisualBranding(payload).variant || "shadow";
  } else {
    delete document.body.dataset.obsidianVariant;
  }
}

function clearVisualTreatment() {
  renderObsidianHero(null);
  applyVisualTreatment(null);
}

function updatePageSubtitle(payload = state.payload) {
  if (!subtitleEl) return;
  subtitleEl.textContent = hasTrackerMarkets(payload) ? TRACKER_PAGE_SUBTITLE : DEFAULT_PAGE_SUBTITLE;
}

function availableModelFamilies(metadata = selectedModelMetadata()) {
  return (Array.isArray(metadata.available_model_families) ? metadata.available_model_families : [])
    .filter((item) => item && typeof item === "object" && item.key);
}

function modelAvailabilityMap(metadata = selectedModelMetadata()) {
  return new Map(availableModelFamilies(metadata).map((item) => [String(item.key), item]));
}

function selectedModelFamily(metadata = selectedModelMetadata()) {
  return metadata.selected_model_family || state.selectedModel || "";
}

function selectedModelLabelParts(metadata = selectedModelMetadata()) {
  const selected = selectedModelFamily(metadata);
  const item = selected ? modelAvailabilityMap(metadata).get(selected) : undefined;
  return {
    label: item?.label || metadata.model_display_name || selected || "",
    badge: item?.badge || ""
  };
}

function shouldShowModelOption(key, metadata = selectedModelMetadata()) {
  const selected = selectedModelFamily(metadata);
  const item = modelAvailabilityMap(metadata).get(key);
  const visibilityStatus = item?.visibility_status || item?.status;
  return !(visibilityStatus === "shadow" && key !== selected);
}

function formatCount(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseAmericanOdds(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "N/A") return null;
  const num = Number(text.replace("+", ""));
  return Number.isFinite(num) ? num : null;
}

function americanToDecimal(value) {
  const price = asNumber(value);
  if (price === null || price === 0) return null;
  return price > 0 ? 1 + price / 100 : 1 + 100 / Math.abs(price);
}

function optionKelly(option) {
  if (!option) return null;
  const explicit = asNumber(option.kelly_fraction);
  if (explicit !== null) return explicit;
  const ev = asNumber(option.expected_value_per_unit ?? option.raw_ev);
  const priceDecimal = asNumber(option.price_decimal) || americanToDecimal(option.price_american ?? parseAmericanOdds(option.odds_text));
  if (ev === null || priceDecimal === null || priceDecimal <= 1) return null;
  return ev / (priceDecimal - 1);
}

function optionWiseScore(option) {
  if (!option) return null;
  const explicit = asNumber(option.wise_choice_score);
  if (explicit !== null) return explicit;
  const kelly = optionKelly(option);
  const probability = asNumber(option.model_probability);
  if (kelly === null || probability === null || probability < 0 || probability > 1) return null;
  return kelly * probability * 100;
}

function formatKelly(option) {
  const kelly = optionKelly(option);
  return kelly === null ? "N/A" : `${(kelly * 100).toFixed(1)}%`;
}

function formatWise(option) {
  const score = optionWiseScore(option);
  return score === null ? "N/A" : score.toFixed(1);
}

function wiseBucketForScore(score) {
  if (score === null) return { key: "unknown", label: "Unknown", status: "No Edge", rank: 0, color: "#667085" };
  if (score <= 0) return { key: "pass_lte_0", label: "<= 0 - No Edge", status: "No Edge", rank: 1, color: "#b42318" };
  if (score < 3) return { key: "pass_0_3", label: "0-3 - Tracker", status: "Tracker", rank: 2, color: "#b42318" };
  if (score < 8) return { key: "pass_3_8", label: "3-8 - Lean", status: "Lean", rank: 3, color: "#b42318" };
  if (score < 14) return { key: "pass_8_14", label: "8-14 - Playable", status: "Playable", rank: 4, color: "#b42318" };
  if (score < 20) return { key: "medium_high_14_20", label: "14-20 - Strong", status: "Strong", rank: 5, color: "#86efac" };
  if (score < 25) return { key: "high_20_25", label: "20-25 - Prime", status: "Prime", rank: 6, color: "#669f2a" };
  return { key: "elite_verify_25_plus", label: "25+ - Verify", status: "Verify", rank: 7, color: "#667085" };
}

function optionWiseBucket(option) {
  if (!option) return wiseBucketForScore(null);
  const key = option.wise_choice_bucket_key;
  const found = WISE_BUCKETS.find(([bucket]) => bucket === key);
  const fallback = wiseBucketForScore(optionWiseScore(option));
  return {
    key: key || fallback.key,
    label: option.wise_choice_bucket_label || (found ? found[1] : fallback.label),
    status: option.wise_choice_status || fallback.status,
    rank: asNumber(option.wise_choice_rank) ?? fallback.rank,
    color: found ? found[2] : option.wise_choice_color || fallback.color
  };
}

function kellyBucket(option) {
  const kelly = optionKelly(option);
  if (kelly === null) return { key: "unknown", color: "#667085" };
  const pct = kelly * 100;
  if (pct <= 0) return { key: "kelly_lte_0", color: "#93370d" };
  if (pct < 5) return { key: "kelly_0_5", color: "#b54708" };
  if (pct < 10) return { key: "kelly_5_10", color: "#dc6803" };
  if (pct < 20) return { key: "kelly_10_20", color: "#0f4c81" };
  return { key: "kelly_20_plus", color: "#156f3c" };
}

function setHidden(el, hidden) {
  if (!el) return;
  el.hidden = hidden;
}

function showLoading() {
  clearVisualTreatment();
  updatePageSubtitle(null);
  setHidden(loadingEl, false);
  setHidden(errorEl, true);
  setHidden(gamesEl, true);
  if (metaEl) {
    metaEl.innerHTML = `<div class="pill">Loading latest board…</div>`;
  }
}

function showError(message) {
  clearVisualTreatment();
  updatePageSubtitle(null);
  setHidden(loadingEl, true);
  setHidden(gamesEl, true);
  if (errorEl) {
    errorEl.hidden = false;
    errorEl.textContent = message;
  }
}

function topLevelCounts(payload) {
  const booksSeen = Array.isArray(payload.books_seen) ? payload.books_seen : [];
  const metadata = selectedModelMetadata(payload);
  const model = selectedModelLabelParts(metadata);
  const modelText = [model.label, model.badge].filter(Boolean).join(" · ");
  return [
    ["Generated", payload.generated_at || "Unknown"],
    ["Date", payload.target_date || "-"],
    modelText ? ["Model", modelText] : null,
    ["Games", formatCount(payload.game_count)],
    ["Betting Games", formatCount(payload.betting_game_count)],
    ["Recommendations", formatCount(payload.recommendation_count)],
    ["Books", booksSeen.length ? booksSeen.join(", ") : "None listed"]
  ].filter(Boolean);
}

function setPageMeta(payload, requestedDate) {
  const targetDate = payload.target_date || requestedDate || "-";
  document.title = `BoardWise MLB - ${targetDate}`;
  updatePageSubtitle(payload);
  if (metaEl) {
    metaEl.innerHTML = topLevelCounts(payload)
      .map(([label, value]) => `<div class="pill"><strong>${esc(label)}</strong> ${esc(value)}</div>`)
      .join("");
  }
  if (dateInput) dateInput.value = payload.target_date || requestedDate || "";
}

function setStatusNote(payload) {
  if (!statusNoteEl) return;
  const notes = [payload.mode_note, payload.summary?.validity ? `Validity: ${payload.summary.validity}` : ""].filter(Boolean);
  if (!notes.length) {
    statusNoteEl.hidden = true;
    statusNoteEl.textContent = "";
    return;
  }
  statusNoteEl.hidden = false;
  statusNoteEl.textContent = notes.join(" ");
}

function gameLabel(game) {
  return game.game_label || `${game.away_team || "Away"} at ${game.home_team || "Home"}`;
}

function wiseChoiceOptions() {
  return {
    excludeTrackingOnly: true,
    mode: state.mode,
    gameLabelForGame: gameLabel
  };
}

function wiseChoiceHelper() {
  return window.BoardWiseWiseChoice || null;
}

function bestOption(game, variant = state.mode) {
  const options = game.best_card_options || {};
  const publicRecommendation = Array.isArray(game.recommendations)
    ? game.recommendations.find((rec) => rec && typeof rec === "object" && !isTrackingOnlyOption(rec))
    : null;
  const publicOption = (option) => isTrackingOnlyOption(option) ? null : option;
  if (variant === "best_value") return publicOption(options.best_value) || publicOption(options.highest_ev) || null;
  if (variant === "best_growth") {
    return publicOption(options.best_growth)
      || publicOption(options.wise_choice)
      || publicOption(options.best_value)
      || publicOption(options.highest_ev)
      || null;
  }
  if (variant === "wise_choice") {
    const helper = wiseChoiceHelper();
    if (helper) return helper.selectWiseChoiceForGame(game, state.payload || {}, wiseChoiceOptions());
    return publicOption(options.wise_choice)
      || publicOption(options.best_value)
      || publicOption(options.highest_ev)
      || null;
  }
  return publicOption(options[variant])
    || publicOption(options.best_value)
    || publicOption(options.highest_ev)
    || publicRecommendation
    || null;
}

function evBucket(game) {
  return bestOption(game, "best_value")?.ev_rating || game.ev_bucket_label || "Low";
}

function probBucket(game) {
  return bestOption(game, "highest_model_prob")?.prob_rating || game.prob_bucket_label || "<50%";
}

function modeBucket(game) {
  const option = bestOption(game, state.mode);
  if (state.mode === "wise_choice") return optionWiseBucket(option).key;
  if (state.mode === "best_growth") return kellyBucket(option).key;
  return evBucket(game);
}

function obsidianQuickGuideItem(payload = state.payload) {
  if (!shouldShowObsidianTreatment(payload)) return null;
  const variant = getVisualBranding(payload).variant || "shadow";
  if (variant === "public") {
    return [
      "Obsidian Steed",
      "The selected MLB model powers this board, with official picks and tracker-only markets clearly separated."
    ];
  }
  return [
    "Obsidian Steed Shadow",
    "A next-generation MLB model is visible for review while official performance remains separated from Classic public results."
  ];
}

function renderQuickGuide() {
  const trackerItem = hasTrackerMarkets()
    ? [
      "1st Inning Trackers",
      "NRFI/YRFI is a tracking-only first-inning model signal. It is not an official pick and is not included in public performance."
    ]
    : null;
  const items = [
    ["Wise Choices™", "Signal buckets, not guarantees. Higher score does not automatically mean higher historical ROI."],
    obsidianQuickGuideItem(),
    ["Market Dropdowns", "Money Line, Run Line, and Total dropdowns show both sides of every market."],
    trackerItem,
    ["Lineup Status", "Confirmed = official lineup; Projected = based on recent games."]
  ].filter(Boolean);
  const el = document.getElementById("quick-guide");
  if (!el) return;
  el.innerHTML = items.map(([label, text]) => `
    <article class="quick-guide-card">
      <div class="stat-label">${esc(label)}</div>
      <div>${esc(text)}</div>
    </article>
  `).join("");
}

function renderToggleButtons() {
  const el = document.getElementById("best-card-toggle");
  if (!el) return;
  if (isPreviewPayload()) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  el.style.display = "";
  el.innerHTML = BEST_CARD_MODES.map(([key, label]) => `
    <button class="toggle-btn ${state.mode === key ? "active" : ""}" data-best-card-sort="${esc(key)}" title="${key === "wise_choice" ? "Official picks that pass BoardWise risk filters, ranked by safest-edge score. Safest Edge = Signal Score × Model Probability" : ""}">${esc(label)}</button>
  `).join("");
  el.querySelectorAll("[data-best-card-sort]").forEach((rawButton) => {
    const button = /** @type {HTMLElement} */ (rawButton);
    button.addEventListener("click", () => {
      state.mode = button.dataset.bestCardSort;
      state.activeBucket = "all";
      renderBoard();
    });
  });
}

function renderModelSelector() {
  if (!modelSelectorEl) return;
  const metadata = selectedModelMetadata();
  const families = availableModelFamilies(metadata);
  const selected = selectedModelFamily(metadata);
  const buttons = isPreviewPayload()
    ? []
    : families
      .filter((item) => shouldShowModelOption(String(item.key), metadata))
      .map((item) => {
        const key = String(item.key);
        const label = item.label || key;
        const active = key === selected;
        const disabled = item.available === false;
        return `
        <button
          class="model-selector-button ${active ? "active" : ""}"
          type="button"
          data-model-family="${esc(key)}"
          ${disabled ? "disabled aria-disabled=\"true\"" : ""}
          title="${disabled ? "No published rows for this date/model yet" : ""}"
        >
          <span>${esc(label)}</span>
          ${item.badge ? `<span class="model-tag">${esc(item.badge)}</span>` : ""}
        </button>`;
      });
  if (!buttons.length) {
    // No selector is better than a wrong hardcoded one: hide when the API
    // does not advertise any model families.
    modelSelectorEl.hidden = true;
    modelSelectorEl.innerHTML = "";
    return;
  }
  modelSelectorEl.hidden = false;
  modelSelectorEl.innerHTML = `
    <span class="model-selector-label">Model</span>
    ${buttons.join("")}
  `;
  modelSelectorEl.querySelectorAll("[data-model-family]").forEach((rawButton) => {
    const button = /** @type {HTMLButtonElement} */ (rawButton);
    button.addEventListener("click", () => {
      if (button.disabled || button.getAttribute("aria-disabled") === "true") return;
      const next = button.dataset.modelFamily || "";
      if (!next || next === state.selectedModel) return;
      state.requestedModel = next;
      writeModelToUrl(next);
      loadBoard(readTargetDate());
    });
  });
}

function renderFilters() {
  if (isPreviewPayload()) {
    if (probFilters) probFilters.style.display = "none";
    if (evFilters) evFilters.style.display = "none";
    return;
  }
  if (state.mode === "full_board") {
    if (probFilters) probFilters.style.display = "none";
    if (evFilters) evFilters.style.display = "none";
    return;
  }
  const valueFilters = [
    ["High", "High", "#156f3c"],
    ["Medium-High", "Medium-High", "#669f2a"],
    ["Medium", "Medium", "#0f4c81"],
    ["Medium-Low", "Medium-Low", "#b54708"],
    ["Low", "Low", "#b42318"]
  ];
  const modeFilters = state.mode === "wise_choice"
    ? WISE_BUCKETS
    : state.mode === "best_growth"
      ? KELLY_BUCKETS
      : valueFilters;
  const filters = [["all", "All Games", "var(--accent)"], ...modeFilters];

  const target = evFilters;
  if (probFilters) probFilters.style.display = "none";
  if (!target) return;
  target.style.display = "";
  target.innerHTML = filters.map(([bucket, label]) => {
    const active = state.activeBucket === bucket;
    return `<button class="bucket-pill ${active ? "active" : ""}" data-bucket="${esc(bucket)}">${esc(label)}</button>`;
  }).join("");
  target.querySelectorAll("[data-bucket]").forEach((rawButton) => {
    const button = /** @type {HTMLElement} */ (rawButton);
    button.addEventListener("click", () => {
      state.activeBucket = button.dataset.bucket || "all";
      renderBoard();
    });
  });
}

function parsePercent(value) {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

function teamNickname(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : "";
}

function favoriteIsHome(game) {
  const fav = String(game.favorite_team || "").trim().toLowerCase();
  if (!fav) return null;
  const homeNick = teamNickname(game.home_team).toLowerCase();
  const homeAbbr = String(game.home_team_abbr || "").toLowerCase();
  const awayNick = teamNickname(game.away_team).toLowerCase();
  const awayAbbr = String(game.away_team_abbr || "").toLowerCase();
  const matchesHome = (homeNick && fav.includes(homeNick)) || (homeAbbr && fav.includes(homeAbbr)) || (homeNick && homeNick.includes(fav)) || fav === "home";
  const matchesAway = (awayNick && fav.includes(awayNick)) || (awayAbbr && fav.includes(awayAbbr)) || (awayNick && awayNick.includes(fav)) || fav === "away";
  if (matchesHome && !matchesAway) return true;
  if (matchesAway && !matchesHome) return false;
  return null;
}

// Returns away/home win probabilities (0-100) using the explicit per-side
// fields when present, then falling back to the favorite probability. Both
// stay null when the side cannot be determined (so the UI shows a dash).
function winProbs(game) {
  let away = parsePercent(game.away_win_prob_text);
  let home = parsePercent(game.home_win_prob_text);
  if (away === null && home === null) {
    const fav = parsePercent(game.favorite_prob_text);
    const favHome = favoriteIsHome(game);
    if (fav !== null && favHome === true) {
      home = fav;
      away = 100 - fav;
    } else if (fav !== null && favHome === false) {
      away = fav;
      home = 100 - fav;
    }
  } else if (away === null && home !== null) {
    away = 100 - home;
  } else if (home === null && away !== null) {
    home = 100 - away;
  }
  return { away, home };
}

function favoredSide(game) {
  const away = parsePercent(game.away_win_prob_text);
  const home = parsePercent(game.home_win_prob_text);
  if (away !== null && home !== null && away !== home) {
    return away > home ? "away" : "home";
  }
  const favHome = favoriteIsHome(game);
  if (favHome === true) return "home";
  if (favHome === false) return "away";
  return "";
}

function sideToneClass(game, which) {
  const favored = favoredSide(game);
  if (!favored) return "";
  return favored === which ? "is-favored" : "is-underdog";
}

function percentText(value, showProbs = true) {
  return showProbs && value !== null ? `${value.toFixed(1)}%` : "not available";
}

function probabilitySplit(game, showProbs = true) {
  const probs = winProbs(game);
  let awayPct = 50;
  let homePct = 50;
  if (showProbs && probs.away !== null && probs.home !== null && (probs.away + probs.home) > 0) {
    const sum = probs.away + probs.home;
    awayPct = (probs.away / sum) * 100;
    homePct = 100 - awayPct;
  }
  return { ...probs, awayPct, homePct };
}

function probabilitySplitLabel(game, split, showProbs = true) {
  const awayTeam = game.away_team || game.away_team_abbr || "Away";
  const homeTeam = game.home_team || game.home_team_abbr || "Home";
  return `${awayTeam} ${percentText(split.away, showProbs)}, ${homeTeam} ${percentText(split.home, showProbs)}`;
}

function moneylineDropdown(game) {
  const dropdowns = Array.isArray(game.market_dropdowns) ? game.market_dropdowns : [];
  return dropdowns.find((market) => {
    const key = String(market?.market_key || "").toLowerCase();
    const title = String(market?.title || "").toLowerCase();
    return key === "h2h" || key === "moneyline" || title.includes("money line") || title.includes("moneyline");
  }) || null;
}

function lastTwoWords(name) {
  const words = String(name || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.length >= 2 ? words.slice(-2).join(" ") : "";
}

// Classifies which side of THIS game a market option belongs to. Matches from
// most-specific to least-specific (abbreviation, full name, last-two-words,
// nickname) and only accepts a tier where exactly one side matches — so
// shared-nickname matchups (e.g. White Sox at Red Sox, both "sox") never
// mislabel the odds.
function optionSideInGame(option, game) {
  const text = `${option?.selection_text || ""} ${option?.label || ""}`.toLowerCase();
  const wb = (needle) => needle.length >= 2 && new RegExp(`\\b${needle}\\b`).test(text);
  const homeAbbr = String(game.home_team_abbr || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const awayAbbr = String(game.away_team_abbr || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const homeFull = String(game.home_team || "").trim().toLowerCase();
  const awayFull = String(game.away_team || "").trim().toLowerCase();
  const homeNick = teamNickname(game.home_team).toLowerCase();
  const awayNick = teamNickname(game.away_team).toLowerCase();
  const tiers = [
    [wb(homeAbbr), wb(awayAbbr)],
    [Boolean(homeFull) && text.includes(homeFull), Boolean(awayFull) && text.includes(awayFull)],
    [Boolean(lastTwoWords(game.home_team)) && text.includes(lastTwoWords(game.home_team)), Boolean(lastTwoWords(game.away_team)) && text.includes(lastTwoWords(game.away_team))],
    [Boolean(homeNick) && text.includes(homeNick), Boolean(awayNick) && text.includes(awayNick)],
  ];
  for (const [home, away] of tiers) {
    if (home && !away) return "home";
    if (away && !home) return "away";
  }
  return null;
}

function moneylineOddsFor(game, side) {
  const dropdown = moneylineDropdown(game);
  const options = dropdown && Array.isArray(dropdown.options) ? dropdown.options : [];
  const match = options.find((option) => optionSideInGame(option, game) === side);
  return match && match.odds_text ? String(match.odds_text) : "";
}

function hasOfficialPlay(game) {
  const recs = Array.isArray(game.recommendations) ? game.recommendations : [];
  return recs.some((rec) => rec && rec.is_official && !isTrackingOnlyOption(rec));
}

function gameDetailHref(game) {
  const pk = game ? (game.game_pk ?? game.game_id) : null;
  if (pk === null || pk === undefined || pk === "") return "";
  const params = new URLSearchParams();
  params.set("game_pk", String(pk));
  const date = (state.payload && state.payload.target_date) || readTargetDate();
  if (date) params.set("date", date);
  if (state.selectedModel) params.set("model", state.selectedModel);
  return `/mlb/game/?${params.toString()}`;
}

function teamAbbrText(team, abbr) {
  if (abbr) return String(abbr).toUpperCase();
  if (team) return String(team).slice(0, 3).toUpperCase();
  return "—";
}

function resolveGameBranding(game) {
  const helper = window.BoardWiseMlbBranding;
  return helper && typeof helper.resolveMatchupBranding === "function"
    ? helper.resolveMatchupBranding(game)
    : { away: null, home: null };
}

function bindRenderedLogos(root) {
  const helper = window.BoardWiseMlbBranding;
  if (helper && typeof helper.bindLogoFallbacks === "function") {
    helper.bindLogoFallbacks(root);
  }
}

function teamBrandStyle(sideBranding) {
  if (!sideBranding) return "";
  return [
    `--team-fill:${sideBranding.fill}`,
    `--team-prob-light:${sideBranding.textOnLight}`,
    `--team-prob-dark:${sideBranding.textOnDark}`,
    `--team-on-fill:${sideBranding.onFill}`,
  ].join(";");
}

function teamMarkStyle(sideBranding) {
  if (!sideBranding) return "";
  return [
    `--team-fill:${sideBranding.fill}`,
    `--team-on-fill:${sideBranding.onFill}`,
  ].join(";");
}

function matchupBarStyle(matchupBranding) {
  if (!matchupBranding?.away || !matchupBranding?.home) return "";
  return [
    `--away-team-fill:${matchupBranding.away.fill}`,
    `--home-team-fill:${matchupBranding.home.fill}`,
  ].join(";");
}

function renderTeamMark(team, abbr, sideBranding) {
  const fallback = teamAbbrText(team, abbr);
  const logoPath = sideBranding?.brand?.logoPath || "";
  const style = teamMarkStyle(sideBranding);
  if (logoPath) {
    return `
      <span class="tot-team-logo-mark"${style ? ` style="${esc(style)}"` : ""} aria-hidden="true">
        <img class="tot-team-logo" data-team-logo src="${esc(logoPath)}" alt="" width="184" height="132" decoding="async">
        <span class="tot-team-fallback">${esc(fallback)}</span>
      </span>
    `;
  }

  return `
    <span class="tot-team-mark"${style ? ` style="${esc(style)}"` : ""} aria-hidden="true">
      <span class="tot-team-fallback">${esc(fallback)}</span>
    </span>
  `;
}

function sideAriaLabel({ isHome, team, abbr, pitcher, lineup, prob, showProbs, odds }) {
  const parts = [
    `${isHome ? "Home" : "Away"} team ${team || teamAbbrText(team, abbr)}`,
    `Starting pitcher ${pitcher || "Pitcher TBD"}`,
  ];
  if (lineup) parts.push(`Lineup ${lineup}`);
  parts.push(`Win probability ${percentText(prob, showProbs)}`);
  if (odds) parts.push(`Moneyline ${odds}`);
  return `${parts.join(". ")}.`;
}

function renderTotSide(game, which, showProbs, sideBranding) {
  const isHome = which === "home";
  const team = isHome ? game.home_team : game.away_team;
  const abbr = isHome ? game.home_team_abbr : game.away_team_abbr;
  const pitcher = isHome ? game.home_pitcher : game.away_pitcher;
  const lineup = isHome ? game.lineup_status_home : game.lineup_status_away;
  const probs = winProbs(game);
  const prob = isHome ? probs.home : probs.away;
  const probText = showProbs && prob !== null ? `${prob.toFixed(1)}<span class="pct">%</span>` : "&mdash;";
  const odds = moneylineOddsFor(game, which);
  const lineupClass = ["confirmed", "projected"].includes(String(lineup)) ? String(lineup) : "unknown";
  const tone = sideToneClass(game, which);
  const sideStyle = teamBrandStyle(sideBranding);
  const sideLabel = sideAriaLabel({ isHome, team, abbr, pitcher, lineup, prob, showProbs, odds });
  return `
    <div class="tot-side ${which} ${tone}"${sideStyle ? ` style="${esc(sideStyle)}"` : ""} aria-label="${esc(sideLabel)}">
      ${renderTeamMark(team, abbr, sideBranding)}
      <div class="tot-team">${esc(team || (isHome ? "Home" : "Away"))}</div>
      <div class="tot-pitcher">${esc(pitcher || "Pitcher TBD")}</div>
      ${lineup ? `<span class="lineup-tag ${lineupClass}">${esc(lineup)}</span>` : ""}
      <div class="tot-prob tnum">${probText}</div>
      ${odds ? `<div class="tot-ml tnum">ML ${esc(odds)}</div>` : ""}
    </div>
  `;
}

function renderTotCenter(game, showProbs, matchupBranding) {
  const split = probabilitySplit(game, showProbs);
  const label = probabilitySplitLabel(game, split, showProbs);
  const awayTone = sideToneClass(game, "away");
  const homeTone = sideToneClass(game, "home");
  const total = game.projected_total_text ? String(game.projected_total_text) : "";
  const barStyle = matchupBarStyle(matchupBranding);
  return `
    <div class="tot-center">
      <div class="tot-winprob-label">Win Prob</div>
      <div class="tot-bar" role="img" aria-label="${esc(label)}"${barStyle ? ` style="${esc(barStyle)}"` : ""}>
        <div class="tot-bar-away tot-bar-segment ${awayTone}" style="height:${split.awayPct.toFixed(1)}%"></div>
        <div class="tot-bar-home tot-bar-segment ${homeTone}" style="height:${split.homePct.toFixed(1)}%"></div>
      </div>
      <div class="tot-vs">VS</div>
      ${total ? `<div class="tot-total tnum">Total ${esc(total)}</div>` : ""}
    </div>
  `;
}

function renderTotMobileSplit(game, showProbs, matchupBranding) {
  const split = probabilitySplit(game, showProbs);
  const label = probabilitySplitLabel(game, split, showProbs);
  const awayTone = sideToneClass(game, "away");
  const homeTone = sideToneClass(game, "home");
  const total = game.projected_total_text ? String(game.projected_total_text) : "";
  const barStyle = matchupBarStyle(matchupBranding);
  return `
    <div class="tot-mobile-split">
      <div class="tot-mobile-bar" role="img" aria-label="${esc(label)}"${barStyle ? ` style="${esc(barStyle)}"` : ""}>
        <div class="tot-mobile-away tot-mobile-segment ${awayTone}" style="width:${split.awayPct.toFixed(1)}%"></div>
        <div class="tot-mobile-home tot-mobile-segment ${homeTone}" style="width:${split.homePct.toFixed(1)}%"></div>
      </div>
      <div class="tot-mobile-label">Model Win Probability</div>
      ${total ? `<div class="tot-mobile-total tnum">Projected total ${esc(total)}</div>` : ""}
    </div>
  `;
}

function renderTaleOfTape(game, showProbs = true) {
  const matchupBranding = resolveGameBranding(game);
  const when = [game.commence_time, game.venue].filter(Boolean).join(" · ");
  const label = gameLabel(game);
  const href = gameDetailHref(game);
  const title = href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label);
  const official = hasOfficialPlay(game) ? `<span class="official-plays-pill">Official Plays</span>` : "";
  return `
    <div class="tot-head">
      <div class="tot-head-meta">
        ${when ? `<div class="tot-when tnum">${esc(when)}</div>` : ""}
        <div class="tot-title">${title}</div>
      </div>
      ${official}
    </div>
    <div class="tot-tape">
      ${renderTotSide(game, "away", showProbs, matchupBranding.away)}
      ${renderTotCenter(game, showProbs, matchupBranding)}
      ${renderTotSide(game, "home", showProbs, matchupBranding.home)}
    </div>
    ${renderTotMobileSplit(game, showProbs, matchupBranding)}
    ${game.board_state_label ? `<div class="state-badge">${esc(game.board_state_label)}</div>` : ""}
    ${game.board_state_note ? `<div class="board-state-note">${esc(game.board_state_note)}</div>` : ""}
  `;
}

function valueToneClass(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("+")) return "positive";
  if (trimmed.startsWith("-") || trimmed.startsWith("−")) return "negative";
  return "";
}

function metric(label, value, cls = "", title = "") {
  const displayValue = value === null || value === undefined || value === "" ? "-" : value;
  const titleAttr = title ? ` title="${esc(title)}"` : "";
  return `<div class="metric-bubble"${titleAttr}><div class="m-label">${esc(label)}</div><div class="m-value ${cls}">${esc(displayValue)}</div></div>`;
}

function optionalMetric(label, value, cls = "", title = "") {
  if (value === null || value === undefined || value === "") return "";
  return metric(label, value, cls, title);
}

function formatProbability(value) {
  const number = asNumber(value);
  if (number === null) return "N/A";
  return `${(number * 100).toFixed(1)}%`;
}

function optionMarketProbability(option) {
  if (!option) return null;
  return asNumber(
    option.market_no_vig_prob ??
    option.market_implied_prob ??
    option.implied_probability ??
    option.price_implied_probability
  );
}

function renderBestCard(option, variant) {
  if (!option) return `<div class="forecast-only-note">No Wise Choice recommendation is available for this game yet.</div>`;
  const label = variant === "wise_choice" || variant === "full_board"
    ? "Wise Choice™"
    : BEST_CARD_MODES.find(([key]) => key === variant)?.[1] || "Best Value";
  const wise = optionWiseBucket(option);
  const badge = variant === "wise_choice"
    ? officialTierBadge(option, wise)
    : variant === "best_growth"
      ? formatKelly(option)
      : (option.ev_text || option.ev_rating);
  const badgePrefix = variant === "wise_choice" ? "" : variant === "best_growth" ? "Signal: " : "Value: ";
  const badgeTitle = variant === "wise_choice" ? `Safest Edge = Signal Score × Model Probability (${formatWise(option)})` : variant === "best_growth" ? "Signal strength" : "Expected value rating";
  const official = option.is_official && !isTrackingOnlyOption(option);
  const meta = [option.sportsbook, option.odds_text].filter(Boolean).join(" ");
  const selection = option.selection_text || option.label || "No selection";
  const win = option.model_probability_text || option.model_prob_text || "";
  const edge = option.edge_text || "";
  const ev = option.ev_text || "";
  return `
    <div class="best-card" data-best-card-variant="${esc(variant)}">
      <div class="best-card-layout">
        <div class="best-copy">
          <div class="best-topline">
            <div class="best-label">${esc(label)}</div>
            ${badge ? `<span class="rating-badge ${variant === "wise_choice" ? "wise-rating-badge" : ""} ${official ? "" : "not-official"}" title="${esc(badgeTitle)}">${esc(badgePrefix + badge)}</span>` : ""}
          </div>
          <div class="best-bet">${esc(selection)}${meta ? `<span class="best-meta-inline"> · ${esc(meta)}</span>` : ""}</div>
        </div>
        <div class="best-metrics">
          ${optionalMetric("Win", win)}
          ${optionalMetric("Edge", edge, valueToneClass(edge))}
          ${optionalMetric("EV", ev, valueToneClass(ev), EV_TIP)}
        </div>
      </div>
    </div>
  `;
}

function officialTierBadge(option, wise = optionWiseBucket(option)) {
  if (isTrackingOnlyOption(option)) return "Tracking";
  const tier = wiseStatusText(wise.key || wise.status);
  if (tier === "Verify") return "Verify Line";
  if (option?.is_official && ["Strong", "Prime", "Playable"].includes(tier)) return `Official · ${tier}`;
  if (tier === "Lean") return option?.is_official ? "Official · Lean" : "Lean · Not Official";
  return tier;
}

function isTrackingOnlyOption(option) {
  return Boolean(option && (option.tracking_only || option.is_tracking_only));
}

function scoreOrFloor(value) {
  const number = asNumber(value);
  return number === null ? -999 : number;
}

function optionSortKey(option, variant = state.mode) {
  const wiseScore = optionWiseScore(option);
  const kelly = optionKelly(option);
  const ev = asNumber(option?.expected_value_per_unit ?? option?.raw_ev);
  const probability = asNumber(option?.model_probability);
  const confidence = asNumber(option?.confidence_rank);
  if (variant === "best_growth") {
    return [kelly, wiseScore, ev, probability, confidence].map(scoreOrFloor);
  }
  if (variant === "best_value") {
    return [ev, kelly, probability, confidence, wiseScore].map(scoreOrFloor);
  }
  return [wiseScore, kelly, ev, probability, confidence].map(scoreOrFloor);
}

function compareBetItems(a, b) {
  const left = optionSortKey(a.option);
  const right = optionSortKey(b.option);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (right[i] ?? -999) - (left[i] ?? -999);
    if (diff !== 0) return diff;
  }
  return String(a.gameLabel).localeCompare(String(b.gameLabel));
}

function collectRecommendedBets(games) {
  const helper = wiseChoiceHelper();
  if (helper) return helper.collectRecommendedBets(games, state.payload || {}, wiseChoiceOptions());

  const bets = [];
  for (const game of games) {
    const recs = Array.isArray(game.recommendations)
      ? game.recommendations.filter((rec) => rec && typeof rec === "object" && !isTrackingOnlyOption(rec))
      : [];
    const official = recs.filter((rec) => rec.is_official && !isTrackingOnlyOption(rec));
    const source = official.length ? official : recs;
    if (!source.length) {
      const option = bestOption(game, state.mode);
      if (option) source.push(option);
    }
    for (const option of source) {
      bets.push({
        game,
        option,
        gameLabel: gameLabel(game)
      });
    }
  }
  return bets.sort(compareBetItems);
}

function optionModeBucket(option) {
  if (state.mode === "wise_choice") {
    const wise = optionWiseBucket(option);
    return { key: wise.key, label: wiseStatusText(wise.key || wise.status) };
  }
  if (state.mode === "best_growth") {
    const bucket = kellyBucket(option);
    const found = KELLY_BUCKETS.find(([key]) => key === bucket.key);
    return { key: bucket.key, label: found ? found[1] : "Signal" };
  }
  return {
    key: option.ev_rating || "Low",
    label: option.ev_rating || "Value"
  };
}

function betPassesFilter(item) {
  if (state.activeBucket === "all") return true;
  return optionModeBucket(item.option).key === state.activeBucket;
}

function renderBetPill(item) {
  const bucket = optionModeBucket(item.option);
  const option = item.option;
  const odds = [option.sportsbook, option.odds_text].filter(Boolean).join(" ");
  return `
    <article class="bet-pill-card">
      <div class="bet-pill-main">
        <div class="bet-pill-copy">
          <div class="bet-pill-game">${esc(item.gameLabel)}</div>
          <div class="bet-pill-choice">${esc(option.selection_text || option.label || "Recommendation")}</div>
          ${odds ? `<div class="bet-pill-odds">${esc(odds)}</div>` : ""}
        </div>
        <span class="bet-pill-bucket" title="Safest Edge = Signal Score × Model Probability">${esc(bucket.label)}</span>
      </div>
    </article>
  `;
}

function renderOptionCard(option) {
  const classes = ["option-card"];
  const trackingOnly = isTrackingOnlyOption(option);
  const official = option.is_official && !trackingOnly;
  if (option.is_primary) classes.push("primary");
  if (official) classes.push("official");
  return `
    <div class="${classes.join(" ")}">
      <div class="option-header">
        <span class="option-label">${esc(option.label || option.selection_text || "Option")}</span>
        <span class="option-badge-row">
          ${option.ev_rating ? `<span class="option-rating-badge rating-badge not-official" title="Expected value rating">EV: ${esc(option.ev_rating)}</span>` : ""}
          ${trackingOnly ? `<span class="option-badge tracker-badge">Tracking Only</span>` : official ? `<span class="option-badge official">Official</span>` : option.status_label ? `<span class="option-badge">${esc(option.status_label)}</span>` : `<span class="option-badge">Pass</span>`}
        </span>
      </div>
      <div class="option-meta">${esc([option.sportsbook, option.odds_text].filter(Boolean).join(" ") || "No book/odds listed")}</div>
      <div class="option-metrics">
        ${metric("Odds", option.odds_text)}
        ${metric("Win Prob", option.model_probability_text || option.model_prob_text)}
        ${metric("Market Impl", formatProbability(optionMarketProbability(option)))}
        ${metric("Edge", option.edge_text, valueToneClass(option.edge_text))}
        ${metric("EV / Unit", option.ev_text, valueToneClass(option.ev_text), `${EV_TIP} ${UNIT_TIP}`)}
      </div>
    </div>
  `;
}

function renderTrackerOutcome(outcome) {
  const label = outcome.label || outcome.side || "Tracker";
  const badge = outcome.tracking_only === false ? "Tracker" : "Tracking Only";
  return `
    <div class="option-card tracker-option">
      <div class="option-header">
        <span class="option-label">${esc(label)}</span>
        <span class="option-badge tracker-badge" title="${esc(TRACKER_HELPER_TEXT)}">${esc(badge)}</span>
      </div>
      <div class="option-meta">${esc([outcome.sportsbook, outcome.odds_text].filter(Boolean).join(" ") || "Tracker market")}</div>
      <div class="option-metrics">
        ${metric("Model", outcome.model_probability_text || formatProbability(outcome.model_probability))}
        ${metric("Market", outcome.market_probability_text || formatProbability(outcome.market_probability))}
        ${metric("Edge", outcome.edge_text)}
        ${metric("Odds", outcome.odds_text)}
      </div>
    </div>
  `;
}

function renderTrackerMarketDropdowns(game) {
  if (!hasTrackerMarkets()) return "";
  const advertisedKeys = advertisedTrackerMarketKeys();
  const dropdowns = (Array.isArray(game.tracker_market_dropdowns) ? game.tracker_market_dropdowns : [])
    .filter((market) => {
      const key = market?.market_key || market?.market_key_canonical || market?.key;
      return key && advertisedKeys.has(String(key));
    });
  if (!dropdowns.length) return "";
  return `<section class="tracker-market-section" aria-label="Tracking-only markets">
    <div class="tracker-section-head">
      <span class="tracker-section-title">Tracking-only markets</span>
      <span class="option-badge tracker-badge" title="${esc(TRACKER_HELPER_TEXT)}">Tracking Only</span>
    </div>
    <div class="dropdown-stack tracker-dropdown-stack">${dropdowns.map((market) => {
    const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
    const title = trackerMarketLabel(market);
    const summaryLabel = `${title}. Tracking Only. Expand tracking-only market details.`;
    return `
      <details class="market-dropdown tracker-market-dropdown">
        <summary class="market-summary-row" aria-label="${esc(summaryLabel)}">
          <span class="market-summary-selection">${esc(title)}</span>
          <span class="market-summary-model"></span>
          <span class="market-summary-edge"></span>
          <span class="market-summary-call">Tracking Only</span>
          <span class="market-summary-chevron" aria-hidden="true">›</span>
        </summary>
        <div class="dropdown-body">
          <div class="tracker-helper-line">${esc(TRACKER_HELPER_TEXT)}</div>
          ${outcomes.map(renderTrackerOutcome).join("")}
        </div>
      </details>
    `;
  }).join("")}</div></section>`;
}

function normalizedText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function marketOptions(market) {
  return (Array.isArray(market?.options) ? market.options : [])
    .filter((option) => option && typeof option === "object");
}

function representativeMarketOption(market) {
  const options = marketOptions(market);
  if (!options.length) return null;
  const official = options.find((option) => option.is_official === true && !isTrackingOnlyOption(option));
  if (official) return official;
  const primary = options.find((option) => option.is_primary === true);
  if (primary) return primary;
  const summary = normalizedText(market?.summary_center_text);
  if (summary) {
    const summaryMatch = options.find((option) => {
      const selection = normalizedText(option.selection_text);
      const label = normalizedText(option.label);
      return selection === summary || label === summary || (selection && summary.includes(selection)) || (label && summary.includes(label));
    });
    if (summaryMatch) return summaryMatch;
  }
  return options[0];
}

function marketRowSelection(market, option) {
  const title = String(market?.title || market?.market_key || "Market");
  if (!option) return title;
  const selection = String(option.selection_text || option.label || "").trim();
  if (!selection) return title;
  const titleNorm = normalizedText(title);
  const selectionNorm = normalizedText(selection);
  if (titleNorm && (titleNorm === selectionNorm || selectionNorm.includes(titleNorm))) return selection;
  return `${title} · ${selection}`;
}

function renderMarketCall(official) {
  const label = official ? "Official" : "Pass";
  return `<span class="market-call-pill ${official ? "official" : "pass"}">${label}</span>`;
}

function renderMarketSummaryRow(market) {
  const representative = representativeMarketOption(market);
  const official = Boolean(representative?.is_official === true && !isTrackingOnlyOption(representative));
  const selection = marketRowSelection(market, representative);
  const model = representative?.model_probability_text || representative?.model_prob_text || "—";
  const edge = representative?.edge_text || "";
  const call = official ? "Official" : "Pass";
  const summaryLabel = `${selection}. Model ${model}. Edge ${edge || "—"}. ${call}. Expand market details.`;
  return `
    <details class="market-dropdown">
      <summary class="market-summary-row" aria-label="${esc(summaryLabel)}">
        <span class="market-summary-selection">${esc(selection)}</span>
        <span class="market-summary-model tnum">${esc(model)}</span>
        <span class="market-summary-edge ${valueToneClass(edge)} tnum">${esc(edge || "—")}</span>
        <span class="market-summary-call">${renderMarketCall(official)}</span>
        <span class="market-summary-chevron" aria-hidden="true">›</span>
      </summary>
      <div class="dropdown-body">${marketOptions(market).map(renderOptionCard).join("") || `<div class="forecast-only-note">No market options are available for this market yet.</div>`}</div>
    </details>
  `;
}

function renderMarketDropdowns(game) {
  const dropdowns = Array.isArray(game.market_dropdowns) ? game.market_dropdowns : [];
  if (!dropdowns.length) {
    return `<div class="forecast-only-note">No market dropdowns are available for this game yet.</div>`;
  }
  return `<div class="market-summary-table">
    <div class="market-summary-head" aria-hidden="true">
      <span>Market</span>
      <span>Model</span>
      <span>Edge</span>
      <span>Call</span>
      <span></span>
    </div>
    ${dropdowns.map(renderMarketSummaryRow).join("")}
    ${renderModelDetails(game)}
  </div>`;
}

function renderModelDetails(game) {
  const cells = Array.isArray(game.model_details_cells) ? game.model_details_cells : [];
  const detailRows = cells.length ? cells : [
    { label: "Away Win Prob", value: game.away_win_prob_text },
    { label: "Home Win Prob", value: game.home_win_prob_text },
    { label: "Projected Total", value: game.projected_total_text },
    { label: "Projected Margin", value: game.projected_margin_text }
  ].filter((row) => row.value);
  if (!detailRows.length && !game.model_details_projected_score && !game.model_version) return "";
  return `
    <details class="market-dropdown">
      <summary class="market-summary-row" aria-label="Model Details. Auxiliary. Expand model details.">
        <span class="market-summary-selection">Model Details</span>
        <span class="market-summary-model"></span>
        <span class="market-summary-edge"></span>
        <span class="market-summary-call">Auxiliary</span>
        <span class="market-summary-chevron" aria-hidden="true">›</span>
      </summary>
      <div class="dropdown-body">
        ${game.model_details_projected_score ? `
          <div class="md-projected-score">
            <div class="m-label">Projected Score</div>
            <div class="m-value">${esc(game.model_details_projected_score)}</div>
          </div>` : ""}
        <div class="md-grid">
          ${detailRows.map((cell) => `
            <div class="md-cell ${cell.wide ? "md-wide" : ""}">
              <div class="m-label">${esc(cell.label || "")}</div>
              <div class="m-value">${esc(cell.value ?? "-")}</div>
            </div>`).join("")}
          ${game.model_version ? `
            <div class="md-cell md-wide">
              <div class="m-label">Model Version</div>
              <div class="m-value">${esc(game.model_version)}</div>
            </div>` : ""}
        </div>
      </div>
    </details>
  `;
}

function gamePassesFilter(game) {
  if (state.activeBucket === "all") return true;
  return modeBucket(game) === state.activeBucket;
}

function renderGame(game, variant = state.mode) {
  const option = bestOption(game, variant);
  const wise = optionWiseBucket(option);
  const tier = wiseStatusText(wise.key || wise.status);
  const strong = tier === "Prime" || tier === "Strong" || option?.ev_rating === "High";
  const tileClass = strong ? "tile strong" : "tile";
  const detailHref = gameDetailHref(game);
  return `
    <article class="${tileClass}" data-ev-bucket="${esc(evBucket(game))}" data-prob-bucket="${esc(probBucket(game))}" data-wise-bucket="${esc(wise.key)}">
      ${renderTaleOfTape(game, true)}
      ${renderBestCard(option, variant)}
      ${renderMarketDropdowns(game)}
      ${renderTrackerMarketDropdowns(game)}
      ${detailHref ? `<a class="tot-detail-link" href="${esc(detailHref)}">Full game detail &rarr;</a>` : ""}
    </article>
  `;
}

function renderPreviewGame(game) {
  const detailHref = gameDetailHref(game);
  return `
    <article class="tile preview-tile">
      ${renderTaleOfTape(game, true)}
      <div class="forecast-only-note preview-note">Preview card — become a Founder to unlock full markets, the model breakdown, and the Wise Choice™ pick.</div>
      ${detailHref ? `<a class="tot-detail-link" href="${esc(detailHref)}">Full game detail &rarr;</a>` : ""}
    </article>
  `;
}

function safePreviewUpgradePath(value) {
  if (typeof value !== "string") return "/pricing/";
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "/pricing/";
  return path;
}

function renderPreviewUpgradeCard(payload = state.payload) {
  const access = payload && payload.access && typeof payload.access === "object"
    ? payload.access
    : {};
  const href = safePreviewUpgradePath(access.upgrade_path);
  return `
    <article class="empty-state">
      <strong>Full MLB board requires Founder access.</strong>
      <div class="preview-upgrade-copy">The preview shows your ${esc(access.max_preview_games || 2)} MLB cards for today.</div>
      <a class="button primary" href="${esc(href)}">Become a Founder</a>
    </article>
  `;
}

function renderBoard() {
  if (!state.payload) return;
  const viewToggle = document.getElementById("board-view-toggle");
  if (viewToggle) viewToggle.style.display = "none";
  renderToggleButtons();
  renderFilters();
  const games = Array.isArray(state.payload.games) ? state.payload.games : [];
  if (!gamesEl) return;
  gamesEl.hidden = false;
  if (isPreviewPayload()) {
    gamesEl.className = "tile-list";
    gamesEl.innerHTML = games.length
      ? `${games.map(renderPreviewGame).join("")}${renderPreviewUpgradeCard()}`
      : renderPreviewUpgradeCard();
    bindRenderedLogos(gamesEl);
    return;
  }
  if (state.mode !== "full_board") {
    gamesEl.className = "bet-pill-list";
    const filteredBets = collectRecommendedBets(games).filter(betPassesFilter);
    gamesEl.innerHTML = filteredBets.length
      ? filteredBets.map(renderBetPill).join("")
      : `<article class="empty-state">No recommended bets match this filter.</article>`;
    bindRenderedLogos(gamesEl);
    return;
  }
  gamesEl.className = "tile-list";
  const filtered = games.filter(gamePassesFilter);
  gamesEl.innerHTML = filtered.length
    ? filtered.map((game) => renderGame(game, "wise_choice")).join("")
    : `<article class="empty-state">No games match this filter.</article>`;
  bindRenderedLogos(gamesEl);
}

function showAccessError(error) {
  const status = Number(error && error.status);
  if (status === 401) {
    showError("Sign in to view the MLB board.");
    return;
  }
  if (status === 403) {
    showError("This MLB board view requires Founder access.");
    return;
  }
  showError("Could not load the MLB board right now. Please try again in a moment.");
}

async function loadBoard(targetDate, options = {}) {
  showLoading();
  const requestedModel = state.requestedModel;
  try {
    const payload = await window.BoardWiseApi.getMlbBoard(targetDate, {
      model: requestedModel || undefined
    });
    state.payload = payload;
    const metadata = selectedModelMetadata(payload);
    state.selectedModel = metadata.selected_model_family || requestedModel || metadata.default_model_family || "";
    if (requestedModel && state.selectedModel !== requestedModel) {
      // The API resolved a different family than requested (unknown, alias, or
      // advertised-but-unavailable for this date); normalize URL state.
      state.requestedModel = state.selectedModel;
      writeModelToUrl(state.requestedModel);
    }
    setHidden(loadingEl, true);
    setHidden(errorEl, true);
    setPageMeta(payload, targetDate);
    setStatusNote(payload);
    if (isPreviewPayload(payload)) state.mode = "full_board";
    renderQuickGuide();
    renderModelSelector();
    renderObsidianHero(payload);
    applyVisualTreatment(payload);
    renderBoard();
  } catch (error) {
    if (requestedModel && !options.isModelFallback && Number(error?.status) === 400) {
      // The API rejected the requested model family; drop the model param and
      // reload the default board once (isModelFallback guards retry loops).
      state.requestedModel = "";
      writeModelToUrl("");
      await loadBoard(targetDate, { isModelFallback: true });
      return;
    }
    console.error(error);
    showAccessError(error);
  }
}

function init() {
  const initialDate = readTargetDate();
  state.requestedModel = readModelFromUrl();
  if (dateInput) dateInput.value = initialDate;
  if (dateForm && dateInput) {
    dateForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = dateInput.value.trim();
      if (value && !isIsoDate(value)) {
        showError("Dates must use YYYY-MM-DD.");
        return;
      }
      writeTargetDate(value);
      loadBoard(value);
    });
  }
  loadBoard(initialDate);
}

if (["", "localhost", "127.0.0.1"].includes(window.location.hostname)) {
  const testWindow = /** @type {Window & { __BoardWiseMlbTestHooks?: any }} */ (window);
  testWindow.__BoardWiseMlbTestHooks = Object.freeze({
    getVisualBranding,
    getTrackerMarketMetadata,
    shouldShowObsidianTreatment,
    favoredSide,
    resolveGameBranding,
    representativeMarketOption,
    wiseBucketForScore,
    wiseStatusText
  });
}

init();
