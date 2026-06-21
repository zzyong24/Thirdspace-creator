// Positioning module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport's mappers and the contract test validate their
// outputs against these; the contract is the single source of truth for the wire
// shape (contract/src/resources/positioning.ts, contract v0.4).
//
// Topology (verified against learnings.schema.ts): the @creatoros/contract root
// barrel re-exports `ENDPOINTS` but NOT the resource files. The op responses are
// reachable as ENDPOINTS.<opKey>.response (the positioning op keys are unique):
//   - getProfile.response === upsertProfile.response === creatorProfileResource
//   - listStatements.response === createStatement.response === getStatement.response
//       === positioningStatementResource
//   - evaluateGate.response === positioningGateResultResource
//   - pages.positioning.get → ENDPOINTS.getPositioningCenter.response
//       === positioningCenterResource
import { ENDPOINTS } from "@creatoros/contract";
import type {
  CreatorProfileRow,
  PositioningStatementRow,
} from "./positioning.repository";

export const creatorProfileResource = ENDPOINTS.getProfile.response;
export const positioningStatementResource =
  ENDPOINTS.createStatement.response;
export const positioningGateResultResource =
  ENDPOINTS.evaluateGate.response;
export const positioningCenterResource =
  ENDPOINTS.getPositioningCenter.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as a
// direct dependency, so we read the output type structurally (mirrors learnings).
export type CreatorProfileResource = (typeof creatorProfileResource)["_output"];
export type PositioningStatementResource =
  (typeof positioningStatementResource)["_output"];
export type PositioningGateResultResource =
  (typeof positioningGateResultResource)["_output"];
export type PositioningCenterResource =
  (typeof positioningCenterResource)["_output"];

// Row → DTO mappers (SPEC §9: the API DTO is built by an explicit mapper, NEVER the
// Drizzle row). The service + contract test share ONE mapping so a wire-shape change
// is caught once.
export function toCreatorProfileDto(
  row: CreatorProfileRow,
): CreatorProfileResource {
  return {
    id: row.id,
    userId: row.userId,
    persona: row.persona,
    field: row.field,
    audience: row.audience,
    differentiation: row.differentiation,
    capabilities: (row.capabilities ?? []) as string[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPositioningStatementDto(
  row: PositioningStatementRow,
): PositioningStatementResource {
  return {
    id: row.id,
    userId: row.userId,
    profileId: row.profileId,
    oneLiner: row.oneLiner,
    keywords: (row.keywords ?? []) as string[],
    productAnchorIds: (row.productAnchorIds ?? []) as string[],
    versionNumber: row.versionNumber,
    createdByType:
      row.createdByType as PositioningStatementResource["createdByType"],
    aiTaskId: row.aiTaskId ?? null,
    createdAt: row.createdAt,
  };
}
