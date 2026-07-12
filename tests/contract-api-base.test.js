import { describe, expect, it } from "vitest";
import {
  PRODUCTION_API_ORIGIN,
  resolveContractApiBase,
} from "../scripts/contract-api-base.mjs";

describe("contract API target", () => {
  it("requires an explicit API base", () => {
    expect(() => resolveContractApiBase({})).toThrow(
      /BOARDWISE_CONTRACT_API_BASE is required/
    );
  });

  it("normalizes an explicit candidate origin", () => {
    expect(
      resolveContractApiBase({
        BOARDWISE_CONTRACT_API_BASE: "http://127.0.0.1:8000/",
        BOARDWISE_CONTRACT_TARGET: "candidate",
      })
    ).toBe("http://127.0.0.1:8000");
  });

  it("rejects production as an authoritative candidate target", () => {
    expect(() =>
      resolveContractApiBase({
        BOARDWISE_CONTRACT_API_BASE: PRODUCTION_API_ORIGIN,
        BOARDWISE_CONTRACT_TARGET: "candidate",
      })
    ).toThrow(/must not target the production API/);
  });

  it("pins production compatibility to the production origin", () => {
    expect(
      resolveContractApiBase({
        BOARDWISE_CONTRACT_API_BASE: PRODUCTION_API_ORIGIN,
        BOARDWISE_CONTRACT_TARGET: "production-compatibility",
      })
    ).toBe(PRODUCTION_API_ORIGIN);

    expect(() =>
      resolveContractApiBase({
        BOARDWISE_CONTRACT_API_BASE: "https://candidate.example.test",
        BOARDWISE_CONTRACT_TARGET: "production-compatibility",
      })
    ).toThrow(/must explicitly target the production API/);
  });

  it("rejects credentials and misleading path components", () => {
    expect(() =>
      resolveContractApiBase({
        BOARDWISE_CONTRACT_API_BASE: "https://user:pass@example.test",
      })
    ).toThrow(/must not contain credentials/);
    expect(() =>
      resolveContractApiBase({
        BOARDWISE_CONTRACT_API_BASE: "https://example.test/api",
      })
    ).toThrow(/origin without a path/);
  });
});
