// @ts-check
// DOM contract for the game detail v2 page against the props response shapes
// documented in docs/Eagle_Eye_Props/02 §3 (full / summary / empty). Rendered
// with route-mocked payload fixtures — asserts the page consumes every
// contract surface it depends on (counts, buckets, pitchers, batters,
// top_plays, engine, upgrade) without leaking or inventing fields.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../fixtures");
const FROZEN_NOW = new Date("2026-06-18T12:00:00-05:00").valueOf();

async function fixture(name) {
  return JSON.parse(await readFile(resolve(FIXTURE_DIR, name), "utf8"));
}

async function mockDetailApis(page, { board, props, authenticated }) {
  await page.addInitScript((now) => {
    Date.now = () => now;
  }, FROZEN_NOW);

  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated,
        user: authenticated ? { email: "founder@example.com" } : null,
        plan: authenticated ? "founder" : "guest",
        features: { mlb_board_basic: true, mlb_board_advanced: authenticated },
      }),
    });
  });

  await page.route("**/api/v1/boards/mlb/**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(board) });
  });

  await page.route("**/api/v1/mlb/games/**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(props) });
  });
}

async function renderDetail(page, options, query = "?game_pk=777001") {
  await mockDetailApis(page, options);
  await page.goto(`/mlb/game/${query}`);
  await expect(page.locator("#gd-loading")).toBeHidden();
  await expect(page.locator("#gd-detail")).toBeVisible();
}

