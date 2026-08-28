#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY_PATH = resolve(ROOT, "assets/data/cfb-active-fbs-teams.json");
const BRANDING_PATH = resolve(ROOT, "assets/data/cfb-team-branding.json");
const RUNTIME_PATH = resolve(ROOT, "assets/js/cfb-team-branding.js");
const LOGO_DIR = resolve(ROOT, "assets/img/cfb/teams");

function fail(message) {
  throw new Error(message);
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const values = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return (0.2126 * channel(values[0])) + (0.7152 * channel(values[1])) + (0.0722 * channel(values[2]));
}

function contrast(left, right) {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const inventory = JSON.parse(await readFile(INVENTORY_PATH, "utf8"));
const branding = JSON.parse(await readFile(BRANDING_PATH, "utf8"));
if (inventory.schema_version !== 1 || inventory.season !== 2026 || inventory.classification !== "fbs") fail("inventory identity invalid");
if (branding.schema_version !== 1 || branding.season !== inventory.season) fail("branding identity invalid");
if (!Array.isArray(inventory.teams) || inventory.team_count !== inventory.teams.length) fail("inventory count invalid");
if (!Array.isArray(branding.teams) || branding.team_count !== branding.teams.length) fail("branding count invalid");

const inventoryKeys = inventory.teams.map((team) => team.team_key);
const brandingKeys = branding.teams.map((team) => team.team_key);
const stableSort = (values) => [...values].sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
if (new Set(inventoryKeys).size !== inventoryKeys.length || new Set(brandingKeys).size !== brandingKeys.length) fail("duplicate canonical team key");
if (JSON.stringify(stableSort(inventoryKeys)) !== JSON.stringify(inventoryKeys)) fail("inventory is not deterministically ordered");
if (JSON.stringify(stableSort(brandingKeys)) !== JSON.stringify(brandingKeys)) fail("branding is not deterministically ordered");
if (JSON.stringify(inventoryKeys) !== JSON.stringify(brandingKeys)) fail("active FBS inventory and branding coverage differ");

const actualLogos = (await readdir(LOGO_DIR)).filter((name) => name.endsWith(".png")).sort();
const expectedLogos = branding.teams.map((team) => `${team.team_key}.png`).sort();
if (JSON.stringify(actualLogos) !== JSON.stringify(expectedLogos)) fail("logo directory differs from the active FBS manifest");

for (const team of branding.teams) {
  if (team.classification !== "fbs" || !/^cfb-[1-9][0-9]*$/.test(team.team_key)) fail(`invalid branding identity: ${team.team_key}`);
  if (!/^#[0-9A-F]{6}$/.test(team.primary) || !/^#[0-9A-F]{6}$/.test(team.secondary) || !/^#[0-9A-F]{6}$/.test(team.probability_color)) fail(`invalid color: ${team.team_key}`);
  if (contrast(team.probability_color, branding.surface) + 1e-9 < branding.minimum_probability_contrast) fail(`probability contrast failed: ${team.team_key}`);
  if (!team.color_source || !team.source_url.startsWith("https://cdn.collegefootballdata.com/")) fail(`source metadata invalid: ${team.team_key}`);
  const path = resolve(ROOT, team.logo.replace(/^\//, ""));
  const bytes = await readFile(path);
  const metadata = await stat(path);
  if (!metadata.isFile() || bytes.length < 100 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") fail(`corrupt PNG: ${team.team_key}`);
  if (bytes.readUInt32BE(16) !== team.logo_width || bytes.readUInt32BE(20) !== team.logo_height || team.logo_width < 128 || team.logo_height < 128) fail(`PNG dimensions differ: ${team.team_key}`);
  if (createHash("sha256").update(bytes).digest("hex") !== team.logo_sha256) fail(`PNG digest differs: ${team.team_key}`);
}

const runtime = await readFile(RUNTIME_PATH, "utf8");
for (const key of brandingKeys) if (!runtime.includes(`"${key}"`)) fail(`runtime branding is missing ${key}`);
console.log(JSON.stringify({
  season: inventory.season,
  active_fbs_team_count: inventory.team_count,
  branding_entry_count: branding.team_count,
  local_logo_count: actualLogos.length,
  corrupt_or_missing: 0,
  contrast_failures: 0,
  duplicate_keys: 0,
  unknown_entries: 0,
}, null, 2));
