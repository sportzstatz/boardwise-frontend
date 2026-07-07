// @ts-check
(function () {
  function noticeEl() {
    return document.getElementById("pricing-checkout-notice");
  }

  /**
   * @param {string} message
   */
  function showNotice(message) {
    const el = noticeEl();
    if (!el) return;
    el.textContent = message;
    el.removeAttribute("hidden");
  }

  function hideNotice() {
    const el = noticeEl();
    if (!el) return;
    el.setAttribute("hidden", "");
  }

  /**
   * Test seam: jsdom cannot spy on window.location.assign, so tests inject
   * window.BoardWiseNavigate instead.
   * @param {string} url
   */
  function navigateTo(url) {
    if (typeof window.BoardWiseNavigate === "function") {
      window.BoardWiseNavigate(url);
      return;
    }
    window.location.assign(url);
  }

  function checkoutCanceled() {
    try {
      return new URLSearchParams(window.location.search).get("checkout") === "canceled";
    } catch (_err) {
      return false;
    }
  }

  /**
   * @param {HTMLButtonElement} button
   */
  async function startCheckout(button) {
    hideNotice();
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
    try {
      const api = window.BoardWiseApi;
      if (!api) throw new Error("BoardWiseApi unavailable");
      const result = await api.createBillingCheckout();
      const url = result && typeof result.checkout_url === "string" ? result.checkout_url : "";
      if (!url) throw new Error("missing checkout_url");
      navigateTo(url);
      return;
    } catch (err) {
      button.removeAttribute("aria-busy");
      button.disabled = false;
      const status = err && typeof (/** @type {any} */ (err).status) === "number"
        ? /** @type {any} */ (err).status
        : 0;
      if (status === 409) {
        // already_founder / subscription_exists: billing status and the
        // Customer Portal live on the account page.
        navigateTo("/account/");
        return;
      }
      if (status === 401) {
        navigateTo(`/login/?return_to=${encodeURIComponent("/pricing/")}`);
        return;
      }
      if (status === 403) {
        showNotice(
          "Verify your email address before starting checkout. Open the most recent BoardWise sign-in email, or sign in again to receive a new one."
        );
        return;
      }
      showNotice(
        "Checkout is not available right now. Please try again shortly or contact support@useboardwise.com."
      );
    }
  }

  const button = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("pricing-checkout-button")
  );
  if (button) {
    button.addEventListener("click", () => {
      startCheckout(button);
    });
  }

  if (checkoutCanceled()) {
    showNotice("Checkout canceled — you have not been charged.");
  }
})();
