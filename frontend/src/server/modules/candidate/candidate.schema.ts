// Candidate module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs for
// this module"). The transport's mappers and the contract test validate their
// outputs against these; the contract is the single source of truth for the wire
// shape (contract/src/resources/candidate.ts, contract v0.4).
//
// Topology (verified against positioning.schema.ts): the @creatoros/contract root
// barrel re-exports `ENDPOINTS` but NOT the resource files. The op responses are
// reachable as ENDPOINTS.<opKey>.response (the candidate op keys are unique):
//   - listCandidates.response === createCandidate.response === getCandidate.response
//       === patchCandidate.response === candidateResource
//   - promoteCandidate.response === topicPromotionResource
//   - listAudienceSignals.response === audienceSignalResource
import { ENDPOINTS } from "@creatoros/contract";
import type {
  CandidateRow,
  AudienceSignalRow,
  TopicPromotionRow,
} from "./candidate.repository";

export const candidateResource = ENDPOINTS.getCandidate.response;
export const audienceSignalResource = ENDPOINTS.listAudienceSignals.response;
export const topicPromotionResource = ENDPOINTS.promoteCandidate.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as a
// direct dependency, so we read the output type structurally (mirrors positioning).
export type CandidateResource = (typeof candidateResource)["_output"];
export type AudienceSignalResource = (typeof audienceSignalResource)["_output"];
export type TopicPromotionResource = (typeof topicPromotionResource)["_output"];

// Row → DTO mappers (SPEC §9: the API DTO is built by an explicit mapper, NEVER the
// Drizzle row). The service + contract test share ONE mapping so a wire-shape change
// is caught once.
export function toCandidateDto(row: CandidateRow): CandidateResource {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    angle: row.angle,
    source: row.source as CandidateResource["source"],
    contentRole: (row.contentRole ?? null) as CandidateResource["contentRole"],
    productAnchorId: row.productAnchorId ?? null,
    positioningFit: row.positioningFit ?? null,
    predictedScore: row.predictedScore ?? null,
    demandCount: row.demandCount,
    status: row.status as CandidateResource["status"],
    aiTaskId: row.aiTaskId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toAudienceSignalDto(
  row: AudienceSignalRow,
): AudienceSignalResource {
  return {
    id: row.id,
    userId: row.userId,
    source: row.source as AudienceSignalResource["source"],
    rawText: row.rawText,
    demandTag: row.demandTag ?? null,
    payingIntent: row.payingIntent ?? null,
    linkedCandidateId: row.linkedCandidateId ?? null,
    ingestionRunId: row.ingestionRunId ?? null,
    createdAt: row.createdAt,
  };
}

export function toTopicPromotionDto(
  row: TopicPromotionRow,
): TopicPromotionResource {
  return {
    id: row.id,
    userId: row.userId,
    candidateId: row.candidateId,
    projectId: row.projectId,
    promotedAt: row.promotedAt,
  };
}

// Internal typed shape the service validates Ingestion's opaque records against
// (Ingestion only validates `Record<string,unknown>[]`, so the typed shape lives
// here, Task 4). A failed validation drives a STABLE `errorCode:"SCHEMA_INVALID"`
// rejection so Ingestion's partial-success accounting works. Pure validation — no
// zod dependency in the frontend package, so a hand-rolled guard (mirrors the
// deterministic, C-5-safe style of the module).
export interface AudienceSignalRecord {
  recordKey?: string;
  source: string; // comment|dm|consultation|review
  rawText: string;
  demandTag?: string | null;
  payingIntent?: string | null;
  linkedCandidateRef?: string | null;
}

const AUDIENCE_SIGNAL_SOURCES = ["comment", "dm", "consultation", "review"];

export function parseAudienceSignalRecord(
  record: Record<string, unknown>,
): { ok: true; value: AudienceSignalRecord } | { ok: false; reason: string } {
  const source = record.source;
  const rawText = record.rawText;
  if (typeof source !== "string" || !AUDIENCE_SIGNAL_SOURCES.includes(source)) {
    return {
      ok: false,
      reason: `source must be one of ${AUDIENCE_SIGNAL_SOURCES.join("|")}`,
    };
  }
  if (typeof rawText !== "string" || rawText.length === 0) {
    return { ok: false, reason: "rawText must be a non-empty string" };
  }
  const value: AudienceSignalRecord = {
    source,
    rawText,
    recordKey:
      typeof record.recordKey === "string" ? record.recordKey : undefined,
    demandTag:
      typeof record.demandTag === "string" ? record.demandTag : null,
    payingIntent:
      typeof record.payingIntent === "string" ? record.payingIntent : null,
    linkedCandidateRef:
      typeof record.linkedCandidateRef === "string"
        ? record.linkedCandidateRef
        : null,
  };
  return { ok: true, value };
}
