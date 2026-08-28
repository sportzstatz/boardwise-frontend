#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY_PATH = resolve(ROOT, "assets/data/cfb-active-fbs-teams.json");
const BRANDING_PATH = resolve(ROOT, "assets/data/cfb-team-branding.json");
const RUNTIME_PATH = resolve(ROOT, "assets/js/cfb-team-branding.js");
const LOGO_DIR = resolve(ROOT, "assets/img/cfb/teams");
const LIGHT_SURFACE = "#FBFAF6";
const DARK_INK = "#112740";
const MIN_CONTRAST = 4.5;
const ALLOWED_HOST = "cdn.collegefootballdata.com";

function option(name) {
  const position = process.argv.indexOf(name);
  return position === -1 ? null : process.argv[position + 1];
}

function fail(message) {
  throw new Error(message);
}

function normalizeHex(value) {
  const text = String(value || "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(text)) return null;
  return text.toUpperCase();
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return (0.2126 * channel(r)) + (0.7152 * channel(g)) + (0.0722 * channel(b));
}

function contrast(left, right) {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function darken(hex, amount) {
  const values = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `#${values.map((value) => Math.max(0, Math.round(value * (1 - amount))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function accessibleProbabilityColor(primary) {
  if (contrast(primary, LIGHT_SURFACE) >= MIN_CONTRAST) return { color: primary, source: "official-metadata" };
  for (let amount = 0.08; amount <= 0.72; amount += 0.04) {
    const candidate = darken(primary, amount);
    if (contrast(candidate, LIGHT_SURFACE) >= MIN_CONTRAST) {
      return { color: candidate, source: "computed-accessible-variant" };
    }
  }
  return { color: DARK_INK, source: "computed-accessible-fallback" };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    fail("downloaded asset is not a PNG");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function downloadLogo(urlText) {
  const url = new URL(urlText);
  if (url.protocol !== "https:" || url.hostname !== ALLOWED_HOST || !url.pathname.endsWith(".png")) {
    fail(`unapproved logo URL: ${url.origin}${url.pathname}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { redirect: "error", signal: controller.signal });
    if (!response.ok) fail(`logo request failed with HTTP ${response.status}: ${url.pathname}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("image/png")) fail(`logo is not image/png: ${url.pathname}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1_000_000) fail(`logo exceeds one-megabyte ceiling: ${url.pathname}`);
    const dimensions = pngDimensions(bytes);
    if (dimensions.width < 128 || dimensions.height < 128) fail(`logo is smaller than 128px: ${url.pathname}`);
    return { bytes, dimensions };
  } finally {
    clearTimeout(timer);
  }
}

