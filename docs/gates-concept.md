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
/mlb/game/
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
assets/js/mlb-game-detail.js
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
- founder/admin: `200` full projected board;
- non-canonical modes, dated boards, model switching, tracking summary, and
  full-board variants: advanced-only and may return `403`.

The page renders preview payloads as preview content with sign-in/upgrade calls
to action. It does not fetch the full premium board and hide it.

`/mlb/` renders each game as a Navy/Gold "tale of the tape" card (model win
probability tug-of-war, both starters, the Wise Choice pick, and full market
dropdowns) that links to `/mlb/game/?game_pk=…&date=…&model=…`.

## MLB Game Detail Behavior

`/mlb/game/` reads `game_pk` (plus optional `date` and `model`) from the URL and
loads the same MLB board through the shared API client, then renders the one
requested game. It performs no game-specific API call and never fetches premium
JSON to hide it client-side:

- founder/admin (`access.level = full`): the full game detail — hero,
  Wise Choice pick, full markets with edge, model breakdown, and pitching
  matchup — plus "coming soon" placeholders for sections not yet served by the
  API (player props, weather/park, line movement and head-to-head).
- free/basic (`access.level = preview`): the hero plus a Founder upsell and a list
  of locked sections. No premium odds, edge, or pick values are rendered, because
  the preview payload does not contain them.
- a requested game absent from a preview board surfaces the Founder upgrade path;
  a game absent from a full board surfaces a not-found message linking back to
  the board.
- `401` is shown as sign-in required and `403` as Founder access required,
  matching the board.

## Performance Behavior

`/performance/` is a **concealed Admin-only** page. Only the Admin plan grants
the `performance_summary` feature; Free and Founder do not see the performance
navigation link, and the page must never render or describe performance to a
non-admin.

At startup, before any performance UI or API call, the page resolves
`/api/v1/me` through the auth-state helper and requires
`performance_summary === true`. If the visitor is not an admin it calls
`window.location.replace("/")` without displaying an upgrade card or any
performance description. Only an admin unhides the `[data-performance-app]`
container and initializes the performance API calls.

The shell additionally carries `data-feature-visible="performance_summary"`, so
the shared `apply-gates` pass reveals it for admins and keeps it hidden for
non-admins **independently of `performance.js`**. This is deliberate resilience:
the shell's reveal must never depend solely on one page script, which a client
could load in a version out of step with the current markup. If a browser ran a
stale `performance.js` (one predating the startup guard, so it never un-hides the
shell) against current HTML, the page would blank for admins. Routing the reveal
through the always-applied `apply-gates` pass (which every page loads) keeps
`/performance/` working regardless of which `performance.js` a client has; the
`performance.js` guard remains for the non-admin redirect and as
belt-and-suspenders. `apply-gates` and `performance.js` both resolve auth
through the shared, request-deduped `loadAuthState`, so the two checks always
agree and a later check can never re-hide what an earlier one revealed.

The API enforces the same boundary: performance routes return an
indistinguishable `404 Not Found` (never `internal_admin`, never an upgrade
path) to guests, Free, and Founder. Because non-admins are redirected at
startup, a `401`/`403`/`404` reaching the data layer means access was lost
mid-session; the page shows a generic admin-only state and must **not**
reinterpret a `404` as "upgrade required".

API-provided data remains the source of truth for available filters, including
the official/tracking performance scope options.

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
