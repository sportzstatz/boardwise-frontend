# Frontend Gates Concept

Status: Sprint 1 design draft. This is a UI/UX and integration plan, not an implemented gate.

## Purpose

The current `boardwise-frontend` is a static Cloudflare Pages site with no build step. It renders:

```text
/
/mlb/
/nhl/
/performance/
```

All live data comes from `https://api.useboardwise.com`. Future account work needs visible gates for guest/free/founder/paid users without pretending that frontend hiding is security.

Rule:

```text
Frontend gates explain access.
API gates enforce access.
```

## Current repo facts

Current files:

```text
index.html
mlb/index.html
nhl/index.html
performance/index.html
assets/js/mlb-board.js
assets/js/nhl-board.js
assets/js/performance.js
assets/css/site.css
_headers
_redirects
```

Current `_headers` CSP includes:

```text
connect-src 'self' https://api.useboardwise.com
form-action 'self'
```

That is enough for basic API calls. Future hosted auth widgets or embedded Stripe scripts would require CSP changes. Redirect-based Stripe Checkout can be supported without embedding Stripe JS on the static page.

## Gate UX tiers

### Guest

Can see:

```text
home
basic MLB board
basic NHL board if populated
limited performance summary
legal pages
login/join CTA
```

Cannot see:

```text
full performance picks
book comparison
advanced model detail
saved picks
alerts
exports
```

### Free logged-in user

Can see:

```text
everything guest can see
account shell
profile/consent state
maybe saved filters or limited personalization later
```

### Founder beta / Pro

Can see:

```text
advanced MLB board details
performance breakdown
performance picks
book comparison
saved picks
alerts/exports when implemented
```

## Suggested future files

Do not add these in Sprint 1 unless implementing gates. This is the desired shape for Sprint 2/3:

```text
assets/js/auth-state.js
assets/js/gates.js
login/index.html
account/index.html
pricing/index.html
billing/success/index.html
billing/cancel/index.html
terms/index.html
privacy/index.html
responsible-gambling/index.html
affiliate-disclosure/index.html
contact/index.html
```

## Auth state contract

Frontend should fetch account state from:

```text
GET https://api.useboardwise.com/api/v1/me
```

Unauthenticated expected shape:

```json
{
  "authenticated": false,
  "user": null,
  "plan": "guest",
  "features": {
    "mlb_board_basic": true,
    "nhl_board_basic": true,
    "performance_summary": true,
    "performance_picks": false
  }
}
```

Authenticated expected shape:

```json
{
  "authenticated": true,
  "user": {
    "email": "user@example.com"
  },
  "plan": "founder_beta",
  "features": {
    "mlb_board_basic": true,
    "performance_summary": true,
    "performance_picks": true,
    "performance_book_comparison": true
  }
}
```

Account-scoped fetches must use credentials once cookies exist:

```js
fetch(`${API_BASE}/api/v1/me`, { credentials: "include" })
```

## Suggested `auth-state.js`

Future file:

```text
assets/js/auth-state.js
```

Suggested non-module script shape to match the current static style:

```js
(function () {
  const API_BASE = window.BOARDWISE_API_BASE || "https://api.useboardwise.com";

  const PUBLIC_FEATURES = {
    mlb_board_basic: true,
    nhl_board_basic: true,
    performance_summary: true,
    mlb_board_advanced: false,
    performance_breakdown: false,
    performance_picks: false,
    performance_book_comparison: false,
    saved_picks: false,
    alerts: false,
    export_csv: false,
  };

  const guestState = {
    authenticated: false,
    user: null,
    plan: "guest",
    features: PUBLIC_FEATURES,
  };

  let cachedState = null;

  function normaliseState(payload) {
    const features = Object.assign({}, PUBLIC_FEATURES, payload && payload.features ? payload.features : {});
    return {
      authenticated: Boolean(payload && payload.authenticated),
      user: payload && payload.user ? payload.user : null,
      plan: payload && payload.plan ? String(payload.plan) : "guest",
      features,
    };
  }

  async function loadAuthState(options = {}) {
    if (cachedState && !options.force) return cachedState;
    try {
      const resp = await fetch(`${API_BASE}/api/v1/me`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!resp.ok) {
        cachedState = guestState;
        return cachedState;
      }
      cachedState = normaliseState(await resp.json());
      return cachedState;
    } catch (_err) {
      cachedState = guestState;
      return cachedState;
    }
  }

  function hasFeature(state, featureKey) {
    return Boolean(state && state.features && state.features[featureKey]);
  }

  window.BoardWiseAuth = {
    loadAuthState,
    hasFeature,
    guestState,
  };
})();
```

## Suggested `gates.js`

Future file:

```text
assets/js/gates.js
```

Suggested non-module script:

