# Copilot Instructions for `boardwise-frontend`

The agent-tool-agnostic instructions live in `AGENTS.md`, which is
authoritative if these files ever differ.

## Repo Summary

`boardwise-frontend` is the static frontend for BoardWise. Preserve public page
contracts, keep changes scoped, and keep production topology out of public
source control.

Production deployment details live in the approved private operations runbook.
Do not add hostnames, IP addresses, SSH targets, deploy checkout paths,
production env-file locations, provider account/tunnel/zone details, internal
admin/operator URLs, or credentials to public repo docs.

## Safety

- Never commit `.env`, `.dev.vars`, hosting-provider API tokens or deploy
  hooks, GitHub PATs, browser storage, cookies, passwords, private keys, or any
  credential value.
- Static assets are public; do not embed secrets in HTML, JavaScript, CSS, or
  generated assets.
- Do not mutate hosting configuration, routing, provider settings, or deploy
  hooks unless explicitly authorized.
- Documentation-only changes do not require frontend redeploys.

## Common Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

For docs-only changes, `git diff --check` plus targeted secret/topology scans
is sufficient unless runtime files changed.

## Runtime Boundary

This repo ships static browser assets through the approved static hosting
pipeline. Keep production host, path, provider, environment, routing, and
smoke-test topology in private operations documentation only.
