(function () {
  function setCta(anchor, { href, label }) {
    if (!anchor) return;
    anchor.setAttribute("href", href);
    anchor.textContent = label;
  }

  function gameCount(payload) {
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

  async function hydrateNhlBoard() {
    if (!window.BoardWiseApi || typeof window.BoardWiseApi.getNhlBoard !== "function") return;
    try {
      const payload = await window.BoardWiseApi.getNhlBoard();
      renderBoardCount(
        document.getElementById("landing-nhl-count"),
        gameCount(payload),
        document.getElementById("landing-nhl-status"),
        "Current hockey board"
      );
    } catch (_err) {
      renderBoardCount(
        document.getElementById("landing-nhl-count"),
        0,
        document.getElementById("landing-nhl-status"),
        "Current hockey board"
      );
    }
  }

  async function hydrateMlbBoard(auth) {
    if (!canLoadMlb(auth)) return;
    if (!window.BoardWiseApi || typeof window.BoardWiseApi.getMlbBoard !== "function") return;
    try {
      const payload = await window.BoardWiseApi.getMlbBoard();
      const count = gameCount(payload);
      renderBoardCount(
        document.getElementById("landing-mlb-count"),
        count,
        document.getElementById("landing-mlb-status"),
        "Today's model board"
      );
      const heroStatus = document.querySelector("#landing-hero-status span:last-child");
      if (heroStatus && count > 0) {
        heroStatus.textContent = `${count} MLB game${count === 1 ? "" : "s"} on today's board`;
      }
    } catch (_err) {
      renderBoardCount(
        document.getElementById("landing-mlb-count"),
        0,
        document.getElementById("landing-mlb-status"),
        "Today's model board"
      );
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
      label: isAuthed ? "Manage account" : "Join the beta",
    });

    if (window.BoardWiseAuth && window.BoardWiseAuth.hasFeature(auth, "performance_summary")) {
      setCta(document.getElementById("landing-proof-cta"), {
        href: "/performance/",
        label: "Open performance",
      });
    }
  }

  async function init() {
    const auth = window.BoardWiseAuth
      ? await window.BoardWiseAuth.loadAuthState()
      : { authenticated: false, features: {} };
    updateCtas(auth);
    await Promise.all([
      hydrateNhlBoard(),
      hydrateMlbBoard(auth),
    ]);
  }

  window.BoardWiseLanding = {
    canLoadMlb,
    gameCount,
    init,
  };

  init().catch(() => {});
})();