test.describe("MLB game detail v2 consumes the props response contract", () => {
  test("access:full renders buckets, pitchers, batters, and counts verbatim", async ({ page }) => {
    const board = await fixture("mlb-game-detail-payload.json");
    const props = await fixture("mlb-game-props-payload.json");
    await renderDetail(page, { board, props, authenticated: true });

    // The props fetch went to the documented route with the page's date param.
    // Default tab honors counts.quoted > 0.
    await expect(page.locator('[data-gd2-panel="props"]')).toBeVisible();

    // Ranked plays render the Prime bucket ONLY (operator decision
    // 2026-07-02): lower buckets stay in the API payload but never render,
    // and the pitcher duel is the next section.
    const prime = props.buckets.find((bucket) => bucket.key === "prime");
    await expect(page.locator(".gd2-bucket")).toHaveCount(1);
    const group = page.locator('.gd2-bucket[data-bucket-key="prime"]');
    await expect(group.locator(".gd2-bucket-name")).toHaveText(prime.label);
    await expect(group.locator(".gd2-bucket-meta")).toHaveText(prime.meta);
    await expect(group.locator(".gd2-rank-card")).toHaveCount(prime.rows.length);
    await expect(page.locator("[data-gd2-min-bucket]")).toHaveCount(0);
    await expect(page.locator(".gd2-no-edge")).toHaveCount(0);
    await expect(
      page.locator('[data-gd2-props-section="ranked"] + [data-gd2-props-section="pitchers"]')
    ).toHaveCount(1);

    // top_plays (≤2) render as the top prop cards.
    await expect(page.locator(".gd2-top-play")).toHaveCount(props.top_plays.length);
    await expect(page.locator(".gd2-top-play").first()).toContainText(props.top_plays[0].bet_label);
    await expect(page.locator(".gd2-top-play").first()).toContainText(props.top_plays[0].quote_short);

    // Pitchers: away first then home, rows in fixed market order.
    const pitcherNames = await page.locator(".gd2-pitcher-card .gd2-player-name").allTextContents();
    expect(pitcherNames).toEqual(props.pitchers.map((pitcher) => pitcher.name));
    const firstPitcherLabels = await page
      .locator(".gd2-pitcher-card")
      .first()
      .locator(".gd2-prop-label")
      .allTextContents();
    expect(firstPitcherLabels.map((label) => label.trim())).toEqual(
      props.pitchers[0].rows.map((row) => row.bet_label)
    );

    // Batters: sorted by batting order per column; model-only HR rows show
    // the No line / — columns; quote_short renders verbatim (U+2212 intact).
    const awayCards = page.locator(".gd2-lineups .gd2-lineup-col").first().locator(".gd2-batter-card");
    await expect(awayCards).toHaveCount(props.batters.away.players.length);
    await expect(awayCards.first()).toContainText(props.batters.away.players[0].name);
    await expect(page.locator(".gd2-hr-row").first()).toContainText("1+ home run");
    await expect(page.locator(".gd2-hr-row").first()).toContainText("No line");
    await expect(page.locator('[data-gd2-panel="props"]')).toContainText("DK −128");

    // engine fields surface on the Model tab.
    await page.locator('[data-gd2-tab="model"]').click();
    await expect(page.locator('[data-gd2-panel="model"]')).toContainText("20k sim paths");
    await expect(page.locator('[data-gd2-panel="model"]')).toContainText(props.engine.model_version);
    await expect(page.locator('[data-gd2-panel="model"]')).toContainText(
      `rolling calibration is currently ${props.engine.calibration}`
    );
  });

  test("access:summary renders the lock panel from counts + top_bucket + upgrade", async ({ page }) => {
    const board = await fixture("mlb-game-detail-preview-payload.json");
    const props = await fixture("mlb-game-props-summary-payload.json");
    await renderDetail(page, { board, props, authenticated: false });

    const lock = page.locator('[data-gd2-panel="props"] .gd2-lock');
    await expect(lock).toBeVisible();
    await expect(lock).toContainText(
      `${props.counts.forecasts} model forecasts for this game — ${props.counts.quoted} quoted by the books`
    );
    await expect(lock).toContainText("two plays above the Prime line today");
    await expect(lock.locator(".gd2-btn-gold")).toHaveAttribute("href", props.upgrade.upgrade_path);
    await expect(lock.locator("[data-auth-guest]")).toHaveAttribute("href", "/login/");
    // Summary payloads carry no rows — nothing premium may render.
    await expect(page.locator(".gd2-rank-card")).toHaveCount(0);
    await expect(page.locator(".gd2-pitcher-card")).toHaveCount(0);
  });

  test("state:no_props_published renders the quiet empty card, board tabs unaffected", async ({ page }) => {
    const board = await fixture("mlb-game-detail-payload.json");
    const props = {
      access: "full",
      game: { game_pk: 777001, date: "2026-06-18", away_abbr: "TOR", home_abbr: "BOS" },
      engine: { family: "eagle_eye", display_name: "Eagle Eye", book: "draftkings" },
      counts: { forecasts: 0, quoted: 0, picks: 0, no_edge: 0 },
      top_plays: [],
      buckets: [],
      pitchers: [],
      batters: { away: { team_abbr: "TOR", players: [] }, home: { team_abbr: "BOS", players: [] } },
      state: "no_props_published",
    };
    await renderDetail(page, { board, props, authenticated: true });

    // quoted == 0 → Markets is the default tab and renders fully.
    await expect(page.locator('[data-gd2-panel="markets"]')).toBeVisible();
    await expect(page.locator(".gd2-mkt-option").first()).toBeVisible();
    await page.locator('[data-gd2-tab="props"]').click();
    await expect(page.locator('[data-gd2-panel="props"]')).toContainText("No player props have been published");
  });

  test("a failing props endpoint never blanks the page", async ({ page }) => {
    const board = await fixture("mlb-game-detail-payload.json");
    await page.addInitScript((now) => {
      Date.now = () => now;
    }, FROZEN_NOW);
    await page.route("**/api/v1/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          user: { email: "founder@example.com" },
          plan: "founder",
          features: { mlb_board_basic: true, mlb_board_advanced: true },
        }),
      });
    });
    await page.route("**/api/v1/boards/mlb/**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(board) });
    });
    await page.route("**/api/v1/mlb/games/**", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "boom" }) });
    });

    const consoleErrors = [];
    page.on("pageerror", (error) => consoleErrors.push(String(error)));

    await page.goto("/mlb/game/?game_pk=777001");
    await expect(page.locator("#gd-detail")).toBeVisible();
    await expect(page.locator("#gd-error")).toBeHidden();
    await expect(page.locator('[data-gd2-panel="markets"]')).toBeVisible();
    await page.locator('[data-gd2-tab="props"]').click();
    await expect(page.locator('[data-gd2-panel="props"]')).toContainText("Player props couldn't load");
    expect(consoleErrors).toEqual([]);
  });
});
