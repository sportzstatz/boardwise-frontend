import { afterEach, describe, expect, it, vi } from "vitest";

async function accessApi() {
  vi.resetModules();
  await import("../assets/js/mlb-access.js");
  return window.BoardWiseMlbAccess;
}

afterEach(() => {
  delete window.BoardWiseMlbAccess;
  vi.resetModules();
});

describe("shared MLB access semantics", () => {
  it("treats preview + card_access full as a limited board with complete cards", async () => {
    const access = await accessApi();
    const payload = { access: { level: "preview", card_access: "full" } };

    expect(access?.accessLevel(payload)).toBe("preview");
    expect(access?.isLimitedBoard(payload)).toBe(true);
    expect(access?.hasFullCardAccess(payload)).toBe(true);
  });

  it("keeps legacy previews sanitized and Founder/Admin boards complete", async () => {
    const access = await accessApi();

    expect(access?.hasFullCardAccess({ access: { level: "preview" } })).toBe(false);
    expect(access?.hasFullCardAccess({ access: { level: "full" } })).toBe(true);
    expect(access?.isLimitedBoard({ access: { level: "full", card_access: "full" } })).toBe(false);
  });
});
