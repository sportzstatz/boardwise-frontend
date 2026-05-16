import { afterEach, describe, expect, it, vi } from "vitest";

const API_BASE = "https://api.example.test";

async function loadLoginScript({
  turnstileValue = "test-token",
  url = "/login/",
} = {}) {
  vi.resetModules();
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

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
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
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: "Sent" }),
    });
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
        headers: { "Content-Type": "application/json" },
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

  it("resets the form and Turnstile after a successful request", async () => {
    const reset = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, message: "Sent" }),
      })
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
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
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
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "magic-token" }),
      })
    );
    expect(message.textContent).toBe(
      "That sign-in link is invalid or expired. Request a new link."
    );
    expect(message.textContent).not.toContain("human check");
  });
});
