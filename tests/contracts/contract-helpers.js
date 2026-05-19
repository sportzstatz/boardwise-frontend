// @ts-check
import { expect } from "@playwright/test";

/**
 * @param {import("@playwright/test").APIResponse} response
 * @param {string} label
 */
export async function expectJsonResponse(response, label) {
  expect(response.ok(), `${label} status ${response.status()}`).toBeTruthy();

  const contentType = response.headers()["content-type"] || "";
  expect(
    contentType,
    `${label} should return JSON content-type`
  ).toContain("application/json");

  const body = await response.json();
  expectPlainObject(body, label);
  expectNoOperatorLeak(body, label);
  return body;
}

/**
 * @param {unknown} value
 * @param {string} label
 */
export function expectPlainObject(value, label) {
  expect(value, `${label} should exist`).toBeTruthy();
  expect(typeof value, `${label} should be an object`).toBe("object");
  expect(Array.isArray(value), `${label} should not be an array`).toBe(false);
}

/**
 * @param {unknown} value
 * @param {string} label
 */
export function expectArray(value, label) {
  expect(Array.isArray(value), `${label} should be an array`).toBe(true);
}

/**
 * @param {unknown} value
 * @param {string} label
 */
export function expectString(value, label) {
  expect(typeof value, `${label} should be a string`).toBe("string");
}

/**
 * @param {unknown} value
 * @param {string} label
 */
export function expectBoolean(value, label) {
  expect(typeof value, `${label} should be a boolean`).toBe("boolean");
}

/**
 * @param {unknown} value
 * @param {string} label
 */
export function expectNumberLike(value, label) {
  const num = Number(value);
  expect(Number.isFinite(num), `${label} should be number-like`).toBe(true);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} label
 */
export function expectVisibilityIfPresent(body, label) {
  if (
    "visibility" in body &&
    body.visibility !== null &&
    body.visibility !== undefined
  ) {
    expectPlainObject(body.visibility, `${label}.visibility`);
  }
}

/**
 * Prevent accidental exposure of operator/admin surfaces or secrets in public
 * API payloads.
 *
 * @param {unknown} body
 * @param {string} label
 */
export function expectNoOperatorLeak(body, label) {
  const text = JSON.stringify(body);

  const forbidden = [
    "/api/v1/operator",
    "X-BoardWise-Operator-Key",
    "BOARDWISE_OPERATOR",
    "operator_api_key",
    "turnstile_secret",
    "webhook_secret",
    "cloudflare_token",
    "BOARDWISE_CLOUDFLARE_EMAIL_API_TOKEN",
    "SESSION_PEPPER",
    "DSN",
  ];

  for (const needle of forbidden) {
    expect(text, `${label} should not expose ${needle}`).not.toContain(needle);
  }
}
