import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createPublishingRepository,
  type PublishingRepository,
  type PublicationRow,
  type PublicationRevisionRow,
} from "./publishing.repository";
import { ConflictError, ValidationError } from "./publishing.errors";
import type { PlatformPublisherPort } from "./platform-publisher";

// Publishing service (foundation §5.3) — RequestContext-taking methods that thread
// `ctx.userId` into a user-scoped repository built per-call via `repoFor(ctx)`
// (foundation §2). It owns the SPEC §12 Publication state machine and is the SOLE
// driver of the platform publish/remove side-effect (behind PlatformPublisherPort —
// SPEC §15: Publishing never calls a platform SDK / S3 directly).
//
// `Publication` is an external fact-of-record (SPEC §13.3/§22): publish/remove is
// IDEMPOTENT — a same-status transition is a no-op, and a re-publish that mints the
// same `(platform, external_id)` returns the original row (the partial-unique
// index is the anchor; the MockPublisher's deterministic id makes the re-publish
// land on it).
//
// Cross-module fan-out (ContentOutput active→published rollup via ProjectsService,
// search upsert, activity, notify) is reached ONLY through injected public service
// seams — NO cross-module repository import (SPEC §22). Each seam is optional so the
// service is unit-testable with stubs and builds without the peers. Post-commit
// side-effects (search/notify) run AFTER the main status write and never roll back
// the publish fact (SPEC §11/§16).

// Allowed server transitions (plan §29 — the 5 contract enum values; `ready` is a
// workspace-local UI sub-state of `draft`, resolved server-side via draft→…).
const ALLOWED: Record<string, ReadonlyArray<string>> = {
  draft: ["scheduled", "published"],
  scheduled: ["published", "failed"],
  published: ["removed"],
  removed: [],
  failed: [],
};

const PLATFORMS = new Set([
  "youtube",
  "bilibili",
  "douyin",
  "xiaohongshu",
  "wechatVideo",
  "x",
]);

// Injected cross-module fan-out seams (public service interfaces only). Each is
// optional; a missing seam is simply skipped (best-effort, SPEC §11).
export type MarkOutputPublished = (
  ctx: RequestContext,
  input: { outputId: string; publicationId: string },
) => Promise<unknown>;
export type SearchIndexPublication = (
  ctx: RequestContext,
  input: { entityType: string; entityId: string; title: string; body: string },
) => Promise<unknown>;
export type RecordPublishActivity = (
  ctx: RequestContext,
  input: { outputId: string; publicationId: string; platform: string },
) => Promise<unknown>;
export type NotifyPublished = (
  ctx: RequestContext,
  input: { publicationId: string; platform: string },
) => Promise<unknown>;

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  publisher: PlatformPublisherPort;
  /** ContentOutput active→published rollup (ProjectsService — ≥1 published). */
  markOutputPublished?: MarkOutputPublished;
  /** Post-commit search index upsert (SearchService.upsertDocument). */
  searchIndex?: SearchIndexPublication;
  /** Post-commit activity record (ProjectsService.recordActivity / equivalent). */
  recordActivity?: RecordPublishActivity;
  /** Post-commit notification (NotificationsService.notify). */
  notify?: NotifyPublished;
  /** Optional cover validation seam (AssetsService.getAsset) — SPEC §15. */
  assertCoverOwned?: (ctx: RequestContext, assetId: string) => Promise<unknown>;
  /**
   * Project→ContentOutput-ids resolver (ProjectsService.listOutputIdsByProject).
   * Used by listPublicationIdsByProject so Publishing never cross-module-joins
   * content_outputs. When unwired, listPublicationIdsByProject resolves to [].
   */
  listOutputIdsByProject?: (
    ctx: RequestContext,
    projectId: string,
  ) => Promise<string[]>;
}

