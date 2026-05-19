import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ASSETS_JS_DIR = path.resolve("assets/js");

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) out.push(...jsFiles(fullPath));
    else if (entry.endsWith(".js")) out.push(fullPath);
  }
  return out;
}

describe("assets/js API boundary", () => {
  it("keeps fetch calls inside api-client.js", () => {
    const offenders = jsFiles(ASSETS_JS_DIR)
      .filter((file) => path.basename(file) !== "api-client.js")
      .filter((file) => readFileSync(file, "utf8").includes("fetch("))
      .map((file) => path.relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });

  it("keeps API URLs inside api-client.js", () => {
    const apiPattern = /api\.useboardwise\.com|\/api\/v1\//;
    const offenders = jsFiles(ASSETS_JS_DIR)
      .filter((file) => path.basename(file) !== "api-client.js")
      .filter((file) => apiPattern.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});
