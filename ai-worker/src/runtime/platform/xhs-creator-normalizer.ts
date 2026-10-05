import { createHash } from "node:crypto";
import type { CollectionPageCommit } from "@creatoros/contract";

/**
 * T-1021 source review: Thirdspace-xhs-creator@34301ee7, worker/src/{identity,analytics-parser}.ts.
 * This module only parses caller-supplied data. It never opens a browser, reads a
 * profile, sends a request, or claims platform permission for CreatorOS.
 */
const CATALOG_SOURCE = "/api/galaxy/v2/creator/note/user/posted";
const IDENTITY_SOURCE = "/api/galaxy/user/info";

export class XhsSourceError extends Error {
  constructor(readonly code: "DATA_SCHEMA" | "DATA_UNAVAILABLE" | "IDENTITY_MISMATCH" | "INCOMPLETE_CATALOG") {
    super(code);
    this.name = "XhsSourceError";
  }
}

function fail(code: XhsSourceError["code"]): never { throw new XhsSourceError(code); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("DATA_SCHEMA");
  return value as Record<string, unknown>;
}
function payload(value: unknown): Record<string, unknown> {
  const envelope = object(value);
  if (envelope.success !== true || envelope.code !== 0) fail("DATA_UNAVAILABLE");
  return object(envelope.data);
}
function optionalCount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("DATA_SCHEMA");
  return value;
}
function metricCount(value: unknown): number | null {
  if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
  // The management page may return display text (for example, an abbreviated
  // count). It is not an exact metric and must not be invented as an integer.
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{4,128}$/.test(value)) fail("DATA_SCHEMA");
  return value;
}
function iso(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail("DATA_SCHEMA");
  return value;
}
function publishedAt(value: unknown): string | null {
  if (value == null || value === 0) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 946684800 || value > 4102444800) fail("DATA_SCHEMA");
  return new Date(value * 1000).toISOString();
}

export interface XhsIdentity { platformIdentity: string; displayName: string; redId: string | null; source: typeof IDENTITY_SOURCE }
export function parseXhsCreatorIdentity(value: unknown, expectedPlatformIdentity?: string): XhsIdentity {
  const data = payload(value);
  const platformIdentity = id(data.userId);
  if (expectedPlatformIdentity && platformIdentity !== expectedPlatformIdentity) fail("IDENTITY_MISMATCH");
  return {
    platformIdentity,
    displayName: typeof data.userName === "string" && data.userName.trim()
      ? data.userName.slice(0, 100) : `小红书账号 ${platformIdentity.slice(-6)}`,
    redId: typeof data.redId === "string" ? data.redId.slice(0, 100) : null,
    source: IDENTITY_SOURCE,
  };
}

export interface XhsCatalogRecord {
  externalId: string;
  title: string | null;
  kind: "video" | "image" | "mixed";
  publishedAt: string | null;
  visibility: { visibility: "unknown"; source: typeof CATALOG_SOURCE; observedAt: string };
  source: typeof CATALOG_SOURCE;
  observedAt: string;
  /** Raw platform count fields. Availability and metric window require a separately reviewed field dictionary. */
  counts: {
    view_count: number | null;
    likes: number | null;
    comments_count: number | null;
    collected_count: number | null;
    shared_count: number | null;
  };
}
export interface XhsCatalogPage {
  requestCursor: string | null;
  nextCursor: string | null;
  reportedTotal: number | null;
  records: XhsCatalogRecord[];
  observedAt: string;
  responseDigest: string;
}

