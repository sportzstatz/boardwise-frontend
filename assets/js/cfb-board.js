// @ts-check
(function () {
  const loadingEl = document.getElementById("cfb-loading");
  const errorEl = document.getElementById("cfb-error");
  const accessEl = document.getElementById("cfb-access");
  const gamesEl = document.getElementById("cfb-games");
  const slateEl = document.getElementById("cfb-slate");
  const updatedEl = document.getElementById("cfb-updated");
  const TIME_ZONE = "America/Chicago";

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function finite(value) {
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
    if (number === null) return "—";
    return `${number > 0 ? "+" : ""}${number.toFixed(1)}`;
  }

  function line(value) {
    const number = finite(value);
    if (number === null) return "";
    return number > 0 ? `+${number}` : String(number);
  }

  function american(value) {
    const number = finite(value);
    if (number === null) return "—";
    return number > 0 ? `+${Math.round(number)}` : String(Math.round(number));
  }

  function when(value, includeDate = true) {
    if (!value) return "—";
    const date = new Date(String(value));
    if (Number.isNaN(date.valueOf())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      ...(includeDate ? { weekday: "short", month: "short", day: "numeric" } : {}),
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  }

  function teamInitials(team) {
    const abbr = String(team?.abbreviation || "").trim();
    if (abbr) return abbr.slice(0, 4).toUpperCase();
    return String(team?.name || "Team")
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
  }

  function dataStateText(state) {
    if (state === "complete") return "Complete forecast inputs";
    if (state === "degraded") return "Degraded forecast inputs";
    return "Forecast unavailable";
  }

  function stateWarning(game) {
    if (game.data_state === "degraded") {
      return `<p class="cfb-warning"><strong>Degraded data:</strong> this card retains only values approved by the release policy. Treat the forecast with extra caution.</p>`;
    }
    if (game.data_state === "unavailable") {
      return `<p class="cfb-warning"><strong>Forecast unavailable:</strong> required model inputs did not meet the beta release contract. No probability has been fabricated.</p>`;
    }
    return "";
  }

  function offerLabel(offer) {
    const selection = String(offer?.selection || "Offer");
    const exactLine = line(offer?.current_line);
    return exactLine ? `${selection} ${exactLine}` : selection;
  }

  function offersComparable(left, right) {
    if (!left || !right) return false;
    return String(left.selection || "") === String(right.selection || "")
      && finite(left.current_line) === finite(right.current_line)
      && finite(left.current_price_american) !== null
      && finite(right.current_price_american) !== null;
  }

  function betterBook(offers) {
    const dk = offers.filter((offer) => offer.bookmaker === "draftkings");
    const fd = offers.filter((offer) => offer.bookmaker === "fanduel");
    if (dk.length !== 1 || fd.length !== 1 || !offersComparable(dk[0], fd[0])) return null;
    const dkPrice = finite(dk[0].current_price_american);
    const fdPrice = finite(fd[0].current_price_american);
    if (dkPrice === fdPrice) return null;
    return /** @type {number} */ (dkPrice) > /** @type {number} */ (fdPrice)
      ? "draftkings"
      : "fanduel";
  }

  function offerCard(offer) {
    const marketState = String(offer.market_state || "unavailable");
    const original = offer.original_price_american == null
      ? "Not retained"
      : `${line(offer.original_line)} ${american(offer.original_price_american)}`.trim();
    return `
      <div class="cfb-offer">
        <div><span class="cfb-offer__selection">${esc(offerLabel(offer))}</span><span class="cfb-offer__price">${esc(american(offer.current_price_american))}</span></div>
        <div class="cfb-offer__facts">
          <span>Model probability<strong>${esc(percent(offer.model_probability))}</strong></span>
          <span>Same-book no-vig<strong>${esc(percent(offer.same_book_no_vig_probability))}</strong></span>
          <span>Push probability<strong>${esc(percent(offer.push_probability))}</strong></span>
          <span>Original offer<strong>${esc(original)}</strong></span>
          <span>Quote state<strong>${esc(marketState)}</strong></span>
        </div>
        <p class="cfb-offer__freshness">Current quote: ${esc(when(offer.current_captured_at))}${offer.original_captured_at ? ` · Open: ${esc(when(offer.original_captured_at))}` : ""}</p>
      </div>`;
  }

  function bookCard(book, offers, better) {
    const label = book === "draftkings" ? "DraftKings" : "FanDuel";
    const validOffers = offers.filter((offer) => offer.bookmaker === book);
    const betterLabel = better === book ? `<span class="cfb-book__better">Better exact price</span>` : "";
    return `
      <section class="cfb-book${better === book ? " cfb-book--better" : ""}" aria-label="${label} offers">
        <div class="cfb-book__head"><span class="cfb-book__name">${label}</span>${betterLabel}</div>
        ${validOffers.length ? validOffers.map(offerCard).join("") : `<p class="cfb-market-note">No current ${label} offer passed the release contract.</p>`}
      </section>`;
  }

  function marketAccordion(group, gameId) {
    const offers = Array.isArray(group?.offers) ? group.offers : [];
    const better = betterBook(offers);
    const state = offers.length ? `${offers.length} exact offer${offers.length === 1 ? "" : "s"}` : "Unavailable";
    return `
      <details class="cfb-accordion cfb-market" data-market="${esc(group?.market || "unknown")}">
        <summary aria-label="${esc(group?.label || "Market")} market for game ${esc(gameId)}. ${esc(state)}. Expand exact sportsbook offers.">
          <span><span class="cfb-accordion__title">${esc(group?.label || "Market")}</span><span class="cfb-accordion__state">${esc(state)}</span></span>
        </summary>
        <div class="cfb-accordion__body">
          ${offers.length ? `<div class="cfb-book-grid">${bookCard("draftkings", offers, better)}${bookCard("fanduel", offers, better)}</div>` : `<p class="cfb-market-note">This market is missing, stale, incomplete, or unavailable in the current safe release.</p>`}
        </div>
      </details>`;
  }

  function quantileSummary(quantiles) {
    if (!quantiles || typeof quantiles !== "object" || Array.isArray(quantiles)) return "Not retained";
    const entries = Object.entries(quantiles).slice(0, 6);
    return entries.length
      ? entries.map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`).join(" · ")
      : "Not retained";
  }

  function modelAccordion(game) {
    const forecast = game.forecast || {};
    const details = game.model_details || {};
    return `
      <details class="cfb-accordion cfb-model-details">
        <summary aria-label="Model Details for ${esc(game.away_team?.name)} at ${esc(game.home_team?.name)}. Expand Founder-safe forecast context.">
          <span><span class="cfb-accordion__title">Model Details</span><span class="cfb-accordion__state">Founder-safe context</span></span>
        </summary>
        <div class="cfb-accordion__body">
          <dl class="cfb-model-grid">
            <div><dt>Model</dt><dd>${esc(details.model_name || "Round House")}</dd></div>
            <div><dt>Expected score</dt><dd>${esc(game.away_team?.abbreviation || "Away")} ${esc(score(forecast.expected_away_score))} · ${esc(game.home_team?.abbreviation || "Home")} ${esc(score(forecast.expected_home_score))}</dd></div>
            <div><dt>Expected margin</dt><dd>Home ${esc(signed(forecast.expected_margin_home))}</dd></div>
            <div><dt>Expected total</dt><dd>${esc(score(forecast.expected_total))}</dd></div>
            <div><dt>Distribution summary</dt><dd>${esc(quantileSummary(forecast.retained_quantiles))}</dd></div>
            <div><dt>Data state</dt><dd>${esc(dataStateText(game.data_state))}</dd></div>
            <div><dt>Team classification</dt><dd>${esc(game.away_team?.name)}: ${esc(details.away_classification || "Not retained")} · ${esc(game.home_team?.name)}: ${esc(details.home_classification || "Not retained")}</dd></div>
            <div><dt>Forecast as of</dt><dd>${esc(when(details.as_of))}</dd></div>
            <div><dt>Release context</dt><dd>Experimental · Forecast only · No selections</dd></div>
          </dl>
          <p class="cfb-model-limit"><strong>Known limitation:</strong> College football forecasts are undergoing prospective evaluation. Inputs, uncertainty coverage, and market alignment may be incomplete. This forecast is not a BoardWise Call.</p>
        </div>
      </details>`;
  }

  function matchup(game) {
    const forecast = game.forecast;
    if (!forecast) {
      return `<div class="cfb-locked-game"><h3>${esc(game.away_team?.name)} at ${esc(game.home_team?.name)}</h3><p>${game.data_state === "unavailable" ? "The current release has no forecast values for this game." : "Founder access is required to view the experimental forecast values and market offers."}</p></div>`;
    }
    const awayProbability = Math.max(0, Math.min(1, finite(forecast.away_win_probability) ?? .5));
    const homeProbability = Math.max(0, Math.min(1, finite(forecast.home_win_probability) ?? (1 - awayProbability)));
    return `
      <div class="cfb-matchup">
        <section class="cfb-team" aria-label="${esc(game.away_team?.name)}, expected score ${esc(score(forecast.expected_away_score))}, win probability ${esc(percent(forecast.away_win_probability))}">
          <div class="cfb-team-mark" aria-hidden="true">${esc(teamInitials(game.away_team))}</div>
          <h3>${esc(game.away_team?.name || "Away team")}</h3>
          <p class="cfb-team__classification">${esc(game.model_details?.away_classification || "College football")}</p>
          <div class="cfb-team__score tnum">${esc(score(forecast.expected_away_score))}<span>Expected score</span></div>
          <div class="cfb-team__prob tnum">${esc(percent(forecast.away_win_probability))}</div>
        </section>
        <div class="cfb-probability" role="img" aria-label="Win probability: ${esc(game.away_team?.name)} ${esc(percent(forecast.away_win_probability))}; ${esc(game.home_team?.name)} ${esc(percent(forecast.home_win_probability))}">
          <div class="cfb-probability__label">Win prob</div>
          <div class="cfb-probability__track" aria-hidden="true"><span class="cfb-probability__away" style="height:${(awayProbability * 100).toFixed(1)}%"></span><span class="cfb-probability__home" style="height:${(homeProbability * 100).toFixed(1)}%"></span></div>
          <div class="cfb-probability__vs">VS</div>
          <div class="cfb-probability__total">Total ${esc(score(forecast.expected_total))}</div>
        </div>
        <section class="cfb-team" aria-label="${esc(game.home_team?.name)}, expected score ${esc(score(forecast.expected_home_score))}, win probability ${esc(percent(forecast.home_win_probability))}">
          <div class="cfb-team-mark" aria-hidden="true">${esc(teamInitials(game.home_team))}</div>
          <h3>${esc(game.home_team?.name || "Home team")}</h3>
          <p class="cfb-team__classification">${esc(game.model_details?.home_classification || "College football")}</p>
          <div class="cfb-team__score tnum">${esc(score(forecast.expected_home_score))}<span>Expected score</span></div>
          <div class="cfb-team__prob tnum">${esc(percent(forecast.home_win_probability))}</div>
        </section>
      </div>`;
  }

  function noCallSlot() {
    return `
      <div class="cfb-no-call">
        <div class="cfb-no-call__slot">BoardWise Call · Not published</div>
        <p><strong>Recommendations are currently being evaluated in shadow.</strong></p>
        <p>No BoardWise Call is published for this game.</p>
      </div>`;
  }

  function gameCard(game, full) {
    const groups = Array.isArray(game.markets) ? game.markets : [];
    const marketNames = ["winner", "spread", "total"];
    const normalizedGroups = marketNames.map((market) => (
      groups.find((group) => group.market === market)
      || { market, label: market[0].toUpperCase() + market.slice(1), offers: [] }
    ));
    const title = `${game.away_team?.name || "Away team"} at ${game.home_team?.name || "Home team"}`;
    const status = game.lock_state === "locked" ? "Locked at kickoff" : String(game.status || "Scheduled");
    return `
      <article class="cfb-game-card cfb-game-card--${esc(game.data_state || "unavailable")}" data-game-id="${esc(game.game_id)}">
        <header class="cfb-game-card__head">
          <div><p class="cfb-game-card__meta">${esc(when(game.kickoff_utc))} · ${esc(game.venue || "Venue unavailable")} · ${esc(status)}</p><h2>${esc(title)}</h2></div>
          <span class="cfb-experimental-badge">Experimental forecast</span>
        </header>
        ${stateWarning(game)}
        ${matchup(game)}
        ${noCallSlot()}
        ${full && game.forecast ? `<div class="cfb-accordions">${normalizedGroups.map((group) => marketAccordion(group, game.game_id)).join("")}${modelAccordion(game)}</div>` : ""}
      </article>`;
  }

  function hideStates() {
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) errorEl.hidden = true;
    if (accessEl) accessEl.hidden = true;
    if (gamesEl) gamesEl.hidden = true;
  }

  function showAccess({ guest, count = 0, betaEnabled = true }) {
    hideStates();
    if (!accessEl) return;
    const title = betaEnabled ? "Founder access unlocks the forecast beta" : "The forecast beta is currently dark";
    const body = betaEnabled
      ? `${count} current-slate game${count === 1 ? " is" : "s are"} available as locked matchup shells. Forecast probabilities, scores, markets, and Model Details stay server-side until Founder access is verified.`
      : "College football is being prepared behind a release flag. No forecast values are available yet.";
    accessEl.innerHTML = `<strong>${esc(title)}</strong><p>${esc(body)}</p>${betaEnabled ? `<a class="bw-button bw-button--gold" href="${guest ? "/login/?return_to=/cfb/" : "/pricing/"}">${guest ? "Sign in" : "View Founder access"}</a>${guest ? `<a class="bw-button bw-button--secondary" href="/pricing/">Learn about Founder</a>` : ""}` : ""}`;
    accessEl.hidden = false;
  }

  function renderBoard(payload) {
    hideStates();
    const games = Array.isArray(payload?.games) ? payload.games : [];
    const full = payload?.access === "full";
    if (slateEl) slateEl.textContent = payload?.release?.season && payload?.release?.week !== null
      ? `${payload.release.season} · Week ${payload.release.week} · ${games.length} game${games.length === 1 ? "" : "s"}`
      : `Current week · ${games.length} game${games.length === 1 ? "" : "s"}`;
    if (updatedEl) updatedEl.textContent = when(payload?.release?.released_at);
    if (!gamesEl) return;
    if (!games.length) {
      gamesEl.innerHTML = `<section class="cfb-state-card"><div><strong>No current-slate forecast is available</strong><p>The safe release has no games to show. Check back after the next scheduled runtime cycle.</p></div></section>`;
    } else {
      gamesEl.innerHTML = games.map((game) => gameCard(game, full)).join("");
    }
    gamesEl.hidden = false;
  }

  function showError(message) {
    hideStates();
    if (!errorEl) return;
    errorEl.innerHTML = `<div><strong>We could not load college football right now</strong><p>${esc(message)}</p><a class="bw-button bw-button--secondary" href="/cfb/">Try again</a></div>`;
    errorEl.hidden = false;
  }

  async function bootstrap() {
    try {
      const [auth, landing] = await Promise.all([
        window.BoardWiseAuth.loadAuthState(),
        window.BoardWiseApi.getCfbLanding(),
      ]);
      if (slateEl) slateEl.textContent = `${landing.game_count} current-slate game${landing.game_count === 1 ? "" : "s"}`;
      if (updatedEl) updatedEl.textContent = when(landing.last_safe_update);
      if (!landing.beta_enabled) {
        showAccess({ guest: !auth.authenticated, betaEnabled: false });
        return;
      }
      if (!auth.authenticated) {
        showAccess({ guest: true, count: landing.game_count });
        return;
      }
      if (!window.BoardWiseAuth.hasFeature(auth, "cfb_board_basic")) {
        showAccess({ guest: false, count: landing.game_count });
        return;
      }
      renderBoard(await window.BoardWiseApi.getCfbBoard());
    } catch (err) {
      if (err && err.status === 401) {
        showAccess({ guest: true });
        return;
      }
      if (err && err.status === 404) {
        showAccess({ guest: false, betaEnabled: false });
        return;
      }
      showError("The latest safe release could not be retrieved. No cached forecast values were displayed.");
    }
  }

  (/** @type {any} */ (window)).__BoardWiseCfbTestHooks = {
    esc,
    offersComparable,
    betterBook,
    gameCard,
    renderBoard,
  };
  void bootstrap();
})();
