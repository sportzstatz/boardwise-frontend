import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("NHL off-season page", () => {
  it("does not expose the retired NHL board UI", async () => {
    const html = await readFile(resolve(process.cwd(), "nhl/index.html"), "utf8");

    expect(html).toContain("NHL Board Off-Season");
    expect(html).toContain("The NHL board is not currently available.");
    expect(html).toContain("Returns Oct 2026");
    expect(html).not.toContain("/assets/js/nhl-board.js");
    expect(html).not.toContain("/assets/js/api-client.js");
    expect(html).not.toContain('id="date-form"');
    expect(html).not.toContain('id="games"');
    // Performance is concealed Admin-only. This static, script-free page cannot
    // gate a link, so it must not link to /performance/ at all.
    expect(html).not.toContain("/performance/");
  });
});
