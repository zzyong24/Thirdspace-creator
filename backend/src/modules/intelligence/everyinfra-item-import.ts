import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { ErrorCode, type RequestContext } from "@creatoros/contract";
import {
  everyInfraQueryErrorCodeSchema,
  everyInfraQueryErrorMessages,
  publicXiaohongshuWorkUrl,
  type EveryInfraQuery,
  type EveryInfraVideoHit,
} from "@creatoros/contract/internal/everyinfra";
import type { Db } from "../../db";
import { assertWritableWorkspace } from "../../workspace-scope";
import {
  intelligenceItems,
  intelligenceSources,
  intelligenceSyncRuns,
  itemMetricSnapshots,
  sourceSnapshots,
} from "../../schema/intelligence";
import {
  intelligenceWorkspaceFilter,
  uniqueIntelligenceRow,
  withIntelligenceWrite,
} from "./intelligence-workspace-scope";
import { IntelligenceConflictError, OwnershipError } from "./intelligence.errors";
import { ConflictError as WorkspaceConflictError } from "../platform-account/platform-account.errors";

type WorkspaceContext = Pick<RequestContext, "userId" | "groupId" | "accountId">;
type RadarHit = Omit<EveryInfraVideoHit, "canonicalUrl"> & { importId?: string };
type ImportableHit = EveryInfraVideoHit & { externalId: string; type: "video" | "article" };
type PendingImport = {
  ctx: WorkspaceContext;
  hit: ImportableHit;
  expiresAt: number;
  result?: Promise<{ itemId: string }>;
};
type InputClient = {
  queryForRadar: (input: EveryInfraQuery, options: { idempotencyKey?: string }) => Promise<{ hits: EveryInfraVideoHit[] }>;
  readXiaohongshuNoteUrl: (externalId: string, options: { idempotencyKey: string }) => Promise<string | undefined>;
};

const ENTRIES_MAX = 5_000;
const ENTRY_LIFETIME_MS = 15 * 60_000;
const MAX_TITLE_LENGTH = 200;

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const trimText = (text: string | undefined): string | null => text?.trim() || null;

class HitNotAddableError extends Error {
  readonly code = ErrorCode.ValidationError;
  readonly details = { domainCode: "EVERYINFRA_HIT_NOT_ADDABLE" };

  constructor() {
    super("该结果无法加入内容雷达，请重新查询或选择其他作品");
  }
}

function isImportable(hit: EveryInfraVideoHit): hit is ImportableHit {
  if (!hit.addable || !hit.externalId || !hit.type) return false;
  if (hit.platform === "wechatVideo" && hit.action === "search") return false;
  return hit.platform === "xiaohongshu"
    ? /^[a-f0-9]{24}$/i.test(hit.externalId)
    : /^\d{1,120}$/.test(hit.externalId);
}

function noteUrl(value: unknown, externalId: string): string | null {
  if (typeof value !== "string") return null;
  const url = URL.parse(value);
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (url.hostname !== "www.xiaohongshu.com" && url.hostname !== "xiaohongshu.com") return null;
  if (![`/explore/${externalId}`, `/discovery/item/${externalId}`].includes(url.pathname)) return null;
  return value;
}

function originalUrl(hit: ImportableHit): string {
  if (hit.platform === "douyin") return `https://www.douyin.com/video/${hit.externalId}`;
  if (hit.platform === "xiaohongshu") {
    const url = hit.action === "user_posts" ? null : noteUrl(hit.canonicalUrl, hit.externalId);
    return url ?? `https://www.xiaohongshu.com/explore/${hit.externalId}`;
  }
  const share = hit.canonicalUrl && URL.parse(hit.canonicalUrl);
  if (share && share.origin === "https://weixin.qq.com" && !share.username && !share.password && /^\/sph\/[^/]+\/?$/.test(share.pathname)) {
    return hit.canonicalUrl!;
  }
  return `https://creatoros.local/sources/wechatVideo/${hit.externalId}`;
}

