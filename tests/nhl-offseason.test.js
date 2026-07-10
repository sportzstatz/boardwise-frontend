import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("retired NHL route", () => {
  it("no longer ships an NHL page or board script", async () => {
    await expect(access(resolve(process.cwd(), "nhl/index.html"))).rejects.toThrow();
    await expect(access(resolve(process.cwd(), "assets/js/nhl-board.js"))).rejects.toThrow();
  });

  it("redirects /nhl and /nhl/ to the landing page", async () => {
    const redirects = await readFile(resolve(process.cwd(), "_redirects"), "utf8");

    expect(redirects).toContain("/nhl / 302");
    expect(redirects).toContain("/nhl/ / 302");
  });

  it("keeps the landing NHL card informational with no dead CTA", async () => {
    const html = await readFile(resolve(process.cwd(), "index.html"), "utf8");

    expect(html).toContain("Returns Oct 2026");
    expect(html).not.toContain('href="/nhl/"');
    // The off-season card is informational only: no "Notify me" (or similar)
    // call to action that looks clickable but goes nowhere.
    expect(html).not.toContain("Notify me");
  });
});
