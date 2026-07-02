(function () {
  const form = /** @type {HTMLFormElement | null} */ (document.getElementById("login-form"));
  const msg = document.getElementById("login-message");
  const DEFAULT_RETURN_TO = "/account/";
  const DEFAULT_SUBMIT_LABEL = "Send my sign-in link";
  let requestInFlight = false;

  function submitButton() {
    return /** @type {HTMLButtonElement | null} */ (
      document.getElementById("login-submit") ||
      (form ? form.querySelector('button[type="submit"]') : null)
    );
  }

  function submitLabel() {
    const button = submitButton();
    return button ? button.querySelector("[data-login-submit-label]") : null;
  }

  function setMessage(text, kind = "info") {
    if (!msg) return;
    msg.textContent = text;
    msg.dataset.kind = kind;
    msg.setAttribute("role", kind === "error" ? "alert" : "status");
    msg.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    msg.setAttribute("aria-atomic", "true");
    msg.removeAttribute("hidden");
  }

  function setFormAvailable(isAvailable) {
    if (!form) return;
    for (const control of form.querySelectorAll("input, button, select, textarea")) {
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLButtonElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) {
        control.disabled = !isAvailable;
      }
    }
    form.setAttribute("aria-busy", isAvailable ? "false" : "true");
  }

  function setSubmitting(isSubmitting, label = "Sending sign-in link…") {
    requestInFlight = isSubmitting;
    const button = submitButton();
    const labelEl = submitLabel();
    if (button) {
      button.disabled = isSubmitting;
      button.setAttribute("aria-busy", isSubmitting ? "true" : "false");
    }
    if (labelEl) labelEl.textContent = isSubmitting ? label : DEFAULT_SUBMIT_LABEL;
    else if (button) button.textContent = isSubmitting ? label : DEFAULT_SUBMIT_LABEL;
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
    setFormAvailable(false);
    try {
      await window.BoardWiseApi.verifyMagicLink(token);
      safeAssign(destination);
      return true;
    } catch (err) {
      setFormAvailable(true);
      if (isApiError(err)) {
        setMessage(
          "That sign-in link is invalid or expired. Request a new link.",
          "error"
        );
        return false;
      }
      setMessage(
        "Could not verify that sign-in link. Request a new link.",
        "error"
      );
      return false;
    }
  }

  async function startLogin(event) {
    event.preventDefault();
    if (requestInFlight) return;
    const emailInput = /** @type {HTMLInputElement | null} */ (document.getElementById("email"));
    const consentInput = /** @type {HTMLInputElement | null} */ (document.getElementById("login-consent"));
    if (consentInput && !consentInput.checked) {
      setMessage(
        "Please confirm you are at least 21, legally permitted to use BoardWise, and agree to the Terms before continuing.",
        "error"
      );
      if (typeof consentInput.reportValidity === "function") consentInput.reportValidity();
      return;
    }
    if (form && typeof form.checkValidity === "function" && !form.checkValidity()) {
      if (typeof form.reportValidity === "function") form.reportValidity();
      return;
    }
    const email = emailInput ? String(emailInput.value || "").trim() : "";
    if (!email) return;

    const token = turnstileToken();
    if (!token) {
      setMessage("Complete the human check, then try again.", "error");
      return;
    }

    setMessage("Sending sign-in link…");
    setSubmitting(true);
    try {
      const body = await window.BoardWiseApi.startMagicLink({
        email,
        return_to: returnToFromUrl(),
        turnstile_token: token,
      });
      setMessage(
        body && body.message
          ? String(body.message)
          : "If that email can sign in or create an account, a link has been sent.",
        "success"
      );
      if (form) form.reset();
      resetTurnstile();
    } catch (_err) {
      resetTurnstile();
      setMessage("Could not request a sign-in link. Try again shortly.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  verifyTokenIfPresent().then((redirecting) => {
    if (!redirecting && form) form.addEventListener("submit", startLogin);
    if (window.BoardWiseGates) window.BoardWiseGates.applyFeatureGates();
  });
})();
