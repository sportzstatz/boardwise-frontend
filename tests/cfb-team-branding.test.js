import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const inventory = JSON.parse(readFileSync("assets/data/cfb-active-fbs-teams.json", "utf8"));
const branding = JSON.parse(readFileSync("assets/data/cfb-team-branding.json", "utf8"));

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const values = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return (0.2126 * channel(values[0])) + (0.7152 * channel(values[1])) + (0.0722 * channel(values[2]));
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("CFB active FBS branding assets", () => {
  it("covers the canonical current-season inventory exactly once", () => {
    expect(inventory.season).toBe(2026);
    expect(inventory.team_count).toBe(138);
    expect(branding.team_count).toBe(inventory.team_count);
    const inventoryKeys = inventory.teams.map((team) => team.team_key);
    const brandingKeys = branding.teams.map((team) => team.team_key);
    expect(new Set(inventoryKeys).size).toBe(inventoryKeys.length);
    expect(new Set(brandingKeys).size).toBe(brandingKeys.length);
    expect(brandingKeys).toEqual(inventoryKeys);
  });

  it("ships one decodable local PNG with matching dimensions and digest per FBS team", () => {
    const actual = readdirSync("assets/img/cfb/teams").filter((name) => name.endsWith(".png")).sort();
    expect(actual).toEqual(branding.teams.map((team) => `${team.team_key}.png`).sort());
    for (const team of branding.teams) {
      const bytes = readFileSync(resolve(team.logo.replace(/^\//, "")));
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.readUInt32BE(16)).toBe(team.logo_width);
      expect(bytes.readUInt32BE(20)).toBe(team.logo_height);
      expect(team.logo_width).toBeGreaterThanOrEqual(128);
      expect(team.logo_height).toBeGreaterThanOrEqual(128);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(team.logo_sha256);
    }
  });

  it("keeps probability colors readable and records source metadata", () => {
    for (const team of branding.teams) {
      expect(contrast(team.probability_color, branding.surface)).toBeGreaterThanOrEqual(branding.minimum_probability_contrast);
      expect(team.source).toBe("college-football-data-team-metadata");
      expect(team.source_url).toMatch(/^https:\/\/cdn\.collegefootballdata\.com\//);
      expect(team.color_source).toMatch(/^(official-metadata|computed-accessible-variant|computed-accessible-fallback)$/);
    }
  });

  it("documents the owner-directed usage boundary and upstream terms", () => {
    expect(branding.source_terms).toBe("https://collegefootballdata.com/terms");
    expect(branding.usage_note).toContain("respective owners");
  });
});
