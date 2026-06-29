// Learnings module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport's mappers and the contract test validate their
// outputs against these; the contract is the single source of truth for the wire
// shape (contract/src/resources/learnings.ts).
//
// Topology (verified against reviews.schema.ts): the @creatoros/contract root barrel
// re-exports `ENDPOINTS` but NOT the resource files. The op responses are reachable
// as ENDPOINTS.<opKey>.response:
//   - listLearnings.response === createLearning.response === evaluateLearning.response
//       === learningResource
//   - createLearningApplication.response === learningApplicationResource
import { ENDPOINTS } from "@creatoros/contract";
import type {
  LearningRow,
  LearningApplicationRow,
} from "./learnings.repository";

export const learningResource = ENDPOINTS.createLearning.response;
export const learningApplicationResource =
  ENDPOINTS.createLearningApplication.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as a
// direct dependency, so we read the output type structurally (mirrors reviews).
export type LearningResource = (typeof learningResource)["_output"];
export type LearningApplicationResource =
  (typeof learningApplicationResource)["_output"];

// Row → DTO mappers (SPEC §9: the API DTO is built by an explicit mapper, NEVER the
// Drizzle row). The service + contract test share ONE mapping so a wire-shape change
// is caught once. user_id is dropped from the application DTO (it is a denormalized
// ownership boundary, never on the wire). The learning DTO keeps `userId` because the
// contract learningResource declares it.
// `reuseCount` is the number of LearningApplications referencing this learning
// (server-derived). Write-path callers (create / promote / evaluate) have no
// application yet — they default to 0; the read paths (list / get) pass the real
// aggregated count from the repository.
export function toLearningDto(
  row: LearningRow,
  reuseCount = 0,
): LearningResource {
  return {
    id: row.id,
    userId: row.userId,
    reviewId: row.reviewId ?? null,
    learningType: row.learningType as LearningResource["learningType"],
    title: row.title,
    insight: row.insight,
    recommendation: row.recommendation,
    validationStatus:
      row.validationStatus as LearningResource["validationStatus"],
    confidenceScore: row.confidenceScore,
    reuseCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toLearningApplicationDto(
  row: LearningApplicationRow,
): LearningApplicationResource {
  return {
    id: row.id,
    learningId: row.learningId,
    projectId: row.projectId,
    contentOutputId: row.contentOutputId ?? null,
    applicationNote: row.applicationNote,
    outcome: (row.outcome ?? {}) as Record<string, unknown>,
    appliedAt: row.appliedAt,
    evaluatedAt: row.evaluatedAt ?? null,
  };
}