async function mapConcurrent(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

const sourcePath = option("--source");
const retrievedAt = option("--retrieved-at");
if (!sourcePath || !retrievedAt || Number.isNaN(Date.parse(retrievedAt))) {
  fail("usage: node scripts/refresh-cfb-team-branding.mjs --source <cfbd-json> --retrieved-at <ISO-8601>");
}

const source = JSON.parse(await readFile(resolve(sourcePath), "utf8"));
if (!Array.isArray(source)) fail("CFBD source must be an array");
const teams = source.map((team) => {
  const id = Number(team?.id);
  const school = String(team?.school || "").trim();
  const mascot = String(team?.mascot || "").trim();
  const classification = String(team?.classification || "").trim().toLowerCase();
  const primary = normalizeHex(team?.color);
  const secondary = normalizeHex(team?.alternateColor) || "#FFFFFF";
  const sourceUrl = String(Array.isArray(team?.logos) ? team.logos[0] : "").replace(/^http:/, "https:");
  if (!Number.isSafeInteger(id) || id <= 0 || !school || classification !== "fbs" || !primary || !sourceUrl) {
    fail(`invalid CFBD FBS team metadata for id ${team?.id}`);
  }
  return {
    cfbd_team_id: id,
    team_key: `cfb-${id}`,
    display_name: mascot ? `${school} ${mascot}` : school,
    school,
    mascot: mascot || null,
    abbreviation: String(team?.abbreviation || "").trim() || null,
    classification: "fbs",
    conference: String(team?.conference || "").trim() || null,
    primary,
    secondary,
    source_url: sourceUrl,
  };
}).sort((left, right) => left.team_key.localeCompare(right.team_key, "en", { numeric: true }));

if (teams.length === 0 || new Set(teams.map((team) => team.team_key)).size !== teams.length) {
  fail("CFBD inventory is empty or contains duplicate canonical keys");
}

await mkdir(LOGO_DIR, { recursive: true });
await mkdir(dirname(INVENTORY_PATH), { recursive: true });

const brandingTeams = await mapConcurrent(teams, 6, async (team) => {
  const { bytes, dimensions } = await downloadLogo(team.source_url);
  const filename = `${team.team_key}.png`;
  await writeFile(resolve(LOGO_DIR, filename), bytes);
  const probability = accessibleProbabilityColor(team.primary);
  return {
    team_key: team.team_key,
    cfbd_team_id: team.cfbd_team_id,
    display_name: team.display_name,
    classification: team.classification,
    logo: `/assets/img/cfb/teams/${filename}`,
    logo_width: dimensions.width,
    logo_height: dimensions.height,
    logo_sha256: sha256(bytes),
    primary: team.primary,
    secondary: team.secondary,
    probability_color: probability.color,
    text_on_primary: contrast("#FFFFFF", team.primary) >= contrast(DARK_INK, team.primary) ? "#FFFFFF" : DARK_INK,
    color_source: probability.source,
    source: "college-football-data-team-metadata",
    source_url: team.source_url,
    retrieved_at: new Date(retrievedAt).toISOString(),
  };
});

const inventory = {
  schema_version: 1,
  season: 2026,
  classification: "fbs",
  canonical_source: "BoardWise rh.teams + rh.team_membership, reconciled to CFBD /teams/fbs?year=2026",
  team_count: teams.length,
  teams: teams.map(({ primary: _primary, secondary: _secondary, source_url: _sourceUrl, ...team }) => team),
};
const branding = {
  schema_version: 1,
  season: 2026,
  source: "CollegeFootballData.com team metadata and logo CDN",
  source_terms: "https://collegefootballdata.com/terms",
  usage_note: "Team marks identify their respective programs; all marks remain property of their respective owners.",
  retrieved_at: new Date(retrievedAt).toISOString(),
  surface: LIGHT_SURFACE,
  minimum_probability_contrast: MIN_CONTRAST,
  team_count: brandingTeams.length,
  teams: brandingTeams,
};

await writeFile(INVENTORY_PATH, `${JSON.stringify(inventory, null, 2)}\n`);
await writeFile(BRANDING_PATH, `${JSON.stringify(branding, null, 2)}\n`);
const runtime = `// Generated by scripts/refresh-cfb-team-branding.mjs.\n(function () {\n  const teams = ${JSON.stringify(Object.fromEntries(brandingTeams.map((team) => [team.team_key, { logo: team.logo, primary: team.primary, secondary: team.secondary, probabilityColor: team.probability_color }])), null, 2)};\n  window.BoardWiseCfbBranding = Object.freeze({ teams: Object.freeze(teams), fallback: Object.freeze({ primary: "#667085", secondary: "#D0D5DD", probabilityColor: "#344054" }) });\n})();\n`;
await writeFile(RUNTIME_PATH, runtime);

console.log(JSON.stringify({
  source: basename(sourcePath),
  season: inventory.season,
  team_count: teams.length,
  logos_written: brandingTeams.length,
  provider_metadata_requests: 0,
  logo_download_requests: brandingTeams.length,
  inventory_path: INVENTORY_PATH,
  branding_path: BRANDING_PATH,
}, null, 2));