export function everyInfraEvidenceUrl(value: string): string {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** PostgreSQL metric and media duration columns are signed 32-bit integers. */
function storedCount(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 2_147_483_647
    ? Math.round(value)
    : null;
}

export function mapEveryInfraItem(hit: EveryInfraVideoHit) {
  if (!isImportable(hit)) throw new HitNotAddableError();
  const summary = trimText(hit.summary);
  const cover = hit.coverUrl && URL.parse(hit.coverUrl);
  const published = hit.publishedAt ? Date.parse(hit.publishedAt) : NaN;
  return {
    platform: hit.platform,
    captureChannel: "everyinfra" as const,
    externalId: hit.externalId,
    type: hit.type,
    // 完整笔记入口保存在服务器，供转写取流。作品 DTO 只投影公开地址。
    canonicalUrl: originalUrl(hit),
    title: (trimText(hit.title) ?? summary ?? "").slice(0, MAX_TITLE_LENGTH),
    summary,
    authorId: trimText(hit.authorId),
    authorName: trimText(hit.authorName),
    coverUrl: cover && cover.protocol === "https:" && cover.hostname !== "creatoros.local"
      && !cover.username && !cover.password && !cover.search
      ? cover.href : null,
    publishedAt: Number.isNaN(published) ? null : new Date(published).toISOString(),
    durationMs: hit.type === "video" ? storedCount(hit.durationMs) : null,
  };
}

function sameScope(a: WorkspaceContext, b: WorkspaceContext): boolean {
  return a.userId === b.userId && (a.groupId || null) === (b.groupId || null)
    && Boolean(a.groupId || (a.accountId && a.accountId === b.accountId));
}

export function createEveryInfraRadar(db: Db, deps: {
  client: (ctx: RequestContext) => Promise<InputClient>;
  assertWorkspaceReadable: (ctx: RequestContext) => Promise<void>;
  now?: () => string;
}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const pending = new Map<string, PendingImport>();

  async function persist(ctx: RequestContext, hit: ImportableHit, importId: string) {
    const input = mapEveryInfraItem(hit);
    if (hit.platform === "xiaohongshu" && hit.action === "user_posts") {
      try {
        const client = await deps.client(ctx);
        const note = await client.readXiaohongshuNoteUrl(
          input.externalId,
          { idempotencyKey: `radar-note:${importId}` },
        );
        const freshUrl = noteUrl(note, input.externalId);
        if (freshUrl && new URL(freshUrl).searchParams.get("xsec_token")) input.canonicalUrl = freshUrl;
      } catch {
        // 保留稳定笔记身份。转写时再按该身份刷新页面链接。
      }
    }
    const stamp = now();
    return withIntelligenceWrite(db, ctx, async (tx, frozen) => {
      const scope = { userId: ctx.userId, accountId: frozen.accountId, groupId: frozen.groupId };
      const match = and(
        intelligenceWorkspaceFilter(intelligenceItems, ctx),
        eq(intelligenceItems.platform, input.platform),
        eq(intelligenceItems.externalId, input.externalId),
      );
      const read = async () => uniqueIntelligenceRow(await tx.select().from(intelligenceItems).where(match).limit(2).for("update"));
      let item = await read();
      if (!item) {
        [item] = await tx.insert(intelligenceItems).values({
          id: randomUUID(),
          ...scope,
          ...input,
          canonicalUrlHash: digest(input.canonicalUrl),
          capturedAt: stamp,
          createdAt: stamp,
          updatedAt: stamp,
        }).onConflictDoNothing().returning();
        item ??= await read();
      }
      if (!item) throw new HitNotAddableError();
      if (item.canonicalUrl !== input.canonicalUrl) {
        await tx.update(intelligenceItems).set({
          canonicalUrl: input.canonicalUrl,
          canonicalUrlHash: digest(input.canonicalUrl),
          updatedAt: stamp,
        }).where(eq(intelligenceItems.id, item.id));
      }

      // 真实上游结果需要保留来源快照，供现有项目入口验证。此来源仅用于追溯。
      const sourceKey = `everyinfra:${input.platform}`;
      const sourceId = `intel-source-${digest(JSON.stringify([scope.userId, scope.groupId || scope.accountId, sourceKey]))}`;
      const runId = `everyinfra-import:${item.id}`;
      await tx.insert(intelligenceSources).values({
        id: sourceId, ...scope, type: "web", platform: input.platform, displayName: "万有引擎",
        externalKey: sourceKey, adapterConfig: { __creatorosProvenanceOnly: 1, originalExternalKey: sourceKey },
        status: "archived", createdAt: stamp, updatedAt: stamp,
      }).onConflictDoNothing();
      await tx.insert(intelligenceSyncRuns).values({
        id: runId, ...scope, sourceId, executionTaskId: runId, trigger: "manual",
        status: "succeeded", startedAt: stamp, finishedAt: stamp, scannedCount: 1, newCount: 1,
        createdAt: stamp, updatedAt: stamp,
      }).onConflictDoNothing();
      const snapshotUrl = everyInfraEvidenceUrl(input.canonicalUrl);
      await tx.insert(sourceSnapshots).values({
        id: runId, ...scope, sourceId, runId, itemId: item.id, capturedAt: stamp,
        finalUrl: snapshotUrl, title: input.title || null,
        contentHash: digest(JSON.stringify([snapshotUrl, input.title, input.summary])),
        safeExtract: input.type === "article" ? input.summary : null,
      }).onConflictDoNothing();
      const metrics = {
        likeCount: storedCount(hit.metrics.likes),
        commentCount: storedCount(hit.metrics.comments),
        collectCount: storedCount(hit.metrics.favorites),
        shareCount: storedCount(hit.metrics.shares),
      };
      if (Object.values(metrics).some((count) => count !== null)) {
        await tx.insert(itemMetricSnapshots).values({
          id: randomUUID(), ...scope, itemId: item.id, capturedAt: stamp, metricSource: "everyinfra", ...metrics,
        }).onConflictDoNothing();
      }
      return { itemId: item.id };
    });
  }

  return {
    async query(ctx: RequestContext, query: EveryInfraQuery, idempotencyKey: string): Promise<{ hits: RadarHit[] }> {
      await deps.assertWorkspaceReadable(ctx);
      let hits: EveryInfraVideoHit[];
      try {
        ({ hits } = await (await deps.client(ctx)).queryForRadar(query, { idempotencyKey }));
      } catch (error) {
        const parsed = everyInfraQueryErrorCodeSchema.safeParse((error as { code?: unknown } | null)?.code);
        const domainCode = parsed.success ? parsed.data : "EVERYINFRA_UPSTREAM";
        throw Object.assign(new Error(everyInfraQueryErrorMessages[domainCode]), {
          code: domainCode === "EVERYINFRA_RATE_LIMIT" ? ErrorCode.RateLimitError : ErrorCode.ExternalDependencyError,
          details: { domainCode },
        });
      }
      const time = Date.now();
      for (const [id, entry] of pending) {
        if (entry.expiresAt <= time) pending.delete(id);
      }
      return {
        hits: hits.map(({ canonicalUrl, ...hit }): RadarHit => {
          const candidate = { ...hit, canonicalUrl };
          if (hit.coverUrl && publicXiaohongshuWorkUrl(hit.coverUrl) !== hit.coverUrl) delete hit.coverUrl;
          if (!isImportable(candidate)) return { ...hit, addable: false };
          const importId = randomUUID();
          pending.set(importId, {
            ctx: { userId: ctx.userId, groupId: ctx.groupId, accountId: ctx.accountId },
            hit: candidate,
            expiresAt: time + ENTRY_LIFETIME_MS,
          });
          if (pending.size > ENTRIES_MAX) {
            const oldest = pending.keys().next().value;
            if (oldest) pending.delete(oldest);
          }
          return { ...hit, importId };
        }),
      };
    },

    async add(ctx: RequestContext, importId: string): Promise<{ itemId: string }> {
      const entry = pending.get(importId);
      if (!entry || entry.expiresAt <= Date.now() || !sameScope(entry.ctx, ctx)) throw new HitNotAddableError();
      await assertWritableWorkspace(db, ctx);
      // 同一加入动作的并发请求共用付费刷新与写入结果。
      const submission = entry.result ??= persist(ctx, entry.hit, importId);
      try {
        return await submission;
      } catch (error) {
        if (entry.result === submission) delete entry.result;
        if (error instanceof HitNotAddableError || error instanceof OwnershipError
          || error instanceof IntelligenceConflictError || error instanceof WorkspaceConflictError) throw error;
        // 存储错误可能携带写入参数，其中包含仅供服务器转写访问的笔记链接。
        throw Object.assign(new Error("暂时无法加入内容雷达，请稍后重试。"), {
          code: ErrorCode.UnexpectedError,
        });
      }
    },
  };
}
