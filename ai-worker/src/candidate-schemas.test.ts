import { describe, it, expect } from "vitest";
import { parseCandidate, RESULT_TYPES } from "./candidate-schemas";

describe("parseCandidate", () => {
  it("accepts a valid artifact_version candidate", () => {
    const result = parseCandidate({
      resultType: "artifact_version",
      resultData: { artifactId: "artifact-1", body: "新的脚本内容", summary: "收紧开场" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an artifact_version candidate missing the body", () => {
    const result = parseCandidate({
      resultType: "artifact_version",
      resultData: { artifactId: "artifact-1" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown result type", () => {
    const result = parseCandidate({ resultType: "nonsense", resultData: {} });
    expect(result.ok).toBe(false);
  });

  it("exposes the supported result types", () => {
    expect(RESULT_TYPES).toContain("artifact_version");
    expect(RESULT_TYPES).toContain("advisory");
  });
});