export interface PublishingService {
  listPublications(
    ctx: RequestContext,
    outputId: string,
    pagination: { limit: number; offset: number },
  ): Promise<PublicationRow[]>;
  createPublication(
    ctx: RequestContext,
    outputId: string,
    body: { platform: string; accountReference: string },
  ): Promise<PublicationRow>;
  getPublication(
    ctx: RequestContext,
    publicationId: string,
  ): Promise<PublicationRow>;
  createRevision(
    ctx: RequestContext,
    publicationId: string,
    body: {
      title: string;
      description: string;
      coverAssetId?: string | null;
      category?: string;
      series?: string;
      platformTags?: string[];
      platformSettings?: Record<string, unknown>;
    },
  ): Promise<PublicationRevisionRow>;
  listRevisions(
    ctx: RequestContext,
    publicationId: string,
    pagination: { limit: number; offset: number },
  ): Promise<PublicationRevisionRow[]>;
  transition(
    ctx: RequestContext,
    publicationId: string,
    body: { status: string },
  ): Promise<PublicationRow>;
  // Downstream consumers (SPEC §19 DashboardQueryService / SPEC §11 Analytics).
  getRecentPublications(
    ctx: RequestContext,
    opts: { limit: number; offset?: number },
  ): Promise<PublicationRow[]>;
  // Dashboard「最近发布」(GAP-DASH-3): the recent publications joined with their
  // REAL display title (resolved from the owning revision — the title lives on a
  // PublicationRevision, never on the PublicationRow). Stays inside the Publishing
  // module (revisions are ours); the play count is joined by the dashboard facade
  // via Analytics (cross-module composition stays at the facade layer).
  getRecentPublicationsWithTitle(
    ctx: RequestContext,
    opts: { limit: number; offset?: number },
  ): Promise<Array<PublicationRow & { title: string }>>;
  // Declared for the Ingestion wave (SPEC §11) — signature only this wave.
  resolvePublication(
    ctx: RequestContext,
    externalSourceRef: { platform: string; externalId: string },
  ): Promise<PublicationRow | null>;
  // 数据底座(SPEC §1.3):为一条真实已发布作品落 publication(直接 published +
  //   external_id=aweme_id)。幂等:同 (platform, external_id) 已存在则返回既有(不重复
  //   建)—— ingestion 的 ensureImportedProject 也先查,这里是第二道防线(partial-unique
  //   external key 锚)。ingestion 经注入端口调本方法(不跨模块直连 repo,守 SPEC §22)。
  createImportedPublication(
    ctx: RequestContext,
    outputId: string,
    input: {
      platform: string;
      externalId: string;
      accountReference?: string;
      externalUrl?: string | null;
      publishedAt?: string | null;
    },
  ): Promise<PublicationRow>;
  // Cross-module resolver for Analytics (SPEC §11/§22): the user-scoped
  // publication ids belonging to a project. Resolves project→ContentOutput ids
  // via the injected ProjectsService seam (project-ownership gate lives there),
  // then queries Publishing's OWN publications by those output ids — no Analytics
  // cross-module join. An unwired seam → []; a project with no outputs → [].
  listPublicationIdsByProject(
    ctx: RequestContext,
    projectId: string,
  ): Promise<string[]>;
  // [T-073] 平台侧可见性同步:按 (platform, externalId) 找到 publication,把抖音端
  // 「仅自己可见/已隐藏」同步为 hidden_at 非空(hidden=true 置 now,false 清 null)。
  // 幂等(已是目标态不再写);找不到该作品(未导入)诚实返 null,不硬造。
  // 只动 hidden_at,不碰 status 状态机(隐藏≠下架:removed 是平台已删,hidden 可恢复)。
  setVisibilityByExternalKey(
    ctx: RequestContext,
    input: { platform: string; externalId: string; hidden: boolean },
  ): Promise<PublicationRow | null>;
  // [T-078] 封面回填读侧:该平台已发布、带 external_id、未隐藏、当前 revision 缺
  // coverAssetId(或无 revision)的 publications —— 采集侧据此逐条抓 iesdouyin 封面。
  listPublicationsMissingCover(
    ctx: RequestContext,
    input: { platform: string; limit?: number },
  ): Promise<PublicationRow[]>;
  // [T-078] 封面落账:给 publication 的当前 revision 补 coverAssetId。revision 是
  // append-only(绝不 UPDATE 旧行)—— 复制当前 revision 字段追加一版带 cover 的新
  // revision 并置 current;导入作品(无 revision)铸一版空标题 revision 只带 cover
  // (标题继续由 content_output 兜底,既有回退链不变)。幂等:当前 revision 已有
  // 封面 → 原样返回不再写(用户手选的封面绝不被采集覆盖)。
  setCover(
    ctx: RequestContext,
    publicationId: string,
    coverAssetId: string,
  ): Promise<PublicationRevisionRow>;
}