/** Catalog `page` is an opaque next cursor; observed transitions include 2→4. */
export function parseXhsCreatorCatalogPage(value: unknown, requestCursor: string | null, observedAt: string): XhsCatalogPage {
  iso(observedAt);
  if (requestCursor !== null && (!/^\d+$/.test(requestCursor) || !Number.isSafeInteger(Number(requestCursor)))) fail("DATA_SCHEMA");
  const data = payload(value);
  if (!Array.isArray(data.notes) || !Array.isArray(data.tags)) fail("DATA_SCHEMA");
  const allTag = data.tags.map(object).find((tag) => tag.id === "special.note_time_desc");
  const reportedTotal = optionalCount(allTag?.notes_count);
  const rawNext = data.page;
  const nextCursor = rawNext == null || rawNext === -1 ? null : String(optionalCount(rawNext));
  if (nextCursor !== null && Number(nextCursor) <= Number(requestCursor ?? -1)) fail("DATA_SCHEMA");
  const records = data.notes.map((raw): XhsCatalogRecord => {
    const note = object(raw);
    const type = note.type;
    return {
      externalId: id(note.id),
      title: typeof note.display_title === "string" && note.display_title.trim()
        ? note.display_title.trim().slice(0, 1000) : null,
      kind: type === "video" ? "video" : type === "normal" ? "image" : "mixed",
      publishedAt: publishedAt(note.visible_time),
      // `tab_status` was present in source samples, but its public/private
      // meaning was never proved. A management-list item is not public proof.
      visibility: { visibility: "unknown", source: CATALOG_SOURCE, observedAt },
      source: CATALOG_SOURCE,
      observedAt,
      counts: {
        view_count: metricCount(note.view_count),
        likes: metricCount(note.likes),
        comments_count: metricCount(note.comments_count),
        collected_count: metricCount(note.collected_count),
        shared_count: metricCount(note.shared_count),
      },
    };
  });
  const ids = records.map((record) => record.externalId);
  if (new Set(ids).size !== ids.length) fail("DATA_SCHEMA");
  return {
    requestCursor, nextCursor, reportedTotal, records, observedAt,
    responseDigest: `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`,
  };
}

/** Validate a single observed pass without declaring it publishable. */
export function inspectXhsCatalogPass(pages: readonly XhsCatalogPage[]) {
  if (!pages.length || pages[0]!.requestCursor !== null) fail("INCOMPLETE_CATALOG");
  const ids = new Set<string>();
  const total = pages[0]!.reportedTotal;
  if (total === null) fail("INCOMPLETE_CATALOG");
  for (const [index, page] of pages.entries()) {
    if (index && page.requestCursor !== pages[index - 1]!.nextCursor) fail("INCOMPLETE_CATALOG");
    if (page.reportedTotal !== null && page.reportedTotal !== total) fail("INCOMPLETE_CATALOG");
    for (const record of page.records) {
      if (ids.has(record.externalId)) fail("INCOMPLETE_CATALOG");
      ids.add(record.externalId);
    }
    if (index < pages.length - 1 && page.nextCursor === null) fail("INCOMPLETE_CATALOG");
  }
  if (ids.size > total) fail("INCOMPLETE_CATALOG");
  return { fetched: ids.size, reportedTotal: total, ids: [...ids].sort(), needsTerminalEvidence: true as const };
}

/** Platform pages can overlap; remove repeats before the backend page port sees them. */
export function dedupeXhsCatalogPass(pages: readonly XhsCatalogPage[]): XhsCatalogPage[] {
  const seen = new Set<string>();
  return pages.map((page) => ({
    ...page,
    records: page.records.filter((record) => {
      if (seen.has(record.externalId)) return false;
      seen.add(record.externalId);
      return true;
    }),
  }));
}

/** Narrow service-port projection: identifiers and conservative visibility only. */
export function xhsSourceWorks(page: XhsCatalogPage): CollectionPageCommit["works"] {
  return page.records.map(({ externalId, title, kind, publishedAt, visibility, source, observedAt }) => ({
    externalId, title, kind, publishedAt, visibility, source, observedAt,
  }));
}

/** No stable snapshot key is exposed by this source, so two independently read passes must agree. */
export function compareXhsCatalogPasses(first: readonly XhsCatalogPage[], second: readonly XhsCatalogPage[]) {
  const left = inspectXhsCatalogPass(first);
  const right = inspectXhsCatalogPass(second);
  if (left.reportedTotal !== right.reportedTotal || left.fetched !== right.fetched ||
      left.ids.some((value, index) => value !== right.ids[index])) fail("INCOMPLETE_CATALOG");
  return { ids: left.ids, reportedTotal: left.reportedTotal, stillNeedsTerminalEvidence: true as const };
}
