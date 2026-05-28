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
  ["best_growth", "Kelly Edge"],
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

const MODEL_OPTIONS = [
  ["obsidian_steed", "Obsidian Steed", "New model"],
  ["classic_mlb", "Classic MLB", "Legacy baseline"]
];

const metaEl = document.getElementById("meta");
const statusNoteEl = document.getElementById("status-note");
const loadingEl = document.getElementById("loading");
const gamesEl = document.getElementById("games");
const errorEl = document.getElementById("error");
const dateForm = /** @type {HTMLFormElement | null} */ (document.getElementById("date-form"));
const dateInput = /** @type {HTMLInputElement | null} */ (document.getElementById("board-date"));
const evFilters = document.getElementById("ev-filters");
const probFilters = document.getElementById("prob-filters");
const modelSelectorEl = document.getElementById("model-selector");

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

function safeColor(value, fallback = "#0f4c81") {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(value || "")) ? value : fallback;
}

function textColorFor(bgColor) {
  return String(bgColor || "").toLowerCase() === "#86efac" ? "#101828" : "#fff";
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
  return MODEL_OPTIONS.some(([key]) => key === model) ? model : "";
}

function writeModelToUrl(model) {
  const url = new URL(window.location.href);
  if (model) url.searchParams.set("model", model);
  else url.searchParams.delete("model");
  window.history.replaceState({}, "", url);
}

function modelOption(key) {
  return MODEL_OPTIONS.find(([value]) => value === key) || MODEL_OPTIONS[0];
}

function selectedModelMetadata(payload = state.payload) {
  return payload && payload.model_metadata && typeof payload.model_metadata === "object"
    ? payload.model_metadata
    : {};
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
  setHidden(loadingEl, false);
  setHidden(errorEl, true);
  setHidden(gamesEl, true);
  if (metaEl) {
    metaEl.innerHTML = `<div class="pill">Loading latest board…</div>`;
  }
}

function showError(message) {
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
  const selectedModel = metadata.selected_model_family || state.selectedModel;
  const model = selectedModel ? modelOption(selectedModel) : null;
  return [
    ["Generated", payload.generated_at || "Unknown"],
    ["Date", payload.target_date || "-"],
    model ? ["Model", `${model[1]} · ${model[2]}`] : null,
    ["Games", formatCount(payload.game_count)],
    ["Betting Games", formatCount(payload.betting_game_count)],
    ["Recommendations", formatCount(payload.recommendation_count)],
    ["Books", booksSeen.length ? booksSeen.join(", ") : "None listed"]
  ].filter(Boolean);
}

