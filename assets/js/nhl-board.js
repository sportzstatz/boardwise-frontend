const API_BASE = "https://api.useboardwise.com";

const state = {
  payload: null,
  mode: "highest_ev",
  activeBucket: "all"
};

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
  return options[variant] || options.highest_ev || (Array.isArray(game.recommendations) ? game.recommendations[0] : null);
}

function evBucket(game) {
  return bestOption(game, "highest_ev")?.ev_rating || game.ev_bucket_label || "Low";
}

function evColor(game) {
  return safeColor(bestOption(game, "highest_ev")?.ev_rating_color || game.ev_bucket_color, "#0f4c81");
}

function probBucket(game) {
  return bestOption(game, "highest_model_prob")?.prob_rating || game.prob_bucket_label || "<50%";
}

function probColor(game) {
  return safeColor(bestOption(game, "highest_model_prob")?.prob_rating_color || game.prob_bucket_color, "#0f4c81");
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
  el.innerHTML = `
    <button class="toggle-btn ${state.mode === "highest_ev" ? "active" : ""}" data-best-card-sort="highest_ev">Highest EV</button>
    <button class="toggle-btn ${state.mode === "highest_model_prob" ? "active" : ""}" data-best-card-sort="highest_model_prob">Highest Model Prob</button>
  `;
  el.querySelectorAll("[data-best-card-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.bestCardSort;
      state.activeBucket = "all";
      renderBoard();
    });
  });
}

function renderFilters() {
  const filters = state.mode === "highest_ev"
    ? [["all", "All Games", "var(--accent)"], ["High", "High", "#156f3c"], ["Medium-High", "Medium-High", "#669f2a"], ["Medium", "Medium", "#0f4c81"], ["Medium-Low", "Medium-Low", "#b54708"], ["Low", "Low", "#b42318"]]
    : [["all", "All Games", "var(--accent)"], ["70%+", "70%+", "#156f3c"], ["65-69%", "65-69%", "#669f2a"], ["60-64%", "60-64%", "#dc6803"], ["55-59%", "55-59%", "#e04f16"], ["50-54%", "50-54%", "#b54708"], ["<50%", "<50%", "#93370d"]];
  const target = state.mode === "highest_ev" ? evFilters : probFilters;
  const other = state.mode === "highest_ev" ? probFilters : evFilters;
  if (other) other.style.display = "none";
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
  const label = variant === "highest_ev" ? "Highest EV" : "Highest Model Prob";
  const badge = variant === "highest_ev" ? option.ev_rating : option.prob_rating;
  const color = safeColor(variant === "highest_ev" ? option.ev_rating_color : option.prob_rating_color, "#0f4c81");
  const badgePrefix = variant === "highest_ev" ? "EV: " : "Prob: ";
  return `
    <div class="best-card" data-best-card-variant="${esc(variant)}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div class="label">Best Available Bet <span style="font-weight:400;color:var(--muted)">(${esc(label)})</span></div>
        ${badge ? `<span class="rating-badge" style="background:${color}">${esc(badgePrefix + badge)}</span>` : ""}
      </div>
      <div class="best-bet">${esc(option.selection_text || "No selection")}</div>
      <div class="best-meta">${esc([option.sportsbook, option.odds_text].filter(Boolean).join(" ") || "No book/odds listed")}</div>
      <div class="best-metrics">
        ${metric("Odds", option.odds_text)}
        ${metric("Model Prob", option.model_prob_text || option.model_probability_text)}
        ${metric("Edge", option.edge_text)}
        ${metric("EV / Unit", option.ev_text)}
        ${metric("Stake", option.stake_text)}
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
        ${metric("Stake", option.stake_text)}
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
    const summaryColor = safeColor(state.mode === "highest_ev" ? market.ev_summary_color : market.prob_summary_color, "#0f4c81");
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
  return state.mode === "highest_ev" ? evBucket(game) === state.activeBucket : probBucket(game) === state.activeBucket;
}

function renderGame(game) {
  const option = bestOption(game, state.mode);
  const border = state.mode === "highest_ev" ? evColor(game) : probColor(game);
  const tileClass = option?.ev_rating === "High" || option?.prob_rating === "70%+" ? "tile strong" : "tile";
  return `
    <article class="${tileClass}" style="border-left-color:${border}" data-ev-bucket="${esc(evBucket(game))}" data-prob-bucket="${esc(probBucket(game))}">
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
  renderToggleButtons();
  renderFilters();
  const games = Array.isArray(state.payload.games) ? state.payload.games : [];
  const filtered = games.filter(gamePassesFilter);
  if (!gamesEl) return;
  gamesEl.hidden = false;
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