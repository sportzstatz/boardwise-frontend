import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = import.meta.dirname;

// In git worktrees node_modules is a symlink into the main checkout; vite's
// dev-server fs allow-list works on realpaths, so without this the @fontsource
// font files 404 and visual baselines render with fallback fonts.
const nodeModulesPath = resolve(root, "node_modules");
const fsAllow = [root];
if (existsSync(nodeModulesPath)) {
  fsAllow.push(realpathSync(nodeModulesPath));
}

export default defineConfig({
  publicDir: false,
  server: {
    fs: {
      allow: fsAllow
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: resolve(root, "index.html"),
        account: resolve(root, "account/index.html"),
        login: resolve(root, "login/index.html"),
        mlb: resolve(root, "mlb/index.html"),
        mlbGame: resolve(root, "mlb/game/index.html"),
        nhl: resolve(root, "nhl/index.html"),
        performance: resolve(root, "performance/index.html"),
        performanceMethodology: resolve(root, "performance-methodology/index.html"),
        pricing: resolve(root, "pricing/index.html"),
        privacy: resolve(root, "privacy/index.html"),
        responsibleUse: resolve(root, "responsible-use/index.html"),
        subscriptionPolicy: resolve(root, "subscription-policy/index.html"),
        affiliateDisclosure: resolve(root, "affiliate-disclosure/index.html"),
        terms: resolve(root, "terms/index.html")
      }
    }
  }
});
