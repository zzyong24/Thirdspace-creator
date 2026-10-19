import { pgTable, text, integer, jsonb, doublePrecision, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import type {NativeReportPayload} from "@creatoros/contract";

// T-1020: local, account-owned collection facts. Only backend service ports write these tables.
export const platformCollectionBindings = pgTable("platform_collection_bindings", {
  accountId: text("account_id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  platformIdentity: text("platform_identity").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  proofSource: text("proof_source").notNull(),
  verifiedAt: text("verified_at").notNull(),
  expiresAt: text("expires_at"),
  revokedAt: text("revoked_at"),
}, table => [
  uniqueIndex("platform_collection_bindings_identity_ux").on(table.userId, table.platform, table.platformIdentity),
]);

export const platformBindAttempts = pgTable("platform_bind_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  clientRequestId: text("client_request_id").notNull(),
  status: text("status").notNull(),
  platformIdentity: text("platform_identity"),
  proofSource: text("proof_source"),
  scopes: jsonb("scopes").$type<string[]>(),
  proofVerifiedAt: text("proof_verified_at"),
  proofExpiresAt: text("proof_expires_at"),
  accountId: text("account_id"),
  cleanupPendingAt: text("cleanup_pending_at"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("platform_bind_attempts_request_ux").on(table.userId, table.platform, table.clientRequestId),
  index("platform_bind_attempts_expiry_ix").on(table.status, table.expiresAt),
]);

export const platformCollectionRuns = pgTable("platform_collection_runs", {
  groupId: text("group_id"),
  groupVersion: integer("group_version"),
  membershipVersion: integer("membership_version"),
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  platform: text("platform").notNull(),
  platformIdentity: text("platform_identity").notNull(),
  capability: text("capability").notNull(),
  clientRequestId: text("client_request_id").notNull(),
  status: text("status").notNull(),
  generation: integer("generation").notNull(),
  leaseToken: text("lease_token"),
  leaseExpiresAt: text("lease_expires_at"),
  sourceSnapshotKey: text("source_snapshot_key"),
  committedPages: integer("committed_pages").notNull().default(0),
  completeCatalogGeneration: integer("complete_catalog_generation"),
  reasonCode: text("reason_code"),
  startedAt: text("started_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("platform_collection_runs_request_ux").on(table.userId, table.accountId, table.capability, table.clientRequestId),
  uniqueIndex("platform_collection_runs_active_ux").on(table.accountId, table.capability)
    .where(sql`status IN ('queued', 'running')`),
  index("platform_collection_runs_account_ix").on(table.userId, table.accountId, table.startedAt),
]);

export const platformCollectionPages = pgTable("platform_collection_pages", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  generation: integer("generation").notNull(),
  scanPass: integer("scan_pass").notNull(),
  pageIndex: integer("page_index").notNull(),
  requestCursor: text("request_cursor"),
  nextCursor: text("next_cursor"),
  sourceSnapshotKey: text("source_snapshot_key"),
  platformReportedTotal: integer("platform_reported_total"),
  totalSource: text("total_source"),
  totalObservedAt: text("total_observed_at"),
  terminalEvidence: jsonb("terminal_evidence").$type<unknown>(),
  pageDigest: text("page_digest").notNull(),
  payloadDigest: text("payload_digest").notNull(),
  hasMore: integer("has_more").notNull(),
  recordIds: jsonb("record_ids").$type<string[]>().notNull(),
  works: jsonb("works").$type<unknown[]>().notNull(),
  metrics: jsonb("metrics").$type<unknown[]>().notNull(),
  observedAt: text("observed_at").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
  uniqueIndex("platform_collection_pages_position_ux").on(table.runId, table.generation, table.scanPass, table.pageIndex),
]);

export const platformCatalogs = pgTable("platform_catalogs", {
  accountId: text("account_id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  generation: integer("generation").notNull().default(0),
  completedAt: text("completed_at"),
  workCount: integer("work_count").notNull().default(0),
});

export const platformWorks = pgTable("platform_works", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  platform: text("platform").notNull(),
  externalId: text("external_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title"),
  publishedAt: text("published_at"),
  visibility: text("visibility").notNull(),
  visibilitySource: text("visibility_source").notNull(),
  visibilityPriority: integer("visibility_priority").notNull(),
  visibilityObservedAt: text("visibility_observed_at").notNull(),
  source: text("source").notNull(),
  observedAt: text("observed_at").notNull(),
  ingestedAt: text("ingested_at").notNull(),
  catalogGeneration: integer("catalog_generation").notNull(),
  publicationId: text("publication_id"),
  legacyProjectId: text("legacy_project_id"),
  legacyPublicationId: text("legacy_publication_id"),
  outboundFrozenAt: text("outbound_frozen_at"),
  uncertainVisibilityAt: text("uncertain_visibility_at"),
}, table => [
  uniqueIndex("platform_works_external_scope_ux").on(table.userId, table.accountId, table.platform, table.externalId),
  index("platform_works_catalog_ix").on(table.userId, table.accountId, table.catalogGeneration),
]);

export const platformVisibilityTombstones = pgTable("platform_visibility_tombstones", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  platform: text("platform").notNull(),
  externalId: text("external_id").notNull(),
  visibility: text("visibility").notNull(),
  source: text("source").notNull(),
  sourcePriority: integer("source_priority").notNull(),
  observedAt: text("observed_at").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
  uniqueIndex("platform_visibility_tombstones_evidence_ux").on(table.userId, table.accountId, table.platform, table.externalId, table.source, table.observedAt),
]);

const metricColumns = () => ({
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  platform: text("platform").notNull(),
  metricKey: text("metric_key").notNull(),
  value: doublePrecision("value"),
  availability: text("availability").notNull(),
  unit: text("unit").notNull(),
  window: jsonb("metric_window").$type<{kind:string;start?:string;end?:string;timeZone?:string}>().notNull(),
  windowKey: text("window_key").notNull(),
  source: text("source").notNull(),
  sourceSnapshotKey: text("source_snapshot_key"),
  sourceSnapshotKeyIndex: text("source_snapshot_key_index").notNull(),
  capturedAt: text("captured_at").notNull(),
  observedAt: text("observed_at").notNull(),
  ingestedAt: text("ingested_at").notNull(),
});

export const platformAccountMetricSnapshots = pgTable("platform_account_metric_snapshots", metricColumns(), table => [
  uniqueIndex("platform_account_metrics_evidence_ux").on(table.userId, table.accountId, table.metricKey, table.windowKey, table.source, table.observedAt, table.sourceSnapshotKeyIndex),
]);
export const platformWorkMetricSnapshots = pgTable("platform_work_metric_snapshots", {
  ...metricColumns(),
  platformWorkId: text("platform_work_id").notNull(),
}, table => [
  uniqueIndex("platform_work_metrics_evidence_ux").on(table.userId, table.accountId, table.platformWorkId, table.metricKey, table.windowKey, table.source, table.observedAt, table.sourceSnapshotKeyIndex),
]);

// T-1110: native source facts retain their collection-time workspace. No catalog projection.
export const platformNativeReports = pgTable("platform_native_reports", {
 id:text("id").primaryKey(),userId:text("user_id").notNull(),groupId:text("group_id").notNull(),accountId:text("account_id").notNull(),
 membershipVersion:integer("membership_version").notNull(),platform:text("platform").notNull(),kind:text("kind").notNull(),sha256:text("sha256").notNull(),selectionKey:text("selection_key").notNull(),
 payload:jsonb("payload").$type<NativeReportPayload>().notNull(),observedAt:text("observed_at").notNull(),ingestedAt:text("ingested_at").notNull(),
},t=>[uniqueIndex("platform_native_reports_evidence_ux").on(t.userId,t.groupId,t.accountId,t.platform,t.kind,t.sha256,t.selectionKey),index("platform_native_reports_scope_ix").on(t.userId,t.groupId,t.accountId,t.observedAt)]);
