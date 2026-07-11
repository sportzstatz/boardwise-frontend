# API Contract Tests

These tests verify that the public BoardWise API returns the response shapes the
frontend expects.

They are contract drift checks, not browser end-to-end tests and not data
correctness tests. The assertions stay broad enough to catch missing fields or
type changes without failing on normal slate and performance-data movement.

The guest checks also enforce the access boundary: the landing snapshot is
shared-cacheable and contains matchup identity plus aggregate results only,
while both player-props route aliases return the structured `mlb_board_basic`
`401` before malformed-date validation.

## Run Locally

```bash
npm run test:contracts
```

Run the tests headed only when debugging Playwright behavior:

```bash
npm run test:contracts:headed
```

## Env Overrides

Override the API base:

```bash
BOARDWISE_CONTRACT_API_BASE=https://api.useboardwise.com npm run test:contracts
```

Override the primary performance sport:

```bash
BOARDWISE_CONTRACT_SPORT=mlb npm run test:contracts
```

## Covered Endpoints

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

## Intentionally Excluded

- Magic-link start
- Magic-link verify
- Logout
- Operator/admin endpoints
- Endpoints requiring secrets
- Endpoints that send email or mutate production state
- Retired off-season board endpoints, including NHL board transport
- Exact game counts
- Exact ROI, pick counts, records, dates, or book availability

## Why Dynamic Values Are Not Asserted

The live API changes as slates publish, picks settle, odds move, and sports move
in and out of season. These tests assert that the frontend's required arrays,
objects, strings, booleans, and number-like fields are present. They avoid exact
counts or business values so CI catches breaking shape changes without becoming
a fragile scoreboard test.
