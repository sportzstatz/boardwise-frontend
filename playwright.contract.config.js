// @ts-check
import { defineConfig } from "@playwright/test";

const API_BASE =
  process.env.BOARDWISE_CONTRACT_API_BASE || "https://api.useboardwise.com";

export default defineConfig({
  testDir: "tests/contracts",
  testMatch: ["**/*.contract.spec.js", "**/*-contract.spec.js"],

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

  use: {
    baseURL: API_BASE,
    extraHTTPHeaders: {
      Accept: "application/json",
    },
  },
});
