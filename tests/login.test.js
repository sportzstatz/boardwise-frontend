import { afterEach, describe, expect, it, vi } from "vitest";

const API_BASE = "https://api.example.test";

async function loadLoginScript({
  turnstileValue = "test-token",
  url = "/login/",
} = {}) {
  vi.resetModules();
  delete window.BoardWiseApi;
  window.history.pushState({}, "", url);
  window.BOARDWISE_API_BASE = API_BASE;

  document.body.innerHTML = `
    <form id="login-form" class="auth-form">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" required>
      ${
        turnstileValue === null
          ? ""
          : `<input name="cf-turnstile-response" value="${turnstileValue}">`
      }
      <button class="button primary" type="submit">Send sign-in link</button>
    </form>
    <p id="login-message" hidden></p>
  `;

  await import("../assets/js/api-client.js");
  await import("../assets/js/login.js");
  await Promise.resolve();

  return {
    form: /** @type {HTMLFormElement} */ (document.getElementById("login-form")),
    email: /** @type {HTMLInputElement} */ (document.getElementById("email")),
    message: /** @type {HTMLElement} */ (document.getElementById("login-message")),
  };
}

function submit(form) {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function jsonResponse(body, { status = 200, statusText = "OK" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => JSON.stringify(body),
  };
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function encodedReturnTo(value) {
  return `/login/?return_to=${encodeURIComponent(value)}`;
}

function expectSameOriginPath(destination, expectedPath) {
  const target = new URL(destination, window.location.origin);
  expect(target.origin).toBe(window.location.origin);
  expect(`${target.pathname}${target.search}${target.hash}`).toBe(expectedPath);
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.BoardWiseApi;
  delete window.BOARDWISE_API_BASE;
  delete window.turnstile;
  document.body.innerHTML = "";
  window.history.pushState({}, "", "/");
});

describe("login", () => {
  it("blocks fetch and shows an error when the Turnstile token is missing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const { form, email, message } = await loadLoginScript({ turnstileValue: "" });
    email.value = "founder@example.test";
    submit(form);
    await settle();

    expect(fetch).not.toHaveBeenCalled();
    expect(message.textContent).toBe("Complete the human check, then try again.");
    expect(message.dataset.kind).toBe("error");
    expect(message.hasAttribute("hidden")).toBe(false);
  });

  it("sends the Turnstile token in the magic-link start request", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, message: "Sent" })
    );
    vi.stubGlobal("fetch", fetch);
    window.turnstile = { reset: vi.fn() };

    const { form, email } = await loadLoginScript({
      url: "/login/?return_to=/performance/",
    });
    email.value = "founder@example.test";
    submit(form);
    await settle();

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/v1/auth/magic-link/start`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );

    const request = fetch.mock.calls[0][1];
    const body = JSON.parse(String(request.body));
    expect(body).toEqual({
      email: "founder@example.test",
      return_to: "/performance/",
      turnstile_token: "test-token",
    });
  });

  it.each([
    ["https://evil.example/phish"],
    ["http://evil.example/phish"],
    ["//evil.example/phish"],
    ["/\\evil.example/phish"],
    ["/\\\\evil.example/phish"],
    ["\\evil.example/phish"],
    ["javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["/account/\r\nLocation:https://evil.example"],
  ])("sanitizes unsafe return_to before magic-link start: %s", async (returnTo) => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, message: "Sent" })
    );
    vi.stubGlobal("fetch", fetch);

    const { form, email } = await loadLoginScript({
      url: encodedReturnTo(returnTo),
    });
    email.value = "founder@example.test";
    submit(form);
    await settle();

    const request = fetch.mock.calls[0][1];
    const body = JSON.parse(String(request.body));
    expect(body.return_to).toBe("/account/");
    expectSameOriginPath(body.return_to, "/account/");
  });

  it("normalizes same-origin absolute return_to before magic-link start", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, message: "Sent" })
    );
    vi.stubGlobal("fetch", fetch);

    const { form, email } = await loadLoginScript({
      url: encodedReturnTo(`${window.location.origin}/performance/?x=1#plans`),
    });
    email.value = "founder@example.test";
    submit(form);
    await settle();

    const request = fetch.mock.calls[0][1];
    const body = JSON.parse(String(request.body));
    expect(body.return_to).toBe("/performance/?x=1#plans");
    expectSameOriginPath(body.return_to, "/performance/?x=1#plans");
  });

  it("resets the form and Turnstile after a successful request", async () => {
    const reset = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: true, message: "Sent" }))
    );
    window.turnstile = { reset };

    const { form, email, message } = await loadLoginScript();
    email.value = "founder@example.test";
    submit(form);
    await settle();

    expect(email.value).toBe("");
    expect(reset).toHaveBeenCalledTimes(1);
    expect(message.textContent).toBe("Sent");
  });

  it("resets Turnstile and shows an error after a failed request", async () => {
    const reset = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ detail: "failed" }, { status: 500, statusText: "Server Error" })
      )
    );
    window.turnstile = { reset };

    const { form, email, message } = await loadLoginScript();
    email.value = "founder@example.test";
    submit(form);
    await settle();

    expect(reset).toHaveBeenCalledTimes(1);
    expect(message.textContent).toBe("Could not request a sign-in link. Try again shortly.");
    expect(message.dataset.kind).toBe("error");
  });

  it("verifies magic-link tokens without requiring Turnstile", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ detail: "invalid" }, { status: 400, statusText: "Bad Request" })
    );
    vi.stubGlobal("fetch", fetch);

    const { message } = await loadLoginScript({
      turnstileValue: null,
      url: "/login/?token=magic-token&return_to=/account/",
    });
    await settle();

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/v1/auth/magic-link/verify`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ token: "magic-token" }),
      })
    );
    expect(message.textContent).toBe(
      "That sign-in link is invalid or expired. Request a new link."
    );
    expect(message.textContent).not.toContain("human check");
  });

  it("scrubs unsafe return_to while removing a failed magic-link token", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ detail: "invalid" }, { status: 400, statusText: "Bad Request" })
    );
    vi.stubGlobal("fetch", fetch);

    await loadLoginScript({
      turnstileValue: null,
      url: `/login/?token=magic-token&return_to=${encodeURIComponent(
        "/\\evil.example/phish"
      )}`,
    });
    await settle();

    expect(window.location.pathname).toBe("/login/");
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain("evil.example");
    expect(window.location.href).not.toContain("token=");
  });
});
