const PRODUCTION_API_ORIGIN = "https://api.useboardwise.com";
const VALID_TARGETS = new Set(["candidate", "production-compatibility"]);

/**
 * Resolve and validate the API origin used by Playwright contract checks.
 * There is deliberately no default: every invocation must identify its target.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveContractApiBase(env = process.env) {
  const raw = String(env.BOARDWISE_CONTRACT_API_BASE || "").trim();
  if (!raw) {
    throw new Error(
      "BOARDWISE_CONTRACT_API_BASE is required; contract tests never default to a deployed API."
    );
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_error) {
    throw new Error("BOARDWISE_CONTRACT_API_BASE must be an absolute http(s) URL.");
  }

  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("BOARDWISE_CONTRACT_API_BASE must use http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("BOARDWISE_CONTRACT_API_BASE must not contain credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("BOARDWISE_CONTRACT_API_BASE must not contain a query or fragment.");
  }
  if (parsed.pathname !== "/") {
    throw new Error("BOARDWISE_CONTRACT_API_BASE must be an origin without a path.");
  }

  const target = String(env.BOARDWISE_CONTRACT_TARGET || "").trim();
  if (target && !VALID_TARGETS.has(target)) {
    throw new Error(
      "BOARDWISE_CONTRACT_TARGET must be candidate or production-compatibility when set."
    );
  }
  if (target === "candidate" && parsed.origin === PRODUCTION_API_ORIGIN) {
    throw new Error("Candidate contract tests must not target the production API.");
  }
  if (
    target === "production-compatibility" &&
    parsed.origin !== PRODUCTION_API_ORIGIN
  ) {
    throw new Error(
      "Production compatibility checks must explicitly target the production API."
    );
  }

  return parsed.origin;
}

export { PRODUCTION_API_ORIGIN };
