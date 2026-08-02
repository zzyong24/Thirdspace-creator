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
  PositioningDiscoverySessionRow,
  PositioningStatementRow,
} from "./positioning.repository";

export const creatorProfileResource = ENDPOINTS.getProfile.response;
export const positioningStatementResource =
  ENDPOINTS.createStatement.response;
export const positioningGateResultResource =
  ENDPOINTS.evaluateGate.response;
export const positioningCenterResource =
  ENDPOINTS.getPositioningCenter.response;
export const positioningDiscoverySessionResource =
  ENDPOINTS.startDiscovery.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as a
// direct dependency, so we read the output type structurally (mirrors learnings).
export type CreatorProfileResource = (typeof creatorProfileResource)["_output"];
export type PositioningStatementResource =
  (typeof positioningStatementResource)["_output"];
export type PositioningMasterSnapshotResource = NonNullable<
  PositioningStatementResource["masterSnapshot"]
>;
export type PositioningMasterRestoreResultResource =
  (typeof ENDPOINTS.restorePositioningMaster.response)["_output"];
export type PositioningGateResultResource =
  (typeof positioningGateResultResource)["_output"];
export type PositioningCenterResource =
  (typeof positioningCenterResource)["_output"];
export type PositioningDiscoverySessionResource =
  (typeof positioningDiscoverySessionResource)["_output"];
export type PositioningDiscoveryConfirmResultResource =
  (typeof ENDPOINTS.confirmDiscovery.response)["_output"];

// jsonb projection — a stored profile row may carry a partial / empty `{}` facets or
// rules object (old rows, AI confirm). Normalize to the full key set with "" defaults so
// the DTO always matches creatorProfileResource (every key present, string-typed).
type FacetsDto = CreatorProfileResource["facets"];
type RulesDto = CreatorProfileResource["downstreamRules"];

function str(o: Record<string, unknown> | null | undefined, k: string): string {
  const v = o?.[k];
  return typeof v === "string" ? v : "";
}

function toFacetsDto(raw: unknown): FacetsDto {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    contentScope: str(o, "contentScope"),
    avoid: str(o, "avoid"),
    corePain: str(o, "corePain"),
    coreValue: str(o, "coreValue"),
    tone: str(o, "tone"),
    statusNote: str(o, "statusNote"),
  };
}

function toRulesDto(raw: unknown): RulesDto {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    topicRule: str(o, "topicRule"),
    scriptRule: str(o, "scriptRule"),
    projectRule: str(o, "projectRule"),
    forbidRule: str(o, "forbidRule"),
    expressionRule: str(o, "expressionRule"),
  };
}

export function toPositioningMasterSnapshotDto(
  raw: unknown,
): PositioningMasterSnapshotResource | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    persona: str(o, "persona"),
    field: str(o, "field"),
    audience: str(o, "audience"),
    differentiation: str(o, "differentiation"),
    capabilities: Array.isArray(o.capabilities)
      ? o.capabilities.filter((item): item is string => typeof item === "string")
      : [],
    facets: toFacetsDto(o.facets),
    downstreamRules: toRulesDto(o.downstreamRules),
  };
}

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
    facets: toFacetsDto(row.facets),
    downstreamRules: toRulesDto(row.downstreamRules),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPositioningDiscoverySessionDto(
  row: PositioningDiscoverySessionRow,
): PositioningDiscoverySessionResource {
  return positioningDiscoverySessionResource.parse({
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    sourceMode: row.sourceMode,
    status: row.status,
    answers: row.answers ?? [],
    webReferences: row.webReferences ?? [],
    inputManifest: row.inputManifest ?? {
      legacyProfileId: null,
      legacyStatementIds: [],
      legacyWorkIds: [],
    },
    adoptedCandidateId: row.adoptedCandidateId ?? null,
    adoptedStatementId: row.adoptedStatementId ?? null,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
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
    // [T-234 读侧补] 写侧 0034 已落库,补投影让 get/list 读得回。
    changeReason: (row as { changeReason?: string }).changeReason ?? "",
    masterSnapshot: toPositioningMasterSnapshotDto(row.masterSnapshot),
    createdAt: row.createdAt,
  };
}
