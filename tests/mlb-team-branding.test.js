import { afterEach, describe, expect, it, vi } from "vitest";

async function loadBranding() {
  vi.resetModules();
  const testWindow = /** @type {Window & { __BoardWiseMlbBrandingTestHooks?: any }} */ (window);
  delete window.BoardWiseMlbBranding;
  delete testWindow.__BoardWiseMlbBrandingTestHooks;
  await import("../assets/js/mlb-team-branding.js");
  return {
    branding: window.BoardWiseMlbBranding,
    hooks: testWindow.__BoardWiseMlbBrandingTestHooks,
  };
}

afterEach(() => {
  const testWindow = /** @type {Window & { __BoardWiseMlbBrandingTestHooks?: any }} */ (window);
  delete window.BoardWiseMlbBranding;
  delete testWindow.__BoardWiseMlbBrandingTestHooks;
});

describe("mlb team branding helper", () => {
  it("resolves canonical abbreviations and logo paths", async () => {
    const { branding } = await loadBranding();
    const brand = branding.getTeamBrand({ abbr: "bal" });

    expect(brand.key).toBe("BAL");
    expect(brand.teamId).toBe(110);
    expect(brand.abbr).toBe("BAL");
    expect(brand.logoPath).toBe("/assets/img/mlb/team-logos/bal.svg");
    expect(brand.primary).toBe("#DF4601");
  });

  it("resolves required abbreviation aliases", async () => {
    const { branding } = await loadBranding();
    expect(branding.getTeamBrand({ abbr: "OAK" }).key).toBe("ATH");
    expect(branding.getTeamBrand({ abbr: "CHW" }).key).toBe("CWS");
    expect(branding.getTeamBrand({ abbr: "KCR" }).key).toBe("KC");
    expect(branding.getTeamBrand({ abbr: "SDP" }).key).toBe("SD");
    expect(branding.getTeamBrand({ abbr: "SFG" }).key).toBe("SF");
    expect(branding.getTeamBrand({ abbr: "TBR" }).key).toBe("TB");
    expect(branding.getTeamBrand({ abbr: "WSN" }).key).toBe("WSH");
  });

  it("lets team ID take precedence over abbreviation and name", async () => {
    const { branding } = await loadBranding();
    const brand = branding.getTeamBrand({
      teamId: 111,
      abbr: "NYY",
      name: "New York Yankees",
    });

    expect(brand.key).toBe("BOS");
  });

  it("falls back to full names including Athletics variants", async () => {
    const { branding } = await loadBranding();

    expect(branding.getTeamBrand({ name: "Toronto Blue Jays" }).key).toBe("TOR");
    expect(branding.getTeamBrand({ name: "Athletics" }).key).toBe("ATH");
    expect(branding.getTeamBrand({ name: "Sacramento Athletics" }).key).toBe("ATH");
  });

  it("returns a neutral brand for unknown teams without throwing", async () => {
    const { branding } = await loadBranding();

    expect(() => branding.getTeamBrand({ abbr: "XYZ", name: "Mystery Club" })).not.toThrow();
    const brand = branding.getTeamBrand({ abbr: "XYZ", name: "Mystery Club" });
    expect(brand.key).toBe("XYZ");
    expect(brand.logoPath).toBe("");
    expect(brand.primary).toBe("#667085");
  });

  it("switches Cincinnati away at St. Louis to Reds secondary black", async () => {
    const { branding } = await loadBranding();
    const matchup = branding.resolveMatchupBranding({
      away_team_abbr: "CIN",
      home_team_abbr: "STL",
    });

    expect(matchup.home.fill).toBe("#C41E3A");
    expect(matchup.home.collisionFallback).toBe("primary");
    expect(matchup.away.fill).toBe("#000000");
    expect(matchup.away.collisionFallback).toBe("secondary");
  });

  it("switches St. Louis away at Cincinnati to Cardinals secondary navy", async () => {
    const { branding } = await loadBranding();
    const matchup = branding.resolveMatchupBranding({
      away_team_abbr: "STL",
      home_team_abbr: "CIN",
    });

    expect(matchup.home.fill).toBe("#C6011F");
    expect(matchup.away.fill).toBe("#0C2340");
    expect(matchup.away.collisionFallback).toBe("secondary");
  });

  it("keeps distinct away primary colors as primary", async () => {
    const { branding } = await loadBranding();
    const matchup = branding.resolveMatchupBranding({
      away_team_abbr: "ATH",
      home_team_abbr: "BOS",
    });

    expect(matchup.away.fill).toBe("#003831");
    expect(matchup.away.collisionFallback).toBe("primary");
  });

  it("selects tertiary when away primary and secondary are too close", async () => {
    const { hooks } = await loadBranding();
    const homeBrand = Object.freeze({ key: "HOME", primary: "#C6011F", secondary: "#000000", tertiary: "#FFFFFF" });
    const awayBrand = Object.freeze({ key: "AWAY", primary: "#C6011F", secondary: "#C6011F", tertiary: "#000000" });
    const matchup = hooks.resolveColorCollision(homeBrand, awayBrand);

    expect(matchup.away.fill).toBe("#000000");
    expect(matchup.away.collisionFallback).toBe("tertiary");
  });

  it("uses neutral away fallback when every candidate is too close", async () => {
    const { hooks } = await loadBranding();
    const homeBrand = Object.freeze({ key: "HOME", primary: "#C6011F", secondary: "#000000", tertiary: "#FFFFFF" });
    const awayBrand = Object.freeze({ key: "AWAY", primary: "#C6011F", secondary: "#C6011F", tertiary: "#C6011F" });
    const matchup = hooks.resolveColorCollision(homeBrand, awayBrand);

    expect(matchup.away.fill).toBe("#667085");
    expect(matchup.away.collisionFallback).toBe("neutral");
  });

  it("returns readable percentage colors on light and dark surfaces", async () => {
    const { branding, hooks } = await loadBranding();
    const matchup = branding.resolveMatchupBranding({
      away_team_abbr: "ATH",
      home_team_abbr: "MIL",
    });

    for (const side of [matchup.away, matchup.home]) {
      expect(hooks.contrastRatio(side.textOnLight, hooks.LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
      expect(hooks.contrastRatio(side.textOnDark, hooks.DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("chooses the higher contrast text color for fallback discs", async () => {
    const { hooks } = await loadBranding();

    expect(hooks.onFillText("#000000")).toBe("#FFFFFF");
    expect(hooks.onFillText("#FFC52F")).toBe("#11263B");
  });

  it("does not mutate registry objects during matchup resolution", async () => {
    const { branding, hooks } = await loadBranding();
    const before = JSON.stringify(hooks.MLB_TEAM_BRANDS.CIN);

    branding.resolveMatchupBranding({
      away_team_abbr: "CIN",
      home_team_abbr: "STL",
    });

    expect(JSON.stringify(hooks.MLB_TEAM_BRANDS.CIN)).toBe(before);
    expect(Object.isFrozen(hooks.MLB_TEAM_BRANDS)).toBe(true);
    expect(Object.isFrozen(hooks.MLB_TEAM_BRANDS.CIN)).toBe(true);
  });
});
