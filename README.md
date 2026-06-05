# BoardWise Frontend

Static browser frontend for BoardWise.

This public repository intentionally does not document production hostnames,
IP addresses, SSH targets, deploy checkout paths, production env-file
locations, provider account/tunnel/zone details, internal admin/operator URLs,
or credentials. Production deployment details live in the approved private
operations runbook.

## Runtime Boundary

The frontend ships static HTML, CSS, JavaScript, and generated assets through
the approved static hosting pipeline. It has no app server runtime in this
repo.

Runtime API data is fetched through the configured public API base in browser
code. Do not add production topology, provider details, or credentials to
public docs or static assets.

## Local Development

Install dependencies, then run the checks relevant to your change:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Local preview:

```bash
npm run preview
```

For docs-only changes, `git diff --check` and targeted public-doc hygiene scans
are normally enough.

## Project Layout

- `index.html` — home page.
- `login/index.html` — login flow.
- `mlb/index.html` — MLB board page.
- `nhl/index.html` — NHL board page.
- `performance/index.html` — performance page.
- `pricing/index.html` — pricing page.
- `assets/` — shared browser code and styles.
- `tests/` — unit, contract, accessibility, and visual coverage.

## Public Documentation Hygiene

Do not add production topology or secrets to public docs. Use placeholders for
examples and point production operations work to the private runbook.
