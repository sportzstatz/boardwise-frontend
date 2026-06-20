import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_DIR = resolve(ROOT_DIR, "assets/img/mlb/team-logos");
const PROVENANCE_PATH = resolve(LOGO_DIR, "PROVENANCE.md");

async function loadBrandingHooks() {
  vi.resetModules();
  const testWindow = /** @type {Window & { __BoardWiseMlbBrandingTestHooks?: any }} */ (window);
  delete window.BoardWiseMlbBranding;
  delete testWindow.__BoardWiseMlbBrandingTestHooks;
  await import("../assets/js/mlb-team-branding.js");
  return testWindow.__BoardWiseMlbBrandingTestHooks;
}

afterEach(() => {
  const testWindow = /** @type {Window & { __BoardWiseMlbBrandingTestHooks?: any }} */ (window);
  delete window.BoardWiseMlbBranding;
  delete testWindow.__BoardWiseMlbBrandingTestHooks;
});

describe("mlb team logo assets", () => {
  it("ships a local SVG file for every registered MLB team", async () => {
    const hooks = await loadBrandingHooks();
    const expectedLogos = Object.values(hooks.MLB_TEAM_BRANDS)
      .map((brand) => brand.logo)
      .sort();
    const actualLogos = readdirSync(LOGO_DIR)
      .filter((name) => name.endsWith(".svg"))
      .sort();

    expect(new Set(expectedLogos).size).toBe(30);
    expect(actualLogos).toEqual(expectedLogos);
  });

  it("keeps imported SVG files self-contained and renderable", async () => {
    const hooks = await loadBrandingHooks();
    const logos = Object.values(hooks.MLB_TEAM_BRANDS).map((brand) => brand.logo);

    for (const logo of logos) {
      const filePath = resolve(LOGO_DIR, logo);
      const svg = readFileSync(filePath, "utf8");
      const externalUrls = [...svg.matchAll(/https?:\/\/[^"'\s<>]+/gi)]
        .map((match) => match[0])
        .filter((url) => url !== "http://www.w3.org/2000/svg");

      expect(statSync(filePath).size).toBeGreaterThan(100);
      expect(svg).toMatch(/^<svg\b/);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toMatch(/\bviewBox="/);
      expect(svg).not.toContain("preserve-aspect-ratio");
      expect(svg).not.toMatch(/<script\b|<foreignObject\b|<image\b|on[a-z]+\s*=|(?:xlink:)?href\s*=|data:|@import/i);
      expect(externalUrls).toEqual([]);
    }
  });

  it("documents the logo package source and license metadata", () => {
    const provenance = readFileSync(PROVENANCE_PATH, "utf8");

    expect(provenance).toContain("react-mlb-logos@1.1.2");
    expect(provenance).toContain("https://registry.npmjs.org/react-mlb-logos/-/react-mlb-logos-1.1.2.tgz");
    expect(provenance).toContain("Package metadata license: ISC");
  });
});
