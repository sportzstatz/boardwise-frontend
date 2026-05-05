const API_BASE = "https://api.useboardwise.com";

const state = {
  payload: null,
  mode: "wise_choice",
  activeBucket: "all"
};

const BEST_CARD_MODES = [
  ["wise_choice", "Wise Choice"],
  ["best_growth", "Best Growth"],
  ["best_value", "Best Value"]
];

const WISE_BUCKETS = [
  ["pass_lte_0", "0 or below - PASS", "#93370d"],
  ["pass_0_3", "0 to 3 - PASS", "#b54708"],
  ["pass_3_8", "3 to 8 - PASS", "#dc6803"],
  ["pass_8_14", "8 to 14 - PASS", "#0f4c81"],
  ["medium_high_14_20", "14 to 20 - MEDIUM-HIGH", "#669f2a"],
  ["high_20_25", "20 to 25 - HIGH", "#156f3c"],
  ["elite_verify_25_plus", "25+ - ELITE / VERIFY", "#067647"]
];

const KELLY_BUCKETS = [
  ["kelly_lte_0", "0% or less", "#93370d"],
  ["kelly_0_5", "0-5%", "#b54708"],
  ["kelly_5_10", "5-10%", "#dc6803"],
  ["kelly_10_20", "10-20%", "#0f4c81"],
  ["kelly_20_plus", "20%+", "#156f3c"]
];

const metaEl = document.getElementById("meta");
const statusNoteEl = document.getElementById("status-note");
const loadingEl = document.getElementById("loading");
const gamesEl = document.getElementById("games");
const errorEl = document.getElementById("error");
const dateForm = document.getElementById("date-form");
const dateInput = document.getElementById("board-date");
const evFilters = document.getElementById("ev-filters");
const probFilters = document.getElementById("prob-filters");

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

function endpointFor(date) {
  return date
    ? `${API_BASE}/api/v1/boards/nhl/${encodeURIComponent(date)}`
    : `${API_BASE}/api/v1/boards/nhl/current`;
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
  if (score === null) return { key: "unknown", label: "Unknown", status: "PASS", color: "#667085" };
  if (score <= 0) return { key: "pass_lte_0", label: "0 or below - PASS", status: "PASS", color: "#93370d" };
  if (score < 3) return { key: "pass_0_3", label: "0 to 3 - PASS", status: "PASS", color: "#b54708" };
  if (score < 8) return { key: "pass_3_8", label: "3 to 8 - PASS", status: "PASS", color: "#dc6803" };
  if (score < 14) return { key: "pass_8_14", label: "8 to 14 - PASS", status: "PASS", color: "#0f4c81" };
  if (score < 20) return { key: "medium_high_14_20", label: "14 to 20 - MEDIUM-HIGH", status: "MEDIUM-HIGH", color: "#669f2a" };
  if (score < 25) return { key: "high_20_25", label: "20 to 25 - HIGH", status: "HIGH", color: "#156f3c" };
  return { key: "elite_verify_25_plus", label: "25+ - ELITE / VERIFY", status: "ELITE / VERIFY", color: "#067647" };
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
    color: option.wise_choice_color || (found ? found[2] : fallback.color)
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
  if (metaEl) metaEl.innerHTML = `<div class="pill">Loading latest board...</div>`;
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
  return [
    ["Generated", payload.generated_at || "Unknown"],
    ["Date", payload.target_date || "-"],
    ["Games", formatCount(payload.game_count)],
    ["Betting Games", formatCount(payload.betting_game_count)],
    ["Recommendations", formatCount(payload.recommendation_count)],
    ["Books", booksSeen.length ? booksSeen.join(", ") : "None listed"]
  ];
}

function setPageMeta(payload, requestedDate) {
  const targetDate = payload.target_date || requestedDate || "-";
  document.title = `BoardWise NHL - ${targetDate}`;
  if (metaEl) {
    metaEl.innerHTML = topLevelCounts(payload)
      .map(([label, value]) => `<div class="pill"><strong>${esc(label)}</strong> ${esc(value)}</div>`)
      .join("");
  }
  if (dateInput) dateInput.value = payload.target_date || requestedDate || "";
}

