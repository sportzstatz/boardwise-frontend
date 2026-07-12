// @ts-check
import { defineConfig, devices } from "@playwright/test";
import { resolveContractApiBase } from "./scripts/contract-api-base.mjs";

const API_BASE = resolveContractApiBase();
const FRONTEND_PORT = Number(process.env.BOARDWISE_CONTRACT_FRONTEND_PORT || 9877);
const FRONTEND_BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const CANDIDATE_TARGET = process.env.BOARDWISE_CONTRACT_TARGET === "candidate";
const RETAIN_REPORTS = Boolean(process.env.CI) || CANDIDATE_TARGET;

export default defineConfig({
  testDir: "tests/contracts",

  forbidOnly: Boolean(process.env.CI) || CANDIDATE_TARGET,
  retries: CANDIDATE_TARGET ? 0 : process.env.CI ? 2 : 0,
  workers: process.env.CI || CANDIDATE_TARGET ? 1 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },

  reporter: RETAIN_REPORTS
    ? [
        ["list"],
        ["junit", { outputFile: "test-results/junit.xml" }],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ]
    : "list",

  projects: [
    {
      // Request-level checks against the explicitly configured API target
      // (tests/contracts/*-contract.spec.js).
      name: "api-contract",
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
        trace:
          CANDIDATE_TARGET ? "off" : "retain-on-failure",
      },
    },
    {
      // Authenticated candidate-stack checks use disposable seeded sessions.
      // Traces stay off because Playwright traces can retain Cookie headers;
      // failure evidence is the sanitized HTML/JUnit report.
      name: "candidate-access",
      testMatch: ["**/candidate-access.spec.js"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: FRONTEND_BASE_URL,
        viewport: { width: 1280, height: 1100 },
        locale: "en-US",
        timezoneId: "America/Chicago",
        trace: "off",
        video: "off",
        screenshot: "off",
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
