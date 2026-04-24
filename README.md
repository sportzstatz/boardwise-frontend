# BoardWise Frontend

This repo is the source of truth for the public BoardWise static frontend.

## Active hosting track

Cloudflare Pages is the chosen hosting track for this cutover.

Why this track won:

- the live domains are already served through Cloudflare
- the repo already uses `_headers`, which matches the Cloudflare Pages model
- no `CNAME` file is currently required for the active live path

## Site structure

- `/` is the landing page
- `/mlb/` fetches the live MLB board JSON from `https://api.useboardwise.com/api/v1/boards/mlb/current`
- `assets/css/site.css` contains the shared site styles
- `assets/js/mlb-board.js` renders the MLB board payload in the browser

## Deployment notes

- keep this repo as the frontend source of truth
- do not republish generated HTML from `SportsPredictionsHub` into this repo
- keep `_headers` in place for Cloudflare Pages header behavior
- do not introduce a GitHub Pages `CNAME` file unless the hosting platform changes intentionally

## Runtime boundary

- static frontend: `useboardwise.com`
- API: `api.useboardwise.com`

The frontend is static only. All live board data comes from the 7060 API.

## Local preview (no build step)

This repo has no build pipeline. To preview locally, serve the directory with any static HTTP server and open the URLs in a browser:

```bash
cd /path/to/boardwise-frontend
python3 -m http.server 9876
# then open:
#   http://127.0.0.1:9876/
#   http://127.0.0.1:9876/mlb/
#   http://127.0.0.1:9876/mlb/?date=2026-04-22
```

The MLB page fetches data from `https://api.useboardwise.com` (CORS allows `http://localhost`/`127.0.0.1`-style origins is NOT configured — for local preview the API calls will be subject to the production CORS allowlist, which is `useboardwise.com`, `www.useboardwise.com`, `staging.useboardwise.com`, and `boardwise-frontend.pages.dev`). For style-only preview against canned JSON, point `API_BASE` in `assets/js/mlb-board.js` to a local JSON file or use a browser extension to override CORS.

## Style-edit workflow

When the API contract is stable, day-to-day edits go in:

- `assets/css/site.css` — colors, spacing, layout. Theme tokens live in the `:root` block at the top.
- `assets/js/mlb-board.js` — card construction and data formatting (`renderGame`, `renderRecommendation`, etc.).
- `index.html`, `mlb/index.html` — page structure / DOM ids that the JS targets.

After saving, refresh the local preview URL (no rebuild). Commit and push to `main` to deploy via Cloudflare Pages.