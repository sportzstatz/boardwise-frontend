const API_BASE = "https://api.useboardwise.com";

const metaEl = document.getElementById("meta");
const statusNoteEl = document.getElementById("status-note");
const summaryEl = document.getElementById("summary");
const loadingEl = document.getElementById("loading");
const gamesEl = document.getElementById("games");
const errorEl = document.getElementById("error");
const dateForm = document.getElementById("date-form");
const dateInput = document.getElementById("board-date");

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

function formatCount(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "0";
}

function readTargetDate() {
  const params = new URLSearchParams(window.location.search);
  const date = (params.get("date") || "").trim();
  return isIsoDate(date) ? date : "";
}

function writeTargetDate(date) {
  const url = new URL(window.location.href);
  if (date) {
    url.searchParams.set("date", date);
  } else {
    url.searchParams.delete("date");
  }
  window.history.replaceState({}, "", url);
}

function endpointFor(date) {
  if (date) {
    return `${API_BASE}/api/v1/boards/mlb/${encodeURIComponent(date)}`;
  }
  return `${API_BASE}/api/v1/boards/mlb/current`;
}

function setMeta(payload, requestedDate) {
  const mode = esc(payload.mode || payload.resolved_mode || "unknown");
  const targetDate = esc(payload.target_date || requestedDate || "-");
  const generatedAt = esc(payload.generated_at || "Unknown");
  metaEl.innerHTML = ""
    + `<span class="meta-pill"><strong>Generated</strong> ${generatedAt}</span>`
    + `<span class="meta-pill"><strong>Board</strong> ${mode}</span>`
    + `<span class="meta-pill"><strong>Date</strong> ${targetDate}</span>`;
}

function setStatusNote(payload) {
  const bits = [];
  if (payload.mode_note) {
    bits.push(esc(payload.mode_note));
  }
  if (payload.summary && payload.summary.validity) {
    bits.push(`Validity: ${esc(payload.summary.validity)}`);
  }
  if (!bits.length) {
    statusNoteEl.hidden = true;
    statusNoteEl.textContent = "";
    return;
  }
  statusNoteEl.hidden = false;
  statusNoteEl.innerHTML = bits.join(" ");
}

function renderSummary(payload) {
  const booksSeen = payload.summary?.books_seen_count ?? (Array.isArray(payload.books_seen) ? payload.books_seen.length : 0);
  const cards = [
    {
      label: "Target date",
      value: esc(payload.target_date || "-"),
      detail: `${esc(payload.mode || payload.resolved_mode || "unknown")} board`
    },
    {
      label: "Games",
      value: formatCount(payload.game_count),
      detail: `${formatCount(payload.betting_game_count)} with market data`
    },
    {
      label: "Recommendations",
      value: formatCount(payload.recommendation_count),
      detail: `${formatCount(payload.summary?.official_count || payload.official_recommendations?.length || 0)} official`
    },
    {
      label: "Books seen",
      value: formatCount(booksSeen),
      detail: Array.isArray(payload.books_seen) && payload.books_seen.length ? esc(payload.books_seen.join(", ")) : "No books listed"
    },
    {
      label: "Request",
      value: esc(payload.requested_mode || "auto"),
      detail: `API: ${esc(readTargetDate() ? "dated board" : "current board")}`
    }
  ];

  summaryEl.innerHTML = cards.map((card) => ""
    + `<article class="metric-card">`
    + `<p class="stat-label">${card.label}</p>`
    + `<div class="metric-value">${card.value}</div>`
    + `<p class="metric-detail">${card.detail}</p>`
    + `</article>`
  ).join("");
}

function renderPitcher(label, teamAbbr, name, lineupStatus) {
  return ""
    + `<article class="pitcher-card">`
    + `<p class="label">${esc(label)} (${esc(teamAbbr || "-")})</p>`
    + `<div class="pitcher-name">${esc(name || "Not listed")}</div>`
    + `<p class="pitcher-note">${esc(lineupStatus || "status unknown")}</p>`
    + `</article>`;
}

