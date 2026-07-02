(function () {
  const LOGO_BASE_PATH = "/assets/img/mlb/team-logos/";
  const LIGHT_SURFACE = "#FBFAF7";
  const DARK_SURFACE = "#13243C";
  const BOARDWISE_INK = "#11263B";
  const MIN_TEXT_CONTRAST = 4.5;
  const MIN_TEAM_DELTA_E = 28;
  const NEUTRAL_AWAY = "#667085";
  const NEUTRAL_HOME = "#13243C";

  function freezeRegistry(registry) {
    for (const key of Object.keys(registry)) {
      Object.freeze(registry[key]);
    }
    return Object.freeze(registry);
  }

  const MLB_TEAM_BRANDS = freezeRegistry({
    ARI: { teamId: 109, logo: "ari.svg", primary: "#A71930", secondary: "#000000", tertiary: "#E3D4AD" },
    ATH: { teamId: 133, logo: "ath.svg", primary: "#003831", secondary: "#EFB21E", tertiary: "#A2AAAD" },
    ATL: { teamId: 144, logo: "atl.svg", primary: "#CE1141", secondary: "#13274F", tertiary: "#EAAA00" },
    BAL: { teamId: 110, logo: "bal.svg", primary: "#DF4601", secondary: "#27251F", tertiary: "#000000" },
    BOS: { teamId: 111, logo: "bos.svg", primary: "#BD3039", secondary: "#0C2340", tertiary: "#FFFFFF" },
    CHC: { teamId: 112, logo: "chc.svg", primary: "#0E3386", secondary: "#CC3433", tertiary: "#FFFFFF" },
    CWS: { teamId: 145, logo: "cws.svg", primary: "#27251F", secondary: "#C4CED4", tertiary: "#FFFFFF" },
    CIN: { teamId: 113, logo: "cin.svg", primary: "#C6011F", secondary: "#000000", tertiary: "#FFFFFF" },
    CLE: { teamId: 114, logo: "cle.svg", primary: "#E50022", secondary: "#00385D", tertiary: "#FFFFFF" },
    COL: { teamId: 115, logo: "col.svg", primary: "#33006F", secondary: "#C4CED4", tertiary: "#000000" },
    DET: { teamId: 116, logo: "det.svg", primary: "#0C2340", secondary: "#FA4616", tertiary: "#FFFFFF" },
    HOU: { teamId: 117, logo: "hou.svg", primary: "#002D62", secondary: "#EB6E1F", tertiary: "#FFFFFF" },
    KC: { teamId: 118, logo: "kc.svg", primary: "#004687", secondary: "#BD9B60", tertiary: "#FFFFFF" },
    LAA: { teamId: 108, logo: "laa.svg", primary: "#BA0021", secondary: "#003263", tertiary: "#C4CED4" },
    LAD: { teamId: 119, logo: "lad.svg", primary: "#005A9C", secondary: "#EF3E42", tertiary: "#A5ACAF" },
    MIA: { teamId: 146, logo: "mia.svg", primary: "#00A3E0", secondary: "#EF3340", tertiary: "#000000" },
    MIL: { teamId: 158, logo: "mil.svg", primary: "#12284B", secondary: "#FFC52F", tertiary: "#FFFFFF" },
    MIN: { teamId: 142, logo: "min.svg", primary: "#002B5C", secondary: "#D31145", tertiary: "#B9975B" },
    NYM: { teamId: 121, logo: "nym.svg", primary: "#002D72", secondary: "#FF5910", tertiary: "#FFFFFF" },
    NYY: { teamId: 147, logo: "nyy.svg", primary: "#0C2340", secondary: "#C4CED4", tertiary: "#FFFFFF" },
    PHI: { teamId: 143, logo: "phi.svg", primary: "#E81828", secondary: "#002D72", tertiary: "#FFFFFF" },
    PIT: { teamId: 134, logo: "pit.svg", primary: "#27251F", secondary: "#FDB827", tertiary: "#FFFFFF" },
    SD: { teamId: 135, logo: "sd.svg", primary: "#2F241D", secondary: "#FFC425", tertiary: "#FFFFFF" },
    SEA: { teamId: 136, logo: "sea.svg", primary: "#0C2C56", secondary: "#005C5C", tertiary: "#C4CED4" },
    SF: { teamId: 137, logo: "sf.svg", primary: "#FD5A1E", secondary: "#27251F", tertiary: "#EFD19F" },
    STL: { teamId: 138, logo: "stl.svg", primary: "#C41E3A", secondary: "#0C2340", tertiary: "#FEDB00" },
    TB: { teamId: 139, logo: "tb.svg", primary: "#092C5C", secondary: "#8FBCE6", tertiary: "#F5D130" },
    TEX: { teamId: 140, logo: "tex.svg", primary: "#003278", secondary: "#C0111F", tertiary: "#FFFFFF" },
    TOR: { teamId: 141, logo: "tor.svg", primary: "#134A8E", secondary: "#E8291C", tertiary: "#1D2D5C" },
    WSH: { teamId: 120, logo: "wsh.svg", primary: "#AB0003", secondary: "#14225A", tertiary: "#FFFFFF" },
  });

  const MLB_TEAM_ALIASES = Object.freeze({
    AZ: "ARI",
    OAK: "ATH",
    CHW: "CWS",
    KCR: "KC",
    ANA: "LAA",
    FLA: "MIA",
    SDP: "SD",
    SFG: "SF",
    TBD: "TB",
    TBR: "TB",
    WAS: "WSH",
    WSN: "WSH",
  });

  const TEAM_NAMES = Object.freeze({
    ARI: ["Arizona Diamondbacks", "Diamondbacks"],
    ATH: ["Athletics", "Oakland Athletics", "Sacramento Athletics"],
    ATL: ["Atlanta Braves", "Braves"],
    BAL: ["Baltimore Orioles", "Orioles"],
    BOS: ["Boston Red Sox", "Red Sox"],
    CHC: ["Chicago Cubs", "Cubs"],
    CWS: ["Chicago White Sox", "White Sox"],
    CIN: ["Cincinnati Reds", "Reds"],
    CLE: ["Cleveland Guardians", "Guardians"],
    COL: ["Colorado Rockies", "Rockies"],
    DET: ["Detroit Tigers", "Tigers"],
    HOU: ["Houston Astros", "Astros"],
    KC: ["Kansas City Royals", "Royals"],
    LAA: ["Los Angeles Angels", "LA Angels", "Angels"],
    LAD: ["Los Angeles Dodgers", "LA Dodgers", "Dodgers"],
    MIA: ["Miami Marlins", "Florida Marlins", "Marlins"],
    MIL: ["Milwaukee Brewers", "Brewers"],
    MIN: ["Minnesota Twins", "Twins"],
    NYM: ["New York Mets", "NY Mets", "Mets"],
    NYY: ["New York Yankees", "NY Yankees", "Yankees"],
    PHI: ["Philadelphia Phillies", "Phillies"],
    PIT: ["Pittsburgh Pirates", "Pirates"],
    SD: ["San Diego Padres", "Padres"],
    SEA: ["Seattle Mariners", "Mariners"],
    SF: ["San Francisco Giants", "Giants"],
    STL: ["St. Louis Cardinals", "Saint Louis Cardinals", "St Louis Cardinals", "Cardinals"],
    TB: ["Tampa Bay Rays", "Tampa Rays", "Rays"],
    TEX: ["Texas Rangers", "Rangers"],
    TOR: ["Toronto Blue Jays", "Blue Jays"],
    WSH: ["Washington Nationals", "Nationals"],
  });

  const TEAM_ID_TO_KEY = Object.freeze(Object.fromEntries(
    Object.entries(MLB_TEAM_BRANDS).map(([key, brand]) => [String(brand.teamId), key])
  ));

  const TEAM_NAME_TO_KEY = Object.freeze(Object.fromEntries(
    Object.entries(TEAM_NAMES).flatMap(([key, names]) => names.map((name) => [normalizeName(name), key]))
  ));

  function normalizeAbbr(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function normalizeName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function normalizeHex(value) {
    return isHexColor(value) ? String(value).toUpperCase() : "";
  }

  function isHexColor(value) {
    return /^#[0-9A-Fa-f]{6}$/.test(String(value || ""));
  }

  function hexToSrgb(hex) {
    const normalized = normalizeHex(hex);
    if (!normalized) return { r: 0, g: 0, b: 0 };
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
    };
  }

  function srgbChannelToLinear(value) {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  }

  function srgbToLinearRgb(rgb) {
    return {
      r: srgbChannelToLinear(rgb.r),
      g: srgbChannelToLinear(rgb.g),
      b: srgbChannelToLinear(rgb.b),
    };
  }

  function linearRgbToXyz(rgb) {
    return {
      x: (rgb.r * 0.4124564) + (rgb.g * 0.3575761) + (rgb.b * 0.1804375),
      y: (rgb.r * 0.2126729) + (rgb.g * 0.7151522) + (rgb.b * 0.0721750),
      z: (rgb.r * 0.0193339) + (rgb.g * 0.1191920) + (rgb.b * 0.9503041),
    };
  }

  function labPivot(value) {
    return value > 0.008856
      ? Math.cbrt(value)
      : (7.787 * value) + (16 / 116);
  }

  function xyzToLab(xyz) {
    const xr = xyz.x / 0.95047;
    const yr = xyz.y / 1.00000;
    const zr = xyz.z / 1.08883;
    const fx = labPivot(xr);
    const fy = labPivot(yr);
    const fz = labPivot(zr);
    return {
      l: (116 * fy) - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz),
    };
  }

  function hexToLab(hex) {
    return xyzToLab(linearRgbToXyz(srgbToLinearRgb(hexToSrgb(hex))));
  }

  function deltaE76(a, b) {
    if (!isHexColor(a) || !isHexColor(b)) return 0;
    const labA = hexToLab(a);
    const labB = hexToLab(b);
    return Math.sqrt(
      ((labA.l - labB.l) ** 2)
      + ((labA.a - labB.a) ** 2)
      + ((labA.b - labB.b) ** 2)
    );
  }

  function relativeLuminance(hex) {
    if (!isHexColor(hex)) return 0;
    const linear = srgbToLinearRgb(hexToSrgb(hex));
    return (0.2126 * linear.r) + (0.7152 * linear.g) + (0.0722 * linear.b);
  }

  function contrastRatio(a, b) {
    if (!isHexColor(a) || !isHexColor(b)) return 1;
    const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
    const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
    return (lighter + 0.05) / (darker + 0.05);
  }

  function hexToHsl(hex) {
    const rgb = hexToSrgb(hex);
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    if (max === min) {
      return { h: 0, s: 0, l: lightness * 100 };
    }
    const delta = max - min;
    const saturation = lightness > 0.5
      ? delta / (2 - max - min)
      : delta / (max + min);
    let hue;
    if (max === r) {
      hue = ((g - b) / delta) + (g < b ? 6 : 0);
    } else if (max === g) {
      hue = ((b - r) / delta) + 2;
    } else {
      hue = ((r - g) / delta) + 4;
    }
    return { h: hue * 60, s: saturation * 100, l: lightness * 100 };
  }

  function hueToRgb(p, q, t) {
    let hue = t;
    if (hue < 0) hue += 1;
    if (hue > 1) hue -= 1;
    if (hue < 1 / 6) return p + ((q - p) * 6 * hue);
    if (hue < 1 / 2) return q;
    if (hue < 2 / 3) return p + ((q - p) * ((2 / 3) - hue) * 6);
    return p;
  }

  function hslToHex(input) {
    const h = (((Number(input.h) || 0) % 360) + 360) % 360;
    const s = Math.min(100, Math.max(0, Number(input.s) || 0)) / 100;
    const l = Math.min(100, Math.max(0, Number(input.l) || 0)) / 100;
    let r;
    let g;
    let b;
    if (s === 0) {
      r = l;
      g = l;
      b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - (l * s);
      const p = (2 * l) - q;
      r = hueToRgb(p, q, (h / 360) + (1 / 3));
      g = hueToRgb(p, q, h / 360);
      b = hueToRgb(p, q, (h / 360) - (1 / 3));
    }
    return `#${[r, g, b].map((channel) => {
      const value = Math.round(channel * 255);
      return value.toString(16).padStart(2, "0");
    }).join("")}`.toUpperCase();
  }

  function readableTextOnLight(fill) {
    return readableText(fill, LIGHT_SURFACE, "darken", BOARDWISE_INK);
  }

  function readableTextOnDark(fill) {
    return readableText(fill, DARK_SURFACE, "lighten", "#FFFFFF");
  }

  function readableText(fill, surface, direction, fallback) {
    const normalized = normalizeHex(fill);
    if (!normalized) return fallback;
    if (contrastRatio(normalized, surface) >= MIN_TEXT_CONTRAST) return normalized;
    const hsl = hexToHsl(normalized);
    let lightness = hsl.l;
    for (let index = 0; index < 32; index += 1) {
      lightness = direction === "darken"
        ? Math.max(18, lightness - 4)
        : Math.min(92, lightness + 4);
      const candidate = hslToHex({ ...hsl, l: lightness });
      if (contrastRatio(candidate, surface) >= MIN_TEXT_CONTRAST) return candidate;
      if ((direction === "darken" && lightness === 18) || (direction === "lighten" && lightness === 92)) {
        break;
      }
    }
    return fallback;
  }

  function onFillText(fill) {
    const normalized = normalizeHex(fill) || NEUTRAL_AWAY;
    return contrastRatio("#FFFFFF", normalized) >= contrastRatio(BOARDWISE_INK, normalized)
      ? "#FFFFFF"
      : BOARDWISE_INK;
  }

  function canonicalKey(input = {}) {
    const teamId = input.teamId ?? input.id;
    if (teamId !== null && teamId !== undefined && TEAM_ID_TO_KEY[String(teamId)]) {
      return TEAM_ID_TO_KEY[String(teamId)];
    }
    const abbr = normalizeAbbr(input.abbr);
    if (abbr) {
      const aliased = MLB_TEAM_ALIASES[abbr] || abbr;
      if (MLB_TEAM_BRANDS[aliased]) return aliased;
    }
    const nameKey = TEAM_NAME_TO_KEY[normalizeName(input.name)];
    return nameKey || "";
  }

  function unknownAbbr(input = {}) {
    const abbr = normalizeAbbr(input.abbr);
    if (abbr) return abbr.slice(0, 4);
    const words = normalizeName(input.name).split(" ").filter(Boolean);
    if (words.length >= 2) return words.map((word) => word[0]).join("").toUpperCase().slice(0, 4);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return "MLB";
  }

  function normalizeBrand(key, input = {}) {
    const source = MLB_TEAM_BRANDS[key];
    if (!source) {
      const abbr = unknownAbbr(input);
      return Object.freeze({
        key: abbr === "MLB" ? "UNKNOWN" : abbr,
        teamId: null,
        abbr,
        logoPath: "",
        primary: NEUTRAL_AWAY,
        secondary: NEUTRAL_AWAY,
        tertiary: NEUTRAL_AWAY,
      });
    }
    return Object.freeze({
      key,
      teamId: source.teamId,
      abbr: key,
      logoPath: `${LOGO_BASE_PATH}${source.logo}`,
      primary: source.primary,
      secondary: source.secondary,
      tertiary: source.tertiary,
    });
  }

  function getTeamBrand(input = {}) {
    return normalizeBrand(canonicalKey(input), input);
  }

  function resolveAwayFill(homeFill, awayBrand) {
    const candidates = [
      ["primary", awayBrand.primary],
      ["secondary", awayBrand.secondary],
      ["tertiary", awayBrand.tertiary],
    ].filter((entry) => isHexColor(entry[1]));
    const match = candidates.find((entry) => deltaE76(entry[1], homeFill) >= MIN_TEAM_DELTA_E);
    if (match) {
      return { fill: normalizeHex(match[1]), collisionFallback: match[0] };
    }
    return { fill: NEUTRAL_AWAY, collisionFallback: "neutral" };
  }

  function sideBranding(brand, fill, collisionFallback) {
    const normalizedFill = normalizeHex(fill) || NEUTRAL_AWAY;
    return Object.freeze({
      brand,
      fill: normalizedFill,
      textOnLight: readableTextOnLight(normalizedFill),
      textOnDark: readableTextOnDark(normalizedFill),
      onFill: onFillText(normalizedFill),
      collisionFallback,
    });
  }

  function resolveColorCollision(homeBrand, awayBrand) {
    const homeFill = normalizeHex(homeBrand.primary) || NEUTRAL_HOME;
    const away = resolveAwayFill(homeFill, awayBrand);
    return Object.freeze({
      home: sideBranding(homeBrand, homeFill, "primary"),
      away: sideBranding(awayBrand, away.fill, away.collisionFallback),
    });
  }

  function resolveMatchupBranding(game = {}) {
    const awayBrand = getTeamBrand({
      teamId: game.away_team_id ?? game.away_mlb_team_id,
      abbr: game.away_team_abbr,
      name: game.away_team,
    });
    const homeBrand = getTeamBrand({
      teamId: game.home_team_id ?? game.home_mlb_team_id,
      abbr: game.home_team_abbr,
      name: game.home_team,
    });
    return resolveColorCollision(homeBrand, awayBrand);
  }

  function markLogoFailed(img) {
    const mark = img.closest("[data-team-logo-mark], .tot-team-logo-mark, .tot-team-mark");
    if (mark) mark.classList.add("logo-failed");
  }

  function bindLogoFallbacks(root = document) {
    const scope = root && typeof root.querySelectorAll === "function" ? root : document;
    const logos = scope.querySelectorAll("img[data-team-logo]");
    for (const img of logos) {
      if (!(img instanceof HTMLImageElement)) continue;
      if (img.dataset.logoFallbackBound !== "true") {
        img.dataset.logoFallbackBound = "true";
        img.addEventListener("error", () => markLogoFailed(img), { once: true });
      }
      if (img.complete && img.naturalWidth === 0) {
        markLogoFailed(img);
      }
    }
  }

  window.BoardWiseMlbBranding = Object.freeze({
    getTeamBrand,
    resolveMatchupBranding,
    bindLogoFallbacks,
  });

  if (["", "localhost", "127.0.0.1"].includes(window.location.hostname)) {
    const testWindow = /** @type {Window & { __BoardWiseMlbBrandingTestHooks?: any }} */ (window);
    testWindow.__BoardWiseMlbBrandingTestHooks = Object.freeze({
      MLB_TEAM_BRANDS,
      MLB_TEAM_ALIASES,
      getTeamBrand,
      resolveMatchupBranding,
      resolveColorCollision,
      isHexColor,
      hexToSrgb,
      srgbToLinearRgb,
      linearRgbToXyz,
      xyzToLab,
      deltaE76,
      relativeLuminance,
      contrastRatio,
      hexToHsl,
      hslToHex,
      readableTextOnLight,
      readableTextOnDark,
      onFillText,
      MIN_TEAM_DELTA_E,
      NEUTRAL_AWAY,
      LIGHT_SURFACE,
      DARK_SURFACE,
      MIN_TEXT_CONTRAST,
    });
  }
})();