function setStatusNote(payload) {
  if (!statusNoteEl) return;
  const notes = [payload.mode_note].filter(Boolean);
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

function probColor(game) {
  return safeColor(bestOption(game, "highest_model_prob")?.prob_rating_color || game.prob_bucket_color, "#0f4c81");
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

function renderQuickGuide(payload) {
  const summary = payload?.summary || {};
  const items = [
    ["Games", formatCount(summary.game_count ?? payload?.game_count)],
    ["Betting Games", formatCount(summary.betting_game_count ?? payload?.betting_game_count)],
    ["Official Picks", formatCount(summary.official_count)],
    ["Books Seen", formatCount(summary.books_seen_count ?? (payload?.books_seen || []).length)]
  ];
  const el = document.getElementById("quick-guide");
  if (!el) return;
  el.innerHTML = items.map(([label, value]) => `
    <article class="quick-guide-card">
      <div class="stat-label">${esc(label)}</div>
      <div style="font-size:24px;font-weight:800;margin-top:4px">${esc(value)}</div>
    </article>
  `).join("");
}

function renderToggleButtons() {
  const el = document.getElementById("best-card-toggle");
  if (!el) return;
  el.style.display = "";
  el.innerHTML = BEST_CARD_MODES.map(([key, label]) => `
    <button class="toggle-btn ${state.mode === key ? "active" : ""}" data-best-card-sort="${esc(key)}">${esc(label)}</button>
  `).join("");
  el.querySelectorAll("[data-best-card-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.bestCardSort;
      state.activeBucket = "all";
      renderBoard();
    });
  });
}

function renderFilters() {
  const valueFilters = [["High", "High", "#156f3c"], ["Medium-High", "Medium-High", "#669f2a"], ["Medium", "Medium", "#0f4c81"], ["Medium-Low", "Medium-Low", "#b54708"], ["Low", "Low", "#b42318"]];
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
    const style = active ? ` style="background:${esc(color)};border-color:${esc(color)};color:#fff"` : "";
    return `<button class="bucket-pill ${active ? "active" : ""}" data-bucket="${esc(bucket)}"${style}>${esc(label)}</button>`;
  }).join("");
  target.querySelectorAll("[data-bucket]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeBucket = button.dataset.bucket || "all";
      renderBoard();
    });
  });
}

function metric(label, value) {
  return `<div class="metric-bubble"><div class="m-label">${esc(label)}</div><div class="m-value">${esc(value || "-")}</div></div>`;
}

function renderTeams(game) {
  return `
    <div class="team-grid">
      <div class="team-card">
        <div class="team-label">Away (${esc(game.away_team_abbr || "-")})</div>
        <div class="team-name">${esc(game.away_team || "Away")}</div>
      </div>
      <div class="team-card">
        <div class="team-label">Home (${esc(game.home_team_abbr || "-")})</div>
        <div class="team-name">${esc(game.home_team || "Home")}</div>
      </div>
    </div>
  `;
}

function renderBestCard(option, variant) {
  if (!option) return `<div class="forecast-only-note">No recommendation is available for this sort.</div>`;
  const label = BEST_CARD_MODES.find(([key]) => key === variant)?.[1] || "Best Value";
  const wise = optionWiseBucket(option);
  const badge = variant === "wise_choice"
    ? `${wise.status} ${formatWise(option)}`
    : variant === "best_growth"
      ? formatKelly(option)
      : (option.ev_text || option.ev_rating);
  const color = variant === "wise_choice"
    ? safeColor(wise.color, "#0f4c81")
    : variant === "best_growth"
      ? safeColor(kellyBucket(option).color, "#0f4c81")
      : safeColor(option.ev_rating_color, "#0f4c81");
  const badgePrefix = variant === "wise_choice" ? "Wise: " : variant === "best_growth" ? "Kelly: " : "Value: ";
  return `
    <div class="best-card" data-best-card-variant="${esc(variant)}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div class="label">${esc(label)}</div>
        ${badge ? `<span class="rating-badge" style="background:${color}">${esc(badgePrefix + badge)}</span>` : ""}
      </div>
      <div class="best-bet">${esc(option.selection_text || "No selection")}</div>
      <div class="best-meta">${esc([option.sportsbook, option.odds_text].filter(Boolean).join(" ") || "No book/odds listed")}</div>
      <div class="best-metrics">
        ${metric("Odds", option.odds_text)}
        ${metric("Model Prob", option.model_prob_text || option.model_probability_text)}
        ${metric("Edge", option.edge_text)}
        ${metric("EV / Unit", option.ev_text)}
        ${metric("Kelly %", option.kelly_text || formatKelly(option))}
      </div>
    </div>
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
          ${option.ev_rating ? `<span class="rating-badge" style="background:${color};font-size:10px;padding:3px 7px">EV: ${esc(option.ev_rating)}</span>` : ""}
          ${option.is_official ? `<span class="option-badge official">Official</span>` : option.status_label ? `<span class="option-badge">${esc(option.status_label)}</span>` : ""}
        </span>
      </div>
      <div class="option-meta">${esc([option.sportsbook, option.odds_text].filter(Boolean).join(" ") || "No book/odds listed")}</div>
      <div class="option-metrics">
        ${metric("Odds", option.odds_text)}
        ${metric("Model Prob", option.model_probability_text || option.model_prob_text)}
        ${metric("Edge", option.edge_text)}
        ${metric("EV / Unit", option.ev_text)}
        ${metric("Kelly %", option.kelly_text || formatKelly(option))}
      </div>
    </div>
  `;
}

