// @ts-check
(function () {
  const byId = (id) => document.getElementById(id);
  const loadingEl = byId("cfb-loading");
  const errorEl = byId("cfb-error");
  const accessEl = byId("cfb-access");
  const gamesEl = byId("cfb-games");
  const slateEl = byId("cfb-slate");
  const updatedEl = byId("cfb-updated");
  const controlsEl = byId("cfb-controls");
  const summaryEl = byId("cfb-board-summary");
  const matchCountEl = byId("cfb-match-count");
  const selectedFiltersEl = byId("cfb-selected-filters");
  const stateSummaryEl = byId("cfb-state-summary");
  const nextKickoffEl = byId("cfb-next-kickoff");
  const weekEl = /** @type {HTMLSelectElement | null} */ (byId("cfb-week"));
  const classificationOptions = [
    { key: "fbs", label: "FBS" }, { key: "fbs-fcs", label: "FBS–FCS" },
    { key: "fcs", label: "FCS" }, { key: "other", label: "Other" },
    { key: "all", label: "All" },
  ];
  const stateOptions = [
    { key: "complete", label: "Complete" }, { key: "degraded", label: "Degraded" },
    { key: "unavailable", label: "Unavailable" }, { key: "all", label: "All" },
  ];
  const DEFAULT_CLASSIFICATION = "fbs";
  const DEFAULT_STATE = "complete";
  const accordionPrefix = "boardwise:cfb:accordions";
  let payloadCache = null;
  let activeFilters = { classification: DEFAULT_CLASSIFICATION, state: DEFAULT_STATE, week: null };
  let allowedWeeks = [];

  function esc(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function finite(value) {
    if (value === null || value === undefined
      || (typeof value !== "number" && typeof value !== "string")
      || (typeof value === "string" && value.trim() === "")) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function percent(value, digits = 1) {
    const number = finite(value);
    return number === null ? "—" : `${(number * 100).toFixed(digits)}%`;
  }

  function score(value) {
    const number = finite(value);
    return number === null ? "—" : number.toFixed(1);
  }

  function signed(value) {
    const number = finite(value);
    return number === null ? "—" : `${number > 0 ? "+" : ""}${number.toFixed(1)}`;
  }

  function line(value) {
    const number = finite(value);
    return number === null ? "" : `${number > 0 ? "+" : ""}${number}`;
  }

  function american(value) {
    const number = finite(value);
    return number === null ? "—" : `${number > 0 ? "+" : ""}${Math.round(number)}`;
  }

  function validDate(value) {
    if (!value) return null;
    const date = new Date(String(value));
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  function when(value, includeDate = true) {
    const date = validDate(value);
    if (!date) return "—";
    return new Intl.DateTimeFormat("en-US", {
      ...(includeDate ? { weekday: "short", month: "short", day: "numeric" } : {}),
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(date);
  }

  function dateHeading(value) {
    const date = validDate(value);
    return date ? new Intl.DateTimeFormat("en-US", {
      weekday: "long", month: "long", day: "numeric",
    }).format(date) : "Kickoff date TBD";
  }

  function timeHeading(value) {
    const date = validDate(value);
    return date ? new Intl.DateTimeFormat("en-US", {
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(date) : "Kickoff TBD";
  }

  function teamInitials(team) {
    const abbr = String(team?.abbreviation || "").trim();
    if (abbr) return abbr.slice(0, 4).toUpperCase();
    return String(team?.name || "Team").split(/\s+/).filter(Boolean)
      .map((part) => part[0]).join("").slice(0, 3).toUpperCase();
  }

  function normalizeClassification(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized || null;
  }

  function classificationBucket(game) {
    const away = normalizeClassification(game?.model_details?.away_classification);
    const home = normalizeClassification(game?.model_details?.home_classification);
    if (!away || !home) return "unknown";
    if (away === "fbs" && home === "fbs") return "fbs";
    if ((away === "fbs" && home === "fcs") || (away === "fcs" && home === "fbs")) return "fbs-fcs";
    if (away === "fcs" && home === "fcs") return "fcs";
    return "other";
  }

  function matchupName(game) {
    return `${game?.away_team?.name || "Unknown team"} at ${game?.home_team?.name || "Unknown team"}`;
  }

  function sortGames(games) {
    return [...games].sort((left, right) => {
      const leftDate = validDate(left?.kickoff_utc);
      const rightDate = validDate(right?.kickoff_utc);
      if (leftDate && !rightDate) return -1;
      if (!leftDate && rightDate) return 1;
      if (leftDate && rightDate && leftDate.valueOf() !== rightDate.valueOf()) {
        return leftDate.valueOf() - rightDate.valueOf();
      }
      return matchupName(left).localeCompare(matchupName(right));
    });
  }

  function groupGames(games) {
    const groups = [];
    for (const game of sortGames(games)) {
      const date = dateHeading(game.kickoff_utc);
      const time = timeHeading(game.kickoff_utc);
      let dateGroup = groups.find((group) => group.label === date);
      if (!dateGroup) { dateGroup = { label: date, times: [] }; groups.push(dateGroup); }
      let timeGroup = dateGroup.times.find((group) => group.label === time);
      if (!timeGroup) { timeGroup = { label: time, games: [] }; dateGroup.times.push(timeGroup); }
      timeGroup.games.push(game);
    }
    return groups;
  }

  function parseFilters(search, weeks, currentWeek) {
    const params = new URLSearchParams(search || "");
    const classification = classificationOptions.some((option) => option.key === params.get("classification"))
      ? params.get("classification") : DEFAULT_CLASSIFICATION;
    const state = stateOptions.some((option) => option.key === params.get("state"))
      ? params.get("state") : DEFAULT_STATE;
    const weekParam = params.get("week");
    const requestedWeek = weekParam === null || weekParam.trim() === "" ? null : Number(weekParam);
    const week = requestedWeek !== null && Number.isSafeInteger(requestedWeek) && weeks.includes(requestedWeek)
      ? requestedWeek : currentWeek;
    return { classification, state, week };
  }

  function serializeFilters(filters, includeDefaults = false) {
    const params = new URLSearchParams();
    if (filters.week !== null && filters.week !== undefined) params.set("week", String(filters.week));
    if (includeDefaults || filters.classification !== DEFAULT_CLASSIFICATION) {
      params.set("classification", filters.classification);
    }
    if (includeDefaults || filters.state !== DEFAULT_STATE) params.set("state", filters.state);
    return params.toString();
  }

  function applyFilters(games, filters) {
    return sortGames(games.filter((game) => (
      (filters.classification === "all" || classificationBucket(game) === filters.classification)
      && (filters.state === "all" || String(game.data_state) === filters.state)
    )));
  }

  function countFilters(games, filters) {
    const classification = Object.fromEntries(classificationOptions.map((option) => [option.key, 0]));
    classification.all = games.length;
    for (const game of games) {
      const bucket = classificationBucket(game);
      if (Object.hasOwn(classification, bucket)) classification[bucket] += 1;
    }
    const population = games.filter((game) => filters.classification === "all"
      || classificationBucket(game) === filters.classification);
    const state = Object.fromEntries(stateOptions.map((option) => [option.key, 0]));
    state.all = population.length;
    for (const game of population) if (Object.hasOwn(state, game.data_state)) state[game.data_state] += 1;
    return { classification, state };
  }

  function normalizeToken(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function selectionLabel(selection, game, market) {
    const value = normalizeToken(selection);
    if (market === "total" && ["over", "under"].includes(value)) {
      return value[0].toUpperCase() + value.slice(1);
    }
    for (const [side, team] of [["away", game.away_team], ["home", game.home_team]]) {
      const candidates = [side, team?.code, team?.logo_key, team?.abbreviation, team?.name]
        .map(normalizeToken);
      if (candidates.includes(value)) return String(team?.name || side);
    }
    return String(selection || "Outcome").replaceAll("_", " ");
  }

  function offersComparable(left, right) {
    if (!left || !right) return false;
    return String(left.selection || "") === String(right.selection || "")
      && finite(left.current_line) === finite(right.current_line)
      && finite(left.current_price_american) !== null
      && finite(right.current_price_american) !== null
      && String(left.market_state) === "complete"
      && String(right.market_state) === "complete"
      && Boolean(left.current_captured_at) && Boolean(right.current_captured_at);
  }

  function betterBookPair(left, right) {
    if (!offersComparable(left, right)) return null;
    const leftPrice = /** @type {number} */ (finite(left.current_price_american));
    const rightPrice = /** @type {number} */ (finite(right.current_price_american));
    if (leftPrice === rightPrice) return "tie";
    return leftPrice > rightPrice ? String(left.bookmaker) : String(right.bookmaker);
  }

  function quoteState(value) {
    const labels = {
      complete: "COMPLETE", stale: "STALE", incomplete: "INCOMPLETE",
      book_missing: "BOOK MISSING", market_disagreement: "MARKET DISAGREEMENT",
    };
    return labels[String(value || "").toLowerCase()] || "INCOMPLETE";
  }

  function dataStateText(state) {
    if (state === "complete") return "Complete forecast inputs";
    if (state === "degraded") return "Limited forecast inputs";
    return "Forecast unavailable";
  }

  function safeReason(game) {
    const codes = Array.isArray(game?.reason_codes)
      ? game.reason_codes.map((code) => String(code).toLowerCase()) : [];
    if (codes.some((code) => code.includes("quarterback") || code.includes("starter"))) {
      return "Starting-player context is still incomplete.";
    }
    if (codes.some((code) => code.includes("weather"))) return "Required game-day conditions are still incomplete.";
    if (codes.some((code) => code.includes("market") || code.includes("odds"))) {
      return "Required market context is not complete yet.";
    }
    if (codes.some((code) => code.includes("rating") || code.includes("feature") || code.includes("input"))) {
      return "Required pregame context is not complete yet.";
    }
    return "One or more required inputs are incomplete.";
  }

  function brandFor(team) {
    const registry = window.BoardWiseCfbBranding;
    const key = String(team?.logo_key || team?.code || "");
    return registry?.teams?.[key] || registry?.fallback
      || { primary: "#667085", secondary: "#D0D5DD", probabilityColor: "#344054" };
  }

  function teamMark(team, compact = false) {
    const brand = brandFor(team);
    const key = String(team?.logo_key || team?.code || "");
    const logo = window.BoardWiseCfbBranding?.teams?.[key]?.logo || "";
    return `<span class="cfb-team-mark${compact ? " cfb-team-mark--compact" : ""}" style="--team-primary:${esc(brand.primary)};--team-secondary:${esc(brand.secondary)}">
      ${logo ? `<img src="${esc(logo)}" width="128" height="128" loading="lazy" decoding="async" alt="" data-team-logo>` : ""}
      <span class="cfb-team-fallback"${logo ? " hidden" : ""} aria-hidden="true">${esc(teamInitials(team))}</span>
    </span>`;
  }

  function probabilityState(offer, market) {
    if (!offer?.current_captured_at || finite(offer?.current_price_american) === null) {
      return "current_quote_missing";
    }
    const original = finite(offer.original_line);
    const current = finite(offer.current_line);
    if (market !== "winner" && (original === null || current === null)) return "line_missing";
    if (original !== current) return "line_changed";
    return "matched_evaluated_line";
  }

  function currentProbability(offer, market) {
    return probabilityState(offer, market) === "matched_evaluated_line"
      ? finite(offer?.model_probability) : null;
  }

  function quoteDetails(offer) {
    if (!offer) return "";
    const original = offer.original_price_american == null ? "Evaluated offer not retained"
      : `Evaluated offer ${line(offer.original_line)} ${american(offer.original_price_american)}`.trim();
    const retained = (key, legacy) => Object.hasOwn(offer, key) ? offer[key] : offer[legacy];
    return `<details class="cfb-quote-details"><summary>Quote details</summary><div>
      <span>${esc(original)}</span>
      <span>BoardWise probability at evaluated line <strong>${esc(percent(retained("original_model_probability", "model_probability")))}</strong></span>
      <span>Evaluated same-book no-vig <strong>${esc(percent(retained("original_same_book_no_vig_probability", "same_book_no_vig_probability")))}</strong></span>
      <span>Push probability at evaluated line <strong>${esc(percent(retained("original_push_probability", "push_probability")))}</strong></span>
      <span>Evaluated quote captured ${esc(when(offer.original_captured_at))}</span>
      <span>Current quote captured ${esc(when(offer.current_captured_at))}</span>
    </div></details>`;
  }

  function offerPrimary(offer) {
    const exactLine = line(offer?.current_line);
    return `${exactLine ? `${exactLine} ` : ""}${american(offer?.current_price_american)}`.trim();
  }

  function offerCell(offer, label, market) {
    if (!offer) return `<td data-label="${esc(label)}"><span class="cfb-offer-missing">Book missing</span></td>`;
    const state = probabilityState(offer, market);
    const unavailable = state === "line_changed" ? "Line moved · probability unavailable at current line"
      : "Probability unavailable for current offer";
    return `<td data-label="${esc(label)}"><strong class="cfb-offer-primary tnum">${esc(offerPrimary(offer))}</strong>
      <span class="cfb-offer-probability">BoardWise probability <strong>${esc(percent(currentProbability(offer, market)))}</strong></span>
      ${state !== "matched_evaluated_line" ? `<span class="cfb-market-note">${esc(unavailable)}</span>` : ""}
      <span class="cfb-quote-state">${esc(quoteState(offer.market_state))}</span>${quoteDetails(offer)}</td>`;
  }

  function outcomesFor(group, game) {
    const outcomes = new Map();
    for (const offer of Array.isArray(group?.offers) ? group.offers : []) {
      const label = selectionLabel(offer.selection, game, group.market);
      if (!outcomes.has(label)) outcomes.set(label, []);
      outcomes.get(label).push(offer);
    }
    return [...outcomes.entries()];
  }

  function marketHeadline(group, game) {
    const offers = (Array.isArray(group?.offers) ? group.offers : []).filter((offer) => (
      String(offer?.market_state) === "complete"
      && Boolean(offer?.current_captured_at)
      && currentProbability(offer, group.market) !== null
      && finite(offer?.current_price_american) !== null
      && (group?.market === "winner" || finite(offer?.current_line) !== null)
    ));
    if (!offers.length) return null;

    const featured = [...offers].sort((left, right) => (
      /** @type {number} */ (finite(right.model_probability))
      - /** @type {number} */ (finite(left.model_probability))
      || /** @type {number} */ (finite(right.current_price_american))
      - /** @type {number} */ (finite(left.current_price_american))
    ))[0];
    const featuredLine = finite(featured.current_line);
    const exactOffers = offers.filter((offer) => (
      String(offer.selection) === String(featured.selection)
      && finite(offer.current_line) === featuredLine
    ));
    const bestPrice = exactOffers.reduce((best, offer) => (
      /** @type {number} */ (finite(offer.current_price_american))
      > /** @type {number} */ (finite(best.current_price_american)) ? offer : best
    ), featured);
    const outcome = selectionLabel(featured.selection, game, group.market);
    const exactLine = group.market === "total" ? String(featuredLine) : line(featuredLine);
    const exactOutcome = group.market === "winner" ? outcome : `${outcome} ${exactLine}`;
    return {
      outcome: exactOutcome,
      probability: percent(featured.model_probability),
      price: american(bestPrice.current_price_american),
    };
  }

  function marketTable(group, game) {
    const outcomes = outcomesFor(group, game);
    if (!outcomes.length) return `<p class="cfb-market-note">This market is missing, stale, incomplete, or unavailable in the current safe release.</p>`;
    if (group.market === "winner") {
      const rows = outcomes.map(([outcome, offers]) => {
        const draftkings = offers.find((offer) => offer.bookmaker === "draftkings");
        const fanduel = offers.find((offer) => offer.bookmaker === "fanduel");
        const better = betterBookPair(draftkings, fanduel);
        const probabilityOffer = [draftkings, fanduel].find((offer) => (
          currentProbability(offer, "winner") !== null
        ));
        const best = better === "draftkings" ? `DraftKings ${american(draftkings.current_price_american)}`
          : better === "fanduel" ? `FanDuel ${american(fanduel.current_price_american)}`
            : better === "tie" ? `Same price ${american(draftkings.current_price_american)}`
              : "Different lines — compare separately";
        return `<tr><th scope="row">${esc(outcome)}</th><td data-label="BoardWise probability"><strong>${esc(percent(currentProbability(probabilityOffer, "winner")))}</strong></td>
          <td data-label="DraftKings">${esc(american(draftkings?.current_price_american))}${quoteDetails(draftkings)}</td>
          <td data-label="FanDuel">${esc(american(fanduel?.current_price_american))}${quoteDetails(fanduel)}</td>
          <td data-label="Best current price" class="cfb-best-price">${esc(best)}</td></tr>`;
      }).join("");
      return `<div class="cfb-table-wrap"><table class="cfb-market-table"><thead><tr><th>Outcome</th><th>BoardWise probability</th><th>DraftKings</th><th>FanDuel</th><th>Best current price</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    const rows = outcomes.map(([outcome, offers]) => {
      const draftkings = offers.find((offer) => offer.bookmaker === "draftkings");
      const fanduel = offers.find((offer) => offer.bookmaker === "fanduel");
      const comparable = draftkings && fanduel && offersComparable(draftkings, fanduel);
      return `<tr><th scope="row">${esc(outcome)}</th>${offerCell(draftkings, "DraftKings", group.market)}${offerCell(fanduel, "FanDuel", group.market)}</tr>
        <tr class="cfb-comparison-row"><td colspan="3">${comparable ? "Same exact line — prices are directly comparable." : "DIFFERENT LINES — compare each exact offer separately."}</td></tr>`;
    }).join("");
    return `<div class="cfb-table-wrap"><table class="cfb-market-table cfb-market-table--exact"><thead><tr><th>Outcome</th><th>DraftKings</th><th>FanDuel</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function accordionState(season, week) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(`${accordionPrefix}:${season}:${week}`) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_error) { return {}; }
  }

  function writeAccordionState(season, week, state) {
    try { sessionStorage.setItem(`${accordionPrefix}:${season}:${week}`, JSON.stringify(state)); }
    catch (_error) { /* Privacy settings may disable session storage. */ }
  }

  function marketAccordion(group, game, season, week) {
    const offers = Array.isArray(group?.offers) ? group.offers : [];
    const state = accordionState(season, week)?.[String(game.game_id)] || {};
    const section = String(group?.market || "unknown");
    const bodyId = `cfb-${season}-${week}-${game.game_id}-${section}`;
    if (!offers.length) return `<div class="cfb-accordion cfb-accordion--unavailable" data-market="${esc(section)}"><div class="cfb-accordion__unavailable"><span class="cfb-accordion__title">${esc(group?.label || "Market")}</span><span>Unavailable</span></div></div>`;
    const headline = marketHeadline(group, game);
    return `<details class="cfb-accordion cfb-market" data-market="${esc(section)}" data-section="${esc(section)}"${state.market === section ? " open" : ""}>
      <summary aria-controls="${esc(bodyId)}" aria-expanded="${state.market === section ? "true" : "false"}"><span><span class="cfb-accordion__title">${esc(group?.label || "Market")}</span>${headline ? `<span class="cfb-accordion__headline"><span aria-hidden="true">·</span> ${esc(headline.outcome)} <span aria-hidden="true">·</span> ${esc(headline.probability)} <span aria-hidden="true">·</span> ${esc(headline.price)}</span>` : `<span class="cfb-accordion__state">Current offers</span>`}</span></summary>
      <div class="cfb-accordion__body" id="${esc(bodyId)}">${marketTable(group, game)}</div></details>`;
  }

  function quantileSummary(quantiles) {
    if (!quantiles || typeof quantiles !== "object" || Array.isArray(quantiles)) return "Not retained";
    const entries = Object.entries(quantiles).slice(0, 6);
    return entries.length ? entries.map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`).join(" · ") : "Not retained";
  }

  function modelAccordion(game, season, week) {
    const forecast = game.forecast || {};
    const details = game.model_details || {};
    const state = accordionState(season, week)?.[String(game.game_id)] || {};
    const bodyId = `cfb-${season}-${week}-${game.game_id}-model`;
    return `<details class="cfb-accordion cfb-model-details" data-section="model"${state.model ? " open" : ""}>
      <summary aria-controls="${esc(bodyId)}" aria-expanded="${state.model ? "true" : "false"}"><span class="cfb-accordion__title">Model Details</span></summary>
      <div class="cfb-accordion__body" id="${esc(bodyId)}">
        <section class="cfb-model-section"><h4>Forecast summary</h4><dl class="cfb-model-grid">
          <div><dt>Model</dt><dd>${esc(details.model_name || "Round House")}</dd></div>
          <div><dt>Expected score</dt><dd>${esc(game.away_team?.name)} ${esc(score(forecast.expected_away_score))} · ${esc(game.home_team?.name)} ${esc(score(forecast.expected_home_score))}</dd></div>
          <div><dt>Expected margin</dt><dd>${esc(game.home_team?.name)} ${esc(signed(forecast.expected_margin_home))}</dd></div>
          <div><dt>Expected total</dt><dd>${esc(score(forecast.expected_total))}</dd></div>
          <div><dt>Distribution summary</dt><dd>${esc(quantileSummary(forecast.retained_quantiles))}</dd></div>
        </dl></section>
        <section class="cfb-model-section"><h4>Game context</h4><dl class="cfb-model-grid">
          <div><dt>Team classification</dt><dd>${esc(game.away_team?.name)}: ${esc(details.away_classification || "Not retained")} · ${esc(game.home_team?.name)}: ${esc(details.home_classification || "Not retained")}</dd></div>
          <div><dt>Data state</dt><dd>${esc(dataStateText(game.data_state))}</dd></div>
        </dl></section>
        <section class="cfb-model-section"><h4>Data freshness and model status</h4><dl class="cfb-model-grid">
          <div><dt>Forecast as of</dt><dd>${esc(when(details.as_of))}</dd></div>
          <div><dt>Release context</dt><dd>Experimental · Forecast only · No selections</dd></div>
        </dl></section>
        <p class="cfb-model-limit"><strong>Known limitation:</strong> College football forecasts are undergoing prospective evaluation. Inputs, uncertainty coverage, and market alignment may be incomplete. This forecast is not a BoardWise Call.</p>
      </div></details>`;
  }

  function matchup(game) {
    const forecast = game.forecast;
    if (!forecast) return `<div class="cfb-locked-game"><div class="cfb-locked-matchup">${teamMark(game.away_team, true)}<span>${esc(game.away_team?.name)}</span><b>at</b>${teamMark(game.home_team, true)}<span>${esc(game.home_team?.name)}</span></div><p>Founder access is required to view the experimental forecast values and market offers.</p></div>`;
    const awayValue = finite(forecast.away_win_probability);
    const homeValue = finite(forecast.home_win_probability);
    const available = awayValue !== null && homeValue !== null;
    const sum = available ? Math.max(0, /** @type {number} */ (awayValue))
      + Math.max(0, /** @type {number} */ (homeValue)) : 0;
    const awayHeight = sum > 0 ? Math.max(0, /** @type {number} */ (awayValue)) / sum : 0;
    const homeHeight = sum > 0 ? Math.max(0, /** @type {number} */ (homeValue)) / sum : 0;
    const awayBrand = brandFor(game.away_team);
    const homeBrand = brandFor(game.home_team);
    const label = available ? `BoardWise win probability: ${game.away_team?.name} ${percent(awayValue)}; ${game.home_team?.name} ${percent(homeValue)}` : `BoardWise win probability unavailable for ${matchupName(game)}`;
    const team = (side, value, expected, brand, classification) => `<section class="cfb-team" aria-label="${esc(side.name)}, expected score ${esc(score(expected))}, BoardWise win probability ${esc(percent(value))}">
      ${teamMark(side)}<h3>${esc(side.name || "Team")}</h3><p class="cfb-team__classification">${esc(classification || "College football")}</p>
      <div class="cfb-team__score tnum">${esc(score(expected))}<span>Expected score</span></div>
      <div class="cfb-team__prob tnum" style="color:${esc(brand.probabilityColor)}"><span>BoardWise probability</span>${esc(percent(value))}</div></section>`;
    return `<div class="cfb-matchup">${team(game.away_team, awayValue, forecast.expected_away_score, awayBrand, game.model_details?.away_classification)}
      <div class="cfb-probability" role="img" aria-label="${esc(label)}"><div class="cfb-probability__label">BoardWise probability</div>
        <div class="cfb-probability__track" aria-hidden="true"><span style="height:${(awayHeight * 100).toFixed(1)}%;background:${esc(awayBrand.probabilityColor)}"></span><span style="height:${(homeHeight * 100).toFixed(1)}%;background:${esc(homeBrand.probabilityColor)}"></span></div>
        <div class="cfb-probability__vs">VS</div><div class="cfb-probability__total">Total ${esc(score(forecast.expected_total))}</div></div>
      ${team(game.home_team, homeValue, forecast.expected_home_score, homeBrand, game.model_details?.home_classification)}</div>`;
  }

  function noCallSlot() {
    return `<div class="cfb-no-call" role="note"><p><strong>Recommendations are currently being evaluated in shadow.</strong> No BoardWise Call is published for this game.</p></div>`;
  }

  function gameHeader(game, badge = "Experimental forecast") {
    const status = game.lock_state === "locked" ? "Locked at kickoff" : String(game.status || "Scheduled");
    return `<header class="cfb-game-card__head"><div><p class="cfb-game-card__meta">${esc(when(game.kickoff_utc))} · ${esc(game.venue || "Venue unavailable")} · ${esc(status)}</p><h2>${esc(matchupName(game))}</h2>${game.forecast ? `<p class="cfb-game-card__meta">Forecast as of ${esc(when(game.model_details?.as_of))}</p>` : ""}</div><span class="cfb-experimental-badge">${esc(badge)}</span></header>`;
  }

  function unavailableCard(game) {
    return `<article class="cfb-game-card cfb-game-card--unavailable cfb-game-card--condensed" data-game-id="${esc(game.game_id)}">${gameHeader(game, "Forecast unavailable")}
      <div class="cfb-unavailable-matchup">${teamMark(game.away_team, true)}<strong>${esc(game.away_team?.name)}</strong><span>at</span>${teamMark(game.home_team, true)}<strong>${esc(game.home_team?.name)}</strong></div>
      <div class="cfb-unavailable-message"><strong>FORECAST UNAVAILABLE</strong><p>${esc(safeReason(game))}</p>${Array.isArray(game.reason_codes) && game.reason_codes.length > 1 ? `<details><summary>Why unavailable?</summary><p>More than one required source did not satisfy the current safe-release contract.</p></details>` : ""}</div></article>`;
  }

  function gameCard(game, full, season, week) {
    if (full && game.data_state === "unavailable") return unavailableCard(game);
    const groups = Array.isArray(game.markets) ? game.markets : [];
    const normalized = ["winner", "spread", "total"].map((market) => groups.find((group) => group.market === market)
      || { market, label: market[0].toUpperCase() + market.slice(1), offers: [] });
    const warning = game.data_state === "degraded" ? `<div class="cfb-warning"><strong>LIMITED FORECAST</strong><span>${esc(safeReason(game))} No recommendation is eligible.</span></div>` : "";
    return `<article class="cfb-game-card cfb-game-card--${esc(game.data_state || "unavailable")}" data-game-id="${esc(game.game_id)}">${gameHeader(game)}${warning}${matchup(game)}${full && game.forecast ? `${noCallSlot()}<div class="cfb-accordions">${normalized.map((group) => marketAccordion(group, game, season, week)).join("")}${modelAccordion(game, season, week)}</div>` : ""}</article>`;
  }

  function renderGroups(games, full, season, week) {
    return groupGames(games).map((date) => `<section class="cfb-date-group"><h2>${esc(date.label)}</h2><div class="cfb-game-grid">${date.times.map((time) => time.games.map((game) => `<section class="cfb-game-slot"><h3>${esc(time.label)}</h3>${gameCard(game, full, season, week)}</section>`).join("")).join("")}</div></section>`).join("");
  }

  function hideStates() {
    for (const element of [loadingEl, errorEl, accessEl, gamesEl]) if (element) element.hidden = true;
  }

  function showLoading() {
    hideStates();
    if (controlsEl) controlsEl.hidden = true;
    if (summaryEl) summaryEl.hidden = true;
    if (loadingEl) { loadingEl.hidden = false; loadingEl.setAttribute("aria-busy", "true"); }
    gamesEl?.setAttribute("aria-busy", "true");
  }

  function showAccess({ guest, count = 0, betaEnabled = true }) {
    hideStates();
    if (controlsEl) controlsEl.hidden = true;
    if (summaryEl) summaryEl.hidden = true;
    if (!accessEl) return;
    const title = betaEnabled ? "Founder access unlocks the forecast beta" : "The forecast beta is currently dark";
    const body = betaEnabled ? `${count} current-slate game${count === 1 ? " is" : "s are"} available as locked matchup shells. Forecast probabilities, scores, markets, and Model Details stay server-side until Founder access is verified.` : "College football is being prepared behind a release flag. No forecast values are available yet.";
    accessEl.innerHTML = `<strong>${esc(title)}</strong><p>${esc(body)}</p>${betaEnabled ? `<a class="bw-button bw-button--gold" href="${guest ? "/login/?return_to=/cfb/" : "/pricing/"}">${guest ? "Sign in" : "View Founder access"}</a>${guest ? `<a class="bw-button bw-button--secondary" href="/pricing/">Learn about Founder</a>` : ""}` : ""}`;
    accessEl.hidden = false;
  }

  function labelFor(options, key) { return options.find((option) => option.key === key)?.label || key; }

  function renderControls(games, season) {
    const counts = countFilters(games, activeFilters);
    if (weekEl) {
      weekEl.innerHTML = allowedWeeks.map((week) => `<option value="${week}"${week === activeFilters.week ? " selected" : ""}>${season} Season · Week ${week}</option>`).join("");
      weekEl.disabled = allowedWeeks.length === 1;
    }
    const classification = controlsEl?.querySelector('[data-filter-group="classification"]');
    const states = controlsEl?.querySelector('[data-filter-group="state"]');
    if (classification) classification.innerHTML = classificationOptions.map((option) => `<button type="button" data-filter="classification" data-value="${option.key}" aria-pressed="${activeFilters.classification === option.key}">${option.label} <span>${counts.classification[option.key]}</span></button>`).join("");
    if (states) states.innerHTML = stateOptions.map((option) => `<button type="button" data-filter="state" data-value="${option.key}" aria-pressed="${activeFilters.state === option.key}">${option.label} <span>${counts.state[option.key]}</span></button>`).join("");
    if (controlsEl) controlsEl.hidden = false;
    return counts;
  }

  function bindLogoFallbacks() {
    gamesEl?.querySelectorAll("img[data-team-logo]").forEach((image) => image.addEventListener("error", () => {
      const htmlImage = /** @type {HTMLImageElement} */ (image);
      htmlImage.hidden = true;
      const fallback = /** @type {HTMLElement | null} */ (image.parentElement?.querySelector(".cfb-team-fallback"));
      if (fallback) fallback.hidden = false;
      image.parentElement?.classList.add("logo-failed");
    }, { once: true }));
  }

  function bindAccordions(season, week) {
    gamesEl?.querySelectorAll("details.cfb-accordion").forEach((details) => details.addEventListener("toggle", () => {
      const htmlDetails = /** @type {HTMLDetailsElement} */ (details);
      const article = details.closest("[data-game-id]");
      const gameId = article?.getAttribute("data-game-id");
      const section = details.getAttribute("data-section");
      if (!gameId || !section) return;
      const state = accordionState(season, week);
      const gameState = state[gameId] || { market: null, model: false };
      if (section === "model") gameState.model = htmlDetails.open;
      else if (htmlDetails.open) {
        gameState.market = section;
        article.querySelectorAll("details.cfb-market[open]").forEach((other) => {
          if (other !== details) other.removeAttribute("open");
        });
      } else if (gameState.market === section) gameState.market = null;
      details.querySelector("summary")?.setAttribute("aria-expanded", String(htmlDetails.open));
      state[gameId] = gameState;
      writeAccordionState(season, week, state);
    }));
  }

  function bindMobileControlsVisibility() {
    if (!controlsEl || typeof window.matchMedia !== "function") return;
    const mobile = window.matchMedia("(max-width: 760px)");
    let lastY = window.scrollY;
    let direction = "";
    let distance = 0;
    let frame = 0;

    const show = () => controlsEl.classList.remove("cfb-controls--scroll-hidden");
    const update = () => {
      frame = 0;
      const currentY = Math.max(0, window.scrollY);
      const delta = currentY - lastY;
      lastY = currentY;
      if (!mobile.matches || controlsEl.hidden || currentY < 24
        || controlsEl.contains(document.activeElement)) {
        direction = "";
        distance = 0;
        show();
        return;
      }
      if (Math.abs(delta) < 1) return;

      const nextDirection = delta > 0 ? "down" : "up";
      if (nextDirection !== direction) {
        direction = nextDirection;
        distance = 0;
      }
      distance += Math.abs(delta);
      if (direction === "up" && distance >= 12) {
        show();
        distance = 0;
        return;
      }
      if (direction !== "down" || controlsEl.classList.contains("cfb-controls--scroll-hidden")) return;
      const top = Number.parseFloat(getComputedStyle(controlsEl).top) || 0;
      const isStuck = controlsEl.getBoundingClientRect().top <= top + 1;
      if (!isStuck) {
        distance = 0;
        return;
      }
      if (distance >= 72) {
        controlsEl.classList.add("cfb-controls--scroll-hidden");
        distance = 0;
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    mobile.addEventListener?.("change", () => {
      lastY = window.scrollY;
      direction = "";
      distance = 0;
      show();
    });
    controlsEl.addEventListener("focusin", show);
  }

  function updateUrl(replace = false) {
    const query = serializeFilters(activeFilters);
    window.history[replace ? "replaceState" : "pushState"]({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }

  function readCurrentSlateFilters(currentWeek) {
    activeFilters = parseFilters(window.location.search, [currentWeek], currentWeek);
    const requestedWeek = new URLSearchParams(window.location.search).get("week");
    if (requestedWeek !== null && requestedWeek !== String(currentWeek)) updateUrl(true);
  }

  function renderCachedBoard() {
    if (!payloadCache || !gamesEl) return;
    hideStates();
    const games = Array.isArray(payloadCache.games) ? payloadCache.games : [];
    const full = payloadCache.access === "full";
    const season = Number(payloadCache?.release?.season || payloadCache?.season || 0);
    const week = Number(activeFilters.week ?? payloadCache?.release?.week ?? payloadCache?.slate?.week ?? 0);
    let matching = games;
    let counts = countFilters(games, { classification: "all", state: "all" });
    if (full) { counts = renderControls(games, season); matching = applyFilters(games, activeFilters); }
    else if (controlsEl) controlsEl.hidden = true;
    if (slateEl) slateEl.textContent = `${season} · Week ${week} · ${games.length} game${games.length === 1 ? "" : "s"}`;
    if (updatedEl) updatedEl.textContent = when(payloadCache?.release?.released_at || payloadCache?.released_at);
    if (matchCountEl) matchCountEl.textContent = `${matching.length} matching game${matching.length === 1 ? "" : "s"}`;
    if (selectedFiltersEl) selectedFiltersEl.textContent = full ? `${labelFor(classificationOptions, activeFilters.classification)} · ${labelFor(stateOptions, activeFilters.state)}` : "Locked matchup preview";
    if (stateSummaryEl) stateSummaryEl.textContent = `${counts.state.complete} complete · ${counts.state.degraded} degraded · ${counts.state.unavailable} unavailable`;
    const next = sortGames(games).find((game) => validDate(game.kickoff_utc)
      && new Date(game.kickoff_utc).valueOf() >= Date.now());
    if (nextKickoffEl) nextKickoffEl.textContent = `Next kickoff ${next ? when(next.kickoff_utc) : "—"}`;
    if (summaryEl) summaryEl.hidden = false;
    if (!matching.length) {
      const classLabel = labelFor(classificationOptions, activeFilters.classification);
      const stateLabel = labelFor(stateOptions, activeFilters.state).toLowerCase();
      gamesEl.innerHTML = `<section class="cfb-empty-state"><strong>No ${esc(stateLabel)} ${esc(classLabel)} games are available for Week ${week}.</strong><p>Try another safe view of the current authorized slate.</p><button type="button" data-empty-action="all-states">Show all data states</button><button type="button" data-empty-action="reset">Reset filters</button></section>`;
    } else gamesEl.innerHTML = renderGroups(matching, full, season, week);
    gamesEl.hidden = false;
    gamesEl.setAttribute("aria-busy", "false");
    bindLogoFallbacks();
    if (full) bindAccordions(season, week);
  }

  function renderBoard(payload) {
    payloadCache = payload;
    const currentWeek = Number(payload?.release?.week ?? payload?.slate?.week ?? 0);
    allowedWeeks = [currentWeek];
    readCurrentSlateFilters(currentWeek);
    renderCachedBoard();
  }

  function showError(message) {
    hideStates();
    if (controlsEl) controlsEl.hidden = true;
    if (summaryEl) summaryEl.hidden = true;
    if (!errorEl) return;
    errorEl.innerHTML = `<div><strong>We could not load college football right now</strong><p>${esc(message)}</p><a class="bw-button bw-button--secondary" href="/cfb/">Try again</a></div>`;
    errorEl.hidden = false;
  }

  async function bootstrap() {
    showLoading();
    try {
      const [auth, landing] = await Promise.all([
        window.BoardWiseAuth.loadAuthState(), window.BoardWiseApi.getCfbLanding(),
      ]);
      if (slateEl) slateEl.textContent = `${landing.game_count} current-slate game${landing.game_count === 1 ? "" : "s"}`;
      if (updatedEl) updatedEl.textContent = when(landing.last_safe_update);
      if (!landing.beta_enabled) return showAccess({ guest: !auth.authenticated, betaEnabled: false });
      if (!auth.authenticated) return showAccess({ guest: true, count: landing.game_count });
      if (!window.BoardWiseAuth.hasFeature(auth, "cfb_board_basic")) return showAccess({ guest: false, count: landing.game_count });
      renderBoard(await window.BoardWiseApi.getCfbBoard());
    } catch (error) {
      if (error && error.status === 401) return showAccess({ guest: true });
      if (error && error.status === 404) return showAccess({ guest: false, betaEnabled: false });
      showError("The latest safe release could not be retrieved. No cached forecast values were displayed.");
    }
  }

  controlsEl?.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest("button"));
    if (!target) return;
    if (target.id === "cfb-reset-filters") activeFilters = { ...activeFilters, classification: DEFAULT_CLASSIFICATION, state: DEFAULT_STATE };
    else if (target.dataset.filter === "classification") activeFilters = { ...activeFilters, classification: target.dataset.value || DEFAULT_CLASSIFICATION };
    else if (target.dataset.filter === "state") activeFilters = { ...activeFilters, state: target.dataset.value || DEFAULT_STATE };
    else return;
    updateUrl(); renderCachedBoard();
  });

  gamesEl?.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest("button[data-empty-action]"));
    if (!target) return;
    activeFilters = target.dataset.emptyAction === "all-states"
      ? { ...activeFilters, state: "all" }
      : { ...activeFilters, classification: DEFAULT_CLASSIFICATION, state: DEFAULT_STATE };
    updateUrl(); renderCachedBoard(); byId("cfb-title")?.scrollIntoView({ block: "start" });
  });

  weekEl?.addEventListener("change", () => {
    const selected = Number(weekEl.value);
    if (selected === activeFilters.week) return;
    if (weekEl) weekEl.value = String(activeFilters.week);
  });

  window.addEventListener("popstate", () => {
    if (!payloadCache) return;
    const currentWeek = Number(payloadCache?.release?.week ?? payloadCache?.slate?.week ?? 0);
    readCurrentSlateFilters(currentWeek);
    renderCachedBoard();
  });

  window.__BoardWiseCfbTestHooks = {
    esc, finite, classificationBucket, sortGames, groupGames, parseFilters,
    serializeFilters, applyFilters, countFilters, selectionLabel, offersComparable,
    betterBookPair, quoteState, marketHeadline, gameCard, unavailableCard, renderBoard,
  };
  bindMobileControlsVisibility();
  void bootstrap();
})();
