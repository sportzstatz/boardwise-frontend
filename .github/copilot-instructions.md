# Copilot Instructions for `boardwise-frontend`

This file is the GitHub Copilot–specific entry point. The
agent-tool-agnostic version lives at `AGENTS.md` at the repo root.
`AGENTS.md` is authoritative if these two ever drift.

## What this repo is

`boardwise-frontend` is the BoardWise static product UI deployed to
**Cloudflare Pages** at `https://useboardwise.com`. There is no
server runtime and no Docker. Pushes to `main` trigger a Cloudflare
Pages deploy.

It calls the public API at `https://api.useboardwise.com` (served by
`sportzstatz/boardwise-api` on 7060). It is **not** the legacy
`sportzstatz.github.io` mirror — that repo is the legacy generated
mirror and is not canonical.

## Default behavior

- Feature branch from `origin/main`. Do not edit `main` directly
  without explicit authorization.
- `main` is branch-protected (PR required, no force-push, no delete).
- Merging to `main` deploys to production. Treat every merge as a
  production deploy and require explicit authorization to merge.
- This repo has no `scripts/repo_secrets_precheck.sh`. Run a manual
  forbidden-file scan before committing (look for `.env`, `.dev.vars`,
  Cloudflare API tokens, deploy hooks, embedded credentials in
  HTML/JS).

## Secrets policy

Never commit `.env`, `.dev.vars`, Cloudflare API tokens, Pages
deploy hooks, GitHub PATs, or any credential value. Static assets
are public — do not embed secrets in HTML/JS/CSS.

For the full forbidden list and required redaction patterns, see
`sportzstatz/boardwise-ops` → `runbooks/security-redaction-rules.md`.

## Code style

- Languages: HTML, CSS, vanilla JS (no framework build at repo root
  today).
- Formatter: none enforced — match surrounding style.
- Linter: none enforced.
- No automated test suite at repo root. Validate by local preview
  plus the API smoke checks below.

## Validation before merge

Local preview:

```bash
python3 -m http.server 8080  # then visit http://127.0.0.1:8080/
```

API smoke (the page should render data sourced from these):

```bash
curl -fsS https://api.useboardwise.com/healthz
curl -fsS https://api.useboardwise.com/api/v1/boards/mlb/current \
  | jq '{target_date, mode, game_count}'
```

If you touched `_headers`, redirects, or anything that affects
CORS/caching, also check `cf-cache-status` on a request to the
deployed origin and coordinate with `boardwise-api` (the permitted
origins list lives in its `main.py`).

## Docker / runtime

None. This repo deploys as static assets via Cloudflare Pages.

## Cross-repo runbooks

- `sportzstatz/boardwise-ops` → `runbooks/cloudflare-tunnel-verification.md`
- `sportzstatz/boardwise-ops` → `docs/branch-protection-status.md`
- `sportzstatz/boardwise-ops` → `runbooks/security-redaction-rules.md`

## Final response shape

For each completed task, the final assistant message should list:

1. Branch and commit SHA(s).
2. Files changed with workspace-relative paths.
3. Validation run (local preview + relevant API smoke if applicable).
4. PR URL if any.
5. Anything intentionally left as a template / not executed.
