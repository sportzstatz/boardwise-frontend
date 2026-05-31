// @ts-check
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.BOARDWISE_A11Y_PORT || 9878);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/a11y",
  testMatch: ["**/*.a11y.spec.js"],

  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,

  reporter: process.env.CI
    ? [
        ["list"],
        ["junit", { outputFile: "test-results/a11y-junit.xml" }],
      ]
    : "list",

  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 1100 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "America/Chicago",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