export function createPublishingService(deps: ServiceDeps): PublishingService {
  function repoFor(ctx: RequestContext): PublishingRepository {
    return createPublishingRepository(deps.db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
    });
  }

  return {
    async listPublications(ctx, outputId, pagination) {
      return repoFor(ctx).listPublicationsByOutput(outputId, pagination);
    },

    async createPublication(ctx, outputId, body) {
      if (!PLATFORMS.has(body.platform)) {
        throw new ValidationError(
          `ValidationError: unknown platform: ${body.platform}`,
        );
      }
      const repo = repoFor(ctx);
      const pub = await repo.createPublication(outputId, body);
      // OQ4 (b-auto): auto-mint an empty revision-1 and set it current so the DTO
      // always serializes a real currentRevisionId (the contract `id` is a
      // non-empty string — a null/"" would fail the parse).
      const rev = await repo.createRevision(pub.id, {
        title: "",
        description: "",
      });
      return repo.setCurrentRevision(pub.id, rev.id);
    },

    async getPublication(ctx, publicationId) {
      return repoFor(ctx).getPublication(publicationId);
    },

    async createRevision(ctx, publicationId, body) {
      const repo = repoFor(ctx);
      await repo.getPublication(publicationId); // ownership gate
      // Cover validation (SPEC §15 "Publishing 校验封面") — only when a coverAssetId
      // is supplied (not in the contract body this wave; future-proofed).
      if (body.coverAssetId && deps.assertCoverOwned) {
        try {
          await deps.assertCoverOwned(ctx, body.coverAssetId);
        } catch {
          throw new ValidationError(
            `ValidationError: cover asset not found or invalid: ${body.coverAssetId}`,
          );
        }
      }
      const rev = await repo.createRevision(publicationId, body);
      await repo.setCurrentRevision(publicationId, rev.id);
      return rev;
    },

    async listRevisions(ctx, publicationId, pagination) {
      const repo = repoFor(ctx);
      await repo.getPublication(publicationId); // ownership gate (cross-user → 404)
      return repo.listRevisions(publicationId, pagination);
    },

    async transition(ctx, publicationId, body) {
      const repo = repoFor(ctx);
      const pub = await repo.getPublication(publicationId); // ownership gate
      const current = pub.status;
      const next = body.status;

      // 2. Idempotency (SPEC §17/§22): same-status transition is a no-op.
      if (next === current) {
        return pub;
      }
      // Entering published: if a published row already carries that external key,
      // return it (re-submission returns the original — partial-unique anchor).
      if (next === "published" && pub.externalId) {
        const existing = await repo.findByExternalKey(
          pub.platform,
          pub.externalId,
        );
        if (existing && existing.status === "published") {
          return existing;
        }
      }

      // 3. Machine guard (§12) — illegal move → ConflictError (→409).
      if (!ALLOWED[current]?.includes(next)) {
        throw new ConflictError(
          `ConflictError: publication ${publicationId} cannot transition ${current} → ${next}`,
        );
      }

      // 4. Side-effects per target status, behind PlatformPublisherPort.
      let updated: PublicationRow;
      if (next === "scheduled") {
        updated = await repo.updatePublicationStatus(publicationId, {
          status: "scheduled",
          scheduledAt: deps.now(),
        });
      } else if (next === "published") {
        const revision = await repo.getCurrentRevision(publicationId);
        const result = await deps.publisher.publish(ctx, {
          publicationId,
          platform: pub.platform,
          accountReference: pub.accountReference,
          revision: revision
            ? {
                title: revision.title,
                description: revision.description,
                coverAssetId: revision.coverAssetId,
                platformTags: (revision.platformTags ?? []) as string[],
                platformSettings: (revision.platformSettings ??
                  {}) as Record<string, unknown>,
              }
            : null,
        });
        updated = await repo.updatePublicationStatus(publicationId, {
          status: "published",
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          publishedAt: deps.now(),
        });
      } else if (next === "removed") {
        await deps.publisher.remove(ctx, { externalId: pub.externalId });
        // Retain externalId / metrics history (SPEC §13.3) — only stamp removedAt.
        updated = await repo.updatePublicationStatus(publicationId, {
          status: "removed",
          removedAt: deps.now(),
        });
      } else {
        // failed
        updated = await repo.updatePublicationStatus(publicationId, {
          status: "failed",
        });
      }

      // 5. Cross-module fan-out via PUBLIC service seams (no repo import). On
      //    → published: drive the ContentOutput active→published rollup, then the
      //    best-effort post-commit side-effects (search / activity / notify).
      if (next === "published") {
        if (deps.markOutputPublished) {
          await deps.markOutputPublished(ctx, {
            outputId: pub.contentOutputId,
            publicationId,
          });
        }
        if (deps.searchIndex) {
          try {
            await deps.searchIndex(ctx, {
              entityType: "publication",
              entityId: publicationId,
              title: `${pub.platform} 发布`,
              body: pub.accountReference,
            });
          } catch {
            // swallow — derived index is retryable, never fatal to the publish fact.
          }
        }
        if (deps.recordActivity) {
          try {
            await deps.recordActivity(ctx, {
              outputId: pub.contentOutputId,
              publicationId,
              platform: pub.platform,
            });
          } catch {
            // swallow — the activity log is derived, retryable.
          }
        }
        if (deps.notify) {
          try {
            await deps.notify(ctx, {
              publicationId,
              platform: pub.platform,
            });
          } catch {
            // swallow — the notification is derived, retryable.
          }
        }
      }

      return updated;
    },

    async getRecentPublications(ctx, opts) {
      return repoFor(ctx).listPublicationsForUser({
        limit: opts.limit,
        offset: opts.offset ?? 0,
      });
    },

    async getRecentPublicationsWithTitle(ctx, opts) {
      const repo = repoFor(ctx);
      const rows = await repo.listPublicationsForUser({
        limit: opts.limit,
        offset: opts.offset ?? 0,
      });
      // Resolve each publication's display title from its revisions (prefer the
      // current revision, else the highest revisionNumber). A publication with no
      // revision keeps "" so the facade can fall back (output title / 未命名发布).
      return Promise.all(
        rows.map(async (r) => {
          let title = "";
          try {
            const revisions = await repo.listRevisions(r.id, {
              limit: 20,
              offset: 0,
            });
            if (revisions.length > 0) {
              const current =
                revisions.find((rev) => rev.id === r.currentRevisionId) ??
                revisions
                  .slice()
                  .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
              title = current?.title?.trim() ?? "";
            }
          } catch {
            title = "";
          }
          return { ...r, title };
        }),
      );
    },

    async resolvePublication(ctx, externalSourceRef) {
      // Ingestion-wave hook (SPEC §11) — thin scoped external-key lookup.
      return repoFor(ctx).findByExternalKey(
        externalSourceRef.platform,
        externalSourceRef.externalId,
      );
    },

    async createImportedPublication(ctx, outputId, input) {
      // 数据底座(SPEC §1.3)。平台白名单同 createPublication;幂等于 (platform,
      //   externalId)——命中既有则直接返回(不重复建)。accountReference 缺省取
      //   "<platform> 导入"(导入作品无显式账号引用)。
      if (!PLATFORMS.has(input.platform)) {
        throw new ValidationError(
          `ValidationError: unknown platform: ${input.platform}`,
        );
      }
      const repo = repoFor(ctx);
      const existing = await repo.findByExternalKey(
        input.platform,
        input.externalId,
      );
      if (existing) return existing;
      return repo.createImportedPublication(outputId, {
        platform: input.platform,
        accountReference: input.accountReference ?? `${input.platform} 导入`,
        externalId: input.externalId,
        externalUrl: input.externalUrl ?? null,
        publishedAt: input.publishedAt ?? null,
      });
    },

    async listPublicationIdsByProject(ctx, projectId) {
      // Resolve the project's ContentOutput ids via the Projects public seam (the
      // project-ownership gate runs there — cross-user/unknown → OwnershipError),
      // then query our OWN publications by those output ids (user-scoped). No
      // Analytics-side cross-module join.
      if (!deps.listOutputIdsByProject) return [];
      const outputIds = await deps.listOutputIdsByProject(ctx, projectId);
      if (outputIds.length === 0) return [];
      return repoFor(ctx).listPublicationIdsByOutputs(outputIds);
    },

    async listPublicationsMissingCover(ctx, input) {
      return repoFor(ctx).listMissingCoverPublications(
        input.platform,
        input.limit ?? 100,
      );
    },

    async setCover(ctx, publicationId, coverAssetId) {
      const repo = repoFor(ctx);
      await repo.getPublication(publicationId); // ownership gate(cross-user → 404)
      const current = await repo.getCurrentRevision(publicationId);
      // 幂等:已有封面(用户手选或上一轮回填)→ 不动,原样返回。
      if (current?.coverAssetId) return current;
      // 封面归属校验(SPEC §15 同 createRevision):cover 必须是本用户的 asset。
      if (deps.assertCoverOwned) {
        try {
          await deps.assertCoverOwned(ctx, coverAssetId);
        } catch {
          throw new ValidationError(
            `ValidationError: cover asset not found or invalid: ${coverAssetId}`,
          );
        }
      }
      // append-only:复制当前 revision 内容 + cover 追加新版(导入作品无 revision →
      // 空标题起一版,标题回退链走 content_output,行为不变)。
      const rev = await repo.createRevision(publicationId, {
        title: current?.title ?? "",
        description: current?.description ?? "",
        coverAssetId,
        category: current?.category ?? "",
        series: current?.series ?? "",
        platformTags: (current?.platformTags ?? []) as string[],
        platformSettings: (current?.platformSettings ?? {}) as Record<
          string,
          unknown
        >,
      });
      await repo.setCurrentRevision(publicationId, rev.id);
      return rev;
    },

    async setVisibilityByExternalKey(ctx, input) {
      // [T-073] 采集侧可见性同步。找不到(该作品未导入)→ null(诚实跳过,不硬造)。
      const repo = repoFor(ctx);
      const pub = await repo.findByExternalKey(input.platform, input.externalId);
      if (!pub) return null;
      const currentlyHidden = pub.hiddenAt != null;
      if (currentlyHidden === input.hidden) return pub; // 幂等:已是目标态不再写
      return repo.setHiddenAt(pub.id, input.hidden ? deps.now() : null);
    },
  };
}
