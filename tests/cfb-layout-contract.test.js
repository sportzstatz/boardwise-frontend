import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync("assets/css/cfb-forecast-beta.css", "utf8");
const html = readFileSync("cfb/index.html", "utf8");
const landingHtml = readFileSync("index.html", "utf8");
const mlbHtml = readFileSync("mlb/index.html", "utf8");
const mlbGameHtml = readFileSync("mlb/game/index.html", "utf8");

describe("CFB responsive and loading contracts", () => {
  it("uses exactly two card columns by default and one below 1024px", () => {
    expect(css).toMatch(/\.cfb-game-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/s);
    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.cfb-game-grid[^}]*grid-template-columns:\s*1fr/);
    expect(css).not.toMatch(/\.cfb-game-grid[^}]*repeat\(3/);
    expect(css).toMatch(/\.cfb-game-slot\s*>\s*h3\s*\{/);
    expect(css).not.toContain(".cfb-time-group");
  });

  it("provides sticky mobile filters without page-level horizontal overflow", () => {
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.cfb-controls\s*\{[^}]*position:\s*sticky/s);
    expect(css).toContain("overflow-x: clip");
    expect(css).toContain("env(safe-area-inset-top)");
  });

  it("ships two-column skeleton markup and loads branding before board code", () => {
    expect(html.match(/cfb-skeleton-card/g)).toHaveLength(2);
    expect(html.indexOf("cfb-team-branding.js")).toBeLessThan(html.indexOf("cfb-board.js"));
    expect(html).toContain('aria-busy="true"');
  });

  it("renders team artwork as the logo alone without a decorative tile", () => {
    const markRule = css.match(/\.cfb-team-mark\s*\{([^}]*)\}/)?.[1] || "";
    expect(markRule).not.toMatch(/(?:border|border-radius|background|box-shadow)\s*:/);
    expect(css).toMatch(/\.cfb-team-mark img\s*\{[^}]*object-fit:\s*contain/s);
  });

  it("links the CFB beta from the all-sports landing page and MLB navigation", () => {
    expect(landingHtml).toContain('id="landing-cfb-card"');
    expect(landingHtml).toContain('href="/cfb/" aria-label="CFB experimental forecast board"');
    expect(mlbHtml).toContain('<a href="/cfb/">CFB Board</a>');
    expect(mlbGameHtml).toContain('<a href="/cfb/">CFB Board</a>');
  });
});
