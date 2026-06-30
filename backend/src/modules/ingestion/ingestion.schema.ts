// Ingestion module schema surface (foundation §5: "<module>.schema.ts —
// re-export/usage of the contract Zod DTOs for this module"). The contract is the
// single source of truth for the wire shape (contract/src/resources/ingestion.ts);
// the transport's toRunResource(row) + the contract test validate against
// `ingestionRunResource`.
//
// Topology (verified against analytics.schema.ts): the @creatoros/contract root
// barrel re-exports `ENDPOINTS` but NOT the resource files. All 7 ingestion ops
// respond with the SAME run envelope, reachable as ENDPOINTS.<op>.response:
//   - createRun / pushMetrics / pushKnowledge / pushAssets / pushArtifacts /
//     completeRun / getRun .response === ingestionRunResource
import { ENDPOINTS } from "@creatoros/contract";

export const ingestionRunResource = ENDPOINTS.createRun.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as a
// direct dependency, so we read the output type structurally.
export type IngestionRunResource = (typeof ingestionRunResource)["_output"];

// ---------------------------------------------------------------------------
// Internal per-record payload validators (Task 4). The contract validates only
// `records: Record<string,unknown>[]` (opaque), so the TYPED per-record shape that
// drives partial-success rejection lives here. Implemented as plain deterministic
// validators (NOT a new zod schema) because the frontend package does not declare
// `zod` as a direct dependency — same reason analytics/knowledge derive types
// structurally rather than importing `z`. Each returns a discriminated result so
// the service can `appendError({ errorCode, errorMessage })` on failure (SPEC
// §17.5) with a stable `errorCode`.
// ---------------------------------------------------------------------------

export const SCHEMA_INVALID = "SCHEMA_INVALID";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errorCode: string; errorMessage: string };

type Rec = Record<string, unknown>;

function fail(errorMessage: string): { ok: false; errorCode: string; errorMessage: string } {
  return { ok: false, errorCode: SCHEMA_INVALID, errorMessage };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isRecord(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// A metric record resolves to a Publication via { platform, externalId } (the
// resolvePublication seam, SPEC §277-281) and carries a capturedAt + a metrics
// map. capturedAt is the Analytics idempotency anchor (roadmap §404).
export interface MetricRecord {
  recordKey: string;
  platform: string;
  externalId: string;
  capturedAt: string;
  metrics: Rec;
  // 数据底座(SPEC §1.3):真抓作品携带的真实标题 + 发布时刻(可空)。导入路径
  // (ensureImportedProject)用它给历史项目起真名 / 落 platform_ref.publishedAt。
  // 常规 push（非导入）可不带,留空即可。
  title?: string;
  publishedAt?: string;
  shareUrl?: string;
}

export function parseMetricRecord(
  record: Rec,
  recordKey: string,
): ValidationResult<MetricRecord> {
  if (!isNonEmptyString(record.platform)) return fail("metric.platform is required");
  if (!isNonEmptyString(record.externalId))
    return fail("metric.externalId is required");
  if (!isNonEmptyString(record.capturedAt))
    return fail("metric.capturedAt is required");
  const metrics = isRecord(record.metrics) ? record.metrics : {};
  const value: MetricRecord = {
    recordKey,
    platform: record.platform,
    externalId: record.externalId,
    capturedAt: record.capturedAt,
    metrics,
  };
  // 数据底座(SPEC §1.3):可选标题/发布时刻/分享链接,仅在非空字符串时带上。
  if (isNonEmptyString(record.title)) value.title = record.title;
  if (isNonEmptyString(record.publishedAt)) value.publishedAt = record.publishedAt;
  if (isNonEmptyString(record.shareUrl)) value.shareUrl = record.shareUrl;
  return { ok: true, value };
}

export interface KnowledgeRecord {
  recordKey: string;
  title: string;
  content: string;
  knowledgeType: string;
}

export function parseKnowledgeRecord(
  record: Rec,
  recordKey: string,
): ValidationResult<KnowledgeRecord> {
  if (!isNonEmptyString(record.title)) return fail("knowledge.title is required");
  return {
    ok: true,
    value: {
      recordKey,
      title: record.title,
      content: typeof record.content === "string" ? record.content : "",
      knowledgeType: isNonEmptyString(record.knowledgeType)
        ? record.knowledgeType
        : "note",
    },
  };
}

export interface AssetRecord {
  recordKey: string;
  name: string;
  assetType: string;
  storageKey: string;
}

export function parseAssetRecord(
  record: Rec,
  recordKey: string,
): ValidationResult<AssetRecord> {
  if (!isNonEmptyString(record.name)) return fail("asset.name is required");
  if (!isNonEmptyString(record.storageKey))
    return fail("asset.storageKey is required");
  return {
    ok: true,
    value: {
      recordKey,
      name: record.name,
      assetType: isNonEmptyString(record.assetType) ? record.assetType : "image",
      storageKey: record.storageKey,
    },
  };
}

export interface ArtifactRecord {
  recordKey: string;
  artifactId: string;
  contentText: string;
  contentData: Rec;
  changeSummary: string;
}

export function parseArtifactRecord(
  record: Rec,
  recordKey: string,
): ValidationResult<ArtifactRecord> {
  if (!isNonEmptyString(record.artifactId))
    return fail("artifact.artifactId is required");
  return {
    ok: true,
    value: {
      recordKey,
      artifactId: record.artifactId,
      contentText: typeof record.contentText === "string" ? record.contentText : "",
      contentData: isRecord(record.contentData) ? record.contentData : {},
      changeSummary:
        typeof record.changeSummary === "string" ? record.changeSummary : "",
    },
  };
}

// Stable record-key derivation: prefer an explicit recordKey, then a domain id,
// else a deterministic positional fallback (no Math.random / hashing of unknown
// shapes — determinism, foundation §4). The positional index keeps a batch's keys
// stable across a re-submission of the SAME ordered batch.
export function deriveRecordKey(record: Rec, index: number): string {
  if (isNonEmptyString(record.recordKey)) return record.recordKey;
  if (isNonEmptyString(record.id)) return record.id;
  if (isNonEmptyString(record.externalId)) return record.externalId;
  return `idx-${index}`;
}
