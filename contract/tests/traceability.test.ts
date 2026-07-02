import { describe, it, expect } from "vitest";
import { ENDPOINTS } from "../src/endpoints";

// GAP-002 (orchestrator/TRACEABILITY_MATRIX.md) named the backend-bearing FR
// chains that were broken because no service contract existed. This test
// proves the contract now carries an operation for each of those capabilities
// (closing the contract half of GAP-002; stage-16 backend tests attach to the
// same operation ids), and that EVERY endpoint is traced to a requirement.

const has = (method: string, path: string) =>
  Object.values(ENDPOINTS).some((e) => e.method === method && e.path === path);

describe("FR → operation traceability (GAP-002)", () => {
  it("traces every endpoint to at least one requirement (fr id)", () => {
    const untraced = Object.values(ENDPOINTS)
      .filter((e) => e.fr.length === 0)
      .map((e) => `${e.method} ${e.path}`);
    expect(untraced, `untraced: ${untraced.join(", ")}`).toEqual([]);
  });

  it("covers each GAP-002 backend-bearing capability with a contract operation", () => {
    // [FR, description, a registered operation that serves it]
    const coverage: ReadonlyArray<[string, string, boolean]> = [
      ["FR-002", "Project lifecycle CRUD", has("GET", "/projects") && has("POST", "/projects") && has("PATCH", "/projects/:projectId")],
      ["FR-006", "Stage transitions", has("POST", "/projects/:projectId/stages/:stage/transition")],
      ["FR-013", "Artifact lifecycle", has("GET", "/artifacts/:artifactId") && has("POST", "/projects/:projectId/artifacts")],
      ["FR-014", "Immutable artifact versions", has("POST", "/artifacts/:artifactId/versions") && has("POST", "/artifacts/:artifactId/restore")],
      ["FR-026/027", "Search indexing + query", has("GET", "/search")],
      ["FR-044", "Multi-platform publications", has("POST", "/outputs/:outputId/publications") && has("POST", "/publications/:publicationId/transition")],
      ["FR-047", "External write API", has("POST", "/ingestion/runs")],
      ["FR-049", "Idempotent ingestion", has("POST", "/ingestion/runs/:runId/complete")],
      ["FR-052", "Raw + normalized metrics", has("POST", "/ingestion/runs/:runId/metrics")],
      ["FR-053", "Metrics aggregation", has("GET", "/analytics/projects/:projectId")],
      ["FR-TAXONOMY", "Tag CRUD + polymorphic entity tagging (v0.2)", has("GET", "/tags") && has("POST", "/tags") && has("PATCH", "/tags/:tagId") && has("POST", "/tags/:tagId/delete") && has("POST", "/tags/assignments") && has("POST", "/tags/assignments/remove") && has("GET", "/tags/for-entity") && has("GET", "/tags/:tagId/entities")],
      // ── contract v0.4 (七步 seven-step) capabilities ──────────────────────
      ["FR-POSITIONING", "定位① CreatorProfile + ② PositioningStatement 版本链 + Gate (七步③)", has("GET", "/positioning/profile") && has("POST", "/positioning/profile") && has("GET", "/positioning/statements") && has("POST", "/positioning/statements") && has("GET", "/positioning/statements/:statementId") && has("POST", "/positioning/gate/evaluate") && has("GET", "/positioning/center")],
      // [T-052 裁决③] FR-MONETIZATION 追溯行已随变现中心物理删除(宪法 §8)。
      ["FR-CANDIDATE", "选题候选池 + 受众信号 + 晋升 (七步③)", has("GET", "/candidates") && has("POST", "/candidates") && has("POST", "/candidates/:candidateId/promote") && has("GET", "/audience-signals") && has("POST", "/audience-signals/:signalId/link")],
      ["FR-CALIBRATION", "变现加权 Rubric 版本链 + 盲预测 + 校准闭环 (七步⑤⑥)", has("POST", "/calibration/rubrics") && has("POST", "/calibration/rubrics/:rubricId/versions") && has("POST", "/calibration/predictions") && has("POST", "/calibration/predictions/:predictionId/lock") && has("POST", "/calibration/predictions/:predictionId/result")],
      ["FR-PLATFORM-ACCOUNT", "多账号矩阵 PlatformAccount registry (七步 §7.1)", has("GET", "/accounts") && has("POST", "/accounts") && has("PATCH", "/accounts/:accountId") && has("POST", "/accounts/:accountId/archive")],
      ["FR-CONTENT-CALENDAR", "发布节奏 ContentCalendarEntry + PublishingCadence + 达成率 (七步 §7.2)", has("GET", "/accounts/:accountId/calendar") && has("POST", "/accounts/:accountId/calendar/entries") && has("POST", "/calendar/entries/:entryId/transition") && has("PUT", "/accounts/:accountId/cadence") && has("GET", "/accounts/:accountId/cadence/attainment")],
    ];
    const uncovered = coverage.filter(([, , ok]) => !ok).map(([fr]) => fr);
    expect(uncovered, `uncovered GAP-002 FRs: ${uncovered.join(", ")}`).toEqual([]);
  });
});
