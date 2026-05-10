import { existsSync } from "node:fs";
import { cp, copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");

async function copyIfExists(source, target) {
  const from = join(root, source);
  if (!existsSync(from)) return;
  await mkdir(dirname(join(root, target)), { recursive: true });
  await copyFile(from, join(root, target));
}

async function copyDirIfExists(source, target) {
  const from = join(root, source);
  if (!existsSync(from)) return;
  await cp(from, join(root, target), { recursive: true });
}

await mkdir(dist, { recursive: true });

await copyDirIfExists("assets", "dist/assets");
await copyIfExists("_headers", "dist/_headers");
await copyIfExists("_redirects", "dist/_redirects");
await copyIfExists("favicon.ico", "dist/favicon.ico");
await copyIfExists("robots.txt", "dist/robots.txt");

console.log("Copied static BoardWise assets into dist/");
