// Reviews module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport's mappers and the contract test validate their
// outputs against these; the contract is the single source of truth for the wire
// shape (contract/src/resources/reviews.ts).
//
// Topology (verified against analytics.schema.ts / publishing.schema.ts): the
// @creatoros/contract root barrel re-exports `ENDPOINTS` but NOT the resource
// files. The op responses are reachable as ENDPOINTS.<opKey>.response:
//   - createReview.response === getReview.response === completeReview.response
//       === reviewResource
//   - createReviewInsight.response === reviewInsightResource
// The reviewPublicationResource has no owned read op this wave (the attach path is
// decorative — Step 5) but is re-exported for the module.
import { ENDPOINTS } from "@creatoros/contract";
import type { ReviewRow, ReviewInsightRow } from "./reviews.repository";

export const reviewResource = ENDPOINTS.createReview.response;
export const reviewInsightResource = ENDPOINTS.createReviewInsight.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as
// a direct dependency, so we read the output type structurally (mirrors analytics).
export type ReviewResource = (typeof reviewResource)["_output"];
export type ReviewInsightResource = (typeof reviewInsightResource)["_output"];

// Row → DTO mappers (SPEC §9: the API DTO is built by an explicit mapper, NEVER the
// Drizzle row). The service + contract test share ONE mapping so a wire-shape
// change is caught once. user_id is dropped (it is the ownership boundary, never
// on the wire).
export function toReviewDto(row: ReviewRow): ReviewResource {
  return {
    id: row.id,
    projectId: row.projectId,
    contentOutputId: row.contentOutputId ?? null,
    reportArtifactId: row.reportArtifactId ?? null,
    reviewType: row.reviewType as ReviewResource["reviewType"],
    status: row.status as ReviewResource["status"],
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? null,
  };
}

export function toReviewInsightDto(row: ReviewInsightRow): ReviewInsightResource {
  return {
    id: row.id,
    reviewId: row.reviewId,
    insightType: row.insightType as ReviewInsightResource["insightType"],
    title: row.title,
    description: row.description,
    evidence: (row.evidence ?? {}) as Record<string, unknown>,
    priority: row.priority,
  };
}
