// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../fixtures");
const FROZEN_NOW = new Date("2026-05-29T12:00:00-05:00").valueOf();

async function fixture(name) {
  const raw = await readFile(resolve(FIXTURE_DIR, name), "utf8");
  return JSON.parse(raw);
}

async function mockBoardPayload(page, payload) {
  await page.addInitScript((now) => {
    Date.now = () => now;
  }, FROZEN_NOW);

  await page.route("**/api/v1/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: false,
        user: null,
        plan: "guest",
        features: {
          mlb_board_basic: true,
          nhl_board_basic: true,
          performance_summary: true,
        },
      }),
    });
  });

  await page.route("**/api/v1/boards/mlb/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}

async function renderBoard(page, payload, query = "") {
  await mockBoardPayload(page, payload);
  await page.goto(`/mlb/${query}`);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#games")).toBeVisible();
}

test.describe("MLB model selector renders from API model family metadata", () => {
  test("selector buttons match available_model_families order, labels, and badges", async ({ page }) => {
    const payload = await fixture("mlb-classic-payload.json");
    await renderBoard(page, payload);

    const metadata = payload.model_metadata;
    const visibleFamilies = metadata.available_model_families.filter(
      (item) =>
        (item.visibility_status || item.status) !== "shadow" ||
        item.key === metadata.selected_model_family
    );
    expect(visibleFamilies.length).toBeGreaterThan(0);

    const buttons = page.locator("#model-selector [data-model-family]");
    await expect(buttons).toHaveCount(visibleFamilies.length);
    for (let index = 0; index < visibleFamilies.length; index += 1) {
      const family = visibleFamilies[index];
      const button = buttons.nth(index);
      await expect(button).toHaveAttribute("data-model-family", family.key);
      await expect(button.locator("span").first()).toHaveText(family.label);
      await expect(button.locator(".model-tag")).toHaveText(family.badge);
    }
  });

  test("a novel model family renders from metadata with zero frontend changes", async ({ page }) => {
    await renderBoard(
      page,
      await fixture("mlb-novel-family-payload.json"),
      "?model=thunder_tusk"
    );

    const buttons = page.locator("#model-selector [data-model-family]");
    await expect(buttons).toHaveCount(2);
    await expect(buttons.nth(0)).toHaveAttribute("data-model-family", "thunder_tusk");
    await expect(buttons.nth(1)).toHaveAttribute("data-model-family", "classic_mlb");

    const novelButton = page.locator('[data-model-family="thunder_tusk"]');
    await expect(novelButton).toBeVisible();
    await expect(novelButton).toHaveClass(/active/);
    await expect(novelButton).toBeEnabled();
    await expect(novelButton.locator("span").first()).toHaveText("Thunder Tusk");
    await expect(novelButton.locator(".model-tag")).toHaveText("Simulation engine");

    // The board itself renders for the unknown-to-the-frontend family.
    await expect(page.locator(".tile")).toHaveCount(1);
    await expect(page.locator("#meta")).toContainText("Thunder Tusk · Simulation engine");
    await expect(page.locator(".best-card")).toContainText("Thunder Tusk");

    // Obsidian-specific visual treatment stays off for non-obsidian families.
    await expect(page.locator("body")).not.toHaveClass(/obsidian-treatment/);
    await expect(page.locator("#obsidian-hero")).toBeHidden();
  });

  test("an unselected shadow family does not render a selector button", async ({ page }) => {
    const payload = await fixture("mlb-classic-payload.json");
    const obsidian = payload.model_metadata.available_model_families.find(
      (item) => item.key === "obsidian_steed"
    );
    expect(obsidian.visibility_status).toBe("shadow");
    expect(payload.model_metadata.selected_model_family).not.toBe("obsidian_steed");

    await renderBoard(page, payload);

    await expect(page.locator("#model-selector")).toBeVisible();
    await expect(page.locator('[data-model-family="obsidian_steed"]')).toHaveCount(0);
    await expect(page.locator("#model-selector")).not.toContainText("Obsidian Steed");
  });
});