function renderModelDetails(game) {
  const cells = Array.isArray(game.model_details_cells) ? game.model_details_cells : [];
  if (!cells.length && !game.model_details_projected_score && !game.model_version) return "";
  return `
    <details class="market-dropdown">
      <summary><span class="summary-label">Model Details</span><span></span><span class="summary-icon"><span class="summary-icon-plus">+</span><span class="summary-icon-minus">-</span></span></summary>
      <div class="dropdown-body">
        ${game.model_details_projected_score ? `<div class="md-projected-score"><div class="m-label">Projected Score</div><div class="m-value">${esc(game.model_details_projected_score)}</div></div>` : ""}
        <div class="md-grid">
          ${cells.map((cell) => `<div class="md-cell ${cell.wide ? "md-wide" : ""}"><div class="m-label">${esc(cell.label || "")}</div><div class="m-value">${esc(cell.value ?? "-")}</div></div>`).join("")}
        </div>
      </div>
    </details>
  `;
}

function renderMarketDropdowns(game) {
  const dropdowns = Array.isArray(game.market_dropdowns) ? game.market_dropdowns : [];
  if (!dropdowns.length) return `<div class="forecast-only-note">No market dropdowns are available for this game yet.</div>${renderModelDetails(game)}`;
  return `<div class="dropdown-stack">${dropdowns.map((market) => {
    const summaryColor = safeColor(state.mode === "best_value" ? market.ev_summary_color : market.ev_summary_color || market.prob_summary_color, "#0f4c81");
    const options = Array.isArray(market.options) ? market.options : [];
    return `
      <details class="market-dropdown">
        <summary>
          <span class="summary-label">${esc(market.title || market.market_key || "Market")}</span>
          <span class="summary-center" style="color:${summaryColor}">${esc(market.summary_center_text || "")}</span>
          <span class="summary-icon"><span class="summary-icon-plus">+</span><span class="summary-icon-minus">-</span></span>
        </summary>
        <div class="dropdown-body">${options.map(renderOptionCard).join("")}</div>
      </details>
    `;
  }).join("")}${renderModelDetails(game)}</div>`;
}

function gamePassesFilter(game) {
  if (state.activeBucket === "all") return true;
  return modeBucket(game) === state.activeBucket;
}

function renderEmptyBoard(payload) {
  const targetDate = payload?.target_date ? ` for ${payload.target_date}` : "";
  const note = payload?.mode_note || "Check back after the next NHL board publication.";
  return `
    <article class="empty-state">
      <strong>No NHL board rows found${esc(targetDate)}.</strong><br>
      <span>${esc(note)}</span>
    </article>
  `;
}

function renderGame(game) {
  const option = bestOption(game, state.mode);
  const border = modeColor(game);
  const wise = optionWiseBucket(option);
  const strong = wise.status === "HIGH" || wise.status === "ELITE / VERIFY" || option?.ev_rating === "High";
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
      ${renderTeams(game)}
      ${renderBestCard(option, state.mode)}
      ${renderMarketDropdowns(game)}
    </article>
  `;
}

function renderBoard() {
  if (!state.payload) return;
  const games = Array.isArray(state.payload.games) ? state.payload.games : [];
  if (!gamesEl) return;
  gamesEl.hidden = false;
  if (!games.length) {
    const toggle = document.getElementById("best-card-toggle");
    if (toggle) toggle.style.display = "none";
    if (evFilters) evFilters.style.display = "none";
    if (probFilters) probFilters.style.display = "none";
    gamesEl.innerHTML = renderEmptyBoard(state.payload);
    return;
  }
  renderToggleButtons();
  renderFilters();
  const filtered = games.filter(gamePassesFilter);
  gamesEl.innerHTML = filtered.length
    ? filtered.map(renderGame).join("")
    : `<article class="empty-state">No games match this filter.</article>`;
}

async function loadBoard(targetDate) {
  showLoading();
  try {
    const response = await fetch(endpointFor(targetDate), { method: "GET", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.payload = payload;
    setHidden(loadingEl, true);
    setHidden(errorEl, true);
    setPageMeta(payload, targetDate);
    setStatusNote(payload);
    renderQuickGuide(payload);
    renderBoard();
  } catch (error) {
    console.error(error);
    showError("Could not load the NHL board right now. Please try again in a moment.");
  }
}

function init() {
  const initialDate = readTargetDate();
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

init();
