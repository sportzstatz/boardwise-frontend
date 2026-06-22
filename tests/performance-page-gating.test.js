import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Regression guard for the admin-blank-/performance bug: the page hid its
// shell by default and relied on performance.js to un-hide it for admins. When
// a browser ran a STALE cached performance.js (no un-hide logic) against the
// fresh hidden-shell HTML, the page blanked for admins. The fix routes the
// shell's reveal/conceal through the always-fresh HTML attribute + the stable
// apply-gates pipeline (data-feature-visible), which works regardless of which
// performance.js version is cached.
describe("performance page shell gating is resilient to a stale performance.js", () => {
  it("gates the shell via apply-gates (data-feature-visible=performance_summary)", async () => {
    const html = await readFile(
      resolve(process.cwd(), "performance/index.html"),
      "utf8"
    );

    const mainTag = html.match(/<main class="performance-shell"[^>]*>/);
    expect(mainTag, "performance-shell <main> exists").not.toBeNull();
    const tag = mainTag[0];

    // Starts hidden (no flash / no render for non-admins before redirect)...
    expect(tag).toContain("hidden");
    expect(tag).toContain("data-performance-app");
    // ...and is revealed only to admins by the stable gates pipeline keyed on
    // the admin-only feature, so a stale cached performance.js cannot blank it.
    expect(tag).toContain('data-feature-visible="performance_summary"');

    // apply-gates must actually run on this page for the gate to apply.
    expect(html).toContain("/assets/js/apply-gates.js");
  });
});
