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
export const topicsOverviewResource = ENDPOINTS.overviewTopics.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as a
// direct dependency, so we read the output type structurally (mirrors positioning).
export type CandidateResource = (typeof candidateResource)["_output"];
export type AudienceSignalResource = (typeof audienceSignalResource)["_output"];
export type TopicPromotionResource = (typeof topicPromotionResource)["_output"];
export type TopicsOverviewResource = (typeof topicsOverviewResource)["_output"];

// The 选题卡 wire shape (contract `candidateCard`), read off the candidateResource so
// it stays in lockstep with the contract. `card` is stored as jsonb (a row carries an
// opaque object); the mapper normalizes it into the FULL shape (every detail field +
// the 3 metrics) so a partially-filled or empty `{}` card always validates.
export type CandidateCard = CandidateResource["card"];

const PRODUCTION_DIFFICULTY = new Set(["low", "mid", "high"]);

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function score(v: unknown): number | null {
  // 0–100 metric or null (honest "unknown"). A non-number / out-of-range → null.
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  if (v < 0 || v > 100) return null;
  return Math.round(v);
}

// jsonb → the full contract card. Drops unknown keys, clamps the metrics, and applies
// the contract defaults (contentStructure:[], the 3 metrics:null). Pure + deterministic
// (no zod dependency in the frontend package — mirrors the hand-rolled signal parser).
export function toCardDto(raw: unknown): CandidateCard {
  const c = (raw ?? {}) as Record<string, unknown>;
  const structure = Array.isArray(c.contentStructure)
    ? c.contentStructure.filter((x): x is string => typeof x === "string")
    : [];
  const difficulty =
    typeof c.productionDifficulty === "string" &&
    PRODUCTION_DIFFICULTY.has(c.productionDifficulty)
      ? (c.productionDifficulty as "low" | "mid" | "high")
      : null;
  return {
    oneLiner: str(c.oneLiner),
    targetAudience: str(c.targetAudience),
    audiencePain: str(c.audiencePain),
    coreConflict: str(c.coreConflict),
    hook: str(c.hook),
    contentStructure: structure,
    format: str(c.format),
    materialBasis: str(c.materialBasis),
    riskNote: str(c.riskNote),
    proposal: str(c.proposal),
    audiencePainScore: score(c.audiencePainScore),
    materialScore: score(c.materialScore),
    productionDifficulty: difficulty,
  };
}

// The known 选题卡 keys (the contract candidateCard fields). Used to filter a PARTIAL
// patch so an edit only carries recognized fields (drops unknown keys, never补 default
// — partial-merge semantics, unlike toCardDto which fills the full shape).
const CARD_DETAIL_KEYS = [
  "oneLiner",
  "targetAudience",
  "audiencePain",
  "coreConflict",
  "hook",
  "format",
  "materialBasis",
  "riskNote",
  "proposal",
] as const;

// A partial 选题卡 patch — keeps only recognized fields, validating each by its type
// (string details, string[] structure, 0–100 metrics, the difficulty enum). Returns a
// sparse object (absent keys are left untouched by the repo's shallow merge).
export function pickCardFields(raw: unknown): Record<string, unknown> {
  const c = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of CARD_DETAIL_KEYS) {
    if (typeof c[k] === "string") out[k] = c[k];
  }
  if (Array.isArray(c.contentStructure)) {
    out.contentStructure = c.contentStructure.filter(
      (x): x is string => typeof x === "string",
    );
  }
  if ("audiencePainScore" in c) out.audiencePainScore = score(c.audiencePainScore);
  if ("materialScore" in c) out.materialScore = score(c.materialScore);
  if (
    typeof c.productionDifficulty === "string" &&
    PRODUCTION_DIFFICULTY.has(c.productionDifficulty)
  ) {
    out.productionDifficulty = c.productionDifficulty;
  }
  return out;
}

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
    card: toCardDto((row as { card?: unknown }).card),
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
    // 评论按作品可读 (T-030 D6) — null 存量/非评论信号 (F3 边界)。
    publicationId: row.publicationId ?? null,
    // 评论点赞数 (T-042 热榜排序依据) — null 存量/非评论信号。
    likeCount: row.likeCount ?? null,
    // 评论粒度幂等锚 (T-065 采集层建, T-092 回流层读) — null 存量/非评论信号。
    externalId: row.externalId ?? null,
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
