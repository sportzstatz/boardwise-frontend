import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("candidate evidence writer", () => {
  it("retains a sanitized failed result when reports are missing", async () => {
    const parent = resolve(".tmp");
    await mkdir(parent, { recursive: true });
    const output = await mkdtemp(resolve(parent, "candidate-evidence-"));
    temporaryRoots.push(output);
    const missing = resolve(output, "missing");
    const token = "disposable-session-must-not-appear";
    const result = spawnSync(
      process.execPath,
      ["scripts/write-candidate-contract-result.mjs"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        env: {
          ...process.env,
          BOARDWISE_RELEASE_ID: "candidate-evidence-test",
          BOARDWISE_DATA_SHA: "1".repeat(40),
          BOARDWISE_API_SHA: "2".repeat(40),
          BOARDWISE_FRONTEND_SHA: "3".repeat(40),
          BOARDWISE_CONTRACT_STATUS: "failed",
          BOARDWISE_CONTRACT_STARTED_AT: "2026-07-12T00:00:00Z",
          BOARDWISE_CONTRACT_JUNIT: missing,
          BOARDWISE_CONTRACT_REPORT: missing,
          BOARDWISE_CONTRACT_EVIDENCE_DIR: output,
          BOARDWISE_CONTRACT_FREE_SESSION_TOKEN: token,
          BOARDWISE_CONTRACT_FOUNDER_SESSION_TOKEN: `${token}-founder`,
          BOARDWISE_CONTRACT_ADMIN_SESSION_TOKEN: `${token}-admin`,
        },
      }
    );

    expect(result.status).not.toBe(0);
    const evidence = JSON.parse(
      await readFile(resolve(output, "result.json"), "utf8")
    );
    expect(evidence).toMatchObject({
      status: "failed",
      evidence_complete: false,
      error_category: "candidate_evidence_incomplete",
    });
    expect(JSON.stringify(evidence)).not.toContain(token);
  });
});
