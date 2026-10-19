import { z } from "zod";
import { id, iso8601, platformId } from "../primitives";
import {platformNativeReportPayload} from "./platform-native-reports";

// T-1020: contract-only surface. Runtime endpoints are registered after the
// service-contract review and backend ownership checks are implemented.
export const collectionPlatformId = platformId;
export type CollectionPlatformId = z.infer<typeof collectionPlatformId>;

export const platformCapability = z.enum([
  "bind",
  "accountOverview",
  "workCatalog",
  "workMetrics",
  "nativeReports",
  "publishDraft",
  "publish",
  "comments",
]);
export const collectionCapability = z.enum(["accountOverview", "workCatalog", "workMetrics", "nativeReports"]);
export const platformAuthState = z.enum([
  "notRequired",
  "pending",
  "authorized",
  "expired",
  "revoked",
]);
export const platformRuntimeState = z.enum([
  "ready",
  "unavailable",
  "rateLimited",
  "needsAuth",
  "degraded",
]);
export const platformCapabilityState = z.strictObject({
  platform: collectionPlatformId,
  capability: platformCapability,
  supported: z.boolean(),
  authState: platformAuthState,
  runtimeState: platformRuntimeState,
  reasonCode: z.string().min(1).nullable(),
  lastVerifiedAt: iso8601.nullable(),
}).superRefine((state, ctx) => {
  if (!state.supported && state.runtimeState === "ready") {
    ctx.addIssue({ code: "custom", message: "Unsupported capability cannot be ready" });
  }
  if (state.runtimeState !== "ready" && !state.reasonCode) {
    ctx.addIssue({ code: "custom", message: "Unavailable capability needs reasonCode" });
  }
});
export const platformCapabilitiesListResponse = z.strictObject({
  items: z.array(platformCapabilityState),
});
export const platformCollectionErrorCode = z.enum([
  "FORBIDDEN_ACCOUNT", "BIND_EXPIRED", "WRONG_PLATFORM_IDENTITY",
  "SCOPE_MISSING", "LEASE_EXPIRED", "GENERATION_STALE",
  "PAGE_DIGEST_CONFLICT", "INCOMPLETE_CATALOG", "SOURCE_UNMAPPED",
  "SOURCE_UNIT_UNKNOWN", "VISIBILITY_STALE",
]);

export const platformBindAttemptStatus = z.enum([
  "pending", "identityVerified", "bound", "expired", "cancelled", "failed",
]);
export const platformBindBeginRequest = z.strictObject({
  platform: collectionPlatformId,
  clientRequestId: id,
});
export const platformBindConfirmRequest = z.strictObject({
  bindAttemptId: id,
});
// Identity and proof are obtained from the trusted adapter's persisted attempt,
// never accepted as strings asserted by the caller of confirm.
export const platformBindAttemptResource = z.strictObject({
  bindAttemptId: id,
  platform: collectionPlatformId,
  status: platformBindAttemptStatus,
  accountId: id.nullable(),
  verifiedPlatformIdentity: z.string().min(1).nullable(),
  expiresAt: iso8601,
});

export const platformVisibility = z.enum([
  "public", "private", "hidden", "removed", "unknown",
]);
export const platformVisibilityEvidence = z.strictObject({
  visibility: platformVisibility,
  source: z.string().min(1),
  sourcePriority: z.number().int().nonnegative(),
  observedAt: iso8601,
});
export const platformWorkResource = z.strictObject({
  id,
  userId: id,
  accountId: id,
  platform: collectionPlatformId,
  externalId: z.string().min(1),
  title: z.string().trim().min(1).nullable(),
  kind: z.enum(["video", "image", "article", "mixed"]),
  publishedAt: iso8601.nullable(),
  visibility: platformVisibilityEvidence,
  source: z.string().min(1),
  observedAt: iso8601,
  ingestedAt: iso8601,
  catalogGeneration: z.number().int().nonnegative(),
  publicationId: id.nullable(),
  legacyProjectId: id.nullable(),
  legacyPublicationId: id.nullable(),
  directoryState: z.enum(["current", "unavailable"]),
  directoryReasonCode: z.string().min(1).nullable(),
});

