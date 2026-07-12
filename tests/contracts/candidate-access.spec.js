// @ts-check
import { expect, test } from "@playwright/test";
import { resolveContractApiBase } from "../../scripts/contract-api-base.mjs";
import { expectPlainObject } from "./contract-helpers.js";

const API_BASE = resolveContractApiBase();
const SESSION_COOKIE =
  String(process.env.BOARDWISE_CONTRACT_SESSION_COOKIE || "").trim() ||
  "__Host-bw_session";
const NAVIGATION_CAPTURE_KEY = "boardwise-contract-billing-navigations";

if (process.env.BOARDWISE_CONTRACT_TARGET !== "candidate") {
  throw new Error(
    "The candidate-access project requires BOARDWISE_CONTRACT_TARGET=candidate."
  );
}

/** @param {"FREE" | "FOUNDER" | "ADMIN"} role */
function sessionToken(role) {
  const name = `BOARDWISE_CONTRACT_${role}_SESSION_TOKEN`;
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required for candidate access contracts.`);
  return value;
}

const SESSIONS = Object.freeze({
  free: sessionToken("FREE"),
  founder: sessionToken("FOUNDER"),
  admin: sessionToken("ADMIN"),
});

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} token
 */
async function installCandidateSession(page, token) {
  const apiUrl = new URL(API_BASE);
  const localApi = new Set(["127.0.0.1", "localhost", "::1"]).has(
    apiUrl.hostname
  );
  if (!localApi && apiUrl.protocol !== "https:") {
    throw new Error("A remote candidate API must use HTTPS for browser sessions.");
  }
  try {
    await page.context().addCookies([
      {
        name: SESSION_COOKIE,
        value: token,
        url: `${apiUrl.origin}/`,
        httpOnly: true,
        secure: apiUrl.protocol === "https:",
        // A locally served candidate frontend is cross-site to an HTTPS
        // staging API, so the injected disposable test session must be usable
        // by credentialed fetch. A same-host local API retains Lax semantics.
        sameSite: localApi ? "Lax" : "None",
      },
    ]);
  } catch (_error) {
    // Never let a protocol error serialize the cookie value into evidence.
    throw new Error(
      "Could not install the candidate session cookie; verify the API origin and cookie-name inputs."
    );
  }
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string | undefined} token
 */
async function configureCandidatePage(page, token) {
  await page.addInitScript((apiBase) => {
    window.BOARDWISE_API_BASE = apiBase;
  }, API_BASE);

  if (!token) {
    await page.goto("/pricing/", { waitUntil: "domcontentloaded" });
    return;
  }
  await installCandidateSession(page, token);

  // Establish the frontend origin before credentialed browser fetches.
  // Browser fetch failures do not serialize Cookie headers into Playwright's
  // instrumented request call log.
  await page.goto("/pricing/", { waitUntil: "domcontentloaded" });
}

/** @param {import("@playwright/test").Page} page */
async function installNavigationCapture(page) {
  await page.addInitScript((captureKey) => {
    window.sessionStorage.removeItem(captureKey);
    window.BoardWiseNavigate = (url) => {
      const raw = window.sessionStorage.getItem(captureKey);
      const existing = raw ? JSON.parse(raw) : [];
      const navigations = Array.isArray(existing) ? existing : [];
      navigations.push(url);
      window.sessionStorage.setItem(captureKey, JSON.stringify(navigations));
    };
  }, NAVIGATION_CAPTURE_KEY);
}

/** @param {import("@playwright/test").Page} page */
async function capturedNavigations(page) {
  return page.evaluate((captureKey) => {
    const raw = window.sessionStorage.getItem(captureKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  }, NAVIGATION_CAPTURE_KEY);
}

/** @param {string} path */
function candidateApiUrl(path) {
  return new URL(path, `${API_BASE}/`).toString();
}

/**
 * Fulfill only the billing response boundary while leaving the production
 * page code and its frozen BoardWiseApi client intact. That makes these
 * browser checks exercise the real client method, request construction, and
 * navigation allowlist without creating provider-side Checkout/Portal state.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @param {Record<string, unknown>} body
 */
async function fulfillCandidateBillingJson(page, path, body) {
  const endpoint = candidateApiUrl(path);
  const frontendOrigin = new URL(page.url()).origin;
  const corsHeaders = {
    "access-control-allow-origin": frontendOrigin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        ...corsHeaders,
        "cache-control": "private, no-store, max-age=0",
      },
      body: JSON.stringify(body),
    });
  });
  return endpoint;
}

/**
 * The authoritative candidate stack intentionally keeps checkout disabled.
 * These URL-boundary cases replace only the billing-status and provider URL
 * responses so the shipped pricing handler can exercise its real API client
 * and navigation allowlist without weakening the separate disabled-state test.
 *
 * @param {import("@playwright/test").Page} page
 */
async function exposeCheckoutForNavigationContract(page) {
  await fulfillCandidateBillingJson(page, "/api/v1/billing/status", {
    plan: "free",
    checkout_available: true,
    portal_available: false,
    subscription: null,
  });
  await page.reload({ waitUntil: "domcontentloaded" });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 */
async function apiGet(page, path) {
  const result = await page.evaluate(
    async ({ apiBase, requestPath }) => {
      let response;
      try {
        response = await fetch(new URL(requestPath, `${apiBase}/`), {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
      } catch (_error) {
        throw new Error("Candidate API request failed.");
      }

      let body;
      try {
        body = await response.json();
      } catch (_error) {
        throw new Error("Candidate API returned a non-JSON response.");
      }

      // `/me` includes account PII that no contract assertion needs. Keep it
      // out of Playwright step values and failure renderings.
      if (requestPath === "/api/v1/me" && body && typeof body === "object") {
        delete body.email;
        delete body.display_name;
        delete body.user_id;
      }
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      };
    },
    { apiBase: API_BASE, requestPath: path }
  );

  return {
    status: () => result.status,
    headers: () => result.headers,
    json: async () => result.body,
  };
}

/**
 * @param {{headers: () => Record<string, string>}} response
 * @param {string} label
 */
function expectPrivateNoStore(response, label) {
  const cacheControl = response.headers()["cache-control"] || "";
  expect(cacheControl, `${label} cache-control`).toContain("private");
  expect(cacheControl, `${label} cache-control`).toContain("no-store");
  expect(cacheControl, `${label} cache-control`).toContain("max-age=0");
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {"guest" | "free" | "founder" | "admin"} plan
 */
async function expectCurrentPlan(page, plan) {
  const response = await apiGet(page, "/api/v1/me");
  expect(response.status(), `${plan} /me status`).toBe(200);
  expectPrivateNoStore(response, `${plan} /me`);
  const body = await response.json();
  expectPlainObject(body, `${plan} /me`);
  expect(String(body.plan).toLowerCase(), `${plan} /me plan`).toBe(plan);
  expect(Boolean(body.authenticated), `${plan} /me authenticated`).toBe(
    plan !== "guest"
  );
  return body;
}

test.describe("candidate browser access and billing matrix", () => {
  test("Guest renders public pages without actionable MLB cards", async ({
    page,
  }) => {
    await configureCandidatePage(page, undefined);
    await expectCurrentPlan(page, "guest");

    await page.goto("/");
    await expect(page.locator("#landing-title")).toBeVisible();
    await expect(page.locator("#landing-preview-loading")).toBeHidden();
    await expect(page.locator(".landing-preview__choice")).toHaveCount(0);
    await expect(page.locator(".landing-preview__bar")).toHaveCount(0);
    await expect(page.locator(".best-card, .market-dropdown, .preview-tile")).toHaveCount(0);

    await page.goto("/pricing/");
    await expect(page.locator("#pricing-title")).toHaveText("BoardWise Founder");
    await expect(page.locator("[data-auth-guest]").first()).toBeVisible();

    await page.route("https://challenges.cloudflare.com/**", (route) =>
      route.abort()
    );
    await page.goto("/login/");
    await expect(page.locator("#login-form")).toBeVisible();

    await page.goto("/mlb/");
    await expect(page.locator("#loading")).toBeHidden();
    await expect(page.locator("#error")).toBeVisible();
    await expect(page.locator("#error")).toContainText("Sign in to view the MLB board");
    await expect(page.locator("#games .tile")).toHaveCount(0);
  });

  test("Free gets exactly two complete cards, advanced gating, and safe disabled checkout", async ({
    page,
  }) => {
    await configureCandidatePage(page, SESSIONS.free);
    const me = await expectCurrentPlan(page, "free");
    expect(me.features.mlb_board_basic).toBe(true);
    expect(me.features.mlb_board_advanced).toBe(false);

    const boardResponse = await apiGet(page, "/api/v1/boards/mlb/current");
    expect(boardResponse.status(), "Free current board status").toBe(200);
    expectPrivateNoStore(boardResponse, "Free current board");
    const board = await boardResponse.json();
    expect(board.access.level).toBe("preview");
    expect(board.access.card_access).toBe("full");
    expect(board.games).toHaveLength(2);

    await page.goto("/mlb/");
    await expect(page.locator("#loading")).toBeHidden();
    await expect(page.locator("#games")).toBeVisible();
    await expect(page.locator("#games .tile")).toHaveCount(2);
    await expect(page.locator("#games .best-card")).toHaveCount(2);
    expect(await page.locator("#games .market-dropdown").count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator("#date-form")).toBeHidden();
    await expect(page.locator("#model-selector")).toBeHidden();
    await expect(page.locator(".preview-upgrade-copy")).toContainText(
      "two complete MLB cards daily"
    );

    const datedResponse = await apiGet(
      page,
      "/api/v1/boards/mlb/2000-01-01"
    );
    expect(datedResponse.status(), "Free dated board status").toBe(403);
    expectPrivateNoStore(datedResponse, "Free dated board");
    await page.goto("/mlb/?date=2000-01-01");
    await expect(page.locator("#loading")).toBeHidden();
    await expect(page.locator("#error")).toContainText(
      "requires Founder access"
    );

    const billingResponse = await apiGet(page, "/api/v1/billing/status");
    expect(billingResponse.status(), "Free billing status").toBe(200);
    expectPrivateNoStore(billingResponse, "Free billing status");
    const billing = await billingResponse.json();
    expect(billing.plan).toBe("free");
    expect(billing.checkout_available).toBe(false);

    await page.goto("/pricing/");
    const checkoutButton = page.locator("#pricing-checkout-button");
    await expect(checkoutButton).toBeVisible();
    const checkoutResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/billing/checkout"
    );
    await checkoutButton.click();
    const checkoutResponse = await checkoutResponsePromise;
    expect(checkoutResponse.status(), "disabled checkout status").toBe(404);
    expectPrivateNoStore(checkoutResponse, "disabled checkout");
    await expect(page.locator("#pricing-checkout-notice")).toContainText(
      "Checkout is not available right now"
    );

    await page.goto("/pricing/?checkout=canceled");
    await expect(page.locator("#pricing-checkout-notice")).toContainText(
      "Checkout canceled"
    );
    await expectCurrentPlan(page, "free");

    const firstPollPromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/v1/billing/status"
    );
    await page.goto("/account/?checkout=success");
    await expect(page.locator("#account-plan")).toContainText("Free");
    await expect(page.locator("#account-billing-notice")).toContainText(
      "Finalizing Founder access"
    );
    const firstPoll = await firstPollPromise;
    expect(firstPoll.status(), "checkout-success billing poll status").toBe(200);
    const firstPollBody = await firstPoll.json();
    expect(firstPollBody.plan).toBe("free");
    expect(firstPollBody.checkout_available).toBe(false);
    await expect(page.locator("#account-plan")).toContainText("Free");

    const founderPollPromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/v1/billing/status"
    );
    await installCandidateSession(page, SESSIONS.founder);
    const founderPoll = await founderPollPromise;
    expect(founderPoll.status(), "Founder billing poll status").toBe(200);
    const founderPollBody = await founderPoll.json();
    expect(founderPollBody.plan).toBe("founder");
    expect(founderPollBody.portal_available).toBe(true);
    await expect(page.locator("#account-plan")).toContainText("Founder");
    await expect(page.locator("#account-billing-notice")).toContainText(
      "Your BoardWise Founder access is active"
    );
  });

  test("Checkout captures an approved Stripe HTTPS navigation from the real browser client", async ({
    page,
  }) => {
    const stripeCheckoutUrl =
      "https://checkout.stripe.com/c/pay/cs_test_browser_contract";
    await installNavigationCapture(page);
    await configureCandidatePage(page, SESSIONS.free);
    await exposeCheckoutForNavigationContract(page);
    const checkoutEndpoint = await fulfillCandidateBillingJson(
      page,
      "/api/v1/billing/checkout",
      {
        checkout_url: stripeCheckoutUrl,
        checkout_session_id: "cs_test_browser_contract",
      }
    );
    expect(
      await page.evaluate(
        () => typeof window.BoardWiseApi?.createBillingCheckout
      )
    ).toBe("function");

    const checkoutRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/billing/checkout"
    );
    const checkoutButton = page.locator("#pricing-checkout-button");
    await expect(checkoutButton).toBeVisible();
    await checkoutButton.click();
    const checkoutRequest = await checkoutRequestPromise;

    expect(checkoutRequest.url()).toBe(checkoutEndpoint);
    expect(checkoutRequest.postDataJSON()).toEqual({});
    await expect.poll(() => capturedNavigations(page)).toEqual([
      stripeCheckoutUrl,
    ]);
    await expect(page.locator("#pricing-checkout-notice")).toBeHidden();
  });

  test("Checkout refuses a Stripe lookalike returned through the real browser client", async ({
    page,
  }) => {
    await installNavigationCapture(page);
    await configureCandidatePage(page, SESSIONS.free);
    await exposeCheckoutForNavigationContract(page);
    const checkoutEndpoint = await fulfillCandidateBillingJson(
      page,
      "/api/v1/billing/checkout",
      {
        checkout_url: "https://checkout.stripe.com.attacker.example/pay",
        checkout_session_id: "cs_test_browser_contract",
      }
    );

    const checkoutRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/billing/checkout"
    );
    const checkoutButton = page.locator("#pricing-checkout-button");
    await expect(checkoutButton).toBeVisible();
    await checkoutButton.click();
    const checkoutRequest = await checkoutRequestPromise;

    expect(checkoutRequest.url()).toBe(checkoutEndpoint);
    await expect(page.locator("#pricing-checkout-notice")).toContainText(
      "Checkout is not available right now"
    );
    expect(await capturedNavigations(page)).toEqual([]);
    await expect(checkoutButton).toBeEnabled();
  });

  test("Founder gets the complete board and paid-account billing controls", async ({
    page,
  }) => {
    await configureCandidatePage(page, SESSIONS.founder);
    const me = await expectCurrentPlan(page, "founder");
    expect(me.features.mlb_board_basic).toBe(true);
    expect(me.features.mlb_board_advanced).toBe(true);
    expect(me.features.performance_summary).toBe(false);

    const boardResponse = await apiGet(page, "/api/v1/boards/mlb/current");
    expect(boardResponse.status(), "Founder current board status").toBe(200);
    expectPrivateNoStore(boardResponse, "Founder current board");
    const board = await boardResponse.json();
    expect(board.access.level).toBe("full");
    expect(board.games.length).toBeGreaterThan(2);

    await page.goto("/mlb/");
    await expect(page.locator("#loading")).toBeHidden();
    await expect(page.locator("#games .tile")).toHaveCount(board.games.length);
    await expect(page.locator("#date-form")).toBeVisible();
    await expect(page.locator("#games .best-card").first()).toBeVisible();

    const billingResponse = await apiGet(page, "/api/v1/billing/status");
    expect(billingResponse.status(), "Founder billing status").toBe(200);
    expectPrivateNoStore(billingResponse, "Founder billing status");
    const billing = await billingResponse.json();
    expect(billing.plan).toBe("founder");
    expect(billing.checkout_available).toBe(false);
    expect(billing.portal_available).toBe(true);

    await page.goto("/account/");
    await expect(page.locator("#account-plan")).toContainText("Founder");
    await expect(page.locator("#account-billing-body")).toContainText(
      "BoardWise Founder"
    );
    await expect(page.locator("#account-manage-billing")).toBeVisible();
    await expect(
      page.locator('[data-access-card="performance"]')
    ).toHaveCount(0);

    const performanceResponse = await apiGet(
      page,
      "/api/v1/performance/filters?sport=mlb"
    );
    expect(performanceResponse.status(), "Founder performance status").toBe(404);
    expectPrivateNoStore(performanceResponse, "Founder performance");
    expect(await performanceResponse.json()).toEqual({ detail: "Not Found" });

    await page.goto("/performance/");
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expect(page.locator("[data-performance-app]")).toHaveCount(0);
  });

  test("Portal captures an approved Stripe HTTPS navigation from the real browser client", async ({
    page,
  }) => {
    const stripePortalUrl =
      "https://billing.stripe.com/p/session/browser_contract";
    await installNavigationCapture(page);
    await configureCandidatePage(page, SESSIONS.founder);
    await page.goto("/account/");
    await expect(page.locator("#account-plan")).toContainText("Founder");
    const portalEndpoint = await fulfillCandidateBillingJson(
      page,
      "/api/v1/billing/portal",
      { portal_url: stripePortalUrl }
    );
    expect(
      await page.evaluate(() => typeof window.BoardWiseApi?.createBillingPortal)
    ).toBe("function");

    const portalRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/billing/portal"
    );
    const manageBilling = page.locator("#account-manage-billing");
    await expect(manageBilling).toBeVisible();
    await manageBilling.click();
    const portalRequest = await portalRequestPromise;

    expect(portalRequest.url()).toBe(portalEndpoint);
    expect(portalRequest.postData()).toBeNull();
    await expect.poll(() => capturedNavigations(page)).toEqual([
      stripePortalUrl,
    ]);
    await expect(page.locator("#account-billing-notice")).toBeHidden();
  });

  test("Portal refuses a non-HTTPS Stripe URL returned through the real browser client", async ({
    page,
  }) => {
    await installNavigationCapture(page);
    await configureCandidatePage(page, SESSIONS.founder);
    await page.goto("/account/");
    await expect(page.locator("#account-plan")).toContainText("Founder");
    const portalEndpoint = await fulfillCandidateBillingJson(
      page,
      "/api/v1/billing/portal",
      { portal_url: "http://billing.stripe.com/p/session/browser_contract" }
    );

    const portalRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/billing/portal"
    );
    const manageBilling = page.locator("#account-manage-billing");
    await expect(manageBilling).toBeVisible();
    await manageBilling.click();
    const portalRequest = await portalRequestPromise;

    expect(portalRequest.url()).toBe(portalEndpoint);
    await expect(page.locator("#account-billing-notice")).toContainText(
      "The billing portal is unavailable right now"
    );
    expect(await capturedNavigations(page)).toEqual([]);
    await expect(manageBilling).not.toHaveAttribute("aria-busy");
  });

  test("Admin sees concealed performance and does not get paid billing controls", async ({
    page,
  }) => {
    await configureCandidatePage(page, SESSIONS.admin);
    const me = await expectCurrentPlan(page, "admin");
    expect(me.features.mlb_board_basic).toBe(true);
    expect(me.features.mlb_board_advanced).toBe(true);
    expect(me.features.performance_summary).toBe(true);

    const performanceResponse = await apiGet(
      page,
      "/api/v1/performance/filters?sport=mlb"
    );
    expect(performanceResponse.status(), "Admin performance status").toBe(200);
    expectPrivateNoStore(performanceResponse, "Admin performance");

    await page.goto("/performance/");
    await expect(page.locator("[data-performance-app]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Performance & ROI" })).toBeVisible();
    await expect(
      page.locator('nav a[href="/performance/"]')
    ).toBeVisible();

    await page.goto("/account/");
    await expect(page.locator("#account-plan")).toContainText("Admin access");
    await expect(page.locator("#account-billing-body")).toContainText(
      "Administrative access is internal"
    );
    await expect(page.locator("#account-manage-billing")).toHaveCount(0);
    await expect(
      page.locator('[data-access-card="performance"]')
    ).toBeVisible();
  });
});
