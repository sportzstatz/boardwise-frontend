# BoardWise Frontend

This repo is the source of truth for the public BoardWise static frontend.

## Active hosting track

Cloudflare Pages is the chosen hosting track for this cutover.

Why this track won:

- the live domains are already served through Cloudflare
- the repo already uses `_headers`, which matches the Cloudflare Pages model
- no `CNAME` file is currently required for the active live path

## Site structure

- `/` (`index.html`) is the landing page.
- `/mlb/` (`mlb/index.html`) fetches the live MLB board JSON from `https://api.useboardwise.com/api/v1/boards/mlb/current`.
- `assets/js/mlb-board.js` renders the MLB board payload in the browser.
- `index.html` and `mlb/index.html` currently carry their page-level styles in inline `<style>` blocks; neither page links `assets/css/site.css` today.
- `assets/css/site.css` exists in the repo as a staging ground for shared styles and a future consolidation pass. It is not yet wired into either page, so editing it alone has no visible effect on the deployed site.

## Deployment notes

- keep this repo as the frontend source of truth
- do not republish generated HTML from `SportsPredictionsHub` into this repo
- keep `_headers` in place for Cloudflare Pages header behavior
- do not introduce a GitHub Pages `CNAME` file unless the hosting platform changes intentionally

## Runtime boundary

- static frontend: `useboardwise.com`
- API: `api.useboardwise.com`

The frontend is static only. All live board data comes from the 7060 API.

## Node toolchain

This repo has a Node-based validation/build layer for CI.

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

The build output is written to `dist/`.

For local preview with Vite:

```bash
npm run preview
# open http://127.0.0.1:9876/
```

The production frontend remains static. Runtime API data is still fetched from `https://api.useboardwise.com`.

## Style-edit workflow

When the API contract is stable, day-to-day edits go in:

- `index.html`, `mlb/index.html` — page structure, DOM ids that the JS targets, **and** the inline `<style>` block that currently drives that page's look (colors, spacing, layout, theme tokens in the inline `:root` block).
- `assets/js/mlb-board.js` — card construction and data formatting (`renderGame`, `renderRecommendation`, etc.).
- `assets/css/site.css` — only relevant if/when shared styles get consolidated out of the inline blocks. Until that consolidation lands and both pages `<link>` it, edits here will not affect the live site.

After saving, refresh the local preview URL (no rebuild). Commit and push to `main` to deploy via Cloudflare Pages.
