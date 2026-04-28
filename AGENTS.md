# Agent Instructions for `boardwise-frontend`

`boardwise-frontend` is the source for the BoardWise static product
UI deployed to **Cloudflare Pages** at `https://useboardwise.com`.
There is no server runtime and no Docker. Pushes to `main` (subject
to branch protection) trigger a Cloudflare Pages deploy.

This file is the agent-tool-agnostic entry point. The Copilot-specific
restatement at `.github/copilot-instructions.md` must remain
consistent with this file.

## Always do this first

```bash
git status -sb
git remote -v
git fetch --prune origin
git branch --show-current
git log --oneline -5
```

If `git status -sb` is not clean and you did not author the dirty
state, stop and ask.

## Branching

- Feature branch from `origin/main`. Convention: `<prefix>/<topic>`.
- Never edit `main` directly without explicit authorization.
- Never `git push --force` or rewrite published history without
  explicit authorization.
- `main` is **branch-protected**: PR required, no force-push, no
  delete (see `sportzstatz/boardwise-ops` →
  `docs/branch-protection-status.md`).
- Merging to `main` triggers a Cloudflare Pages deploy. Treat each
  merge as a production deploy.

## Secrets

- Never commit `.env`, `.dev.vars`, Cloudflare API tokens,
  Cloudflare Pages deploy hooks, GitHub PATs, or any credential
  value.
- Static assets are public by definition — do not embed secrets in
  HTML/JS/CSS.
- Use `<REDACTED>` placeholders in examples.

## Build / test / runtime

- This repo currently ships static HTML/CSS/JS plus Cloudflare
  `_headers`. There is no Node build step at the repo root today.
- Local preview: any static file server pointed at the repo root
  (e.g. `python3 -m http.server 8080`) is sufficient.
- Validation before merge:
  - Open the touched page locally and visually confirm.
  - For API-consuming pages, hit `https://api.useboardwise.com/healthz`
    and `/api/v1/boards/mlb/current` and confirm the page renders the
    expected `target_date` / `mode` / `game_count`.
  - Check Cloudflare cache headers (`cf-cache-status`) if cache
    behavior was touched — coordinate via `sportzstatz/boardwise-ops`
    → `runbooks/cloudflare-tunnel-verification.md` and the cache
    asset rule in repo memory.

## Production mutation rules

- Merging to `main` deploys to `useboardwise.com`. Do not merge
  without explicit authorization.
- Do not change `_headers`, redirect rules, or CORS-relevant behavior
  without coordinating with `boardwise-api` (the
  `BOARDWISE_FRONTEND_*` permitted-origins list lives in `main.py`
  there).

## Cross-repo runbooks

For runbooks that involve this repo, see
`sportzstatz/boardwise-ops`:

- `runbooks/cloudflare-tunnel-verification.md`
- `runbooks/security-redaction-rules.md`
- `docs/branch-protection-status.md`

## Final response shape

For each completed task, the agent's final message should list:

1. Branch and commit SHA(s).
2. Files changed with workspace-relative paths.
3. Validation run (local preview + relevant API smoke if applicable).
4. PR URL if any.
5. Anything intentionally left as a template / not executed.