export const metricAvailability = z.enum([
  "available", "permissionDenied", "sourceMissing", "partial",
  "rateLimited", "parseFailed", "stale",
]);
export const metricWindow = z.union([
  z.strictObject({ kind: z.literal("lifetime") }),
  z.strictObject({
    kind: z.literal("interval"),
    start: iso8601,
    end: iso8601,
    timeZone: z.string().min(1),
  }).refine((window) => Date.parse(window.start) < Date.parse(window.end), "Metric window must be ordered"),
]);
export const platformMetricKey = z.enum([
  "follower_count", "follower_gain", "play_count", "view_count", "read_count",
  "exposure_count", "like_count", "comment_count", "share_count", "favorite_count",
]);
export const workMetricKey = platformMetricKey.exclude(["follower_count"]);
const metricSnapshotBase = z.strictObject({
  id,
  userId: id,
  accountId: id,
  platform: collectionPlatformId,
  metricKey: platformMetricKey,
  value: z.number().nonnegative().finite().nullable(),
  availability: metricAvailability,
  unit: z.literal("count"),
  window: metricWindow,
  source: z.string().min(1),
  sourceSnapshotKey: z.string().min(1).nullable(),
  capturedAt: iso8601,
  observedAt: iso8601,
  ingestedAt: iso8601,
}).superRefine((snapshot, ctx) => {
  if ((snapshot.availability === "available") !== (snapshot.value !== null)) {
    ctx.addIssue({ code: "custom", message: "Value and availability disagree" });
  }
});
export const accountMetricSnapshotResource = metricSnapshotBase.safeExtend({
  metricKey: z.literal("follower_count"),
  window: z.strictObject({ kind: z.literal("lifetime") }),
});
export const workMetricSnapshotResource = metricSnapshotBase.safeExtend({
  platformWorkId: id,
  metricKey: workMetricKey,
}).superRefine((snapshot, ctx) => {
  if (snapshot.metricKey === "follower_gain" && snapshot.window.kind !== "interval") {
    ctx.addIssue({ code: "custom", message: "Follower gain requires interval window" });
  }
});

export const sourceVisibilityEvidence = z.strictObject({
  visibility: platformVisibility,
  source: z.string().min(1),
  observedAt: iso8601,
});
export const sourceWorkRecord = z.strictObject({
  externalId: z.string().min(1),
  title: z.string().trim().min(1).nullable().optional(),
  kind: z.enum(["video", "image", "article", "mixed"]),
  publishedAt: iso8601.nullable(),
  visibility: sourceVisibilityEvidence,
  source: z.string().min(1),
  observedAt: iso8601,
});
export const sourceMetricRecord = z.strictObject({
  externalWorkId: z.string().min(1).nullable(),
  sourceField: z.string().min(1),
  sourceUnit: z.string().min(1),
  value: z.number().nonnegative().finite().nullable(),
  availability: metricAvailability,
  window: metricWindow,
  source: z.string().min(1),
  capturedAt: iso8601,
  observedAt: iso8601,
}).superRefine((metric, ctx) => {
  if ((metric.availability === "available") !== (metric.value !== null)) {
    ctx.addIssue({ code: "custom", message: "Source value and availability disagree" });
  }
});

export const collectionTerminalEvidence = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("platformHasMoreFalse"),
    source: z.string().min(1),
    observedAt: iso8601,
  }),
  z.strictObject({
    kind: z.literal("reportedTotalAndProbe"),
    source: z.string().min(1),
    observedAt: iso8601,
    probe: z.strictObject({
      requestCursor: z.string().min(1),
      nextCursor: z.string().nullable(),
      recordIds: z.array(z.string().min(1)),
      responseDigest: z.string().min(1),
      observedAt: iso8601,
    }),
  }),
]);

