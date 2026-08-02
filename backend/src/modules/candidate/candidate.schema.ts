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

function safeHttpUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function parseSourceReferences(
  raw: unknown,
): NonNullable<CandidateCard["sourceReferences"]> {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const references: NonNullable<CandidateCard["sourceReferences"]> = [];
  for (const value of raw.slice(0, 10)) {
    if (value == null || typeof value !== "object") continue;
    const ref = value as Record<string, unknown>;
    const kind =
      ref.kind === "original_video" || ref.kind === "source_page"
        ? ref.kind
        : undefined;
    const platform = str(ref.platform);
    const label = str(ref.label);
    const url = safeHttpUrl(ref.url);
    if (!kind || !platform || !label || !url || seen.has(url)) continue;
    seen.add(url);
    references.push({
      kind,
      platform,
      label,
      url,
      intelligenceItemId: str(ref.intelligenceItemId),
    });
  }
  return references;
}

function stringList(raw: unknown, max: number): string[] {
  return Array.isArray(raw)
    ? raw
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
        .slice(0, max)
    : [];
}

export function parseSourceDecomposition(
  raw: unknown,
): CandidateCard["sourceDecomposition"] | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const hook = str(value.hook)?.trim();
  const reusablePattern = str(value.reusablePattern)?.trim();
  const structureSteps = stringList(value.structureSteps, 8);
  const coreClaims = stringList(value.coreClaims, 8);
  if (!hook || !reusablePattern || structureSteps.length < 2 || coreClaims.length < 1) {
    return undefined;
  }
  return {
    hook,
    structureSteps,
    coreClaims,
    reusablePattern,
    factRisks: stringList(value.factRisks, 12),
  };
}

export function parseAdaptationStrategy(
  raw: unknown,
): CandidateCard["adaptationStrategy"] | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  return {
    keep: stringList(value.keep, 8),
    replace: stringList(value.replace, 8),
    add: stringList(value.add, 8),
    avoid: stringList(value.avoid, 8),
  };
}

export function parseAdaptedDraft(
  raw: unknown,
): CandidateCard["adaptedDraft"] | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const contentText = str(value.contentText)?.trim();
  const generatedFromTranscriptHash = str(value.generatedFromTranscriptHash)?.trim();
  const strategyHash = str(value.strategyHash)?.trim();
  const templateVersion = str(value.templateVersion)?.trim();
  if (!contentText || !generatedFromTranscriptHash || !strategyHash || !templateVersion) {
    return undefined;
  }
  return {
    contentText: contentText.slice(0, 50_000),
    generatedFromTranscriptHash,
    strategyHash,
    templateVersion,
  };
}

// [T-284a] 复刻补链 G1 —— 原爆款拆解要素(candidate.card.teardown)的解析。5 段可迁移要素
// (钩子/结构/为什么爆/可借鉴点/适配本账号建议),benchmark-teardown-runner 建候选后 patch 挂上。
// 全字段可空;整体无任一有效段 → undefined(候选 card 里不留空壳,读端 toCardDto 也就不带 teardown)。
// 纯函数(无 zod 依赖,mirrors toCardDto 手写解析风格)。导出供单测直接断言。
export function parseTeardownRef(
  raw: unknown,
): CandidateCard["teardown"] | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const t = raw as Record<string, unknown>;
  const points = Array.isArray(t.可借鉴点)
    ? t.可借鉴点.filter((x): x is string => typeof x === "string" && x.length > 0)
    : undefined;
  const out: NonNullable<CandidateCard["teardown"]> = {};
  const hook = str(t.钩子拆解);
  if (hook) out.钩子拆解 = hook;
  const structure = str(t.结构拆解);
  if (structure) out.结构拆解 = structure;
  const why = str(t.为什么爆);
  if (why) out.为什么爆 = why;
  if (points && points.length > 0) out.可借鉴点 = points;
  const adapt = str(t.适配本账号建议);
  if (adapt) out.适配本账号建议 = adapt;
  return Object.keys(out).length > 0 ? out : undefined;
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
    // [T-235d] 归因溯源(additive)—— 实验候选携带其归因行 id(soft ref),UI 点开看依据。
    attributionId: str(c.attributionId),
    // [T-284a] 复刻补链 G1(additive)—— benchmark 转化候选携带的原爆款拆解要素(5 段),
    //   立项时复制进 briefDetail.benchmarkRef 回流写稿。非 benchmark 候选无此字段。
    teardown: parseTeardownRef(c.teardown),
    // [T-482] 只回显校验过的 HTTP(S) 来源；非法/重复链接在领域 DTO 边界丢弃。
    sourceReferences: parseSourceReferences(c.sourceReferences),
    sourceDecomposition: parseSourceDecomposition(c.sourceDecomposition),
    adaptationStrategy: parseAdaptationStrategy(c.adaptationStrategy),
    adaptedDraft: parseAdaptedDraft(c.adaptedDraft),
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
  // [T-235d] 归因溯源(additive)—— 实验候选进池时经 card patch 挂上;patch 不能丢它。
  "attributionId",
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
  // [T-284a] 复刻补链 G1 —— teardown 是对象(非 string),CARD_DETAIL_KEYS 只过 string,故单独放行。
  //   benchmark-teardown-runner 建候选后 `patchCandidate({ card: { teardown } })` 补写;patch 白名单
  //   不能丢它(否则 5 段拆解永远存不进 card,复刻回流断链)。解析失败/空 → 不写(不覆盖既有)。
  if ("teardown" in c) {
    const parsed = parseTeardownRef(c.teardown);
    if (parsed) out.teardown = parsed;
  }
  if ("sourceReferences" in c) {
    out.sourceReferences = parseSourceReferences(c.sourceReferences);
  }
  if ("sourceDecomposition" in c) {
    const parsed = parseSourceDecomposition(c.sourceDecomposition);
    if (parsed) out.sourceDecomposition = parsed;
  }
  if ("adaptationStrategy" in c) {
    const parsed = parseAdaptationStrategy(c.adaptationStrategy);
    if (parsed) out.adaptationStrategy = parsed;
  }
  if ("adaptedDraft" in c) {
    const parsed = parseAdaptedDraft(c.adaptedDraft);
    if (parsed) out.adaptedDraft = parsed;
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
