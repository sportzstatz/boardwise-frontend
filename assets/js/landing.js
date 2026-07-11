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

  function formatUnits(value, digits = 2) {
    if (value === null || value === undefined || value === "") return "";
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}u`;
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
    return `--team-color:${color}`;
  }

  // Same logo-mark pattern as the game detail page: <img data-team-logo>
  // inside the circle with the abbreviation as fallback. bindLogoFallbacks
  // (called after render) collapses a failed SVG back to the colored circle.
  function teamMark(team, sideBranding, fallbackAbbr) {
    const abbr = team?.abbr || fallbackAbbr;
    const logoPath = sideBranding?.brand?.logoPath || "";
    const logo = logoPath
      ? `<img class="landing-preview__team-logo" data-team-logo src="${escapeHtml(logoPath)}" alt="" width="34" height="34" decoding="async">`
      : "";
    return `
      <div class="landing-preview__team-mark${logoPath ? " has-logo" : ""}" data-team-logo-mark aria-hidden="true">
        ${logo}
        <span class="landing-preview__team-fallback">${escapeHtml(abbr)}</span>
      </div>
    `;
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

  function renderFeaturedMatchup(featured, targetDate) {
    const branding = teamBranding(featured);
    const away = featured.away || {};
    const home = featured.home || {};

    return `
      <article class="landing-preview" aria-labelledby="landing-featured-matchup">
        <div class="landing-preview__top">
          <div>
            <div class="landing-preview__meta tnum">${escapeHtml(gameMeta(featured, targetDate))}</div>
            <div id="landing-featured-matchup" class="landing-preview__matchup">${escapeHtml(featured.game_label)}</div>
          </div>
          <span class="landing-preview__label">Today's matchup</span>
        </div>

        <div class="landing-preview__body">
          <div class="landing-preview__team" style="${teamStyle(branding.away)}">
            ${teamMark(away, branding.away, "AWY")}
            <div class="landing-preview__team-name">${escapeHtml(away.short_name || away.team_name || "Away")}</div>
          </div>

          <div class="landing-preview__bar-wrap">
            <div class="landing-preview__vs">at</div>
          </div>

          <div class="landing-preview__team" style="${teamStyle(branding.home)}">
            ${teamMark(home, branding.home, "HME")}
            <div class="landing-preview__team-name">${escapeHtml(home.short_name || home.team_name || "Home")}</div>
          </div>
        </div>
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
    if (window.BoardWiseMlbBranding && typeof window.BoardWiseMlbBranding.bindLogoFallbacks === "function") {
      window.BoardWiseMlbBranding.bindLogoFallbacks(preview);
    }
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
    // This panel shows the Obsidian Steed tracked aggregate, so the
    // admin record link must open the tracking scope — performance_scope=official would
    // resolve to the classic/official record instead. The tracking scope is bound to
    // obsidian_steed on both the perf page and the API, so model_family is not needed.
    return `/performance/?sport=mlb&performance_scope=tracking&start_date=${date}&end_date=${date}&settled_only=true`;
  }

  function aggregateRecord(summary) {
    if (summary.record !== null && summary.record !== undefined && String(summary.record).trim()) {
      return String(summary.record);
    }
    if (summary.wins === null || summary.wins === undefined || summary.wins === "") return "—";
    if (summary.losses === null || summary.losses === undefined || summary.losses === "") return "—";
    const wins = Number(summary.wins);
    const losses = Number(summary.losses);
    if (!Number.isFinite(wins) || !Number.isFinite(losses)) return "—";
    const pushes = Number(summary.pushes);
    return Number.isFinite(pushes) && pushes > 0
      ? `${wins}-${losses}-${pushes}`
      : `${wins}-${losses}`;
  }

  function aggregateRoi(summary) {
    const hasExplicit = summary.roi_pct !== null && summary.roi_pct !== undefined && summary.roi_pct !== "";
    const hasFraction = summary.roi !== null && summary.roi !== undefined && summary.roi !== "";
    const explicit = hasExplicit ? Number(summary.roi_pct) : Number.NaN;
    const percent = Number.isFinite(explicit)
      ? explicit
      : (hasFraction ? Number(summary.roi) * 100 : Number.NaN);
    if (!Number.isFinite(percent)) return "—";
    return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
  }

  function resultMetric(label, value) {
    return `
      <article class="landing-result-card landing-result-stat">
        <span class="landing-result-stat__label">${escapeHtml(label)}</span>
        <strong class="landing-result-stat__value tnum">${escapeHtml(value)}</strong>
      </article>
    `;
  }

  function renderAggregateResults(summary) {
    const hasPicks = summary.pick_count !== null && summary.pick_count !== undefined && summary.pick_count !== "";
    const picks = hasPicks ? Number(summary.pick_count) : Number.NaN;
    return [
      resultMetric("Record", aggregateRecord(summary)),
      resultMetric("Picks", Number.isFinite(picks) ? String(picks) : "—"),
      resultMetric("Units", formatUnits(summary.units_won) || "—"),
      resultMetric("ROI", aggregateRoi(summary)),
    ].join("");
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
    const summary = results && results.summary && typeof results.summary === "object"
      ? results.summary
      : null;
    if (!results || !summary) {
      hideResults();
      return;
    }

    const section = document.getElementById("proof");
    const dateLabel = formatCalendarDate(results.target_date, { month: "short", day: "numeric" });
    const latest = results.is_yesterday ? "yesterday's" : "latest";
    const title = dateLabel ? `Results for ${dateLabel}` : "Latest results";

    if (section) section.removeAttribute("hidden");
    const kicker = document.getElementById("landing-results-kicker");
    if (kicker) kicker.textContent = `Obsidian Steed \u00b7 ${latest} results`;
    const heading = document.getElementById("landing-results-title");
    if (heading) heading.textContent = title;

    const secondaryLabel = results.is_yesterday ? "See yesterday's results" : "See latest results";
    setCta(document.getElementById("landing-secondary-cta"), {
      href: "#proof",
      label: secondaryLabel,
    });

    const cards = document.getElementById("landing-results-cards");
    if (cards) {
      cards.innerHTML = renderAggregateResults(summary);
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
