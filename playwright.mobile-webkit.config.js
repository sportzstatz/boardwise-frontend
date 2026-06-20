// @ts-check
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.BOARDWISE_MOBILE_WEBKIT_PORT || 9879);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/mobile-webkit",
  testMatch: ["**/*.webkit.spec.js"],

  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,

  reporter: process.env.CI
    ? [
        ["list"],
        ["junit", { outputFile: "test-results/mobile-webkit-junit.xml" }],
      ]
    : "list",

  use: {
    ...devices["iPhone 13"],
    browserName: "webkit",
    baseURL: BASE_URL,
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
