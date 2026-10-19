import { createHash } from "node:crypto";
import type { CollectionPageCommit } from "@creatoros/contract";

// Creator-center page bundle observed 2026-09-30: cp.63021c43.js reads
// /rest/cp/creator/pc/home/infoV2; articleManage.f297ace2.js reads
// /rest/cp/works/v2/video/pc/photo/list (queryType 0, cursor, limit 30).
// These parsers still require a real signed-in page response before acceptance.
export const KS_IDENTITY_SOURCE = "/rest/cp/creator/pc/home/infoV2";
export const KS_WORK_SOURCE = "/rest/cp/works/v2/video/pc/photo/list";

export class KuaishouSourceError extends Error {
  constructor(readonly code: "DATA_SCHEMA" | "DATA_UNAVAILABLE" | "IDENTITY_MISMATCH" | "INCOMPLETE_CATALOG") {
    super(code);
  }
}
function fail(code: KuaishouSourceError["code"]): never { throw new KuaishouSourceError(code); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("DATA_SCHEMA");
  return value as Record<string, unknown>;
}
function data(value: unknown): Record<string, unknown> {
  const envelope = object(value);
  if (envelope.result !== undefined && envelope.result !== 1) fail("DATA_UNAVAILABLE");
  if (envelope.success !== undefined && envelope.success !== true) fail("DATA_UNAVAILABLE");
  return object(envelope.data);
}
function sourceId(value: unknown): string {
  const result = typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value) : value;
  if (typeof result !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(result)) fail("DATA_SCHEMA");
  return result;
}
function count(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("DATA_SCHEMA");
  return value;
}
function timestamp(value: unknown): string | null {
  if (value === undefined || value === null || value === 0) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 946684800000 || value > 4102444800000) {
    fail("DATA_SCHEMA");
  }
  return new Date(value).toISOString();
}

export interface KuaishouCreatorIdentity {
  platformIdentity: string; displayName: string; kwaiId: string | null;
  followerCount: number | null; source: typeof KS_IDENTITY_SOURCE;
}
export function parseKuaishouCreatorIdentity(value: unknown, expected?: string): KuaishouCreatorIdentity {
  const body = data(value);
  const platformIdentity = sourceId(body.userId);
  if (expected && expected !== platformIdentity) fail("IDENTITY_MISMATCH");
  return {
    platformIdentity,
    displayName: typeof body.userName === "string" && body.userName.trim()
      ? body.userName.trim().slice(0, 100) : `快手账号 ${platformIdentity.slice(-6)}`,
    kwaiId: typeof body.userKwaiId === "string" && body.userKwaiId.trim()
      ? body.userKwaiId.trim().slice(0, 100) : null,
    followerCount: count(body.fansCnt), source: KS_IDENTITY_SOURCE,
  };
}

export interface KuaishouWork {
  externalId: string; title: string | null; kind: "video" | "image";
  publishedAt: string | null; playCount: number | null;
  likeCount: number | null; commentCount: number | null;
  source: typeof KS_WORK_SOURCE; observedAt: string;
}
export interface KuaishouWorkPage {
  requestCursor: string | null; nextCursor: string | null;
  reportedTotal: number; works: KuaishouWork[];
  observedAt: string; responseDigest: string;
}

export function parseKuaishouWorkPage(value: unknown, requestCursor: string | null,
  observedAt: string): KuaishouWorkPage {
  if (new Date(observedAt).toISOString() !== observedAt) fail("DATA_SCHEMA");
  const body = data(value);
  const list = body.list;
  if (!Array.isArray(list)) fail("DATA_SCHEMA");
  const reportedTotal = count(body.total);
  if (reportedTotal === null) fail("DATA_SCHEMA");
  const rawCursor = body.nextCursor;
  if (typeof rawCursor !== "string" || !rawCursor) fail("DATA_SCHEMA");
  const nextCursor = rawCursor === "no_more" ? null : rawCursor;
  if (nextCursor !== null && nextCursor === requestCursor) fail("INCOMPLETE_CATALOG");
  const works = list.map((item: unknown): KuaishouWork => {
    const work = object(item);
    const externalId = work.workId !== null && work.workId !== undefined
      ? sourceId(work.workId) : `draft_${sourceId(work.publishId)}`;
    return {
      externalId,
      title: typeof work.title === "string" && work.title.trim() ? work.title.trim().slice(0, 1000) : null,
      kind: work.showAtlasIcon === true ? "image" : "video",
      publishedAt: timestamp(work.uploadTime),
      playCount: count(work.playCount), likeCount: count(work.likeCount),
      commentCount: count(work.commentCount), source: KS_WORK_SOURCE, observedAt,
    };
  });
  if (new Set(works.map((work) => work.externalId)).size !== works.length) fail("DATA_SCHEMA");
  return { requestCursor, nextCursor, reportedTotal, works, observedAt,
    responseDigest: `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}` };
}

export function compareKuaishouWorkPasses(first: readonly KuaishouWorkPage[], second: readonly KuaishouWorkPage[]) {
  const inspect = (pages: readonly KuaishouWorkPage[]) => {
    if (!pages.length || pages[0]!.requestCursor !== null || pages.at(-1)!.nextCursor !== null) fail("INCOMPLETE_CATALOG");
    const total = pages[0]!.reportedTotal;
    const ids = new Set<string>();
    for (const [index, page] of pages.entries()) {
      if (page.reportedTotal !== total || (index && page.requestCursor !== pages[index - 1]!.nextCursor)) fail("INCOMPLETE_CATALOG");
      for (const work of page.works) {
        if (ids.has(work.externalId)) fail("INCOMPLETE_CATALOG");
        ids.add(work.externalId);
      }
    }
    if (ids.size !== total) fail("INCOMPLETE_CATALOG");
    return [...ids].sort();
  };
  const left = inspect(first), right = inspect(second);
  if (left.length !== right.length || left.some((id, index) => id !== right[index])) fail("INCOMPLETE_CATALOG");
  return { total: left.length, ids: left };
}

export function kuaishouSourceWorks(page: KuaishouWorkPage): CollectionPageCommit["works"] {
  return page.works.map((work) => ({
    externalId: work.externalId, title: work.title, kind: work.kind,
    publishedAt: work.publishedAt,
    visibility: { visibility: "unknown", source: KS_WORK_SOURCE, observedAt: work.observedAt },
    source: KS_WORK_SOURCE, observedAt: work.observedAt,
  }));
}
