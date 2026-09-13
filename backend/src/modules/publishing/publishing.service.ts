import { adoptPublicationDraft,type AdoptPublicationDraftInput } from "./publication-draft-adoption.service";
import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createPublishingRepository,
  type PublishingRepository,
  type PublicationRow,
  type PublicationRevisionRow,
} from "./publishing.repository";
import {
  ConflictError,
  OwnershipError,
  ValidationError,
  requireAccountId,
} from "./publishing.errors";
import { createUnavailablePublisher, type PlatformPublisherPort } from "./platform-publisher";

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
  publisher?: PlatformPublisherPort;
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
  // [T-321 治本] 「登记已发布」(register)成功落 published publication 后,把该 output 的
  //   属主项目跃迁到「已发布/复盘」态(projectsService.getProjectIdByOutput + markPublished),
  //   让用户绑定后立刻显已发布(不用等日拉)。可选、best-effort:未注入或失败绝不阻断登记主流程。
  markOwnerProjectPublished?: (
    ctx: RequestContext,
    outputId: string,
  ) => Promise<void>;
  // [T-724] register 身份判据与可重试补偿端口。生产组合根必须接 Projects 公共 service；
  //   单测未注入时只保留旧的保守退化，不允许凭空推断项目语义。
  resolveOutputOwner?: (
    ctx: RequestContext,
    outputId: string,
  ) => Promise<{
    projectId: string;
    source: string;
    status: string;
    title: string;
  } | null>;
  reconcileImportedProjections?: (
    ctx: RequestContext,
    input: {
      platform: string;
      externalId: string;
      canonicalProjectId: string;
    },
  ) => Promise<unknown>;
}

