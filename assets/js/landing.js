(function () {
  const CT_TIME_ZONE = "America/Chicago";
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setCta(anchor, { href, label }) {
    if (!anchor) return;
    anchor.setAttribute("href", href);
    anchor.textContent = label;
  }

  function gameCount(payload) {
    if (payload?.board && Number.isFinite(Number(payload.board.game_count))) {
      return Number(payload.board.game_count);
    }
    return payload && Array.isArray(payload.games) ? payload.games.length : 0;
  }

  function renderBoardCount(container, count, fallbackEl, fallback) {
    if (!container) {
      if (fallbackEl) fallbackEl.textContent = fallback;
      return;
    }
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) {
      container.setAttribute("hidden", "");
      if (fallbackEl) fallbackEl.textContent = fallback;
      return;
    }
    const strong = container.querySelector("strong");
    if (strong) strong.textContent = String(n);
    container.removeAttribute("hidden");
    if (fallbackEl) fallbackEl.textContent = `${n} game${n === 1 ? "" : "s"} on the board`;
  }

  function canLoadMlb(auth) {
    return Boolean(
      auth &&
      auth.authenticated &&
      window.BoardWiseAuth &&
      window.BoardWiseAuth.hasFeature(auth, "mlb_board_basic")
    );
  }

  function canLoadPerformance(auth) {
    return Boolean(
      auth &&
      auth.authenticated &&
      window.BoardWiseAuth &&
      window.BoardWiseAuth.hasFeature(auth, "performance_summary")
    );
  }

  function parseIsoCalendarDate(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day, 12));
  }

  function formatCalendarDate(value, options) {
    const date = parseIsoCalendarDate(value);
    if (!date) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: CT_TIME_ZONE,
      ...options,
    }).format(date);
  }

  function formatAmerican(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return number > 0 ? `+${number}` : String(number);
  }

  function formatPercentFraction(value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return `${(number * 100).toFixed(digits)}%`;
  }

  function formatSignedPercentFraction(value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return `${number >= 0 ? "+" : ""}${(number * 100).toFixed(digits)}%`;
  }

  function formatUnits(value, digits = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}u`;
  }

  function toneForNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number === 0) return "";
    return number > 0 ? "positive" : "negative";
  }

  function safeColor(value, fallback) {
    const text = String(value || "");
    return HEX_COLOR.test(text) ? text.toUpperCase() : fallback;
  }

  function teamBranding(featured) {
    if (!window.BoardWiseMlbBranding) {
      return {
        away: { fill: "#667085", textOnLight: "#667085" },
        home: { fill: "#13243C", textOnLight: "#11263B" },
      };
    }
    return window.BoardWiseMlbBranding.resolveMatchupBranding({
      away_team_abbr: featured?.away?.abbr,
      away_team: featured?.away?.team_name,
      home_team_abbr: featured?.home?.abbr,
      home_team: featured?.home?.team_name,
    });
  }

  function teamStyle(brand) {
    const color = safeColor(brand?.fill, "#667085");
    const probColor = safeColor(brand?.textOnLight, color);
    return `--team-color:${color};--team-prob-color:${probColor}`;
  }

  function probabilityPercent(team) {
    const number = Number(team?.win_probability);
    if (!Number.isFinite(number)) return 50;
    return Math.max(0, Math.min(100, number * 100));
  }

  function probabilityText(team) {
    return team?.win_probability_text || formatPercentFraction(team?.win_probability) || "N/A";
  }

  function probabilityMarkup(team) {
    const text = probabilityText(team);
    if (text.endsWith("%")) {
      return `${escapeHtml(text.slice(0, -1))}<span>%</span>`;
    }
    return escapeHtml(text);
  }

  function moneylineText(team) {
    const text = team?.moneyline_text || formatAmerican(team?.moneyline_american);
    return text ? `ML ${text}` : "ML N/A";
  }

  function gameMeta(featured, targetDate) {
    const dateLabel = formatCalendarDate(targetDate, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return [dateLabel, featured?.commence_time, featured?.venue]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" · ");
  }

  function metricClass(value) {
    const tone = toneForNumber(value);
    return tone ? ` ${tone}` : "";
  }

  function renderFeaturedChoice(pick) {
    if (!pick) {
      return `
        <div class="landing-preview__choice landing-preview__choice--empty">
          <div class="landing-preview__choice-head">
            <span class="landing-preview__choice-label">Today's board</span>
            <span class="landing-preview__choice-pill">Preview</span>
          </div>
          <div class="landing-preview__pick-main">No official play has been published for this slate yet.</div>
        </div>
      `;
    }

    const sportsbook = pick.sportsbook
      ? ` <span>&middot; ${escapeHtml(pick.sportsbook)}</span>`
      : "";
    const winText = pick.model_probability_text || formatPercentFraction(pick.model_probability) || "N/A";
    const edgeText = pick.edge_text || formatSignedPercentFraction(pick.probability_edge) || "N/A";
    const evText = pick.ev_text || formatUnits(pick.expected_value_per_unit) || "N/A";
    const priceText = pick.price_text || formatAmerican(pick.price_american) || "";
    const pill = pick.is_official ? "Official" : "Preview";

    return `
      <div class="landing-preview__choice">
        <div class="landing-preview__choice-head">
          <span class="landing-preview__choice-label">Wise Choice&trade;</span>
          <span class="landing-preview__choice-pill">${pill}</span>
        </div>
        <div class="landing-preview__pick">
          <div class="landing-preview__pick-main">${escapeHtml(pick.selection_text)}${sportsbook}</div>
          <div class="landing-preview__pick-price tnum">${escapeHtml(priceText)}</div>
        </div>
        <div class="landing-preview__metrics">
          <div class="landing-preview__metric">
            <div class="landing-preview__metric-label">Win</div>
            <div class="landing-preview__metric-value tnum">${escapeHtml(winText)}</div>
          </div>
          <div class="landing-preview__metric">
            <div class="landing-preview__metric-label">Edge</div>
            <div class="landing-preview__metric-value${metricClass(pick.probability_edge)} tnum">${escapeHtml(edgeText)}</div>
          </div>
          <div class="landing-preview__metric">
            <div class="landing-preview__metric-label">EV</div>
            <div class="landing-preview__metric-value${metricClass(pick.expected_value_per_unit)} tnum">${escapeHtml(evText)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderFeaturedMatchup(featured, targetDate) {
    const branding = teamBranding(featured);
    const away = featured.away || {};
    const home = featured.home || {};
    const awayPct = probabilityPercent(away);
    const homePct = probabilityPercent(home);
    const awayText = probabilityText(away);
    const homeText = probabilityText(home);
    const label = featured.pick?.is_official ? "Official" : "Preview";

    return `
      <article class="landing-preview" aria-labelledby="landing-featured-matchup">
        <div class="landing-preview__top">
          <div>
            <div class="landing-preview__meta tnum">${escapeHtml(gameMeta(featured, targetDate))}</div>
            <div id="landing-featured-matchup" class="landing-preview__matchup">${escapeHtml(featured.game_label)}</div>
          </div>
          <span class="landing-preview__label">${label}</span>
        </div>

        <div class="landing-preview__body">
          <div class="landing-preview__team" style="${teamStyle(branding.away)}">
            <div class="landing-preview__team-mark" aria-hidden="true">${escapeHtml(away.abbr || "AWY")}</div>
            <div class="landing-preview__team-name">${escapeHtml(away.short_name || away.team_name || "Away")}</div>
            <div class="landing-preview__prob tnum">${probabilityMarkup(away)}</div>
            <div class="landing-preview__odds tnum">${escapeHtml(moneylineText(away))}</div>
          </div>

          <div class="landing-preview__bar-wrap">
            <div class="landing-preview__bar" role="img" aria-label="${escapeHtml(`${away.short_name || away.team_name || "Away"} ${awayText}, ${home.short_name || home.team_name || "Home"} ${homeText}`)}">
              <div class="landing-preview__bar-away" style="height:${awayPct.toFixed(1)}%;background:${safeColor(branding.away?.fill, "#667085")}"></div>
              <div class="landing-preview__bar-home" style="height:${homePct.toFixed(1)}%;background:${safeColor(branding.home?.fill, "#13243C")}"></div>
            </div>
            <div class="landing-preview__vs">vs</div>
          </div>

          <div class="landing-preview__team" style="${teamStyle(branding.home)}">
            <div class="landing-preview__team-mark" aria-hidden="true">${escapeHtml(home.abbr || "HME")}</div>
            <div class="landing-preview__team-name">${escapeHtml(home.short_name || home.team_name || "Home")}</div>
            <div class="landing-preview__prob tnum">${probabilityMarkup(home)}</div>
            <div class="landing-preview__odds tnum">${escapeHtml(moneylineText(home))}</div>
          </div>
        </div>

        ${renderFeaturedChoice(featured.pick)}
      </article>
    `;
  }

  function showFeatured(featured, targetDate) {
    const loading = document.getElementById("landing-preview-loading");
    const preview = document.getElementById("landing-preview");
    const empty = document.getElementById("landing-preview-empty");
    if (loading) loading.setAttribute("hidden", "");
    if (empty) empty.setAttribute("hidden", "");
    if (!preview) return;
    preview.innerHTML = renderFeaturedMatchup(featured, targetDate);
    preview.dataset.state = "ready";
    preview.removeAttribute("hidden");
  }

  function showFeaturedEmpty(message) {
    const loading = document.getElementById("landing-preview-loading");
    const preview = document.getElementById("landing-preview");
    const empty = document.getElementById("landing-preview-empty");
    if (loading) loading.setAttribute("hidden", "");
    if (preview) {
      preview.innerHTML = "";
      preview.dataset.state = "empty";
      preview.setAttribute("hidden", "");
    }
    if (empty) {
      empty.textContent = message || "Today's featured matchup is not available yet.";
      empty.removeAttribute("hidden");
    }
  }

  function dateScopedPerformanceHref(results) {
    const date = encodeURIComponent(results.target_date);
    // This panel shows the Obsidian Steed (tracked, is_official=false) winners, so the
    // admin record link must open the tracking scope — performance_scope=official would
    // resolve to the classic/official record instead. The tracking scope is bound to
    // obsidian_steed on both the perf page and the API, so model_family is not needed.
    return `/performance/?sport=mlb&performance_scope=tracking&start_date=${date}&end_date=${date}&settled_only=true`;
  }

  function titleCase(value) {
    const text = String(value || "");
    return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "Settled";
  }

  function resultCardClass(status) {
    if (status === "win") return "is-win";
    if (status === "loss") return "is-loss";
    return "is-neutral";
  }

  function renderResultCard(highlight) {
    const status = String(highlight?.result_status || "").toLowerCase();
    const price = [highlight?.price_text, highlight?.bookmaker_abbr]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" · ");
    return `
      <article class="landing-result-card ${resultCardClass(status)}">
        <div class="landing-result-card__accent" aria-hidden="true"></div>
        <div class="landing-result-card__body">
          <div class="landing-result-card__head">
            <span class="landing-result-card__game">${escapeHtml(highlight?.game_label)}</span>
            <span class="landing-result-card__status">${escapeHtml(titleCase(status))}</span>
          </div>
          <div class="landing-result-card__selection">${escapeHtml(highlight?.selection_text)}</div>
          <div class="landing-result-card__price tnum">${escapeHtml(price)}</div>
          <div class="landing-result-card__units">
            <span>Units won</span>
            <strong class="tnum">${escapeHtml(formatUnits(highlight?.units_won))}</strong>
          </div>
        </div>
      </article>
    `;
  }

  function hideResults() {
    const section = document.getElementById("proof");
    const cards = document.getElementById("landing-results-cards");
    if (section) section.setAttribute("hidden", "");
    if (cards) cards.innerHTML = "";
    // Suppress the Admin-only record link too: a hidden panel must never leave a
    // (possibly stale) link to the concealed /performance/ dashboard exposed.
    const link = document.getElementById("landing-results-link");
    if (link) {
      link.setAttribute("hidden", "");
      link.removeAttribute("href");
    }
  }

  function renderResults(results, auth) {
    if (!results) {
      hideResults();
      return;
    }

    // Compute the wins-only highlights BEFORE deciding whether to reveal #proof.
    // Only the top bets that hit (wins) are shown \u2014 the API already ranks them
    // by units won, but filter defensively so a stale payload never renders a loss.
    const highlights = (Array.isArray(results.highlights) ? results.highlights : [])
      .filter((highlight) => String(highlight?.result_status || "").toLowerCase() === "win")
      .slice(0, 4);

    // A settled date with zero Obsidian winners (or a stale all-losses payload) must
    // not show an "Obsidian Steed winners" panel with an empty cards grid. Hide the
    // whole section and repoint the secondary CTA away from the now-hidden #proof,
    // mirroring the API-failure path.
    if (highlights.length === 0) {
      hideResults();
      setCta(document.getElementById("landing-secondary-cta"), {
        href: "#how",
        label: "How the model works",
      });
      return;
    }

    const section = document.getElementById("proof");
    const dateLabel = formatCalendarDate(results.target_date, { month: "short", day: "numeric" });
    const latest = results.is_yesterday ? "yesterday's" : "latest";
    const title = dateLabel ? `What hit on ${dateLabel}` : "Official results";

    if (section) section.removeAttribute("hidden");
    const kicker = document.getElementById("landing-results-kicker");
    if (kicker) kicker.textContent = `Obsidian Steed \u00b7 ${latest} winners`;
    const heading = document.getElementById("landing-results-title");
    if (heading) heading.textContent = title;

    const secondaryLabel = results.is_yesterday ? "See yesterday's results" : "See latest results";
    setCta(document.getElementById("landing-secondary-cta"), {
      href: "#proof",
      label: secondaryLabel,
    });

    const cards = document.getElementById("landing-results-cards");
    if (cards) {
      cards.innerHTML = highlights.map(renderResultCard).join("");
    }

    // Performance is concealed Admin-only. Only an admin (performance_summary)
    // may see or be linked to the tracked-record dashboard; never describe it
    // to, or route, guests / Free / Founder toward /performance/ (or send them
    // to /pricing or /login for it). The link starts hidden in the markup.
    const link = document.getElementById("landing-results-link");
    if (link) {
      if (canLoadPerformance(auth)) {
        link.setAttribute("href", dateScopedPerformanceHref(results));
        link.removeAttribute("hidden");
      } else {
        link.setAttribute("hidden", "");
        link.removeAttribute("href");
      }
    }
  }

  function renderLandingBoardCount(board) {
    const count = Number(board?.game_count || 0);
    renderBoardCount(
      document.getElementById("landing-mlb-count"),
      count,
      document.getElementById("landing-mlb-status"),
      "Today's model board"
    );
    const heroStatus = document.querySelector("#landing-hero-status span:last-child");
    if (heroStatus) {
      heroStatus.textContent = count > 0
        ? `${count} MLB game${count === 1 ? "" : "s"} on today's board`
        : "Daily MLB model board";
    }
  }

  async function hydrateLandingSnapshot(auth) {
    if (!window.BoardWiseApi || typeof window.BoardWiseApi.getMlbLanding !== "function") {
      showFeaturedEmpty("Today's featured matchup is not available yet.");
      hideResults();
      return;
    }

    try {
      const payload = /** @type {BoardWiseMlbLandingPayload} */ (await window.BoardWiseApi.getMlbLanding());
      const board = payload.board;
      renderLandingBoardCount(board);
      if (board.featured) {
        showFeatured(board.featured, board.target_date);
      } else {
        showFeaturedEmpty("Today's featured matchup is not available yet.");
      }
      renderResults(payload?.results || null, auth);
    } catch (_err) {
      renderBoardCount(
        document.getElementById("landing-mlb-count"),
        0,
        document.getElementById("landing-mlb-status"),
        "Today's model board"
      );
      const heroStatus = document.querySelector("#landing-hero-status span:last-child");
      if (heroStatus) heroStatus.textContent = "Daily MLB model board";
      showFeaturedEmpty("Today's featured matchup is not available yet.");
      hideResults();
      setCta(document.getElementById("landing-secondary-cta"), {
        href: "#how",
        label: "How the model works",
      });
    }
  }

  function updateCtas(auth) {
    const hasMlb = canLoadMlb(auth);
    const isAuthed = Boolean(auth && auth.authenticated);
    const primaryHref = hasMlb ? "/mlb/" : isAuthed ? "/pricing/" : "/login/?return_to=/mlb/";
    const primaryLabel = hasMlb ? "View today's MLB board" : isAuthed ? "View pricing" : "View today's MLB board";
    const mlbCard = document.getElementById("landing-mlb-card");
    if (mlbCard) mlbCard.setAttribute("href", primaryHref);
    const mlbCta = document.getElementById("landing-mlb-cta");
    if (mlbCta) mlbCta.textContent = hasMlb ? "Open board" : isAuthed ? "View pricing" : "Sign in to open";

    setCta(document.getElementById("landing-primary-cta"), {
      href: primaryHref,
      label: primaryLabel,
    });
    setCta(document.getElementById("landing-cta-primary"), {
      href: primaryHref,
      label: hasMlb ? "View today's board" : isAuthed ? "View pricing" : "Sign in to view the board",
    });
    setCta(document.getElementById("landing-cta-secondary"), {
      href: isAuthed ? "/account/" : "/pricing/",
      label: isAuthed ? "Manage account" : "View Founder access",
    });
  }

  async function init() {
    const auth = window.BoardWiseAuth
      ? await window.BoardWiseAuth.loadAuthState()
      : { authenticated: false, features: {} };
    updateCtas(auth);
    await hydrateLandingSnapshot(auth);
  }

  window.BoardWiseLanding = {
    canLoadMlb,
    gameCount,
    init,
  };

  init().catch(() => {});
})();
