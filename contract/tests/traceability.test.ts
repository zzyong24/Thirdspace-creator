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
    ];
    const uncovered = coverage.filter(([, , ok]) => !ok).map(([fr]) => fr);
    expect(uncovered, `uncovered GAP-002 FRs: ${uncovered.join(", ")}`).toEqual([]);
  });
});