export interface PublishingService {
  adoptDraft(ctx:RequestContext,input:AdoptPublicationDraftInput):Promise<PublicationRow>;
  listPublications(
    ctx: RequestContext,
    outputId: string,
    pagination: { limit: number; offset: number },
  ): Promise<PublicationRow[]>;
  listPublicationsForUser(
    ctx: RequestContext,
    pagination: { limit: number; offset: number },
  ): Promise<PublicationRow[]>;
  /**
   * 组合层批量读取指定 outputs 的 canonical publication 事实；按联合归属收窄，
   * 且不因 hidden/platformStatus 丢失历史已发布事实。
   */
  listPublishedInWindow(ctx: RequestContext, window: {start: string; end: string}): Promise<PublicationRow[]>;
  listPublicationsByOutputIds(
    ctx: RequestContext,
    outputIds: ReadonlyArray<string>,
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
  ): Promise<
    Array<
      PublicationRow & {
        title: string;
        /** 当前 revision 的真实封面资产；无封面时为 null。 */
        coverAssetId: string | null;
      }
    >
  >;
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
      // [B-02] 新建 pub 时原子补铸的 revision-1 标题(缺省空)。
      title?: string;
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
  /**
   * 项目的真实发布事实。`publishedAt` 是唯一判据；即使作品后来下架，
   * 历史发布事实仍保留。返回最早一条，供排期达成态判定。
   */
  getProjectPublicationFact(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{ publicationId: string; publishedAt: string } | null>;
  listCurrentRevisionSummariesByPublicationIds(
    ctx: RequestContext,
    publicationIds: ReadonlyArray<string>,
  ): Promise<
    Array<{
      publicationId: string;
      revisionId: string;
      title: string;
      coverAssetId: string | null;
    }>
  >;
  // [T-073] 平台侧可见性同步:按 (platform, externalId) 找到 publication,把抖音端
  // 「仅自己可见/已隐藏」同步为 hidden_at 非空(hidden=true 置 now,false 清 null)。
  // 幂等(已是目标态不再写);找不到该作品(未导入)诚实返 null,不硬造。
  // 只动 hidden_at,不碰 status 状态机(隐藏≠下架:removed 是平台已删,hidden 可恢复)。
  setVisibilityByExternalKey(
    ctx: RequestContext,
    input: { platform: string; externalId: string; hidden: boolean },
  ): Promise<PublicationRow | null>;
  // [T-033] 平台侧审核状态同步:detail 导出 .xlsx「审核状态」列(原值,如「已通过」/
  // 「仅自己可见」/「私密」/「审核中」/「未通过」) → publication.platformStatus。幂等(同值
  // 不再写);找不到该作品(未导入)诚实返 null。不动 hidden_at(两者正交,各管各的)。
  setPlatformStatusByExternalKey(
    ctx: RequestContext,
    input: { platform: string; externalId: string; platformStatus: string | null },
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
  // [T-321 治本] register(登记已发布)成功后跃迁该 output 属主项目到已发布态(best-effort,
  //   经注入的 markOwnerProjectPublished 端口;未注入/失败 → 静默 no-op,绝不阻断登记)。
  markOwnerPublished(ctx: RequestContext, outputId: string): Promise<void>;
  // [T-323] register(登记已发布)专用入口:落/命中 published publication 并处理「作品已被
  //   日拉自动建的 imported 空壳占用」的重锚。四分支(见实现分支表):无 existing → 新建;
  //   existing 锚在同 output → 幂等;existing 锚在别的 output 且「旧属主 imported 空壳、
  //   新属主非 imported」→ 重锚到本 output + 归档空壳;否则(existing 已属真实手动项目 / 归属
  //   不明)→ 不抢(保守返 existing,绝不误伤用户已有项目)。**仅供 register transport 用**;
  //   ingestion 日拉仍走 createImportedPublication(语义不变,不动)。
  registerOwnerPublication(
    ctx: RequestContext,
    outputId: string,
    input: {
      platform: string;
      externalId: string;
      accountReference?: string;
      externalUrl?: string | null;
      publishedAt?: string | null;
      // [B-02] 新建分支下原子补铸的 revision-1 标题(登记用户项目标题;缺省空)。
      title?: string;
    },
  ): Promise<PublicationRow>;
}

export function createPublishingService(deps: ServiceDeps): PublishingService {
  const publisher = deps.publisher ?? createUnavailablePublisher();
  function repoFor(ctx: RequestContext): PublishingRepository {
    return createPublishingRepository(deps.db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
      // [T-332 S2] strict 按号:未选号 ctx → AccountRequiredError(SPEC §4.2 引导态,
      //   读写同门);写路径 stamp / 读路径 eq 都用这一个断言后的号。
      accountId: requireAccountId(ctx.accountId, "publishing"),
    });
  }

  // [T-321/T-323] best-effort 跃迁 output 属主项目到已发布态。未注入端口或任何失败都吞掉
  //   —— 登记发布(publication)已落是真的,项目 stage 是派生显示,失败绝不回滚发布事实。
  async function markOwnerPublishedBestEffort(
    ctx: RequestContext,
    outputId: string,
  ): Promise<void> {
    if (!deps.markOwnerProjectPublished || !outputId) return;
    try {
      await deps.markOwnerProjectPublished(ctx, outputId);
    } catch {
      // 静默降级:不阻断登记主流程(与 SPEC §11 post-commit 副作用不回滚同款)。
    }
  }

  // [T-724] 生产端口一旦存在就 fail closed：读取异常继续上抛，不能把基础设施失败伪装成
  // 「没有 owner」并误走孤儿修复。只有单测/旧组合根未注入端口时才返回 null。
  async function resolveOwner(
    ctx: RequestContext,
    outputId: string,
  ): Promise<{
    projectId: string;
    source: string;
    status: string;
    title: string;
  } | null> {
    if (!deps.resolveOutputOwner) return null;
    return deps.resolveOutputOwner(ctx, outputId);
  }

  async function reconcileImportedBestEffort(
    ctx: RequestContext,
    input: {
      platform: string;
      externalId: string;
      canonicalProjectId: string;
    },
  ): Promise<void> {
    if (!deps.reconcileImportedProjections) return;
    // 核心 publication 写不能被跨模块补偿回滚；本次最多两次，后续登记/采集仍会重进。
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await deps.reconcileImportedProjections(ctx, input);
        return;
      } catch (error) {
        const rawCode = (error as { code?: unknown } | null)?.code;
        console.error("PROJECT_IDENTITY_RECONCILE_FAILED", {
          requestId: ctx.requestId,
          operation: "registerOwnerPublication",
          errorName:
            error instanceof Error
              ? error.name
              : typeof (error as { name?: unknown } | null)?.name === "string"
                ? String((error as { name: string }).name)
                : "UnknownError",
          errorCode: typeof rawCode === "string" ? rawCode : null,
          attempt,
        });
      }
    }
  }

  // [DATA-H03] createPublication 前校验 outputId 存在且属当前用户 —— 复用已注入的
  //   resolveOutputOwner 端口(= projectsService.getOutputOwnerSummary:越权 / 不存在 →
  //   null，基础设施故障原样上抛)。挡住「认证用户用任意 outputId 建跨属主 / 悬空 publication,平台发布成功后才暴露
  //   本地状态错误」。fail-closed:能校验就必须过;端口未注入(仅单测退化态)才降级放行 ——
  //   生产组合根恒接线,dispatch 路径必校验。
  async function assertOutputOwned(
    ctx: RequestContext,
    outputId: string,
  ): Promise<void> {
    if (!deps.resolveOutputOwner) return; // 端口未注入 → 无法校验,降级放行(生产已接线)
    const owner = await deps.resolveOutputOwner(ctx, outputId);
    if (!owner) {
      // 跨用户 / 不存在 → OwnershipError(→404,不泄露行存在性,与本模块所有权门一致)。
      throw new OwnershipError(
        `OwnershipError: content output not found: ${outputId}`,
      );
    }
  }

  // [DATA-H04] 重试对账:publication 已 published,但属主项目 rollup 可能因上一次发布中途
  //   中断而没跃迁(先调平台 → 更 publication → 更 output/project 三步非原子)。同状态重试
  //   若「直接早返回」,项目会永久留在未跃迁态。markOutputPublished 幂等,重进 published 时
  //   补跑一次让「已 published 但项目未跃迁」自愈(只补 rollup —— publisher.publish 与
  //   派生副作用 search/activity/notify 不重放,避免重复发平台 / 重复通知)。
  async function reconcilePublishedRollup(
    ctx: RequestContext,
    pub: PublicationRow,
  ): Promise<void> {
    if (!deps.markOutputPublished) return;
    await deps.markOutputPublished(ctx, {
      outputId: pub.contentOutputId,
      publicationId: pub.id,
    });
  }

  return {
    async markOwnerPublished(ctx, outputId) {
      // [T-321 治本] best-effort:属主项目跃迁到已发布态(实现见 markOwnerPublishedBestEffort)。
      await markOwnerPublishedBestEffort(ctx, outputId);
    },

    async listPublications(ctx, outputId, pagination) {
      // [T-332 S6 · §4.5 父锚号一致性门] 跨号/跨用户/不存在的 outputId → 404 同貌,
      //   与 projects.outputs.list(经 requireProject)语义一致 —— 此前只有 strict 行过滤
      //   (空 200),「B 号摸 A 号成片的发布列表」会得到一个假空态而非深链 404
      //   (S6 双号验收暴露)。建侧 createPublication/register 的 DATA-H03 门是同一端口。
      await assertOutputOwned(ctx, outputId);
      return repoFor(ctx).listPublicationsByOutput(outputId, pagination);
    },

    async listPublicationsForUser(ctx, pagination) {
      return repoFor(ctx).listPublicationsForUser(pagination);
    },

    async listPublishedInWindow(ctx, window) {
      const start = Date.parse(window.start), end = Date.parse(window.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error("日期范围无效");
      return repoFor(ctx).listPublishedInWindow({start: new Date(start).toISOString(), end: new Date(end).toISOString()});
    },
    async listPublicationsByOutputIds(ctx, outputIds) {
      return repoFor(ctx).listPublicationsByOutputs(outputIds);
    },

    async getProjectPublicationFact(ctx, projectId) {
      const repo = repoFor(ctx);
      if (!deps.listOutputIdsByProject) return null;
      const outputIds = await deps.listOutputIdsByProject(ctx, projectId);
      if (outputIds.length === 0) return null;
      const publications = await repo.listPublicationsByOutputs(outputIds);
      const earliest = publications
        .filter(
          (
            publication,
          ): publication is PublicationRow & { publishedAt: string } =>
            Boolean(publication.publishedAt),
        )
        .sort(
          (a, b) =>
            a.publishedAt.localeCompare(b.publishedAt) ||
            a.id.localeCompare(b.id),
        )[0];
      return earliest
        ? {
            publicationId: earliest.id,
            publishedAt: earliest.publishedAt,
          }
        : null;
    },

    async listCurrentRevisionSummariesByPublicationIds(ctx, publicationIds) {
      return repoFor(ctx).listCurrentRevisionSummariesByPublicationIds(
        publicationIds,
      );
    },

    async adoptDraft(ctx,input){
      if(!PLATFORMS.has(input.platform))throw new ValidationError(`ValidationError: unknown platform: ${input.platform}`);
      await assertOutputOwned(ctx,input.outputId);
      return adoptPublicationDraft(deps.db,ctx,input,deps);
    },

    async createPublication(ctx, outputId, body) {
      if (!PLATFORMS.has(body.platform)) {
        throw new ValidationError(
          `ValidationError: unknown platform: ${body.platform}`,
        );
      }
      // [DATA-H03] 建 pub 前校验 output 归属(不建跨属主 / 悬空行)。
      await assertOutputOwned(ctx, outputId);
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

      // 2. Idempotency (SPEC §17/§22): same-status transition is a no-op —— 但重进
      //    published 时必须补跑属主项目 rollup 对账([DATA-H04]:上一次发布可能落了平台事实
      //    却在 rollup 前中断,项目永久未跃迁;markOutputPublished 幂等,重跑安全)。
      if (next === current) {
        if (next === "published") {
          await reconcilePublishedRollup(ctx, pub);
        }
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
          // [DATA-H04] 同上:命中既有 published 行 → 补跑 rollup 对账再返回。
          await reconcilePublishedRollup(ctx, existing);
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
        const result = await publisher.publish(ctx, {
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
        await publisher.remove(ctx, { externalId: pub.externalId });
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
          let coverAssetId: string | null = null;
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
              coverAssetId = current?.coverAssetId ?? null;
            }
          } catch {
            title = "";
            coverAssetId = null;
          }
          return { ...r, title, coverAssetId };
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
      if (existing) {
        // T-400:重复采集是修复历史空元数据的机会。只补空值，绝不覆盖用户已经
        // 修改过的标题/链接；revision 仍保持 append-only。
        let reconciled = existing;
        const incomingUrl = input.externalUrl?.trim() ?? "";
        if (!(existing.externalUrl?.trim() ?? "") && incomingUrl) {
          reconciled = await repo.updatePublicationStatus(existing.id, {
            status: existing.status,
            externalUrl: incomingUrl,
          });
        }
        const incomingTitle = input.title?.trim() ?? "";
        if (incomingTitle) {
          const current = await repo.getCurrentRevision(existing.id);
          if (!(current?.title?.trim() ?? "")) {
            const revision = await repo.createRevision(existing.id, {
              title: incomingTitle,
              description: current?.description ?? "",
              coverAssetId: current?.coverAssetId ?? null,
              category: current?.category ?? "",
              series: current?.series ?? "",
              platformTags: (current?.platformTags ?? []) as string[],
              platformSettings: (current?.platformSettings ?? {}) as Record<
                string,
                unknown
              >,
            });
            reconciled = await repo.setCurrentRevision(existing.id, revision.id);
          }
        }
        return reconciled;
      }
      try {
        return await repo.createImportedPublication(outputId, {
          platform: input.platform,
          accountReference: input.accountReference ?? `${input.platform} 导入`,
          externalId: input.externalId,
          externalUrl: input.externalUrl?.trim() || null,
          publishedAt: input.publishedAt ?? null,
          title: input.title?.trim(),
        });
      } catch (error) {
        // 两个自动化/登记请求都在 pre-read 后 INSERT 时，唯一索引决定 canonical。
        // 竞争失败者回读真实 winner，而不是把幂等竞争冒充成批次失败。
        const raced = await repo.findByExternalKey(
          input.platform,
          input.externalId,
        );
        if (raced) return raced;
        throw error;
      }
    },

    async registerOwnerPublication(ctx, outputId, input) {
      // T-724：publication 是唯一外部作品事实；登记只允许 imported→用户项目或孤儿修复，
      // 两个用户项目之间绝不静默抢锚。Projects 投影归档是可重试补偿，不是假跨模块事务。
      if (!PLATFORMS.has(input.platform)) {
        throw new ValidationError(
          `ValidationError: unknown platform: ${input.platform}`,
        );
      }
      const ownerNew = await resolveOwner(ctx, outputId);
      if (deps.resolveOutputOwner && !ownerNew) {
        throw new OwnershipError(
          `OwnershipError: content output not found: ${outputId}`,
        );
      }
      if (ownerNew?.status === "archived") {
        throw new ConflictError(
          "ConflictError: archived project cannot register a publication",
          {
            reason: "target_project_archived",
            canonicalProjectId: ownerNew.projectId,
            canonicalProjectTitle: ownerNew.title,
          },
        );
      }
      const repo = repoFor(ctx);
      let existing = await repo.findByExternalKey(
        input.platform,
        input.externalId,
      );

      // 无 existing → 创建；若唯一索引竞争失败，回读 winner 后继续同一判定矩阵。
      if (!existing) {
        try {
          const created = await repo.createImportedPublication(outputId, {
            platform: input.platform,
            accountReference:
              input.accountReference ?? `${input.platform} 导入`,
            externalId: input.externalId,
            externalUrl: input.externalUrl?.trim() || null,
            publishedAt: input.publishedAt ?? null,
            title: input.title?.trim(),
          });
          await markOwnerPublishedBestEffort(ctx, outputId);
          if (ownerNew) {
            await reconcileImportedBestEffort(ctx, {
              platform: input.platform,
              externalId: input.externalId,
              canonicalProjectId: ownerNew.projectId,
            });
          }
          return created;
        } catch (error) {
          existing = await repo.findByExternalKey(
            input.platform,
            input.externalId,
          );
          if (!existing) throw error;
        }
      }

      // same-output 幂等成功也必须重进补偿，修复上一次换锚成功但归档失败的残留。
      if (existing.contentOutputId === outputId) {
        await markOwnerPublishedBestEffort(ctx, outputId);
        if (ownerNew) {
          await reconcileImportedBestEffort(ctx, {
            platform: input.platform,
            externalId: input.externalId,
            canonicalProjectId: ownerNew.projectId,
          });
        }
        return existing;
      }

      const ownerOld = await resolveOwner(ctx, existing.contentOutputId);

      // 同一项目的另一个 output 已持有作品：项目身份没有冲突，保持现锚并补跑收口。
      if (ownerNew && ownerOld?.projectId === ownerNew.projectId) {
        await markOwnerPublishedBestEffort(ctx, existing.contentOutputId);
        await reconcileImportedBestEffort(ctx, {
          platform: input.platform,
          externalId: input.externalId,
          canonicalProjectId: ownerNew.projectId,
        });
        return existing;
      }

      // 只有 orphan repair 或 imported→非 imported 才自动换锚。
      if (
        ownerNew &&
        (!ownerOld ||
          (ownerOld.source === "imported" && ownerNew.source !== "imported"))
      ) {
        const reAnchored = await repo.reAnchorPublicationOutput(
          existing.id,
          outputId,
        );
        await markOwnerPublishedBestEffort(ctx, outputId);
        await reconcileImportedBestEffort(ctx, {
          platform: input.platform,
          externalId: input.externalId,
          canonicalProjectId: ownerNew.projectId,
        });
        return reAnchored;
      }

      // 生产 owner 已知时，manual/manual 或 imported/imported 争抢都明确 409，不能返回
      // existing 让调用端误以为当前项目登记成功。同租户 owner 信息由 Projects 门验证后才返回。
      if (ownerOld && ownerNew) {
        throw new ConflictError(
          "ConflictError: external work is already owned by another project",
          {
            reason: "external_work_owned_by_another_project",
            canonicalProjectId: ownerOld.projectId,
            canonicalProjectTitle: ownerOld.title,
          },
        );
      }

      // 仅兼容未注入 owner 端口的旧最小单测组合：不抢、不谎称换锚。
      await markOwnerPublishedBestEffort(ctx, existing.contentOutputId);
      return existing;
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

    async setPlatformStatusByExternalKey(ctx, input) {
      // [T-033] 平台侧审核状态同步。找不到(该作品未导入)→ null(诚实跳过,不硬造)。
      // 幂等:同值不再写。null 也算合法状态(比如采集拿不到这列 → 显式清空)。
      const repo = repoFor(ctx);
      const pub = await repo.findByExternalKey(input.platform, input.externalId);
      if (!pub) return null;
      if (pub.platformStatus === input.platformStatus) return pub; // 幂等
      return repo.setPlatformStatus(pub.id, input.platformStatus);
    },
  };
}
