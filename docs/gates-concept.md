# Frontend Gates

Status: current frontend integration notes for account-aware BoardWise pages.

## Rule

```text
Frontend gates explain access.
API gates enforce access.
```

The static frontend must not fetch premium JSON and hide it in browser code.
Authenticated/premium requests use credentialed API calls, and the API decides
whether the response is full, preview, `401`, or `403`.

## Runtime Shape

This repo ships static HTML, CSS, JavaScript, and generated assets through the
approved static hosting pipeline. It has no app server runtime, but it does have
a Vite build/test toolchain.

Current first-level pages:

```text
/
/account/
/login/
/mlb/
/nhl/
/performance/
/pricing/
```

Current shared browser files:

```text
assets/js/api-client.js
assets/js/auth-state.js
assets/js/login.js
assets/js/mlb-board.js
assets/js/nhl-board.js
assets/js/performance.js
assets/js/account.js
```

## API Client Contract

`assets/js/api-client.js` owns API URL construction and JSON error handling.
Account-aware calls use credentials and no-store where the response may depend
on the current user:

```text
GET  /api/v1/me
POST /api/v1/auth/magic-link/start
POST /api/v1/auth/magic-link/verify
POST /api/v1/auth/logout
GET  /api/v1/boards/mlb/current
GET  /api/v1/boards/mlb/{target_date}
GET  /api/v1/performance/filters
GET  /api/v1/performance/summary
GET  /api/v1/performance/breakdown
GET  /api/v1/performance/picks
GET  /api/v1/performance/book-comparison
```

NHL board calls remain public static-board calls in this phase.

## Auth State

`assets/js/auth-state.js` fetches `/api/v1/me` with:

```js
{
  credentials: "include",
  cache: "no-store"
}
```

It normalizes missing or failed auth-state responses to a guest state.

Unauthenticated state:

```json
{
  "authenticated": false,
  "user": null,
  "plan": "guest",
  "features": {
    "mlb_board_basic": false,
    "mlb_board_advanced": false,
    "performance_summary": false
  }
}
```

Authenticated state includes `user`, `plan`, and a feature map returned by the
API. The frontend should not synthesize premium access from plan labels alone.

## Login And Signup Copy

`/login/` submits `POST /api/v1/auth/magic-link/start` and always shows generic
copy so the page does not reveal whether an email already has an account.

The page includes Turnstile markup/configuration when present. The login script
only sends a Turnstile token when Turnstile is enabled and available on the
page.

Magic-link verification posts to `/api/v1/auth/magic-link/verify`, then reloads
auth state from `/api/v1/me`.

## MLB Board Behavior

`/mlb/` fetches the MLB board with:

```js
{
  credentials: "include",
  cache: "no-store"
}
```

Expected API outcomes:

- guest: `401` with `detail.error = authentication_required` and
  `detail.required_feature = mlb_board_basic`;
- free/basic: `200` preview payload with two deterministic preview cards for
  the canonical current mode;
- pro/founder/admin: `200` full projected board;
- non-canonical modes, dated boards, model switching, tracking summary, and
  full-board variants: advanced-only and may return `403`.

The page renders preview payloads as preview content with sign-in/upgrade calls
to action. It does not fetch the full premium board and hide it.

## Performance Behavior

`/performance/` fetches filters, summary, breakdown, picks, and book comparison
through credentialed no-store API calls. The API currently gates performance
routes with `internal_admin`.

The page should surface:

- `401` as sign-in required;
- `403` as full/admin access required;
- API-provided data as the source of truth for available filters, including the
  official/tracking performance scope options.

## Account And Pricing

`/account/` loads `/api/v1/me` and displays the current account, plan, and
feature state. Guests are directed to sign in.

`/pricing/` is static product copy in this repo. It does not imply that Stripe
checkout routes exist.

## CSP And Third Parties

The frontend must not embed secrets. If a future auth provider or Stripe
Elements integration adds third-party scripts, update `_headers`/CSP and the
privacy documentation in the same reviewed change. Redirect-only flows are
preferred when possible.

## Not Implemented By Frontend Gates

- Billing checkout and webhook behavior.
- Saved picks, alerts, and exports.
- Any entitlement decision that is not also enforced by the API.
- Hosted auth widgets beyond the current magic-link/Turnstile flow.
