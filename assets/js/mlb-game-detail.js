// @ts-check
// BoardWise MLB game detail page (game-detail-v2).
// Two data sources, fetched in parallel through the shared API client
// (assets/js/api-client.js — this file never talks to the network directly):
//   1. the board payload for the selected game family (hero, Wise Choice,
//      Markets tab, Model tab), and
//   2. the per-game props payload (family-agnostic Player Props tab, the
//      "Top prop" teaser, the props-engine model cards, and the free/guest
//      lock panel).
// The props fetch failing must never blank the page: the game tabs render and
// the Props tab shows a quiet inline error instead.

const gdState = {
  payload: null,
  game: null,
  props: null,
  propsError: false,
  gamePk: "",
  requestedModel: "",
  selectedModel: "",
  activeTab: "markets",
  propsSeg: "ranked",
};

const gdEls = {
  loading: document.getElementById("gd-loading"),
  error: document.getElementById("gd-error"),
  detail: document.getElementById("gd-detail"),
  back: document.getElementById("gd-back"),
};

const GD_TABS = [
  { id: "markets", label: "Markets" },
  { id: "props", label: "Player Props" },
  { id: "model", label: "Model" },
  { id: "weather", label: "Weather & Park", soon: true },
  { id: "trends", label: "Trends", soon: true },
];

const BUCKET_LABELS = {
  prime: "Prime",
  strong: "Strong",
  playable: "Playable",
  lean: "Lean",
};

const SMALL_NUMBER_WORDS = [
  "no", "one", "two", "three", "four", "five",
  "six", "seven", "eight", "nine", "ten",
];

/* ---------- shared utilities ---------- */

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

function writeModelToUrl(model) {
  const url = new URL(window.location.href);
  if (model) url.searchParams.set("model", model);
  else url.searchParams.delete("model");
  window.history.replaceState({}, "", url);
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

const TWO_WORD_NICKNAMES = ["blue jays", "red sox", "white sox"];

function teamCityLabel(fullName, abbr) {
  const words = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 3 && TWO_WORD_NICKNAMES.includes(words.slice(-2).join(" ").toLowerCase())) {
    return words.slice(0, -2).join(" ");
  }
  if (words.length >= 2) return words.slice(0, -1).join(" ");
  return words[0] || String(abbr || "").toUpperCase() || "Team";
}

function lastNameOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
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

function marketDropdowns(game) {
  if (Array.isArray(game.market_dropdowns)) return game.market_dropdowns;
  if (Array.isArray(game.markets)) return game.markets;
  return [];
}

