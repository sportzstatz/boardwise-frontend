// @ts-check
// BoardWise MLB game detail page.
// Reuses the shared API client (assets/js/api-client.js) for all network
// access so this file never talks to the network directly.

const gdState = {
  payload: null,
  game: null,
  gamePk: "",
  requestedModel: "",
  selectedModel: "",
};

const gdEls = {
  loading: document.getElementById("gd-loading"),
  error: document.getElementById("gd-error"),
  detail: document.getElementById("gd-detail"),
  back: document.getElementById("gd-back"),
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function readParam(name) {
  return (new URLSearchParams(window.location.search).get(name) || "").trim();
}

function readTargetDate() {
  const date = readParam("date");
  return isIsoDate(date) ? date : "";
}

function readModel() {
  const model = readParam("model");
  return /^[a-z][a-z0-9_]{0,63}$/.test(model) ? model : "";
}

function readGamePk() {
  const pk = readParam("game_pk") || readParam("game_id");
  return /^[A-Za-z0-9_-]{1,64}$/.test(pk) ? pk : "";
}

function setHidden(el, hidden) {
  if (!el) return;
  el.hidden = hidden;
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

function percentText(value) {
  return value !== null ? `${value.toFixed(1)}%` : "not available";
}

function probabilitySplit(game) {
  const probs = winProbs(game);
  let awayPct = 50;
  let homePct = 50;
  if (probs.away !== null && probs.home !== null && (probs.away + probs.home) > 0) {
    const sum = probs.away + probs.home;
    awayPct = (probs.away / sum) * 100;
    homePct = 100 - awayPct;
  }
  return { ...probs, awayPct, homePct };
}

function probabilitySplitLabel(game, split) {
  const awayTeam = game.away_team || game.away_team_abbr || "Away";
  const homeTeam = game.home_team || game.home_team_abbr || "Home";
  return `${awayTeam} ${percentText(split.away)}, ${homeTeam} ${percentText(split.home)}`;
}

function lastTwoWords(name) {
  const words = String(name || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.length >= 2 ? words.slice(-2).join(" ") : "";
}

// Classifies which side of THIS game a market option belongs to. Matches from
// most-specific to least-specific and only accepts a tier where exactly one
// side matches, so shared-nickname matchups (e.g. White Sox at Red Sox, both
// "sox") never mislabel the odds.
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

function moneylineDropdown(game) {
  const dropdowns = Array.isArray(game.market_dropdowns) ? game.market_dropdowns : [];
  return dropdowns.find((market) => {
    const key = String(market?.market_key || "").toLowerCase();
    const title = String(market?.title || "").toLowerCase();
    return key === "h2h" || key === "moneyline" || title.includes("money line") || title.includes("moneyline");
  }) || null;
}

function moneylineOddsFor(game, side) {
  const dropdown = moneylineDropdown(game);
  const options = dropdown && Array.isArray(dropdown.options) ? dropdown.options : [];
  const match = options.find((option) => optionSideInGame(option, game) === side);
  return match && match.odds_text ? String(match.odds_text) : "";
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
  const className = logoPath ? "tot-team-mark has-logo" : "tot-team-mark";
  const style = teamMarkStyle(sideBranding);
  return `
    <div class="${className}"${style ? ` style="${esc(style)}"` : ""} aria-hidden="true">
      ${logoPath ? `<img class="tot-team-logo" data-team-logo src="${esc(logoPath)}" alt="" width="64" height="64" decoding="async">` : ""}
      <span class="tot-team-fallback">${esc(fallback)}</span>
    </div>
  `;
}

function sideAriaLabel({ isHome, team, abbr, pitcher, lineup, prob, odds }) {
  const parts = [
    `${isHome ? "Home" : "Away"} team ${team || teamAbbrText(team, abbr)}`,
    `Starting pitcher ${pitcher || "Pitcher TBD"}`,
  ];
  if (lineup) parts.push(`Lineup ${lineup}`);
  parts.push(`Win probability ${percentText(prob)}`);
  if (odds) parts.push(`Moneyline ${odds}`);
  return `${parts.join(". ")}.`;
}

function isTrackingOnly(option) {
  return Boolean(option && (option.tracking_only || option.is_tracking_only));
}

function hasOfficialPlay(game) {
  const recs = Array.isArray(game.recommendations) ? game.recommendations : [];
  return recs.some((rec) => rec && rec.is_official && !isTrackingOnly(rec));
}

function gameLabel(game) {
  return game.game_label || `${game.away_team || "Away"} at ${game.home_team || "Home"}`;
}

function accessLevel(payload) {
  const access = payload && payload.access && typeof payload.access === "object" ? payload.access : {};
  return String(access.level || (access.preview ? "preview" : "full"));
}

function isPreviewPayload(payload) {
  return accessLevel(payload) === "preview";
}

function safeUpgradePath(payload) {
  const access = payload && payload.access && typeof payload.access === "object" ? payload.access : {};
  const path = typeof access.upgrade_path === "string" ? access.upgrade_path.trim() : "";
  if (!path.startsWith("/") || path.startsWith("//")) return "/pricing/";
  return path;
}

function findGame(payload, gamePk) {
  const games = Array.isArray(payload && payload.games) ? payload.games : [];
  if (gamePk) {
    // An explicit game request must match; never silently fall back to another
    // game (that would mislabel the page).
    return games.find((game) => String(game.game_pk ?? game.game_id ?? "") === String(gamePk)) || null;
  }
  return games.length === 1 ? games[0] : null;
}

function boardHref() {
  const params = new URLSearchParams();
  const date = readTargetDate();
  if (date) params.set("date", date);
  if (gdState.selectedModel) params.set("model", gdState.selectedModel);
  const query = params.toString();
  return query ? `/mlb/?${query}` : "/mlb/";
}

/* ---------- rendering ---------- */

function lockIcon(size = 20) {
  const sizeClass = size <= 14 ? "gd-lock-sm" : "gd-lock-lg";
  return `<span class="gd-lock-icon ${sizeClass}" aria-hidden="true">
    <span class="gd-lock-shackle"></span><span class="gd-lock-body"></span></span>`;
}

function renderHero(game) {
  const matchupBranding = resolveGameBranding(game);
  const split = probabilitySplit(game);
  const splitLabel = probabilitySplitLabel(game, split);
  const awayMl = moneylineOddsFor(game, "away");
  const homeMl = moneylineOddsFor(game, "home");
  const total = game.projected_total_text ? `Proj total ${esc(game.projected_total_text)}` : "";
  const side = (which) => {
    const isHome = which === "home";
    const team = isHome ? game.home_team : game.away_team;
    const abbr = isHome ? game.home_team_abbr : game.away_team_abbr;
    const pitcher = isHome ? game.home_pitcher : game.away_pitcher;
    const lineup = isHome ? game.lineup_status_home : game.lineup_status_away;
    const prob = isHome ? split.home : split.away;
    const odds = isHome ? homeMl : awayMl;
    const lineupClass = ["confirmed", "projected"].includes(String(lineup)) ? String(lineup) : "unknown";
    const tone = sideToneClass(game, which);
    const sideBranding = isHome ? matchupBranding.home : matchupBranding.away;
    const sideStyle = teamBrandStyle(sideBranding);
    const sideLabel = sideAriaLabel({ isHome, team, abbr, pitcher, lineup, prob, odds });
    return `
      <div class="tot-side ${which} ${tone}"${sideStyle ? ` style="${esc(sideStyle)}"` : ""} aria-label="${esc(sideLabel)}">
        ${renderTeamMark(team, abbr, sideBranding)}
        <div class="tot-team">${esc(team || (isHome ? "Home" : "Away"))}</div>
        <div class="tot-pitcher">${esc(pitcher || "Pitcher TBD")}</div>
        ${lineup ? `<span class="lineup-tag ${lineupClass}">${esc(lineup)}</span>` : ""}
        <div class="tot-prob tnum">${prob !== null ? `${prob.toFixed(1)}<span class="pct">%</span>` : "&mdash;"}</div>
        ${odds ? `<div class="tot-ml tnum">ML ${esc(odds)}</div>` : ""}
      </div>`;
  };
  const awayTone = sideToneClass(game, "away");
  const homeTone = sideToneClass(game, "home");
  const barStyle = matchupBarStyle(matchupBranding);
  return `
    <section class="gd-hero">
      <div class="tot-tape">
        ${side("away")}
        <div class="tot-center">
          <div class="tot-winprob-label">Win Prob</div>
          <div class="tot-bar" role="img" aria-label="${esc(splitLabel)}"${barStyle ? ` style="${esc(barStyle)}"` : ""}>
            <div class="tot-bar-away tot-bar-segment ${awayTone}" style="height:${split.awayPct.toFixed(1)}%"></div>
            <div class="tot-bar-home tot-bar-segment ${homeTone}" style="height:${split.homePct.toFixed(1)}%"></div>
          </div>
          <div class="tot-vs">VS</div>
          ${total ? `<div class="tot-total tnum">${total}</div>` : ""}
        </div>
        ${side("home")}
      </div>
      <div class="tot-mobile-split">
        <div class="tot-mobile-bar" role="img" aria-label="${esc(splitLabel)}"${barStyle ? ` style="${esc(barStyle)}"` : ""}>
          <div class="tot-mobile-away tot-mobile-segment ${awayTone}" style="width:${split.awayPct.toFixed(1)}%"></div>
          <div class="tot-mobile-home tot-mobile-segment ${homeTone}" style="width:${split.homePct.toFixed(1)}%"></div>
        </div>
        <div class="tot-mobile-label">Model Win Probability</div>
        ${total ? `<div class="tot-mobile-total tnum">${total}</div>` : ""}
      </div>
    </section>`;
}

function edgeClass(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("+")) return "good";
  if (trimmed.startsWith("-") || trimmed.startsWith("−")) return "bad";
  return "";
}

// Mirrors the board's wiseStatusText so the detail page reports the same tier.
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

// Derives the official-pick pill label from the option's Wise Choice tier
// instead of hard-coding "Playable" (mirrors the board's officialTierBadge).
function officialTierLabel(option) {
  if (isTrackingOnly(option)) return "Tracking";
  const tier = wiseStatusText(option.wise_choice_status || option.wise_choice_bucket_key || option.wise_choice_bucket_label);
  if (tier === "Verify") return "Verify Line";
  if (option.is_official && ["Strong", "Prime", "Playable"].includes(tier)) return `Official · ${tier}`;
  if (tier === "Lean") return option.is_official ? "Official · Lean" : "Lean · Not Official";
  return option.is_official ? "Official" : tier;
}

function wiseChoiceFor(game, payload) {
  const helper = window.BoardWiseWiseChoice;
  if (helper) {
    return helper.selectWiseChoiceForGame(game, payload || {}, {
      excludeTrackingOnly: true,
      mode: "wise_choice",
      gameLabelForGame: gameLabel,
    });
  }
  const cards = game.best_card_options && typeof game.best_card_options === "object" ? game.best_card_options : {};
  return cards.wise_choice || cards.best_value || cards.highest_ev || null;
}

function renderWiseBanner(game, payload) {
  const option = wiseChoiceFor(game, payload);
  if (!option) {
    return `
      <section id="wise-choice" class="gd-block">
        ${sectionTitle("Wise Choice")}
        <div class="gd-note">No Wise Choice recommendation is available for this game.</div>
      </section>`;
  }
  const meta = [option.sportsbook, option.odds_text].filter(Boolean).join(" · ");
  const win = option.model_probability_text || option.model_prob_text || "";
  const edge = option.edge_text || "";
  const ev = option.ev_text || "";
  const bubble = (label, value, cls = "") =>
    value ? `<div class="gd-bubble"><div class="gd-bubble-label">${esc(label)}</div><div class="gd-bubble-value ${cls} tnum">${esc(value)}</div></div>` : "";
  const official = option.is_official && !isTrackingOnly(option);
  return `
    <section id="wise-choice" class="gd-wise" aria-labelledby="wise-choice-title">
      <div class="gd-wise-copy">
        <div class="gd-wise-eyebrow">
          <h2 id="wise-choice-title" class="gd-wise-label">Wise Choice™</h2>
          <span class="gd-official-pill">${esc(official ? officialTierLabel(option) : officialTierLabel(option))}</span>
        </div>
        <div class="gd-wise-pick">${esc(option.selection_text || option.label || "No selection")}</div>
        ${meta ? `<div class="gd-wise-meta">${esc(meta)}</div>` : ""}
      </div>
      <div class="gd-bubbles">
        ${bubble("Win", win)}
        ${bubble("Edge", edge, edgeClass(edge))}
        ${bubble("EV", ev, edgeClass(ev))}
      </div>
    </section>`;
}

function sectionTitle(text) {
  return `<h2 class="gd-section-title">${esc(text)}</h2>`;
}

function renderMarkets(game) {
  const dropdowns = Array.isArray(game.market_dropdowns) ? game.market_dropdowns : [];
  if (!dropdowns.length) {
    return `<section id="full-markets" class="gd-block">${sectionTitle("Full Markets")}<div class="gd-note">No matched markets are available for this game yet.</div></section>`;
  }
  const cell = (label, value, cls = "") =>
    `<div class="gd-cell"><div class="gd-cell-label">${esc(label)}</div><div class="gd-cell-value ${cls} tnum">${esc(value || "—")}</div></div>`;
  const optionCard = (option) => {
    const official = option.is_official && !isTrackingOnly(option);
    const model = option.model_probability_text || option.model_prob_text || "";
    return `
      <div class="gd-mkt-option ${official ? "official" : ""}">
        <div class="gd-mkt-option-head">
          <span class="gd-mkt-side">${esc(option.selection_text || option.label || "Option")}</span>
          ${official ? `<span class="gd-official-pill sm">Official</span>` : `<span class="gd-pass">Pass</span>`}
        </div>
        <div class="gd-mkt-cells">
          ${cell("Odds", option.odds_text)}
          ${cell("Model", model)}
          ${cell("Edge", option.edge_text, edgeClass(option.edge_text))}
          ${option.ev_text ? cell("EV", option.ev_text, edgeClass(option.ev_text)) : ""}
        </div>
      </div>`;
  };
  const markets = dropdowns.map((market) => {
    const options = Array.isArray(market.options) ? market.options : [];
    return `
      <div class="gd-market">
        <div class="gd-market-title">${esc(market.title || market.market_key || "Market")}</div>
        <div class="gd-market-options">${options.length ? options.map(optionCard).join("") : `<div class="gd-note">No market options are available for this market yet.</div>`}</div>
      </div>`;
  }).join("");
  return `<section id="full-markets" class="gd-block">${sectionTitle("Full Markets")}<div class="gd-markets">${markets}</div></section>`;
}

function renderModelBreakdown(game) {
  const cells = Array.isArray(game.model_details_cells) ? game.model_details_cells : [];
  const rows = cells.length ? cells : [
    { label: "Away Win Prob", value: game.away_win_prob_text },
    { label: "Home Win Prob", value: game.home_win_prob_text },
    { label: "Projected Total", value: game.projected_total_text },
    { label: "Projected Margin", value: game.projected_margin_text },
  ].filter((row) => row.value);
  if (!rows.length && !game.model_details_projected_score && !game.model_version) {
    return `<section id="model-breakdown" class="gd-block">${sectionTitle("Model Breakdown")}<div class="gd-note">Model breakdown details are not available for this game yet.</div></section>`;
  }
  const grid = rows.map((row) => `
    <div class="gd-model-cell ${row.wide ? "wide" : ""}">
      <div class="gd-cell-label">${esc(row.label || "")}</div>
      <div class="gd-cell-value tnum">${esc(row.value ?? "—")}</div>
    </div>`).join("");
  const versionCell = game.model_version
    ? `<div class="gd-model-cell wide"><div class="gd-cell-label">Model Version</div><div class="gd-cell-value">${esc(game.model_version)}</div></div>`
    : "";
  return `
    <section id="model-breakdown" class="gd-block">
    ${sectionTitle("Model Breakdown")}
    ${game.model_details_projected_score ? `<div class="gd-proj-score"><span class="gd-cell-label">Projected Score</span><span class="gd-proj-value tnum">${esc(game.model_details_projected_score)}</span></div>` : ""}
    ${grid || versionCell ? `<div class="gd-model-grid">${grid}${versionCell}</div>` : ""}
    </section>`;
}

function renderPitching(game) {
  const card = (which) => {
    const isHome = which === "home";
    const team = isHome ? game.home_team_abbr : game.away_team_abbr;
    const name = isHome ? game.home_pitcher : game.away_pitcher;
    const lineup = isHome ? game.lineup_status_home : game.lineup_status_away;
    const lineupClass = ["confirmed", "projected"].includes(String(lineup)) ? String(lineup) : "unknown";
    return `
      <div class="gd-pitch-card">
        <div class="gd-cell-label">${esc(isHome ? "Home" : "Away")}${team ? ` · ${esc(team)}` : ""}</div>
        <div class="gd-pitch-name">${esc(name || "Pitcher TBD")}</div>
        ${lineup ? `<span class="lineup-tag ${lineupClass}">${esc(lineup)}</span>` : ""}
      </div>`;
  };
  return `
    <section id="pitching-matchup" class="gd-block">
    ${sectionTitle("Pitching Matchup")}
    <div class="gd-pitch">${card("away")}${card("home")}</div>
    <div class="gd-soon-line">ERA, K/9, WHIP, splits, and recent form are coming soon.</div>
    </section>`;
}

function comingSoonCard(title, copy) {
  return `
    <div class="gd-soon">
      <div class="gd-soon-head"><span class="gd-soon-title">${esc(title)}</span><span class="gd-soon-tag">Soon</span></div>
      <div class="gd-soon-copy">${esc(copy)}</div>
    </div>`;
}

function renderComingSoon(id, title, cards, extraClass = "") {
  return `
    <section id="${esc(id)}" class="gd-soon-section">
      ${sectionTitle(title)}
      <div class="gd-soon-grid ${esc(extraClass)}">
        ${cards.map(([cardTitle, copy]) => comingSoonCard(cardTitle, copy)).join("")}
      </div>
    </section>`;
}

function renderSectionNav() {
  const chips = [
    ["Wise Choice", "#wise-choice"],
    ["Markets", "#full-markets"],
    ["Player Props", "#player-props"],
    ["Pitching", "#pitching-matchup"],
    ["Model", "#model-breakdown"],
    ["Weather", "#weather-park"],
    ["Trends", "#line-trends"],
  ];
  return `<nav class="gd-section-nav" aria-label="Game detail sections">${chips.map(([label, href]) => `<a class="gd-section-chip" href="${esc(href)}">${esc(label)}</a>`).join("")}</nav>`;
}

function renderProDetail(payload, game) {
  return `
    <div class="gd-detail-inner">
      ${renderHero(game)}
      ${renderSectionNav()}
      <div class="gd-sections">
        ${renderWiseBanner(game, payload)}
        ${renderMarkets(game)}
        ${renderComingSoon("player-props", "Player Props", [["Player props", "Coming soon. Board payloads do not provide player props yet."]])}
        ${renderPitching(game)}
        ${renderModelBreakdown(game)}
        ${renderComingSoon("weather-park", "Weather & Park", [["Weather & park", "Coming soon. Weather and park-factor payloads are not available yet."]])}
        ${renderComingSoon("line-trends", "Line Movement & Trends", [["Line Movement", "Coming soon."], ["Head-to-Head & Recent", "Coming soon."]], "two")}
      </div>
    </div>`;
}

function renderUpsell(payload) {
  const href = safeUpgradePath(payload);
  return `
    <section class="gd-upsell">
      <div class="gd-upsell-lock">${lockIcon(22)}</div>
      <div class="gd-upsell-copy">
        <div class="gd-upsell-title">Unlock the full game with BoardWise Pro</div>
        <div class="gd-upsell-sub">Full market context, the Wise Choice™ pick, model breakdown, pitching and more.</div>
      </div>
      <a class="button primary" href="${esc(href)}">Go Pro</a>
    </section>`;
}

function lockedRow(title, copy) {
  return `
    <div class="gd-locked-row">
      <div class="gd-locked-icon">${lockIcon(14)}</div>
      <div class="gd-locked-copy"><div class="gd-locked-title">${esc(title)}</div><div class="gd-locked-sub">${esc(copy)}</div></div>
      <span class="gd-locked-tag">Pro</span>
    </div>`;
}

function renderFreeDetail(payload, game) {
  return `
    <div class="gd-detail-inner">
      ${renderHero(game)}
      ${renderUpsell(payload)}
      <div class="gd-sections">
        <section class="gd-block">
          ${sectionTitle("Locked with Pro")}
          <div class="gd-locked-list">
            ${lockedRow("Full Markets", "Every supported market side and model call.")}
            ${lockedRow("Wise Choice™ Pick", "The official playable pick context.")}
            ${lockedRow("Model Breakdown", "Projected score, win probability and model cells.")}
            ${lockedRow("Pitching Matchup", "Starters, lineup status and future pitching metrics.")}
            ${lockedRow("Player Props / Weather / Trends", "Additional Pro sections as payloads become available.")}
          </div>
        </section>
        ${renderComingSoon("player-props", "Player Props", [["Player props", "Coming soon."]])}
        ${renderComingSoon("weather-park", "Weather & Park", [["Weather & park", "Coming soon."]])}
        ${renderComingSoon("line-trends", "Line Movement & Trends", [["Line Movement", "Coming soon."], ["Head-to-Head & Recent", "Coming soon."]], "two")}
      </div>
    </div>`;
}

function renderNav(payload, game) {
  if (!gdEls.back) return;
  const planBadge = isPreviewPayload(payload)
    ? `<span class="gd-plan free">Free</span>`
    : `<span class="gd-plan pro">Pro</span>`;
  const official = game && hasOfficialPlay(game)
    ? `<span class="official-plays-pill">Official Plays</span>`
    : "";
  const label = game ? gameLabel(game) : "Game Detail";
  const when = game ? [game.commence_time, game.venue].filter(Boolean).join(" · ") : "";
  gdEls.back.innerHTML = `
    <a class="gd-back-link" href="${esc(boardHref())}">← Today's Board</a>
    <div class="gd-title-wrap">
      <div class="eyebrow">BoardWise · MLB · Game Detail</div>
      <h1 id="gd-heading">${esc(label)}</h1>
      ${when ? `<div class="gd-top-meta tnum">${esc(when)}</div>` : ""}
    </div>
    <span class="gd-nav-right">${planBadge}${official}</span>`;
}

function renderTitle(game) {
  const label = gameLabel(game);
  document.title = `${label} · BoardWise MLB`;
  const heading = document.getElementById("gd-heading");
  if (heading) heading.textContent = label;
}

function showError(message, options = {}) {
  setHidden(gdEls.loading, true);
  setHidden(gdEls.detail, true);
  if (gdEls.error) {
    gdEls.error.hidden = false;
    const cta = options.cta
      ? `<div class="gd-error-cta"><a class="button primary" href="${esc(options.cta.href)}">${esc(options.cta.label)}</a></div>`
      : "";
    gdEls.error.innerHTML = `<div>${esc(message)}</div>${cta}`;
  }
}

function showAccessError(error) {
  const status = Number(error && error.status);
  if (status === 401) {
    showError("Sign in to view this game's detail.", { cta: { href: "/login/", label: "Sign in" } });
    return;
  }
  if (status === 403) {
    showError("This game detail view requires Pro access.", { cta: { href: "/pricing/", label: "Go Pro" } });
    return;
  }
  showError("Could not load this game right now. Please try again in a moment.", {
    cta: { href: boardHref(), label: "Back to board" },
  });
}

function renderGameNotFound(payload) {
  if (isPreviewPayload(payload)) {
    showError("This game's full detail requires Pro access.", { cta: { href: safeUpgradePath(payload), label: "Go Pro" } });
    return;
  }
  showError("We couldn't find that game on the selected date.", { cta: { href: boardHref(), label: "Back to board" } });
}

function renderDetail() {
  const payload = gdState.payload;
  const game = gdState.game;
  if (!gdEls.detail) return;
  renderNav(payload, game);
  renderTitle(game);
  gdEls.detail.innerHTML = isPreviewPayload(payload)
    ? renderFreeDetail(payload, game)
    : renderProDetail(payload, game);
  bindRenderedLogos(gdEls.detail);
  setHidden(gdEls.loading, true);
  setHidden(gdEls.error, true);
  setHidden(gdEls.detail, false);
}

async function loadDetail(options = {}) {
  setHidden(gdEls.loading, false);
  setHidden(gdEls.error, true);
  setHidden(gdEls.detail, true);
  const requestedModel = gdState.requestedModel;
  const date = readTargetDate();
  try {
    const payload = await window.BoardWiseApi.getMlbBoard(date, {
      model: requestedModel || undefined,
    });
    gdState.payload = payload;
    const metadata = payload && payload.model_metadata && typeof payload.model_metadata === "object"
      ? payload.model_metadata
      : {};
    gdState.selectedModel = metadata.selected_model_family || requestedModel || metadata.default_model_family || "";
    const game = findGame(payload, gdState.gamePk);
    if (!game) {
      renderNav(payload, null);
      renderGameNotFound(payload);
      return;
    }
    gdState.game = game;
    renderDetail();
  } catch (error) {
    if (requestedModel && !options.isModelFallback && Number(error?.status) === 400) {
      gdState.requestedModel = "";
      await loadDetail({ isModelFallback: true });
      return;
    }
    console.error(error);
    showAccessError(error);
  }
}

function init() {
  gdState.gamePk = readGamePk();
  gdState.requestedModel = readModel();
  if (gdEls.back) {
    gdEls.back.innerHTML = `
      <a class="gd-back-link" href="${esc(boardHref())}">← Today's Board</a>
      <div class="gd-title-wrap">
        <div class="eyebrow">BoardWise · MLB · Game Detail</div>
        <h1 id="gd-heading">Game Detail</h1>
      </div>
      <span class="gd-nav-right"></span>`;
  }
  loadDetail();
}

if (["", "localhost", "127.0.0.1"].includes(window.location.hostname)) {
  const testWindow = /** @type {Window & { __BoardWiseGameDetailTestHooks?: any }} */ (window);
  testWindow.__BoardWiseGameDetailTestHooks = Object.freeze({
    winProbs,
    favoriteIsHome,
    favoredSide,
    resolveGameBranding,
    findGame,
    accessLevel,
  });
}

init();