// Only the internal worker service port accepts this DTO. The backend resolves
// user, internal IDs, priority, metric dictionary and project/publication links.
const collectionPageBase = z.strictObject({
  attemptId: id,
  accountId: id,
  platform: collectionPlatformId,
  expectedPlatformIdentity: z.string().min(1),
  generation: z.number().int().positive(),
  leaseToken: z.string().min(1),
  sourceSnapshotKey: z.string().min(1).nullable(),
  scanPass: z.union([z.literal(1), z.literal(2)]),
  platformReportedTotal: z.number().int().nonnegative().nullable(),
  totalSource: z.string().min(1).nullable(),
  totalObservedAt: iso8601.nullable(),
  terminalEvidence: collectionTerminalEvidence.nullable(),
  pageIndex: z.number().int().nonnegative(),
  requestCursor: z.string().nullable(),
  nextCursor: z.string().nullable(),
  pageDigest: z.string().min(1),
  hasMore: z.boolean(),
  observedAt: iso8601,
});
export const collectionPageCommit = z.discriminatedUnion("capability", [
  collectionPageBase.safeExtend({capability:z.literal("nativeReports"),works:z.tuple([]),accountMetrics:z.tuple([]),workMetrics:z.tuple([]),nativeReports:z.array(platformNativeReportPayload).min(1).max(5)}),
  collectionPageBase.safeExtend({
    capability: z.literal("workCatalog"),
    works: z.array(sourceWorkRecord),
    accountMetrics: z.tuple([]),
    workMetrics: z.tuple([]),
  }),
  collectionPageBase.safeExtend({
    capability: z.literal("accountOverview"),
    works: z.tuple([]),
    accountMetrics: z.array(sourceMetricRecord),
    workMetrics: z.tuple([]),
  }),
  collectionPageBase.safeExtend({
    capability: z.literal("workMetrics"),
    works: z.tuple([]),
    accountMetrics: z.tuple([]),
    workMetrics: z.array(sourceMetricRecord),
  }),
]).superRefine((page, ctx) => {
  const totalFields = [page.platformReportedTotal, page.totalSource, page.totalObservedAt];
  if (totalFields.some((value) => value === null) && totalFields.some((value) => value !== null)) {
    ctx.addIssue({ code: "custom", message: "Platform total, source and observation time must appear together" });
  }
  if (!page.hasMore && !page.terminalEvidence) {
    ctx.addIssue({ code: "custom", message: "Terminal page requires evidence" });
  }
  if (page.hasMore && page.terminalEvidence) {
    ctx.addIssue({ code: "custom", message: "Nonterminal page cannot claim terminal evidence" });
  }
  if (page.terminalEvidence?.kind === "reportedTotalAndProbe" && page.platformReportedTotal === null) {
    ctx.addIssue({ code: "custom", message: "Reported-total terminal evidence requires platform total" });
  }
  if (page.terminalEvidence?.kind === "reportedTotalAndProbe") {
    const probe = page.terminalEvidence.probe;
    if (!page.nextCursor || probe.requestCursor !== page.nextCursor) {
      ctx.addIssue({ code: "custom", message: "Probe must follow the terminal candidate cursor" });
    }
    if (probe.nextCursor !== null && probe.nextCursor !== probe.requestCursor) {
      ctx.addIssue({ code: "custom", message: "Probe continued to another cursor" });
    }
  }
  const seen = new Set<string>();
  for (const [index, work] of page.works.entries()) {
    if (seen.has(work.externalId)) {
      ctx.addIssue({ code: "custom", path: ["works", index], message: "Duplicate externalId in page" });
    }
    seen.add(work.externalId);
  }
  for (const [index, metric] of page.accountMetrics.entries()) {
    if (metric.externalWorkId !== null) ctx.addIssue({ code: "custom", path: ["accountMetrics", index], message: "Account metric cannot name work" });
  }
  for (const [index, metric] of page.workMetrics.entries()) {
    if (metric.externalWorkId === null) ctx.addIssue({ code: "custom", path: ["workMetrics", index], message: "Work metric requires externalWorkId" });
  }
});
export const collectionPageReceipt = z.strictObject({
  attemptId: id,
  generation: z.number().int().positive(),
  scanPass: z.union([z.literal(1), z.literal(2)]),
  pageIndex: z.number().int().nonnegative(),
  disposition: z.enum(["accepted", "replayed"]),
  nextCursor: z.string().nullable(),
  completeCatalogGeneration: z.number().int().nonnegative().nullable(),
});
export const collectionStartRequest = z.strictObject({
  accountId: id,
  capability: collectionCapability,
  clientRequestId: id,
});
export const collectionStatusRequest = z.strictObject({
  accountId: id,
  attemptId: id,
});
export const collectionCancelRequest = z.strictObject({
  attemptId: id,
  accountId: id,
});
export const platformWorksListQuery = z.strictObject({
  accountId: id,
  cursor: z.string().nullable().optional(),
  pageSize: z.number().int().positive().max(100).default(20),
  projectId: id.optional(),
});
export const platformMetricsReadQuery = z.strictObject({
  accountId: id,
  platformWorkId: id.optional(),
  metricKey: platformMetricKey.optional(),
  cursor: z.string().nullable().optional(),
  pageSize: z.number().int().positive().max(100).default(20),
});
export const platformWorksListResponse = z.strictObject({
  accountId: id,
  catalogGeneration: z.number().int().nonnegative().nullable(),
  catalogCompleteness: z.enum(["none", "legacyPartial", "verifiedComplete"]),
  catalogCompletedAt: iso8601.nullable(),
  total: z.number().int().nonnegative(),
  currentTotal: z.number().int().nonnegative(),
  unavailableTotal: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  items: z.array(platformWorkResource),
}).superRefine((page, ctx) => {
  if (page.currentTotal + page.unavailableTotal !== page.total) {
    ctx.addIssue({ code: "custom", message: "Catalog totals must reconcile" });
  }
  if ((page.catalogCompleteness === "verifiedComplete") !== (page.catalogCompletedAt !== null)) {
    ctx.addIssue({ code: "custom", message: "Only a verified complete catalog has completion time" });
  }
  if (page.catalogCompleteness === "none" && (page.catalogGeneration !== null || page.total !== 0)) {
    ctx.addIssue({ code: "custom", message: "Missing catalog cannot claim works" });
  }
  for (const [index, work] of page.items.entries()) {
    if (work.accountId !== page.accountId ||
      (work.directoryState === "current" && page.catalogGeneration !== null && work.catalogGeneration !== page.catalogGeneration) ||
      (work.directoryState === "unavailable" &&
        (work.directoryReasonCode !== "ABSENT_UNCONFIRMED" || work.visibility.visibility !== "unknown" ||
          page.catalogGeneration === null || work.catalogGeneration >= page.catalogGeneration))) {
      ctx.addIssue({ code: "custom", path: ["items", index], message: "Work outside account or catalog generation" });
    }
  }
});
export const platformMetricsReadResponse = z.strictObject({
  accountId: id,
  nextCursor: z.string().nullable(),
  accountMetrics: z.array(accountMetricSnapshotResource),
  workMetrics: z.array(workMetricSnapshotResource),
}).superRefine((page, ctx) => {
  for (const [index, metric] of page.accountMetrics.entries()) {
    if (metric.accountId !== page.accountId) ctx.addIssue({ code: "custom", path: ["accountMetrics", index], message: "Account metric outside account" });
  }
  for (const [index, metric] of page.workMetrics.entries()) {
    if (metric.accountId !== page.accountId) ctx.addIssue({ code: "custom", path: ["workMetrics", index], message: "Work metric outside account" });
  }
});
export const collectionRunStatus = z.enum([
  "queued", "running", "complete", "partial", "needsAuth", "failed", "cancelled",
]);
export const collectionRunResource = z.strictObject({
  attemptId: id,
  accountId: id,
  capability: collectionCapability,
  status: collectionRunStatus,
  generation: z.number().int().positive(),
  committedPages: z.number().int().nonnegative(),
  completeCatalogGeneration: z.number().int().nonnegative().nullable(),
  reasonCode: z.string().min(1).nullable(),
  startedAt: iso8601,
  updatedAt: iso8601,
});

export type PlatformCapabilityState = z.infer<typeof platformCapabilityState>;
export type PlatformWorkResource = z.infer<typeof platformWorkResource>;
export type AccountMetricSnapshotResource = z.infer<typeof accountMetricSnapshotResource>;
export type WorkMetricSnapshotResource = z.infer<typeof workMetricSnapshotResource>;
export type CollectionPageCommit = z.infer<typeof collectionPageCommit>;
export type CollectionRunResource = z.infer<typeof collectionRunResource>;
