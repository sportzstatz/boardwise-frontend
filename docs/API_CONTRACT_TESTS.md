# API Contract Tests

These tests verify that an explicitly selected BoardWise API returns the
response shapes and access behavior the candidate frontend expects. There is
no implicit API target: `BOARDWISE_CONTRACT_API_BASE` is required, and the
configuration fails before test discovery when it is absent or invalid.

The reusable candidate gate and production compatibility monitoring are
different workflows:

- `.github/workflows/candidate-contract-gate.yml` is callable only by a release
  orchestrator. It checks out and verifies all three exact SHAs before testing
  a non-production API. Its result is authoritative only when the private ops
  workflow also proves that API/database stack was started from those sources;
  there is deliberately no standalone manual dispatch that can self-attest an
  unrelated API URL.
- `.github/workflows/production-api-compatibility.yml` explicitly targets the
  deployed production API. It monitors drift but is non-authoritative for a
  candidate release.

The existing frontend deployment gate also consumes an explicit API origin,
but its compatibility result is not cross-repository candidate evidence.

The request-level assertions stay broad enough to catch missing fields or type
changes without failing on ordinary slate and performance-data movement. The
authenticated browser matrix is intentionally exact because it runs against
deterministic candidate fixtures.

## Run Locally

Supply a local candidate API origin explicitly:

```bash
BOARDWISE_CONTRACT_API_BASE=http://127.0.0.1:8000 \
  BOARDWISE_CONTRACT_TARGET=candidate \
  npm run test:contracts
```

This runs request-level API contracts plus route-mocked DOM contracts. Run only
one portion with `npm run test:contracts:api` or
`npm run test:contracts:dom`. Add `--headed` through
`npm run test:contracts:headed` only while debugging.

Omitting the base is an expected hard failure:

```bash
npm run test:contracts
```

## Authenticated Candidate Matrix

`npm run test:contracts:candidate` adds real browser checks for seeded Free,
Founder, and Admin sessions. It requires these environment-scoped inputs:

```text
BOARDWISE_CONTRACT_API_BASE
BOARDWISE_CONTRACT_TARGET=candidate
BOARDWISE_CONTRACT_FREE_SESSION_TOKEN
BOARDWISE_CONTRACT_FOUNDER_SESSION_TOKEN
BOARDWISE_CONTRACT_ADMIN_SESSION_TOKEN
BOARDWISE_CONTRACT_SESSION_COOKIE
```

The cookie-name input defaults to the API's current `__Host-bw_session`
contract. A local HTTP candidate that is intentionally configured with a
non-secure test cookie must supply the same test cookie name to the browser
workflow. Session values belong in protected environment secret storage; do
not put them in repository variables, command arguments, logs, or artifacts.

The role matrix proves:

- Guest public pages render without actionable MLB cards, and the board itself
  retains its `401` sign-in treatment.
- Free receives exactly two complete current-board cards, advanced routes are
  gated, checkout-disabled UI fails safely, cancel leaves access unchanged,
  and a success return polls backend billing state without granting access
  locally.
- Founder receives the complete board, Founder account billing controls, and
  the concealed `404` performance contract.
- Admin receives Founder board access plus the concealed performance UI/API,
  while account billing copy does not misrepresent Admin as paid access.

The candidate gate also requires checkout to be disabled. Stripe lifecycle
automation is owned by the API/staging gate; these browser checks do not create
a paid subscription or treat a Checkout redirect as proof of payment.

## Request-Level Endpoints

- `/api/v1/me`
- `/api/v1/public/landing/mlb`
- `/api/v1/boards/mlb/current`
- `/api/v1/mlb/games/{game_pk}/props`
- `/api/mlb/game/{game_pk}/props` (legacy alias)
- `/api/v1/performance/filters`
- `/api/v1/performance/summary`
- `/api/v1/performance/breakdown`
- `/api/v1/performance/picks`
- `/api/v1/performance/book-comparison`
- `/api/v1/billing/checkout`
- `/api/v1/billing/status`
- `/api/v1/billing/portal`

Guest checks enforce the access boundary: the landing snapshot is
shared-cacheable and contains matchup identity plus aggregate results only,
while board/props routes preserve the structured `mlb_board_basic` `401`.
Authenticated and denied account, board, performance, and billing responses
must preserve private/no-store headers.

## Evidence And Retention

The reusable workflow writes this sanitized artifact subtree:

```text
frontend-contracts/
  result.json
  junit.xml
  playwright-report/
    index.html
```

`result.json` identifies the release, workflow run, and all three exact SHAs. A
passing result requires zero failed, skipped, or xfailed tests. Candidate
traces, videos, and screenshots are disabled because authenticated browser
capture can retain session headers or test-user data. The HTML/JUnit report is
scanned for the scoped session values and Cookie headers before upload. Success
and failure artifacts are retained for 30 days. A minimal failed `result.json`
is created before report inspection, so configuration, collection, web-server,
or sanitizer failures still leave safe machine-readable failure evidence.

## Intentionally Excluded

- Magic-link start and verify mutations
- Logout
- Operator/admin mutation endpoints
- Real Stripe Checkout or Customer Portal session creation
- Stripe webhooks and raw provider payloads
- Retired off-season board endpoints, including NHL board transport
- Exact production game counts, ROI, records, dates, or book availability

Production compatibility assertions avoid exact business values because the
deployed API changes as slates publish, picks settle, odds move, and sports move
in and out of season. Exact candidate role assertions rely only on the seeded
candidate database.
