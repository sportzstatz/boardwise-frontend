import { afterEach, describe, expect, it, vi } from "vitest";

function apiError(status) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

async function loadPricingPage({
  url = "/pricing/",
  createBillingCheckout = vi.fn(),
} = {}) {
  vi.resetModules();
  window.history.pushState({}, "", url);

  document.body.innerHTML = `
    <p id="pricing-checkout-notice" hidden></p>
    <button id="pricing-checkout-button" type="button" data-auth-authenticated hidden>Become a Founder</button>
  `;

  const navigate = vi.fn();
  window.BoardWiseNavigate = navigate;
  window.BoardWiseApi = /** @type {any} */ ({ createBillingCheckout });

  await import("../assets/js/pricing.js");

  return {
    navigate,
    createBillingCheckout,
    button: /** @type {HTMLButtonElement} */ (
      document.getElementById("pricing-checkout-button")
    ),
    notice: /** @type {HTMLElement} */ (
      document.getElementById("pricing-checkout-notice")
    ),
  };
}

function settle() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete window.BoardWiseApi;
  delete window.BoardWiseNavigate;
  document.body.innerHTML = "";
  window.history.pushState({}, "", "/pricing/");
});

describe("pricing page checkout", () => {
  it("starts checkout and navigates to the Stripe-hosted URL", async () => {
    const { button, navigate, createBillingCheckout, notice } = await loadPricingPage({
      createBillingCheckout: vi.fn().mockResolvedValue({
        checkout_url: "https://checkout.stripe.com/c/pay/cs_live_test",
        checkout_session_id: "cs_live_test",
      }),
    });

    button.click();
    await settle();

    expect(createBillingCheckout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_live_test");
    expect(notice.hasAttribute("hidden")).toBe(true);
  });

  it("sends 409 (existing subscription / already founder) to the account page", async () => {
    const { button, navigate } = await loadPricingPage({
      createBillingCheckout: vi.fn().mockRejectedValue(apiError(409)),
    });

    button.click();
    await settle();

    expect(navigate).toHaveBeenCalledWith("/account/");
  });

  it("sends guests (401) to sign in with a pricing return path", async () => {
    const { button, navigate } = await loadPricingPage({
      createBillingCheckout: vi.fn().mockRejectedValue(apiError(401)),
    });

    button.click();
    await settle();

    expect(navigate).toHaveBeenCalledWith("/login/?return_to=%2Fpricing%2F");
  });

  it("asks unverified accounts (403) to verify email without navigating", async () => {
    const { button, navigate, notice } = await loadPricingPage({
      createBillingCheckout: vi.fn().mockRejectedValue(apiError(403)),
    });

    button.click();
    await settle();

    expect(navigate).not.toHaveBeenCalled();
    expect(notice.hasAttribute("hidden")).toBe(false);
    expect(notice.textContent).toContain("Verify your email");
    expect(button.disabled).toBe(false);
  });

  it("shows an unavailable notice when checkout is disabled (404)", async () => {
    const { button, navigate, notice } = await loadPricingPage({
      createBillingCheckout: vi.fn().mockRejectedValue(apiError(404)),
    });

    button.click();
    await settle();

    expect(navigate).not.toHaveBeenCalled();
    expect(notice.hasAttribute("hidden")).toBe(false);
    expect(notice.textContent).toContain("Checkout is not available right now");
    expect(button.disabled).toBe(false);
  });

  it("treats a response without checkout_url as unavailable", async () => {
    const { button, navigate, notice } = await loadPricingPage({
      createBillingCheckout: vi.fn().mockResolvedValue({}),
    });

    button.click();
    await settle();

    expect(navigate).not.toHaveBeenCalled();
    expect(notice.textContent).toContain("Checkout is not available right now");
  });

  it("refuses a non-Stripe checkout redirect returned by the API", async () => {
    const { button, navigate, notice } = await loadPricingPage({
      createBillingCheckout: vi.fn().mockResolvedValue({
        checkout_url: "https://checkout.stripe.com.attacker.example/pay",
      }),
    });

    button.click();
    await settle();

    expect(navigate).not.toHaveBeenCalled();
    expect(notice.textContent).toContain("Checkout is not available right now");
  });

  it("shows a canceled-checkout notice from the Stripe cancel redirect", async () => {
    const { notice, navigate } = await loadPricingPage({
      url: "/pricing/?checkout=canceled",
    });

    expect(notice.hasAttribute("hidden")).toBe(false);
    expect(notice.textContent).toContain("Checkout canceled");
    expect(navigate).not.toHaveBeenCalled();
  });
});
