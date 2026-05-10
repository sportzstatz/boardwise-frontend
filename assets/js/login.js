(function () {
  const API_BASE = window.BOARDWISE_API_BASE || "https://api.useboardwise.com";
  const form = /** @type {HTMLFormElement | null} */ (document.getElementById("login-form"));
  const msg = document.getElementById("login-message");

  function setMessage(text, kind = "info") {
    if (!msg) return;
    msg.textContent = text;
    msg.dataset.kind = kind;
    msg.removeAttribute("hidden");
  }

  function safeReturnTo(value) {
    const raw = String(value || "").trim();
    if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")) {
      return raw;
    }
    return "/account/";
  }

  function scrubTokenFromUrl() {
    const current = new URL(window.location.href);
    current.searchParams.delete("token");

    const returnTo = safeReturnTo(
      current.searchParams.get("return_to") || "/account/"
    );
    current.search = "";
    if (returnTo !== "/account/") {
      current.searchParams.set("return_to", returnTo);
    }

    const cleanPath = `${current.pathname}${current.search}${current.hash || ""}`;
    window.history.replaceState({}, document.title, cleanPath || "/login/");
  }

  function returnToFromParams(params) {
    return safeReturnTo(params.get("return_to") || "/account/");
  }

  function returnToFromUrl() {
    return returnToFromParams(new URLSearchParams(window.location.search));
  }

  async function verifyTokenIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return false;

    const destination = returnToFromParams(params);
    scrubTokenFromUrl();

    setMessage("Signing you in…");
    try {
      const resp = await fetch(`${API_BASE}/api/v1/auth/magic-link/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!resp.ok) {
        setMessage(
          "That sign-in link is invalid or expired. Request a new link.",
          "error"
        );
        return true;
      }

      window.location.assign(destination);
      return true;
    } catch (_err) {
      setMessage(
        "Could not verify that sign-in link. Request a new link.",
        "error"
      );
      return true;
    }
  }

  async function startLogin(event) {
    event.preventDefault();
    const emailInput = /** @type {HTMLInputElement | null} */ (document.getElementById("email"));
    const email = emailInput ? String(emailInput.value || "").trim() : "";
    if (!email) return;

    setMessage("Sending sign-in link…");
    try {
      const resp = await fetch(`${API_BASE}/api/v1/auth/magic-link/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, return_to: returnToFromUrl() }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const body = await resp.json();
      setMessage(
        body.message || "If that email can sign in, a link has been sent."
      );
      if (form) form.reset();
    } catch (_err) {
      setMessage("Could not request a sign-in link. Try again shortly.", "error");
    }
  }

  verifyTokenIfPresent().then((handled) => {
    if (!handled && form) form.addEventListener("submit", startLogin);
    if (window.BoardWiseGates) window.BoardWiseGates.applyFeatureGates();
  });
})();
