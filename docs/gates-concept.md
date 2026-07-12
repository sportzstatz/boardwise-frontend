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
- free/basic: `200` count-limited payload with two deterministic, complete
  cards for the canonical current mode (`access.level = preview` and
  `access.card_access = full`);
- founder/admin: `200` full projected board;
- non-canonical modes, dated boards, model switching, tracking summary, and
  full-board variants: advanced-only and may return `403`.

`access.level = preview` limits the board, controls, date, and model surfaces;
it does not sanitize a card when `access.card_access = full`. The page renders
those two cards through the same card renderer used for Founder, while hiding
date selection, model selection, board modes, and filters. During rolling
deployments, old preview payloads without `card_access` retain the sanitized
legacy renderer.

`/mlb/` renders each game as a Navy/Gold "tale of the tape" card (model win
probability tug-of-war, both starters, the Wise Choice pick, and full market
dropdowns). Founder links retain `game_pk`, `date`, and `model`; Free links use
only `game_pk` so detail reloads the canonical current board rather than a
Founder-only dated/model route.

## MLB Game Detail Behavior

`/mlb/game/` reads `game_pk` (plus optional `date` and `model`) from the URL and
loads the same MLB board through the shared API client, then renders the one
requested game. In parallel, it fetches the family-agnostic player-props route;
a props failure never blanks the board-derived detail:

- founder/admin (`access.level = full`): the full game detail — hero,
  Wise Choice pick, full markets with edge, model breakdown, and pitching
  matchup — plus full props when published. Weather/park and trends remain
  future sections.
- free/basic (`access.level = preview`, `access.card_access = full`): the full
  board-derived hero, Wise Choice, markets, and model breakdown for either of
  the two selected daily games. Player props remain an `access = summary`
  upgrade panel.
- legacy Free payloads without `card_access`: the sanitized hero and locked
  markets/model renderer remain available for deployment rollback safety.
- a requested game absent from a preview board surfaces the Founder upgrade path;
  a game absent from a full board surfaces a not-found message linking back to
  the board.
- `401` is shown as sign-in required and `403` as Founder access required,
  matching the board.

The public landing endpoint is separate from authenticated card access. It may
show the schedule-ordered matchup identity (teams, time, and venue) plus
Obsidian Steed aggregate Record/Picks/Units/ROI. The landing renderer never
reads picks, probabilities, odds, books, edge, EV, Wise Choice fields, or
individual result highlights, including from a stale cached response.

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

Founder accounts receive billing-management controls on `/account/`. The
frontend accepts a Customer Portal URL only when it is HTTPS and hosted by
Stripe. Admin access is described as internal rather than as a paid Founder
subscription.

Authenticated Free accounts can start the fixed Founder checkout from
`/pricing/` only when the API enables it. A disabled or unavailable checkout
stays on the page with safe fallback copy. Checkout and portal responses are
treated as untrusted: the browser follows only HTTPS Stripe-hosted URLs.

`/account/?checkout=success` never grants Founder access from the redirect. It
polls `/api/v1/billing/status`, reloads `/api/v1/me` only after the backend
reports Founder, and otherwise leaves the current plan unchanged. The cancel
return on `/pricing/` changes copy only and does not alter access.

Candidate browser contracts for these states require an explicit non-production
API origin and disposable seeded role sessions. Production API compatibility is
a separate monitoring workflow and is not candidate-approval evidence. See
`docs/API_CONTRACT_TESTS.md`.

## CSP And Third Parties

The frontend must not embed secrets. If a future auth provider or Stripe
Elements integration adds third-party scripts, update `_headers`/CSP and the
privacy documentation in the same reviewed change. Redirect-only flows are
preferred when possible.

## Not Implemented By Frontend Gates

- Stripe webhook reconciliation and entitlement writes (API/data behavior).
- Creation or mutation of Stripe objects inside frontend candidate contracts.
- Saved picks, alerts, and exports.
- Any entitlement decision that is not also enforced by the API.
- Hosted auth widgets beyond the current magic-link/Turnstile flow.
