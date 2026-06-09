// @ts-check
import { defineConfig, devices } from "@playwright/test";

const API_BASE =
  process.env.BOARDWISE_CONTRACT_API_BASE || "https://api.useboardwise.com";
const FRONTEND_PORT = Number(process.env.BOARDWISE_CONTRACT_FRONTEND_PORT || 9877);
const FRONTEND_BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: "tests/contracts",

  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },

  reporter: process.env.CI
    ? [
        ["list"],
        ["junit", { outputFile: "test-results/contracts-junit.xml" }],
      ]
    : "list",

  projects: [
    {
      // Request-level contract checks against the live public API
      // (tests/contracts/*-contract.spec.js).
      name: "live-api",
      testMatch: ["**/*-contract.spec.js"],
      use: {
        baseURL: API_BASE,
        extraHTTPHeaders: {
          Accept: "application/json",
        },
      },
    },
    {
      // DOM-level contract checks rendered against route-mocked API payload
      // fixtures (tests/contracts/*.contract.spec.js).
      name: "dom-contract",
      testMatch: ["**/*.contract.spec.js"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: FRONTEND_BASE_URL,
        viewport: { width: 1280, height: 1100 },
        locale: "en-US",
        timezoneId: "America/Chicago",
        trace: "retain-on-failure",
      },
    },
  ],

  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`,
    url: FRONTEND_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