```js
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

  async function applyFeatureGates(root = document) {
    const auth = await window.BoardWiseAuth.loadAuthState();
    root.querySelectorAll("[data-required-feature]").forEach((el) => {
      const featureKey = el.getAttribute("data-required-feature") || "";
      const allowed = window.BoardWiseAuth.hasFeature(auth, featureKey);
      if (allowed) {
        el.removeAttribute("hidden");
        return;
      }
      const title = el.getAttribute("data-gate-title") || "This section is gated";
      const body = el.getAttribute("data-gate-body") || "Sign in or upgrade to access this BoardWise feature.";
      el.innerHTML = gateCard({ title, body });
      el.removeAttribute("hidden");
    });

    root.querySelectorAll("[data-auth-label]").forEach((el) => {
      if (auth.authenticated && auth.user && auth.user.email) {
        el.textContent = auth.user.email;
      } else {
        el.textContent = "Sign in";
      }
    });
  }

  window.BoardWiseGates = {
    applyFeatureGates,
    gateCard,
  };
})();
```

## Example gated markup

On `/performance/`, wrap premium sections once the API is gated:

```html
<section
  class="section"
  data-required-feature="performance_picks"
  data-gate-title="Full pick history"
  data-gate-body="Detailed published-pick history is available to founder beta and paid users."
>
  <!-- existing picks table here -->
</section>
```

On `/mlb/`, gate advanced card details while keeping the basic board public:

```html
<div
  data-required-feature="mlb_board_advanced"
  data-gate-title="Advanced MLB details"
  data-gate-body="Advanced model context is available to founder beta and paid users."
>
  <!-- advanced details here -->
</div>
```

## Script include order

Future pages using gates should load scripts in this order:

```html
<script src="/assets/js/auth-state.js"></script>
<script src="/assets/js/gates.js"></script>
<script src="/assets/js/performance.js"></script>
```

Or call gates at the end of the page:

```html
<script>
  window.BoardWiseGates && window.BoardWiseGates.applyFeatureGates();
</script>
```

## CSS concept

Today most page styles are inline. Either add gate styles to each page's inline `<style>` block, or consolidate shared UI styles into `assets/css/site.css` and link it across pages.

Suggested gate styles:

```css
.gate-card {
  border: 1px solid var(--line);
  background: linear-gradient(135deg, #ffffff 0%, #eef4ff 100%);
  border-radius: 16px;
  padding: 18px;
  box-shadow: var(--shadow);
}
.gate-eyebrow {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}
.gate-card h3 {
  margin: 8px 0 6px;
}
.gate-card p {
  color: var(--muted);
  line-height: 1.5;
  margin: 0 0 14px;
}
```

## Navigation concept

Add consistent links to the nav rows:

```html
<a class="nav-link" href="/pricing/">Join beta</a>
<a class="nav-link" href="/account/" data-auth-label>Sign in</a>
```

Guest sees "Sign in". Authenticated user sees email or "Account".

## New static pages concept

### `/login/`

- Email input.
- Calls `POST /api/v1/auth/magic-link/start`.
- Always shows a non-enumerating success message.

### `/account/`

- Calls `GET /api/v1/me`.
- If guest, show sign-in CTA.
- If authenticated, show email, plan, feature list, consents, billing placeholder.

### `/pricing/` or `/join-beta/`

- Until Stripe exists, show founder beta CTA/contact.
- After Stripe test mode, show subscribe button that calls Checkout Session endpoint.

### `/billing/success/`

- Do not assume access is active just because user landed here.
- Call `/api/v1/me` or `/api/v1/billing/status` and show pending/active state.

### `/billing/cancel/`

- Show neutral message and link back to pricing/account.

## `_headers` / CSP notes

Current CSP is good for the static public beta. Future changes:

### BoardWise API only

No CSP change needed if auth stays on `api.useboardwise.com` and Stripe Checkout is redirect-only.

### Hosted auth provider

Add provider domains to `script-src`, `connect-src`, and possibly `frame-src` only if the provider requires embedded scripts/widgets.

### Embedded Stripe elements

If BoardWise later embeds Stripe JS instead of redirect-only Checkout, CSP will need explicit Stripe domains. Prefer redirect-only Checkout for lower static-site complexity.

## API failure UX

Handle gate errors returned by API:

```json
{
  "error": "entitlement_required",
  "required_feature": "performance_picks",
  "upgrade_path": "/pricing/"
}
```

Suggested frontend handler:

```js
async function fetchJsonWithGate(url) {
  const resp = await fetch(url, { credentials: "include" });
  const payload = await resp.json().catch(() => null);
  if (resp.status === 401 || resp.status === 403) {
    return { gated: true, status: resp.status, payload };
  }
  if (!resp.ok) throw new Error(payload && payload.detail ? payload.detail : `HTTP ${resp.status}`);
  return { gated: false, payload };
}
```

## Implementation order for frontend gates

1. Add legal footer links first.
2. Add `/login/`, `/account/`, `/pricing/` shells.
3. Add `auth-state.js` and `gates.js`.
4. Add visual gates around premium sections.
5. Only after API gates exist, call gated endpoints for premium sections.
6. Add success/cancel pages when Stripe test mode starts.

## Do not do

- Do not embed secrets in static HTML/JS.
- Do not fetch premium JSON and merely hide it with CSS/JS.
- Do not add third-party scripts without updating CSP and privacy policy.
- Do not promise NHL/NCAAMB paid coverage until the backend reliably supports it.