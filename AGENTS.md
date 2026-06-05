# Agent Instructions for `boardwise-frontend`

## What This Repo Is

`boardwise-frontend` is the static frontend for BoardWise. It contains public
HTML, CSS, JavaScript, tests, and build tooling for the browser experience.
There is no app server runtime in this repo.

Production deployment details live in the approved private operations runbook.
Do not add hostnames, IP addresses, SSH targets, deploy checkout paths,
production env-file locations, provider account/tunnel/zone details, internal
admin/operator URLs, or credentials to public repo docs.

## Default Behavior

- Branch from `origin/main` for implementation work.
- Treat merges to `main` as production-affecting unless the task says
  otherwise.
- Do not mutate hosting configuration, deploy hooks, DNS/routing, or provider
  settings unless explicitly authorized.
- Keep changes scoped to the requested user-facing behavior.
- For docs-only changes, do not run the full frontend suite unless runtime files
  change or the task explicitly asks for it.

## Public Documentation Hygiene

Public docs may describe repo-local development, validation, user-facing
contracts, and security expectations. They must not disclose production
hostnames, IPs, SSH targets, deploy paths, production env locations, provider
account/tunnel/zone details, internal admin/operator URLs, or secrets. Use the
approved private operations runbook for production topology.

If an actual secret is discovered, stop normal work immediately. Report only the
secret category, do not paste the value, and recommend revocation/rotation plus
history cleanup as a separate incident-response action.

## Secrets Policy

Never commit `.env`, `.dev.vars`, hosting-provider API tokens or deploy hooks,
GitHub PATs, browser storage, cookies, passwords, private keys, or any
credential value. Static assets are public by definition; do not embed secrets
in HTML, JavaScript, CSS, or generated assets.

## Code Style

- Prefer the existing static-page structure and shared JS helpers.
- Keep browser API calls centralized through the existing API client patterns.
- Preserve public page URLs and user-visible contracts unless explicitly
  changing them.
- Avoid introducing runtime dependencies or server-side behavior without a
  specific task.

## Build And Test

Common local validation commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:contracts
npm run test:a11y
npm run test:visual
npm run build
```

Local preview:

```bash
npm run preview
```

For docs-only changes, prefer:

```bash
git diff --check
```

and targeted scans for accidentally introduced secrets or operational topology.

## Runtime Boundary

This repo ships static browser assets through the approved static hosting
pipeline. Production hosting, routing, provider settings, cache behavior, and
deployment smoke checks belong in private operations documentation.

Documentation-only changes do not require a frontend redeploy.

## Final Response Shape

For completed tasks, report:

1. Branch and commit SHA(s), if created.
2. Files changed, using repo-relative paths.
3. Validation run.
4. PR URL, if opened.
5. Deployment impact.
6. Anything intentionally not executed.
