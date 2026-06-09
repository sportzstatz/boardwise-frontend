(function () {
  const form = /** @type {HTMLFormElement | null} */ (document.getElementById("login-form"));
  const msg = document.getElementById("login-message");
  const DEFAULT_RETURN_TO = "/account/";

  function setMessage(text, kind = "info") {
    if (!msg) return;
    msg.textContent = text;
    msg.dataset.kind = kind;
    msg.removeAttribute("hidden");
  }

  function hasControlCharacter(value) {
    return Array.from(value).some((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127;
    });
  }

  function safeReturnTo(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.includes("\\") || hasControlCharacter(raw)) return DEFAULT_RETURN_TO;
    if (raw.startsWith("/")) return safePath(raw);

    try {
      const parsed = new URL(raw);
      if (parsed.origin !== window.location.origin) return DEFAULT_RETURN_TO;
      return safePath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    } catch (_err) {
      return DEFAULT_RETURN_TO;
    }
  }

  function safePath(value) {
    if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_RETURN_TO;
    if (value.includes("\\") || hasControlCharacter(value)) return DEFAULT_RETURN_TO;
    return value;
  }

  function safeAssign(destination) {
    const safeDestination = safeReturnTo(destination);
    const target = new URL(safeDestination, window.location.origin);
    if (target.origin !== window.location.origin) {
      window.location.assign(DEFAULT_RETURN_TO);
      return;
    }
    window.location.assign(`${target.pathname}${target.search}${target.hash}`);
  }

  function scrubTokenFromUrl() {
    const current = new URL(window.location.href);
    current.searchParams.delete("token");

    const returnTo = safeReturnTo(
      current.searchParams.get("return_to") || DEFAULT_RETURN_TO
    );
    current.search = "";
    if (returnTo !== DEFAULT_RETURN_TO) {
      current.searchParams.set("return_to", returnTo);
    }

    const cleanPath = `${current.pathname}${current.search}${current.hash || ""}`;
    window.history.replaceState({}, document.title, cleanPath || "/login/");
  }

  function returnToFromParams(params) {
    return safeReturnTo(params.get("return_to") || DEFAULT_RETURN_TO);
  }

  function returnToFromUrl() {
    return returnToFromParams(new URLSearchParams(window.location.search));
  }

  function turnstileToken() {
    const input = /** @type {HTMLInputElement | null} */ (
      document.querySelector('input[name="cf-turnstile-response"]')
    );
    return input ? String(input.value || "").trim() : "";
  }

  function resetTurnstile() {
    if (window.turnstile && typeof window.turnstile.reset === "function") {
      window.turnstile.reset();
    }
  }

  /**
   * @param {unknown} error
   * @returns {error is BoardWiseApiErrorLike}
   */
  function isApiError(error) {
    return Boolean(error && typeof error === "object" && "status" in error);
  }

  async function verifyTokenIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return false;

    const destination = returnToFromParams(params);
    scrubTokenFromUrl();

    setMessage("Signing you in…");
    try {
      await window.BoardWiseApi.verifyMagicLink(token);
      safeAssign(destination);
      return true;
    } catch (err) {
      if (isApiError(err)) {
        setMessage(
          "That sign-in link is invalid or expired. Request a new link.",
          "error"
        );
        return true;
      }
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

    const token = turnstileToken();
    if (!token) {
      setMessage("Complete the human check, then try again.", "error");
      return;
    }

    setMessage("Sending sign-in link…");
    try {
      const body = await window.BoardWiseApi.startMagicLink({
        email,
        return_to: returnToFromUrl(),
        turnstile_token: token,
      });
      setMessage(
        body && body.message
          ? String(body.message)
          : "If that email can sign in or create an account, a link has been sent."
      );
      if (form) form.reset();
      resetTurnstile();
    } catch (_err) {
      resetTurnstile();
      setMessage("Could not request a sign-in link. Try again shortly.", "error");
    }
  }

  verifyTokenIfPresent().then((handled) => {
    if (!handled && form) form.addEventListener("submit", startLogin);
    if (window.BoardWiseGates) window.BoardWiseGates.applyFeatureGates();
  });
})();