function renderRecommendation(rec) {
  const confidence = rec.confidence_label || rec.status_label || "Recommendation";
  const tagBits = [
    rec.sportsbook,
    rec.odds_text,
    rec.model_prob_text,
    rec.edge_text,
    rec.ev_text
  ].filter(Boolean);

  return ""
    + `<article class="recommendation-card">`
    + `<div class="rec-title-row">`
    + `<div>`
    + `<p class="label">${esc(rec.market_title || rec.market_key || "Market")}</p>`
    + `<div class="rec-title">${esc(rec.selection_text || "Recommendation")}</div>`
    + `</div>`
    + `<span class="confidence-badge">${esc(confidence)}</span>`
    + `</div>`
    + `<p class="rec-meta">${tagBits.map((item) => esc(item)).join(" · ") || "No pricing metadata supplied."}</p>`
    + `<div class="rec-tags">`
    + (rec.is_official ? `<span class="mini-pill"><strong>Official</strong></span>` : "")
    + (rec.stake_text ? `<span class="mini-pill">${esc(rec.stake_text)}</span>` : "")
    + (rec.confidence_rank ? `<span class="mini-pill">Rank ${esc(rec.confidence_rank)}</span>` : "")
    + `</div>`
    + `</article>`;
}

function renderGame(game) {
  const recommendations = Array.isArray(game.recommendations) ? game.recommendations : [];
  const insightBits = [
    game.projected_score_text,
    game.projected_margin_text,
    game.projected_total_text,
    game.market_moneyline_text,
    game.market_runline_text,
    game.market_total_text
  ].filter(Boolean);

  return ""
    + `<article class="game-card">`
    + `<header class="game-head">`
    + `<div class="game-topline">`
    + `<div>`
    + `<p class="label">Game ${esc(game.game_pk || "-")}</p>`
    + `<h2 class="game-title">${esc(game.game_label || `${game.away_team || "Away"} at ${game.home_team || "Home"}`)}</h2>`
    + `</div>`
    + `<div class="game-tags">`
    + (game.favorite_team ? `<span class="tag"><strong>Favorite</strong> ${esc(game.favorite_team)} ${esc(game.favorite_prob_text || "")}</span>` : "")
    + (game.board_state_label ? `<span class="tag">${esc(game.board_state_label)}</span>` : "")
    + `</div>`
    + `</div>`
    + `<div class="game-subline">`
    + (game.commence_time ? `<span>${esc(game.commence_time)}</span>` : "")
    + (game.venue ? `<span>${esc(game.venue)}</span>` : "")
    + (game.board_state_note ? `<span>${esc(game.board_state_note)}</span>` : "")
    + `</div>`
    + `</header>`
    + `<section class="section-block">`
    + `<p class="section-label">Pitchers</p>`
    + `<div class="pitcher-grid">`
    + renderPitcher("Away", game.away_team_abbr, game.away_pitcher, game.lineup_status_away)
    + renderPitcher("Home", game.home_team_abbr, game.home_pitcher, game.lineup_status_home)
    + `</div>`
    + `</section>`
    + (insightBits.length
      ? `<section class="section-block"><p class="section-label">Market snapshot</p><div class="insight-strip">${insightBits.map((item) => `<span class="mini-pill">${esc(item)}</span>`).join("")}</div></section>`
      : "")
    + `<section class="section-block">`
    + `<p class="section-label">Recommendations</p>`
    + (recommendations.length
      ? `<div class="rec-list">${recommendations.map(renderRecommendation).join("")}</div>`
      : `<div class="empty-card">No recommendations published for this game.</div>`)
    + `</section>`
    + `</article>`;
}

function renderGames(payload) {
  const games = Array.isArray(payload.games) ? payload.games : [];
  if (!games.length) {
    gamesEl.innerHTML = `<article class="empty-card">No games were returned for this board.</article>`;
    gamesEl.hidden = false;
    return;
  }
  gamesEl.innerHTML = games.map(renderGame).join("");
  gamesEl.hidden = false;
}

function showError(message) {
  loadingEl.hidden = true;
  gamesEl.hidden = true;
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function setLoading() {
  loadingEl.hidden = false;
  errorEl.hidden = true;
  gamesEl.hidden = true;
  summaryEl.innerHTML = "";
  metaEl.innerHTML = `<span class="meta-pill">Loading latest board...</span>`;
  statusNoteEl.hidden = true;
  statusNoteEl.textContent = "";
}

async function loadBoard(targetDate) {
  setLoading();
  try {
    const response = await fetch(endpointFor(targetDate), {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    loadingEl.hidden = true;
    setMeta(payload, targetDate);
    setStatusNote(payload);
    renderSummary(payload);
    renderGames(payload);
    if (dateInput) {
      dateInput.value = payload.target_date || targetDate || "";
    }
    document.title = payload.target_date ? `BoardWise MLB - ${payload.target_date}` : "BoardWise MLB";
  } catch (error) {
    console.error(error);
    showError("Could not load the MLB board right now. Please try again in a moment.");
  }
}

function init() {
  const initialDate = readTargetDate();
  if (dateInput) {
    dateInput.value = initialDate;
  }

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