function setPageMeta(payload, requestedDate) {
  const targetDate = payload.target_date || requestedDate || "-";
  document.title = `BoardWise MLB - ${targetDate}`;
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

function bestOption(game, variant = state.mode) {
  const options = game.best_card_options || {};
  if (variant === "best_value") return options.best_value || options.highest_ev || null;
  if (variant === "best_growth") return options.best_growth || options.wise_choice || options.best_value || options.highest_ev || null;
  if (variant === "wise_choice") return options.wise_choice || options.best_value || options.highest_ev || null;
  return options[variant] || options.best_value || options.highest_ev || (Array.isArray(game.recommendations) ? game.recommendations[0] : null);
}

function evBucket(game) {
  return bestOption(game, "best_value")?.ev_rating || game.ev_bucket_label || "Low";
}

function evColor(game) {
  return safeColor(bestOption(game, "best_value")?.ev_rating_color || game.ev_bucket_color, "#0f4c81");
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

function modeColor(game) {
  const option = bestOption(game, state.mode);
  if (state.mode === "wise_choice") return safeColor(optionWiseBucket(option).color, "#0f4c81");
  if (state.mode === "best_growth") return safeColor(kellyBucket(option).color, "#0f4c81");
  return evColor(game);
}

function renderQuickGuide() {
  const items = [
    ["Wise Choices™", "Signal buckets, not guarantees. Higher score does not automatically mean higher historical ROI."],
    ["Model Selector", "Compare Obsidian Steed with Classic MLB while the new model builds live history."],
    ["Market Dropdowns", "Money Line, Run Line, and Total dropdowns show both sides of every market."],
    ["Lineup Status", "Confirmed = official lineup; Projected = based on recent games."]
  ];
  const el = document.getElementById("quick-guide");
  if (!el) return;
  el.innerHTML = items.map(([label, text]) => `
    <article class="quick-guide-card">
      <div class="stat-label">${esc(label)}</div>
      <div style="color:var(--muted);font-size:14px;margin-top:4px">${esc(text)}</div>
    </article>
  `).join("");
}

function renderToggleButtons() {
  const el = document.getElementById("best-card-toggle");
  if (!el) return;
  el.style.display = "";
  el.innerHTML = BEST_CARD_MODES.map(([key, label]) => `
    <button class="toggle-btn ${state.mode === key ? "active" : ""}" data-best-card-sort="${esc(key)}" title="${key === "wise_choice" ? "Official picks that pass BoardWise risk filters, ranked by safest-edge score. Safest Edge = Kelly Score × Model Probability" : ""}">${esc(label)}</button>
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
  const selected = metadata.selected_model_family || state.selectedModel || "classic_mlb";
  const metadataHasAvailability = Array.isArray(metadata.available_model_families);
  const available = new Map(
    (metadataHasAvailability ? metadata.available_model_families : [])
      .map((item) => [item.key, item])
  );
  modelSelectorEl.hidden = false;
  modelSelectorEl.innerHTML = `
    <span class="model-selector-label">Model</span>
    ${MODEL_OPTIONS.map(([key, label, badge]) => {
      const item = available.get(key) || {};
      const active = key === selected;
      const disabled = metadataHasAvailability ? (!available.has(key) || item.available === false) : false;
      return `
        <button
          class="model-selector-button ${active ? "active" : ""}"
          type="button"
          data-model-family="${esc(key)}"
          ${disabled ? "disabled aria-disabled=\"true\"" : ""}
          title="${disabled ? "No published rows for this date/model yet" : ""}"
        >
          <span>${esc(label)}</span>
          <span class="model-tag">${esc(badge)}</span>
        </button>`;
    }).join("")}
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
  target.innerHTML = filters.map(([bucket, label, color]) => {
    const active = state.activeBucket === bucket;
    const style = active ? ` style="background:${esc(color)};border-color:${esc(color)};color:${esc(textColorFor(color))}"` : "";
    return `<button class="bucket-pill ${active ? "active" : ""}" data-bucket="${esc(bucket)}" data-bg="${esc(color)}"${style}>${esc(label)}</button>`;
  }).join("");
  target.querySelectorAll("[data-bucket]").forEach((rawButton) => {
    const button = /** @type {HTMLElement} */ (rawButton);
    button.addEventListener("click", () => {
      state.activeBucket = button.dataset.bucket || "all";
      renderBoard();
    });
  });
}

function renderPitchers(game) {
  return `
    <div class="pitchers">
      <div class="pitcher-card">
        <div class="pitcher-label">Away Pitcher (${esc(game.away_team_abbr || "-")})</div>
        <div class="pitcher-name">${esc(game.away_pitcher || "Not listed")}</div>
        <span class="lineup-tag ${esc(game.lineup_status_away || "unknown")}">${esc(game.lineup_status_away || "unknown")}</span>
      </div>
      <div class="pitcher-card">
        <div class="pitcher-label">Home Pitcher (${esc(game.home_team_abbr || "-")})</div>
        <div class="pitcher-name">${esc(game.home_pitcher || "Not listed")}</div>
        <span class="lineup-tag ${esc(game.lineup_status_home || "unknown")}">${esc(game.lineup_status_home || "unknown")}</span>
      </div>
    </div>
  `;
}

function metric(label, value) {
  return `<div class="metric-bubble"><div class="m-label">${esc(label)}</div><div class="m-value">${esc(value || "-")}</div></div>`;
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
  if (!option) return `<div class="forecast-only-note">No best-bet recommendation is available for this sort.</div>`;
  const label = BEST_CARD_MODES.find(([key]) => key === variant)?.[1] || "Best Value";
  const wise = optionWiseBucket(option);
  const model = modelOption(selectedModelMetadata().selected_model_family || state.selectedModel || "classic_mlb");
  const badge = variant === "wise_choice"
    ? officialTierBadge(option, wise)
    : variant === "best_growth"
      ? formatKelly(option)
      : (option.ev_text || option.ev_rating);
  const color = variant === "wise_choice"
    ? safeColor(wise.color, "#0f4c81")
    : variant === "best_growth"
      ? safeColor(kellyBucket(option).color, "#0f4c81")
      : safeColor(option.ev_rating_color, "#0f4c81");
  const badgePrefix = variant === "wise_choice" ? "" : variant === "best_growth" ? "Kelly: " : "Value: ";
  const badgeTitle = variant === "wise_choice" ? `Safest Edge = Kelly Score × Model Probability (${formatWise(option)})` : variant === "best_growth" ? "Kelly percentage" : "Expected value rating";
  return `
    <div class="best-card" data-best-card-variant="${esc(variant)}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div class="label">${esc(label)}</div>
        ${badge ? `<span class="rating-badge ${variant === "wise_choice" ? "wise-rating-badge" : ""}" title="${esc(badgeTitle)}" style="background:${color};color:${esc(textColorFor(color))}">${esc(badgePrefix + badge)}</span>` : ""}
      </div>
      <div class="best-bet">${esc(option.selection_text || "No selection")}</div>
      <div class="best-meta">${esc([model[1], option.sportsbook, option.odds_text].filter(Boolean).join(" · ") || "No book/odds listed")}</div>
      <div class="best-metrics">
        ${metric("Odds", option.odds_text)}
        ${metric("Win Prob", option.model_prob_text || option.model_probability_text)}
        ${metric("Market Impl", formatProbability(optionMarketProbability(option)))}
        ${metric("Edge", option.edge_text)}
        ${metric("EV / Unit", option.ev_text)}
      </div>
    </div>
  `;
}

function officialTierBadge(option, wise = optionWiseBucket(option)) {
  const tier = wiseStatusText(wise.key || wise.status);
  if (tier === "Verify") return "Verify Line";
  if (option?.is_official && ["Strong", "Prime", "Playable"].includes(tier)) return `Official · ${tier}`;
  if (tier === "Lean") return option?.is_official ? "Official · Lean" : "Lean · Not Official";
  return tier;
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
  const bets = [];
  for (const game of games) {
    const recs = Array.isArray(game.recommendations) ? game.recommendations.filter((rec) => rec && typeof rec === "object") : [];
    const official = recs.filter((rec) => rec.is_official);
    const source = official.length ? official : recs;
    if (!source.length) {
      const option = bestOption(game, state.mode);
      if (option) source.push(option);
    }
    for (const option of source) {
      bets.push({
        game,
        option,
        gameLabel: game.game_label || `${game.away_team || "Away"} at ${game.home_team || "Home"}`
      });
    }
  }
  return bets.sort(compareBetItems);
}

function optionModeBucket(option) {
  if (state.mode === "wise_choice") {
    const wise = optionWiseBucket(option);
    return { key: wise.key, label: wiseStatusText(wise.key || wise.status), color: safeColor(wise.color, "#0f4c81") };
  }
  if (state.mode === "best_growth") {
    const bucket = kellyBucket(option);
    const found = KELLY_BUCKETS.find(([key]) => key === bucket.key);
    return { key: bucket.key, label: found ? found[1] : "Kelly", color: safeColor(bucket.color, "#0f4c81") };
  }
  return {
    key: option.ev_rating || "Low",
    label: option.ev_rating || "Value",
    color: safeColor(option.ev_rating_color, "#0f4c81")
  };
}

function betPassesFilter(item) {
  if (state.activeBucket === "all") return true;
  return optionModeBucket(item.option).key === state.activeBucket;
}

function renderBetPill(item) {
  const bucket = optionModeBucket(item.option);
  const color = safeColor(bucket.color, "#0f4c81");
  const textColor = textColorFor(color);
  const option = item.option;
  const odds = [option.sportsbook, option.odds_text].filter(Boolean).join(" ");
  return `
    <article class="bet-pill-card" style="border-left-color:${color}">
      <div class="bet-pill-main">
        <div class="bet-pill-copy">
          <div class="bet-pill-game">${esc(item.gameLabel)}</div>
          <div class="bet-pill-choice">${esc(option.selection_text || option.label || "Recommendation")}</div>
          ${odds ? `<div class="bet-pill-odds">${esc(odds)}</div>` : ""}
        </div>
        <span class="bet-pill-bucket" title="Safest Edge = Kelly Score × Model Probability" style="background:${color};color:${textColor}">${esc(bucket.label)}</span>
      </div>
    </article>
  `;
}

function renderOptionCard(option) {
  const color = safeColor(option.ev_rating_color || option.prob_rating_color, "#0f4c81");
  const classes = ["option-card"];
  if (option.is_primary) classes.push("primary");
  if (option.is_official) classes.push("official");
  return `
    <div class="${classes.join(" ")}">
      <div class="option-header">
        <span class="option-label">${esc(option.label || option.selection_text || "Option")}</span>
        <span style="display:flex;gap:6px;align-items:center">
          ${option.ev_rating ? `<span class="option-rating-badge rating-badge" title="Expected value rating" style="background:${color};font-size:10px;padding:3px 7px">EV: ${esc(option.ev_rating)}</span>` : ""}
          ${option.is_official ? `<span class="option-badge official">Official</span>` : option.status_label ? `<span class="option-badge">${esc(option.status_label)}</span>` : ""}
        </span>
      </div>
      <div class="option-meta">${esc([option.sportsbook, option.odds_text].filter(Boolean).join(" ") || "No book/odds listed")}</div>
      <div class="option-metrics">
        ${metric("Odds", option.odds_text)}
        ${metric("Win Prob", option.model_probability_text || option.model_prob_text)}
        ${metric("Market Impl", formatProbability(optionMarketProbability(option)))}
        ${metric("Edge", option.edge_text)}
        ${metric("EV / Unit", option.ev_text)}
      </div>
    </div>
  `;
}

function renderMarketDropdowns(game) {
  const dropdowns = Array.isArray(game.market_dropdowns) ? game.market_dropdowns : [];
  if (!dropdowns.length) {
    return `<div class="forecast-only-note">No market dropdowns are available for this game yet.</div>`;
  }
  return `<div class="dropdown-stack">${dropdowns.map((market) => {
    const summaryColor = safeColor(state.mode === "best_value" ? market.ev_summary_color : market.ev_summary_color || market.prob_summary_color, "#0f4c81");
    const options = Array.isArray(market.options) ? market.options : [];
    return `
      <details class="market-dropdown">
        <summary>
          <span class="summary-label">${esc(market.title || market.market_key || "Market")}</span>
          <span class="summary-center" style="color:${summaryColor}">${esc(market.summary_center_text || "")}</span>
          <span class="summary-icon"><span class="summary-icon-plus">+</span><span class="summary-icon-minus">−</span></span>
        </summary>
        <div class="dropdown-body">${options.map(renderOptionCard).join("")}</div>
      </details>
    `;
  }).join("")}${renderModelDetails(game)}</div>`;
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
      <summary>
        <span class="summary-label">Model Details</span>
        <span class="summary-center"></span>
        <span class="summary-icon"><span class="summary-icon-plus">+</span><span class="summary-icon-minus">−</span></span>
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
  const border = variant === "wise_choice" ? safeColor(wise.color, "#0f4c81") : modeColor(game);
  const tier = wiseStatusText(wise.key || wise.status);
  const strong = tier === "Prime" || tier === "Strong" || option?.ev_rating === "High";
  const tileClass = strong ? "tile strong" : "tile";
  return `
    <article class="${tileClass}" style="border-left-color:${border}" data-ev-bucket="${esc(evBucket(game))}" data-prob-bucket="${esc(probBucket(game))}" data-wise-bucket="${esc(wise.key)}">
      <div class="tile-top">
        <div>
          <div class="game-label">${esc(game.game_label || `${game.away_team || "Away"} at ${game.home_team || "Home"}`)}</div>
          <div class="game-time">${esc(game.commence_time || "Time not listed")}</div>
          <div class="venue-text">${esc(game.venue || "Venue not listed")}</div>
          ${game.board_state_label ? `<div class="state-badge">${esc(game.board_state_label)}</div>` : ""}
          ${game.board_state_note ? `<div class="venue-text">${esc(game.board_state_note)}</div>` : ""}
        </div>
        <div class="favorite-badge">${esc(game.favorite_team || "Favorite")}<br>${esc(game.favorite_prob_text || "")}</div>
      </div>
      ${renderPitchers(game)}
      ${renderBestCard(option, variant)}
      ${renderMarketDropdowns(game)}
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
  if (state.mode !== "full_board") {
    gamesEl.className = "bet-pill-list";
    const filteredBets = collectRecommendedBets(games).filter(betPassesFilter);
    gamesEl.innerHTML = filteredBets.length
      ? filteredBets.map(renderBetPill).join("")
      : `<article class="empty-state">No recommended bets match this filter.</article>`;
    return;
  }
  gamesEl.className = "tile-list";
  const filtered = games.filter(gamePassesFilter);
  gamesEl.innerHTML = filtered.length
    ? filtered.map((game) => renderGame(game, "wise_choice")).join("")
    : `<article class="empty-state">No games match this filter.</article>`;
}

async function loadBoard(targetDate) {
  showLoading();
  try {
    const payload = await window.BoardWiseApi.getMlbBoard(targetDate, {
      model: state.requestedModel || undefined
    });
    state.payload = payload;
    const metadata = selectedModelMetadata(payload);
    state.selectedModel = metadata.selected_model_family || state.requestedModel || "classic_mlb";
    setHidden(loadingEl, true);
    setHidden(errorEl, true);
    setPageMeta(payload, targetDate);
    setStatusNote(payload);
    renderQuickGuide();
    renderModelSelector();
    renderBoard();
  } catch (error) {
    console.error(error);
    showError("Could not load the MLB board right now. Please try again in a moment.");
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
    wiseBucketForScore,
    wiseStatusText
  });
}

init();