function moneylineDropdown(game) {
  return marketDropdowns(game).find((market) => {
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

// Small circular team mark (pitcher cards): team-color ring with the logo
// inside; a failed SVG collapses to the solid team-color circle + abbr.
function renderSmallTeamMark(abbr, sideBranding) {
  const logoPath = sideBranding?.brand?.logoPath || "";
  const style = teamMarkStyle(sideBranding);
  const logo = logoPath
    ? `<img class="gd2-team-logo" data-team-logo src="${esc(logoPath)}" alt="" width="26" height="26" decoding="async">`
    : "";
  return `
    <span class="gd2-team-mark${logoPath ? " has-logo" : ""}" data-team-logo-mark${style ? ` style="${esc(style)}"` : ""} aria-hidden="true">
      ${logo}
      <span class="gd2-team-mark-fallback">${esc(String(abbr || "—").toUpperCase())}</span>
    </span>`;
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

function gameLabel(game) {
  return game.game_label || `${game.away_team || "Away"} at ${game.home_team || "Home"}`;
}

function accessLevel(payload) {
  if (window.BoardWiseMlbAccess) return window.BoardWiseMlbAccess.accessLevel(payload);
  const access = payload && payload.access && typeof payload.access === "object" ? payload.access : {};
  return String(access.level || (access.preview ? "preview" : "full"));
}

function isPreviewPayload(payload) {
  return window.BoardWiseMlbAccess
    ? window.BoardWiseMlbAccess.isLimitedBoard(payload)
    : accessLevel(payload) === "preview";
}

function hasFullCardAccess(payload) {
  if (window.BoardWiseMlbAccess) return window.BoardWiseMlbAccess.hasFullCardAccess(payload);
  const access = payload && payload.access && typeof payload.access === "object" ? payload.access : {};
  return accessLevel(payload) === "full" || String(access.card_access || "") === "full";
}

function safeUpgradePath(payload) {
  const access = payload && payload.access && typeof payload.access === "object" ? payload.access : {};
  return safePath(access.upgrade_path);
}

function safePath(value) {
  const path = typeof value === "string" ? value.trim() : "";
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
  // A limited Free board is available only through the canonical current
  // route. Even though its payload identifies the selected family, forwarding
  // that model (or a date) would turn the back link into a Founder-only request.
  if (gdState.payload && isPreviewPayload(gdState.payload)) return "/mlb/";
  const params = new URLSearchParams();
  const date = readTargetDate();
  if (date) params.set("date", date);
  if (gdState.selectedModel) params.set("model", gdState.selectedModel);
  const query = params.toString();
  return query ? `/mlb/?${query}` : "/mlb/";
}

/* ---------- formatting (from the design's data script) ---------- */

// Signed percentage with a real minus sign (U+2212), e.g. +47.2% / −4.1%.
function sPct(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${num >= 0 ? "+" : "−"}${(Math.abs(num) * 100).toFixed(1)}%`;
}

function toneClass(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num >= 0 ? "gd2-pos" : "gd2-neg";
}

function pBetTextOf(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `${(num * 100).toFixed(1)}%` : "—";
}

function pBetPctOf(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num * 1000) / 10));
}

function countText(value) {
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : "0";
}

function numberWord(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return String(value ?? "");
  return SMALL_NUMBER_WORDS[num] ?? String(num);
}

function bucketLabelFor(key) {
  const normalized = String(key || "").toLowerCase();
  if (BUCKET_LABELS[normalized]) return BUCKET_LABELS[normalized];
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "";
}

function formatBoardDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      month: "short",
      day: "2-digit",
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  } catch (_err) {
    return "";
  }
}

/* ---------- props payload helpers ---------- */

function propsAccessLevel(props) {
  return String(props && props.access ? props.access : "");
}

function propsCounts(props) {
  return props && props.counts && typeof props.counts === "object" ? props.counts : {};
}

function propsUpgradePath(props) {
  return safePath(props && props.upgrade && typeof props.upgrade === "object" ? props.upgrade.upgrade_path : "");
}

function isPropsEmpty(props) {
  if (!props) return true;
  if (props.state === "no_props_published") return true;
  const pitchers = Array.isArray(props.pitchers) ? props.pitchers : [];
  const batters = props.batters && typeof props.batters === "object" ? props.batters : {};
  const awayPlayers = Array.isArray(batters.away?.players) ? batters.away.players : [];
  const homePlayers = Array.isArray(batters.home?.players) ? batters.home.players : [];
  return !pitchers.length && !awayPlayers.length && !homePlayers.length;
}

function gameStatusLabel() {
  const raw = String(
    (gdState.props && gdState.props.game && gdState.props.game.status)
    || (gdState.game && (gdState.game.game_status || gdState.game.status))
    || ""
  ).toLowerCase();
  if (raw.includes("postpon")) return "Postponed";
  if (raw.includes("cancel")) return "Canceled";
  if (raw.includes("suspend")) return "Suspended";
  if (raw.includes("final") || raw.includes("completed") || raw.includes("game over")) return "Final";
  return "";
}

// Resolved team fill for a props row: rows carry is_home / team_abbr, and the
// fill always comes from resolveMatchupBranding (never a hard-coded team hex).
function rowSideBranding(row, matchupBranding) {
  if (row && typeof row.is_home === "boolean") {
    return row.is_home ? matchupBranding.home : matchupBranding.away;
  }
  const abbr = String(row?.team_abbr || "").toUpperCase();
  const homeAbbr = String(
    (gdState.props && gdState.props.game && gdState.props.game.home_abbr)
    || (gdState.game && gdState.game.home_team_abbr)
    || ""
  ).toUpperCase();
  return abbr && homeAbbr && abbr === homeAbbr ? matchupBranding.home : matchupBranding.away;
}

function sideFill(sideBranding, fallback) {
  return (sideBranding && sideBranding.fill) || fallback;
}

/* ---------- Wise Choice helpers ---------- */

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

function edgeClass(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("+")) return "good";
  if (trimmed.startsWith("-") || trimmed.startsWith("−")) return "bad";
  return "";
}

/* ---------- hero ---------- */

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

/* ---------- Wise Choice banner ---------- */

function renderTopPropTeaser() {
  // Suppressed for finished/postponed games and whenever the full props
  // payload has no ranked play to point at.
  if (gameStatusLabel()) return "";
  const props = gdState.props;
  if (!props || gdState.propsError || propsAccessLevel(props) !== "full") return "";
  const play = Array.isArray(props.top_plays) ? props.top_plays[0] : null;
  if (!play || !play.bet_label) return "";
  const name = lastNameOf(play.player_name) || String(play.player_name || "");
  const label = [name, play.bet_label].filter(Boolean).join(" ");
  const ev = Number(play.ev);
  const evPart = Number.isFinite(ev) ? ` · ${sPct(ev)} EV` : "";
  return `<button type="button" class="gd2-top-prop tnum" data-gd2-goto-props>Top prop: ${esc(label)}${esc(evPart)} →</button>`;
}

function renderWiseBanner(game, payload) {
  const option = wiseChoiceFor(game, payload);
  if (!option) return "";
  const meta = [option.sportsbook, option.odds_text].filter(Boolean).join(" · ");
  const win = option.model_probability_text || option.model_prob_text || "";
  const edge = option.edge_text || "";
  const ev = option.ev_text || "";
  const bubble = (label, value, cls = "") =>
    value ? `<div class="gd-bubble"><div class="gd-bubble-label">${esc(label)}</div><div class="gd-bubble-value ${cls} tnum">${esc(value)}</div></div>` : "";
  return `
    <section id="wise-choice" class="gd-wise" aria-labelledby="wise-choice-title">
      <div class="gd-wise-copy">
        <div class="gd-wise-eyebrow">
          <h2 id="wise-choice-title" class="gd-wise-label">Wise Choice™</h2>
          <span class="gd-official-pill">${esc(officialTierLabel(option))}</span>
        </div>
        <div class="gd-wise-pick">${esc(option.selection_text || option.label || "No selection")}</div>
        ${meta ? `<div class="gd-wise-meta tnum">${esc(meta)}</div>` : ""}
        ${renderTopPropTeaser()}
      </div>
      <div class="gd-bubbles">
        ${bubble("Win", win)}
        ${bubble("Edge", edge, edgeClass(edge))}
        ${bubble("EV", ev, edgeClass(ev))}
      </div>
    </section>`;
}

/* ---------- tab bar + panels ---------- */

function renderTabBar() {
  const buttons = GD_TABS.map((tab) => {
    if (tab.soon) {
      return `<button type="button" class="gd2-tab is-soon" disabled>${esc(tab.label)} <span class="gd2-soon-chip">Soon</span></button>`;
    }
    const active = gdState.activeTab === tab.id;
    return `<button type="button" class="gd2-tab${active ? " is-active" : ""}" data-gd2-tab="${esc(tab.id)}" aria-pressed="${active ? "true" : "false"}">${esc(tab.label)}</button>`;
  }).join("");
  return `<div class="gd2-tabbar" aria-label="Game detail sections">${buttons}</div>`;
}

function lockIcon() {
  return `<span class="gd2-lock-glyph" aria-hidden="true"><span class="gd2-lock-shackle"></span><span class="gd2-lock-body"></span></span>`;
}

function renderLockedSection(title, copy, ctaHref) {
  return `
    <article class="gd2-lock">
      ${lockIcon()}
      <div class="gd2-lock-title">${esc(title)}</div>
      <div class="gd2-lock-copy">${esc(copy)}</div>
      <span class="gd2-lock-ctas">
        <a class="gd2-btn gd2-btn-gold" href="${esc(ctaHref)}">View Founder access</a>
      </span>
    </article>`;
}

/* ---------- Markets tab ---------- */

function marketSortIndex(market) {
  const key = String(market?.market_key || "").toLowerCase();
  const title = String(market?.title || "").toLowerCase();
  if (key === "h2h" || key === "moneyline" || title.includes("money line") || title.includes("moneyline")) return 0;
  if (key === "spreads" || key === "run_line" || title.includes("run line")) return 1;
  if (key === "totals" || title.includes("total")) return 2;
  return 3;
}

function isSameWiseOption(option, wise) {
  if (!option || !wise) return false;
  const norm = (value) => String(value || "").trim().toLowerCase();
  const optionSelection = norm(option.selection_text || option.label);
  const wiseSelection = norm(wise.selection_text || wise.label);
  if (!optionSelection || optionSelection !== wiseSelection) return false;
  const optionBook = norm(option.sportsbook);
  const wiseBook = norm(wise.sportsbook);
  if (optionBook && wiseBook && optionBook !== wiseBook) return false;
  return true;
}

function renderMarketsPanel(payload, game) {
  const dropdowns = marketDropdowns(game).slice().sort((a, b) => marketSortIndex(a) - marketSortIndex(b));
  if (!dropdowns.length) {
    return `<div class="gd-note">No matched markets are available for this game yet.</div>`;
  }
  const wise = wiseChoiceFor(game, payload);
  const cell = (label, value, cls = "") =>
    `<span class="gd2-mkt-cell"><span class="gd2-mkt-cell-label">${esc(label)}</span><span class="gd2-mkt-cell-value ${cls} tnum">${esc(value || "—")}</span></span>`;
  const optionCard = (option) => {
    const isWise = isSameWiseOption(option, wise);
    const model = option.model_probability_text || option.model_prob_text || "";
    return `
      <article class="gd2-mkt-option${isWise ? " is-wise" : ""}">
        <span class="gd2-mkt-option-head">
          <span class="gd2-mkt-side">${esc(option.selection_text || option.label || "Option")}</span>
          <span class="gd2-mkt-tag${isWise ? " is-wise" : ""}">${isWise ? "Wise Choice™" : "Pass"}</span>
        </span>
        <span class="gd2-mkt-cells">
          ${cell("Odds", option.odds_text)}
          ${cell("Model", model)}
          ${cell("Edge", option.edge_text, edgeClass(option.edge_text))}
          ${cell("EV", option.ev_text, edgeClass(option.ev_text))}
        </span>
      </article>`;
  };
  const groups = dropdowns.map((market) => {
    const options = Array.isArray(market.options) ? market.options : [];
    if (!options.length) return "";
    return `
      <div class="gd2-mkt-group">
        <div class="gd2-mkt-group-title">${esc(market.title || market.market_key || "Market")}</div>
        <div class="gd2-mkt-options">${options.map(optionCard).join("")}</div>
      </div>`;
  }).filter(Boolean).join("");
  return groups || `<div class="gd-note">No matched markets are available for this game yet.</div>`;
}

/* ---------- Model tab ---------- */

function renderModelPanel(payload, game) {
  const props = gdState.props;
  const engine = props && !gdState.propsError && props.engine && typeof props.engine === "object" ? props.engine : {};
  const probs = winProbs(game);
  const wise = wiseChoiceFor(game, payload);
  const boardState = (wise && (wise.wise_choice_bucket_label || (wise.wise_choice_status ? wiseStatusText(wise.wise_choice_status) : "")))
    || game.board_state_label
    || "—";
  const nSims = Number(engine.n_sims);
  const simsText = Number.isFinite(nSims) && nSims > 0 ? `${Math.round(nSims / 1000)}k sim paths` : "—";
  const metadata = payload && payload.model_metadata && typeof payload.model_metadata === "object" ? payload.model_metadata : {};
  const gameModelVersion = game.model_version || metadata.model_version || "";
  const engineModelVersion = engine.model_version || "";
  const calibration = typeof engine.calibration === "string" ? engine.calibration.trim() : "";
  const statCard = (label, value) =>
    `<article class="gd2-stat-card"><div class="gd2-stat-label">${esc(label)}</div><div class="gd2-stat-value tnum">${esc(value || "—")}</div></article>`;
  const disclaimer = `Prop forecasts are EE-Sim read-only tallies blended 50/50 with the trained head per market${calibration ? `; rolling calibration is currently ${calibration}` : ""}. Signal buckets, not guarantees — a higher score does not automatically mean higher historical ROI.`;
  return `
    <article class="gd2-proj-score">
      <span class="gd2-stat-label">Projected score</span>
      <span class="gd2-proj-score-value tnum">${esc(game.model_details_projected_score || "—")}</span>
    </article>
    <div class="gd2-stat-grid">
      ${statCard("Away win prob", game.away_win_prob_text || (probs.away !== null ? percentText(probs.away) : ""))}
      ${statCard("Home win prob", game.home_win_prob_text || (probs.home !== null ? percentText(probs.home) : ""))}
      ${statCard("Projected total", game.projected_total_text)}
      ${statCard("Projected margin", game.projected_margin_text)}
      ${statCard("Board state", boardState)}
      ${statCard("Props engine", simsText)}
    </div>
    <article class="gd2-version-card">
      <div class="gd2-stat-label">Model version</div>
      <div class="gd2-version-value tnum">${esc(gameModelVersion || "—")}</div>
      ${engineModelVersion ? `<div class="gd2-version-value gd2-version-engine tnum">${esc(engineModelVersion)}</div>` : ""}
    </article>
    <p class="gd2-model-disclaimer">${esc(disclaimer)}</p>`;
}

/* ---------- Player Props tab ---------- */

function renderPBetBar(pBet, fill, options = {}) {
  const pct = pBetPctOf(pBet);
  const text = pBetTextOf(pBet);
  const fillStyle = options.muted
    ? `background:${esc(fill)};background:color-mix(in srgb, ${esc(fill)} 55%, #ffffff)`
    : `background:${esc(fill)}`;
  return `
    <span class="gd2-bar" role="img" aria-label="Model probability the bet cashes: ${esc(text)}">
      <span class="gd2-bar-fill" style="width:${pct}%;${fillStyle}"></span>
      <span class="gd2-bar-notch"></span>
    </span>`;
}

function renderPropRow(row, matchupBranding) {
  const fill = sideFill(rowSideBranding(row, matchupBranding), "#44546a");
  if (row.model_only) {
    return `
      <div class="gd2-prop-row gd2-hr-row">
        <span class="gd2-prop-label">${esc(row.bet_label || "1+ home run")}</span>
        <span class="gd2-prop-right">
          <span class="gd2-prop-quote gd2-noline">No line</span>
          <span class="gd2-prop-ev gd2-noline tnum">—</span>
        </span>
        <span class="gd2-prop-barrow">
          ${renderPBetBar(row.p_bet, fill, { muted: true })}
          <span class="gd2-prop-pbet tnum">${esc(pBetTextOf(row.p_bet))}</span>
        </span>
      </div>`;
  }
  const pick = Boolean(row.is_pick);
  return `
    <div class="gd2-prop-row${pick ? " is-pick" : ""}">
      <span class="gd2-prop-label">${esc(row.bet_label || "—")}${pick ? ` <span class="gd2-pick-pill">Pick</span>` : ""}</span>
      <span class="gd2-prop-right">
        <span class="gd2-prop-quote tnum">${esc(row.quote_short || "—")}</span>
        <span class="gd2-prop-ev ${toneClass(row.ev)} tnum">${esc(sPct(row.ev))}</span>
      </span>
      <span class="gd2-prop-barrow">
        ${renderPBetBar(row.p_bet, fill)}
        <span class="gd2-prop-pbet tnum">${esc(pBetTextOf(row.p_bet))}</span>
      </span>
    </div>`;
}

function renderTopPlays(props) {
  const plays = (Array.isArray(props.top_plays) ? props.top_plays : []).slice(0, 2);
  if (!plays.length) return "";
  const card = (play) => {
    const name = lastNameOf(play.player_name) || String(play.player_name || "");
    const meta = [play.quote_short, Number.isFinite(Number(play.p_bet)) ? `model ${pBetTextOf(play.p_bet)}` : ""]
      .filter(Boolean).join(" · ");
    return `
      <article class="gd2-top-play">
        <span class="gd2-top-play-copy">
          <span class="gd2-top-play-eyebrow">Top prop play</span>
          <span class="gd2-top-play-label">${esc([name, play.bet_label].filter(Boolean).join(" "))}</span>
          ${meta ? `<span class="gd2-top-play-meta tnum">${esc(meta)}</span>` : ""}
        </span>
        <span class="gd2-top-play-ev">
          <span class="gd2-top-play-ev-value ${toneClass(play.ev)} tnum">${esc(sPct(play.ev))}</span>
          <span class="gd2-top-play-ev-label">EV / unit</span>
        </span>
      </article>`;
  };
  return `<div class="gd2-top-plays">${plays.map(card).join("")}</div>`;
}

function renderRankCard(row, matchupBranding) {
  const side = rowSideBranding(row, matchupBranding);
  const fill = sideFill(side, "#44546a");
  const pick = Boolean(row.is_pick);
  return `
    <article class="gd2-rank-card${pick ? " is-pick" : ""}">
      <span class="gd2-rank-top">
        <span class="gd2-rank-who">
          <span class="gd2-rank-dot" style="background:${esc(fill)}"></span>
          <span class="gd2-rank-player">${esc(row.player_name || "—")}</span>
          ${pick ? `<span class="gd2-pick-pill">Pick</span>` : ""}
        </span>
        <span class="gd2-rank-ev">
          <span class="gd2-rank-ev-value ${toneClass(row.ev)} tnum">${esc(sPct(row.ev))}</span>
          <span class="gd2-rank-ev-label">EV / unit</span>
        </span>
      </span>
      <span class="gd2-rank-bet">${esc(row.bet_label || "—")} <span class="gd2-rank-quote tnum">${esc(row.quote_short || "")}</span></span>
      <span class="gd2-rank-barrow">
        ${renderPBetBar(row.p_bet, fill)}
        <span class="gd2-rank-model tnum">model ${esc(pBetTextOf(row.p_bet))}</span>
      </span>
    </article>`;
}

function renderRanked(props, matchupBranding) {
  // Prime plays only: the lower buckets (Strong/Playable/Lean) stay in the
  // API payload but are not rendered — the pitcher duel follows immediately.
  const buckets = Array.isArray(props.buckets) ? props.buckets : [];
  const prime = buckets.find(
    (bucket) => String(bucket?.key || "").toLowerCase() === "prime"
  );
  const rows = prime && Array.isArray(prime.rows) ? prime.rows : [];
  const list = rows.length
    ? `
    <div class="gd2-bucket" data-bucket-key="prime">
      <div class="gd2-bucket-head">
        <span class="gd2-bucket-name">${esc((prime && prime.label) || bucketLabelFor("prime"))}</span>
        <span class="gd2-bucket-meta tnum">${esc((prime && prime.meta) || "")}</span>
      </div>
      <div class="gd2-bucket-rows">${rows.map((row) => renderRankCard(row, matchupBranding)).join("")}</div>
    </div>`
    : `<div class="gd-note">No Prime plays for this game today.</div>`;
  return `
    <div class="gd2-props-heading-row">
      <div class="gd2-props-heading">Ranked plays</div>
    </div>
    <div class="gd2-ranked">${list}</div>`;
}

function renderPitcherCards(props, matchupBranding) {
  const pitchers = Array.isArray(props.pitchers) ? props.pitchers : [];
  if (!pitchers.length) {
    return `<div class="gd-note">No pitcher props posted for this game yet.</div>`;
  }
  const card = (pitcher) => {
    const side = pitcher.is_home ? matchupBranding.home : matchupBranding.away;
    const fill = sideFill(side, "#44546a");
    const rows = Array.isArray(pitcher.rows) ? pitcher.rows : [];
    const rowsWithSide = rows.map((row) => ({ ...row, is_home: Boolean(pitcher.is_home), team_abbr: pitcher.team_abbr }));
    return `
      <article class="gd2-pitcher-card" style="border-top-color:${esc(fill)}">
        <div class="gd2-player-head">
          ${renderSmallTeamMark(pitcher.team_abbr, side)}
          <span class="gd2-player-id">
            <span class="gd2-player-name">${esc(pitcher.name || "Pitcher TBD")}</span>
            <span class="gd2-player-sub">${esc(pitcher.sub || "")}</span>
          </span>
          ${pitcher.has_pick ? `<span class="gd2-pick-pill gd2-head-pick">Pick</span>` : ""}
        </div>
        ${rowsWithSide.map((row) => renderPropRow(row, matchupBranding)).join("")}
      </article>`;
  };
  return `<div class="gd2-pitchers">${pitchers.map(card).join("")}</div>`;
}

function renderBatterColumn(sideData, isHome, game, matchupBranding) {
  const players = Array.isArray(sideData?.players) ? sideData.players : [];
  const sideBranding = isHome ? matchupBranding.home : matchupBranding.away;
  const fill = sideFill(sideBranding, "#44546a");
  const teamName = isHome ? game.home_team : game.away_team;
  const city = teamCityLabel(teamName, sideData?.team_abbr);
  const cards = players.length ? players.map((player) => {
    const rows = (Array.isArray(player.rows) ? player.rows : [])
      .map((row) => ({ ...row, is_home: isHome, team_abbr: sideData?.team_abbr }));
    return `
      <article class="gd2-batter-card${player.has_pick ? " is-pick" : ""}">
        <div class="gd2-player-head">
          <span class="gd2-order-chip tnum" aria-hidden="true">${esc(String(player.batting_order ?? "—"))}</span>
          <span class="gd2-player-name">${esc(player.name || "—")}</span>
          ${player.has_pick ? `<span class="gd2-pick-pill gd2-head-pick">Pick</span>` : ""}
        </div>
        ${rows.map((row) => renderPropRow(row, matchupBranding)).join("")}
      </article>`;
  }).join("") : `<div class="gd-note">No batter props posted for this lineup yet.</div>`;
  return `
    <div class="gd2-lineup-col">
      <div class="gd2-col-head">
        <span class="gd2-col-dot" style="background:${esc(fill)}" aria-hidden="true"></span>
        <span>${esc(city)} — ${isHome ? "home" : "away"}</span>
      </div>
      ${cards}
    </div>`;
}

function renderPropsLock(props) {
  const counts = propsCounts(props);
  const picks = Number(counts.picks);
  const bucketLabel = bucketLabelFor(props.top_bucket);
  const picksClause = Number.isFinite(picks) && picks > 0 && bucketLabel
    ? `, with ${numberWord(picks)} ${picks === 1 ? "play" : "plays"} above the ${bucketLabel} line today`
    : "";
  return `
    <article class="gd2-lock">
      ${lockIcon()}
      <div class="gd2-lock-title">Player props are Founder access</div>
      <div class="gd2-lock-copy tnum">${esc(countText(counts.forecasts))} model forecasts for this game — ${esc(countText(counts.quoted))} quoted by the books, ranked by edge and EV${esc(picksClause)}.</div>
      <span class="gd2-lock-ctas">
        <a class="gd2-btn gd2-btn-gold" href="${esc(propsUpgradePath(props))}">View Founder access</a>
        <a class="gd2-btn gd2-btn-ghost" href="/login/" data-auth-guest hidden>Sign in</a>
      </span>
    </article>`;
}

function renderPropsFull(props, game) {
  const matchupBranding = resolveGameBranding(game);
  const batters = props.batters && typeof props.batters === "object" ? props.batters : {};
  const segButton = (key, label) =>
    `<button type="button" class="gd2-seg-btn${gdState.propsSeg === key ? " is-active" : ""}" data-gd2-seg="${esc(key)}" aria-pressed="${gdState.propsSeg === key ? "true" : "false"}">${esc(label)}</button>`;
  const sectionClass = (key) => `gd2-props-section${gdState.propsSeg === key ? " is-seg-active" : ""}`;
  return `
    <div class="gd2-seg" role="group" aria-label="Player props views">
      ${segButton("ranked", "Ranked")}
      ${segButton("pitchers", "Pitchers")}
      ${segButton("batters", "Batters")}
    </div>
    ${renderTopPlays(props)}
    <section class="${sectionClass("ranked")}" data-gd2-props-section="ranked">
      ${renderRanked(props, matchupBranding)}
    </section>
    <section class="${sectionClass("pitchers")}" data-gd2-props-section="pitchers">
      <div class="gd2-props-heading-row">
        <div class="gd2-props-heading">The pitcher duel</div>
      </div>
      ${renderPitcherCards(props, matchupBranding)}
    </section>
    <section class="${sectionClass("batters")}" data-gd2-props-section="batters">
      <div class="gd2-props-heading-row">
        <div class="gd2-props-heading">The lineups — batter props</div>
        <div class="gd2-props-legend">Bar = model p the bet cashes · notch = 50/50 · gold = pick</div>
      </div>
      <div class="gd2-lineups">
        ${renderBatterColumn(batters.away, false, game, matchupBranding)}
        ${renderBatterColumn(batters.home, true, game, matchupBranding)}
      </div>
    </section>`;
}

function renderPropsPanel(game) {
  const props = gdState.props;
  if (gdState.propsError || !props) {
    return `<div class="gd-note gd2-props-note">Player props couldn't load for this game right now. The rest of the page is unaffected — try again in a moment.</div>`;
  }
  if (propsAccessLevel(props) === "summary") {
    return renderPropsLock(props);
  }
  if (isPropsEmpty(props)) {
    return `<div class="gd-note gd2-props-note">No player props have been published for this game yet. Props publish around 7:25 AM CT on game days.</div>`;
  }
  return renderPropsFull(props, game);
}

/* ---------- page assembly ---------- */

function legalLine() {
  return `<p class="gd2-legal">For informational and entertainment purposes only — not gambling, financial, legal, or investment advice. Must be 21+ and legally permitted to use BoardWise. If gambling is a problem, call or text 1-800-GAMBLER, or in Iowa call 1-800-BETS-OFF (1-800-238-7633).</p>`;
}

function defaultTab() {
  const props = gdState.props;
  if (props && !gdState.propsError) {
    const quoted = Number(propsCounts(props).quoted);
    if (Number.isFinite(quoted) && quoted > 0) return "props";
  }
  return "markets";
}

function renderPanels(payload, game) {
  const fullCards = hasFullCardAccess(payload);
  const upgradeHref = safeUpgradePath(payload);
  const panel = (id, content) =>
    `<section class="gd2-panel" data-gd2-panel="${esc(id)}"${gdState.activeTab === id ? "" : " hidden"}>${content}</section>`;
  return [
    panel("markets", fullCards
      ? renderMarketsPanel(payload, game)
      : renderLockedSection("Full markets are Founder access", "Every supported market side with the model's call, edge, and expected value.", upgradeHref)),
    panel("props", renderPropsPanel(game)),
    panel("model", fullCards
      ? renderModelPanel(payload, game)
      : renderLockedSection("The model breakdown is Founder access", "Projected score, win probabilities, projected total and margin, and model versions.", upgradeHref)),
  ].join("");
}

function renderDetailInner(payload, game) {
  return `
    <div class="gd-detail-inner gd2-detail">
      ${renderHero(game)}
      ${hasFullCardAccess(payload) ? renderWiseBanner(game, payload) : ""}
      ${renderTabBar()}
      ${renderPanels(payload, game)}
      ${legalLine()}
    </div>`;
}

function renderNav(payload, game) {
  if (!gdEls.back) return;
  const planBadge = isPreviewPayload(payload)
    ? `<span class="gd-plan free">Free</span>`
    : `<span class="gd-plan founder">Founder</span>`;
  const statusLabel = game ? gameStatusLabel() : "";
  const statusPill = statusLabel ? `<span class="gd2-status-pill">${esc(statusLabel)}</span>` : "";
  const label = game ? gameLabel(game) : "Game Detail";
  const dateLabel = formatBoardDate((payload && payload.target_date) || readTargetDate());
  const dateTime = [dateLabel, game ? game.commence_time : ""].filter(Boolean).join(" | ");
  const when = game ? [dateTime, game.venue].filter(Boolean).join(" · ") : "";
  gdEls.back.innerHTML = `
    <a class="gd-back-link" href="${esc(boardHref())}">← Today's Board</a>
    <div class="gd-title-wrap">
      <div class="eyebrow">BoardWise · MLB · Game Detail</div>
      <h1 id="gd-heading">${esc(label)}</h1>
      ${when ? `<div class="gd-top-meta tnum">${esc(when)}</div>` : ""}
    </div>
    <span class="gd-nav-right">${statusPill}${planBadge}</span>`;
}

function renderTitle(game) {
  const label = gameLabel(game);
  document.title = `${label} - BoardWise`;
  const heading = document.getElementById("gd-heading");
  if (heading) heading.textContent = label;
}

/* ---------- interaction ---------- */

function setActiveTab(tab) {
  if (!tab || !gdEls.detail) return;
  gdState.activeTab = tab;
  gdEls.detail.querySelectorAll("[data-gd2-tab]").forEach((button) => {
    const active = button.getAttribute("data-gd2-tab") === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  gdEls.detail.querySelectorAll("[data-gd2-panel]").forEach((element) => {
    const panel = /** @type {HTMLElement} */ (element);
    panel.hidden = panel.getAttribute("data-gd2-panel") !== tab;
  });
}

function setPropsSeg(seg) {
  if (!seg || !gdEls.detail) return;
  gdState.propsSeg = seg;
  gdEls.detail.querySelectorAll("[data-gd2-seg]").forEach((button) => {
    const active = button.getAttribute("data-gd2-seg") === seg;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  gdEls.detail.querySelectorAll("[data-gd2-props-section]").forEach((section) => {
    section.classList.toggle("is-seg-active", section.getAttribute("data-gd2-props-section") === seg);
  });
}

function bindDetailEvents(root) {
  root.querySelectorAll("[data-gd2-tab]").forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.getAttribute("data-gd2-tab")));
  });
  root.querySelectorAll("[data-gd2-goto-props]").forEach((button) => {
    button.addEventListener("click", () => setActiveTab("props"));
  });
  root.querySelectorAll("[data-gd2-seg]").forEach((button) => {
    button.addEventListener("click", () => setPropsSeg(button.getAttribute("data-gd2-seg")));
  });
}

function applyGates(root) {
  // Reveals guest-only CTAs (e.g. the lock panel's Sign in link) using the
  // shared gates helper; the auth state is cached by auth-state.js.
  if (window.BoardWiseGates && typeof window.BoardWiseGates.applyFeatureGates === "function") {
    Promise.resolve(window.BoardWiseGates.applyFeatureGates(root)).catch(() => {});
  }
}

/* ---------- states / errors ---------- */

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
    showError("This game detail view requires Founder access.", { cta: { href: "/pricing/", label: "Become a Founder" } });
    return;
  }
  showError("Could not load this game right now. Please try again in a moment.", {
    cta: { href: boardHref(), label: "Back to board" },
  });
}

function renderGameNotFound(payload) {
  if (isPreviewPayload(payload)) {
    showError("This game's full detail requires Founder access.", { cta: { href: safeUpgradePath(payload), label: "Become a Founder" } });
    return;
  }
  showError("We couldn't find that game on the selected date.", { cta: { href: boardHref(), label: "Back to board" } });
}

function renderDetail() {
  const payload = gdState.payload;
  const game = gdState.game;
  if (!gdEls.detail) return;
  gdState.activeTab = defaultTab();
  renderNav(payload, game);
  renderTitle(game);
  gdEls.detail.innerHTML = renderDetailInner(payload, game);
  bindDetailEvents(gdEls.detail);
  bindRenderedLogos(gdEls.detail);
  applyGates(gdEls.detail);
  setHidden(gdEls.loading, true);
  setHidden(gdEls.error, true);
  setHidden(gdEls.detail, false);
}

/* ---------- data loading ---------- */

function fetchProps(date) {
  if (!gdState.gamePk || !window.BoardWiseApi || typeof window.BoardWiseApi.getMlbGameProps !== "function") {
    return Promise.resolve(null);
  }
  return window.BoardWiseApi.getMlbGameProps(gdState.gamePk, { date: date || undefined });
}

async function settleProps(propsPromise) {
  try {
    gdState.props = await propsPromise;
    gdState.propsError = !gdState.props;
  } catch (error) {
    gdState.props = null;
    gdState.propsError = true;
    console.warn("BoardWise: player props fetch failed", error);
  }
}

async function loadDetail(options = {}) {
  setHidden(gdEls.loading, false);
  setHidden(gdEls.error, true);
  setHidden(gdEls.detail, true);
  const requestedModel = gdState.requestedModel;
  const date = readTargetDate();
  // Both fetches run in parallel; the props fetch is family-agnostic so the
  // board's model-fallback retry never re-issues it.
  const propsPromise = options.propsPromise || fetchProps(date);
  try {
    const payload = await window.BoardWiseApi.getMlbBoard(date, {
      model: requestedModel || undefined,
    });
    gdState.payload = payload;
    const metadata = payload && payload.model_metadata && typeof payload.model_metadata === "object"
      ? payload.model_metadata
      : {};
    gdState.selectedModel = metadata.selected_model_family || requestedModel || metadata.default_model_family || "";
    // Stale bookmark normalization: whenever the URL carries a model param
    // that differs from the family the API resolved (retired keys, eagle_eye,
    // aliases), rewrite it in place — never 400 the user.
    if (gdState.selectedModel && readParam("model") && readParam("model") !== gdState.selectedModel) {
      writeModelToUrl(gdState.selectedModel);
    }
    const game = findGame(payload, gdState.gamePk);
    if (!game) {
      await settleProps(propsPromise);
      renderNav(payload, null);
      renderGameNotFound(payload);
      return;
    }
    gdState.game = game;
    await settleProps(propsPromise);
    renderDetail();
  } catch (error) {
    if (requestedModel && !options.isModelFallback && Number(error?.status) === 400) {
      gdState.requestedModel = "";
      await loadDetail({ isModelFallback: true, propsPromise });
      return;
    }
    console.error(error);
    await settleProps(propsPromise);
    showAccessError(error);
  }
}

function init() {
  gdState.gamePk = readGamePk();
  const model = readModel();
  // eagle* families are props engines, never board families — drop them up
  // front so the board fetch resolves the default family in one round trip.
  gdState.requestedModel = /^eagle/.test(model) ? "" : model;
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
    hasFullCardAccess,
    sPct,
    pBetPctOf,
    pBetTextOf,
    numberWord,
    bucketLabelFor,
    defaultTab,
    gameStatusLabel,
  });
}

init();
