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