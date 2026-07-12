import { cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";

const SHA_RE = /^[0-9a-f]{40}$/;
const RELEASE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const CHECKS = [
  "candidate_api_contracts",
  "candidate_dom_contracts",
  "candidate_browser_access_matrix",
];

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function fullSha(name) {
  const value = required(name).toLowerCase();
  if (!SHA_RE.test(value)) throw new Error(`${name} must be a full commit SHA.`);
  return value;
}

function isoTimestamp(name) {
  const value = required(name);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be a UTC ISO-8601 timestamp.`);
  }
  return new Date(value).toISOString();
}

function attributeTotal(xml, attribute) {
  let total = 0;
  for (const match of xml.matchAll(/<testsuite\b[^>]*>/g)) {
    const value = match[0].match(new RegExp(`\\b${attribute}="(\\d+)"`));
    total += value ? Number(value[1]) : 0;
  }
  return total;
}

function suiteHostnames(xml) {
  return new Set(
    [...xml.matchAll(/<testsuite\b[^>]*\bhostname="([^"]+)"[^>]*>/g)].map(
      (match) => match[1]
    )
  );
}

async function assertNoDisabledContractTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await assertNoDisabledContractTests(path);
      continue;
    }
    if (!entry.isFile() || extname(entry.name) !== ".js") continue;
    const source = await readFile(path, "utf8");
    if (/\b(?:test|describe)\s*\.\s*(?:skip|fixme|fail)\b/.test(source)) {
      throw new Error("Candidate contract sources must not disable or xfail tests.");
    }
  }
}

function secretBuffers() {
  return ["FREE", "FOUNDER", "ADMIN"]
    .map((role) =>
      String(process.env[`BOARDWISE_CONTRACT_${role}_SESSION_TOKEN`] || "")
    )
    .filter(Boolean)
    .map((value) => Buffer.from(value));
}

async function assertSafeFile(path, secrets) {
  const name = basename(path).toLowerCase();
  if (name.includes("trace") || extname(name) === ".zip") {
    throw new Error("Trace and archive files are forbidden in contract evidence.");
  }

  const contents = await readFile(path);
  for (const secret of secrets) {
    if (secret.length && contents.includes(secret)) {
      throw new Error("A session credential was found in contract evidence.");
    }
  }

  if (new Set([".html", ".json", ".xml", ".txt", ".md"]).has(extname(name))) {
    const text = contents.toString("utf8");
    const cookieName = String(
      process.env.BOARDWISE_CONTRACT_SESSION_COOKIE || "__Host-bw_session"
    );
    if (/(^|[\r\n])\s*(?:cookie|set-cookie)\s*:/i.test(text)) {
      throw new Error("A Cookie header was found in contract evidence.");
    }
    if (cookieName && text.includes(`${cookieName}=`)) {
      throw new Error("A session cookie was found in contract evidence.");
    }
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) {
      throw new Error("An email address was found in contract evidence.");
    }
  }
}

async function assertSafeTree(path, secrets) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) {
    throw new Error("Symlinks are forbidden in contract evidence.");
  }
  if (info.isFile()) {
    await assertSafeFile(path, secrets);
    return;
  }
  if (!info.isDirectory()) {
    throw new Error("Unsupported contract evidence entry.");
  }
  for (const entry of await readdir(path)) {
    await assertSafeTree(resolve(path, entry), secrets);
  }
}

const releaseId = required("BOARDWISE_RELEASE_ID");
if (!RELEASE_RE.test(releaseId)) {
  throw new Error("BOARDWISE_RELEASE_ID contains unsupported characters.");
}

const requestedStatus = required("BOARDWISE_CONTRACT_STATUS");
if (!new Set(["passed", "failed"]).has(requestedStatus)) {
  throw new Error("BOARDWISE_CONTRACT_STATUS must be passed or failed.");
}

const startedAt = isoTimestamp("BOARDWISE_CONTRACT_STARTED_AT");
const dataSha = fullSha("BOARDWISE_DATA_SHA");
const apiSha = fullSha("BOARDWISE_API_SHA");
const frontendSha = fullSha("BOARDWISE_FRONTEND_SHA");
const junitSource = resolve(
  process.env.BOARDWISE_CONTRACT_JUNIT || "test-results/junit.xml"
);
const reportSource = resolve(
  process.env.BOARDWISE_CONTRACT_REPORT || "playwright-report"
);
const contractSources = resolve("tests/contracts");
const output = resolve(
  process.env.BOARDWISE_CONTRACT_EVIDENCE_DIR || "frontend-contracts"
);
const cwdPrefix = `${resolve(".")}${sep}`;
if (!output.startsWith(cwdPrefix)) {
  throw new Error("Contract evidence output must stay inside the repository checkout.");
}

// Create a safe failure attestation before inspecting optional reports. If
// collection, web-server startup, or sanitization failed, the workflow still
// retains machine-readable evidence without copying unsafe material.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const initialResult = {
  schema_version: 1,
  release_id: releaseId,
  workflow_run_id: process.env.GITHUB_RUN_ID || "local",
  status: "failed",
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  data_sha: dataSha,
  api_sha: apiSha,
  frontend_sha: frontendSha,
  skipped: 0,
  xfailed: 0,
  evidence_complete: false,
  error_category: "candidate_evidence_incomplete",
  checks: CHECKS.map((name) => ({ name, status: "failed" })),
};
await writeFile(
  resolve(output, "result.json"),
  `${JSON.stringify(initialResult, null, 2)}\n`,
  "utf8"
);

await assertNoDisabledContractTests(contractSources);

const junit = await readFile(junitSource, "utf8");
const tests = attributeTotal(junit, "tests");
const skipped = attributeTotal(junit, "skipped");
const failures = attributeTotal(junit, "failures");
const errors = attributeTotal(junit, "errors");
if (tests < 1) throw new Error("Candidate JUnit contains no tests.");
const projects = suiteHostnames(junit);
for (const project of ["api-contract", "dom-contract", "candidate-access"]) {
  if (!projects.has(project)) {
    throw new Error(`Candidate JUnit is missing the ${project} project.`);
  }
}

const status =
  requestedStatus === "passed" && failures === 0 && errors === 0 && skipped === 0
    ? "passed"
    : "failed";
if (requestedStatus === "passed" && status !== "passed") {
  throw new Error("Candidate JUnit contains a failed, errored, or skipped test.");
}

const reportIndex = resolve(reportSource, "index.html");
await stat(reportIndex);
const secrets = secretBuffers();
await assertSafeFile(junitSource, secrets);
await assertSafeTree(reportSource, secrets);

await cp(junitSource, resolve(output, "junit.xml"));
await cp(reportSource, resolve(output, "playwright-report"), { recursive: true });

const result = {
  schema_version: 1,
  release_id: releaseId,
  workflow_run_id: process.env.GITHUB_RUN_ID || "local",
  status,
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  data_sha: dataSha,
  api_sha: apiSha,
  frontend_sha: frontendSha,
  skipped,
  xfailed: 0,
  evidence_complete: true,
  checks: CHECKS.map((name) => ({ name, status })),
};
await writeFile(
  resolve(output, "result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8"
);

process.stdout.write("Wrote sanitized candidate contract evidence.\n");
