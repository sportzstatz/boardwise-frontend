(function () {
  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function gateCard({ title, body, ctaText = "Join beta", ctaHref = "/pricing/" }) {
    return `
      <article class="gate-card" data-gate-card="true">
        <div class="gate-eyebrow">Locked feature</div>
        <h3>${esc(title)}</h3>
        <p>${esc(body)}</p>
        <a class="button primary" href="${esc(ctaHref)}">${esc(ctaText)}</a>
      </article>
    `;
  }

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  async function applyFeatureGates(root = document) {
    if (!window.BoardWiseAuth) return null;
    const auth = await window.BoardWiseAuth.loadAuthState();

    root.querySelectorAll("[data-auth-label]").forEach((el) => {
      el.textContent = window.BoardWiseAuth.displayName(auth);
    });

    root.querySelectorAll("[data-auth-guest]").forEach((el) => {
      setHidden(el, Boolean(auth.authenticated));
    });

    root.querySelectorAll("[data-auth-authenticated]").forEach((el) => {
      setHidden(el, !auth.authenticated);
    });

    root.querySelectorAll("[data-required-feature]").forEach((el) => {
      const featureKey = el.getAttribute("data-required-feature") || "";
      const allowed = window.BoardWiseAuth.hasFeature(auth, featureKey);
      if (allowed) {
        el.removeAttribute("hidden");
        return;
      }
      const title = el.getAttribute("data-gate-title") || "This section is gated";
      const body = el.getAttribute("data-gate-body") || "Sign in or join beta to access this BoardWise feature.";
      el.innerHTML = gateCard({ title, body });
      el.removeAttribute("hidden");
    });

    return auth;
  }

  window.BoardWiseGates = {
    applyFeatureGates,
    gateCard,
  };
})();