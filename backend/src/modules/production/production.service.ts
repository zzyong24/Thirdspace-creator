import {assertWritableWorkspace} from "../../workspace-scope";
import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createProductionRepository,
  type ProductionRepository,
  type ProductionRow,
  type ProductionSegmentRow,
  type ExportRecordRow,
} from "./production.repository";
import {
  ConflictError,
  OwnershipError,
  UnsupportedOperationError,
} from "./production.errors";
import {
  aggregateMaterialExport,
  type MaterialExportPorts,
} from "./material-export";

// Production service (foundation §5.3) — RequestContext-taking methods that thread
// `ctx.userId` into a user-scoped repository built per-call via `repoFor(ctx)`
// (foundation §2). It owns the SPEC §12 state machines:
//   - Production.status: drafting → recording → editing → rendering → ready
//     (forward-only, ADJACENT steps; any skip/backward → ConflictError).
//   - ExportRecord.status: queued|rendering → ready (exports.complete drives it).
//
// The completeExport method is the SPEC §11 cross-module fan-out. There is no
// formal UnitOfWork class in shared infra yet (the realized artifacts module does
// the same: durable main write, then BEST-EFFORT post-commit peer calls that never
// roll back the export fact). Peer access is ONLY through injected public service
// seams — NO cross-module repository import (SPEC §22). Each seam is optional so
// the service is unit-testable with stubs and the module builds without the peers.

// Production.status ordering (contract enum is authoritative — plan §31).
const STATUS_ORDER = [
  "drafting",
  "recording",
  "editing",
  "rendering",
  "ready",
] as const;

// Injected cross-module fan-out seams (public service interfaces only). Each is
// optional; a missing seam is simply skipped (best-effort, SPEC §11).
export type SetPrimaryOutputAsset = (
  ctx: RequestContext,
  input: { outputId: string; assetId: string },
) => Promise<unknown>;
export type SearchIndexAsset = (
  ctx: RequestContext,
  input: { entityType: string; entityId: string; title: string; body: string },
) => Promise<unknown>;
export type RecordExportActivity = (
  ctx: RequestContext,
  input: {
    outputId: string;
    exportId: string;
    resultAssetId: string;
  },
) => Promise<unknown>;

// [T-366b] 素材包导出的组合根接线(全部经各模块公开 service,无跨模块 repo import)。
// 数据取数缝在 MaterialExportPorts(material-export.ts);此外还需两个产物落点缝:
// zip 字节 → 一次性对象存储下载产物(不创建 asset)，以及 production → 属主项目的反查
// (ProjectsService.getProjectIdByOutput)。未接线时该 op 诚实抛 Unsupported。
export interface MaterialExportWiring {
  ports: MaterialExportPorts;
  /** content_output → 属主 projectId(越权/不存在 → null → 404 语义)。 */
  resolveProjectIdByOutput(
    ctx: RequestContext,
    outputId: string,
  ): Promise<string | null>;
  /** zip 字节只落对象存储并返回短时签名下载 URL，不创建普通素材。 */
  storeDownloadArtifact(
    ctx: RequestContext,
    input: { name: string; bytes: Uint8Array },
  ): Promise<{ url: string; fileName: string }>;
}

export interface MaterialExportResult {
  assetId: string | null;
  downloadUrl: string;
  fileName: string;
  fileCount: number;
  totalBytes: number;
  hasDecisions: boolean;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  assertOutputOwned?:(ctx:RequestContext,id:string)=>Promise<unknown>;
  assertAssetOwned?:(ctx:RequestContext,id:string)=>Promise<unknown>;
  /** ContentOutput active→ready primary-asset link (ProjectsService.patchOutput). */
  setPrimaryOutputAsset?: SetPrimaryOutputAsset;
  /** Post-commit search index upsert (SearchService.upsertDocument). */
  searchIndexAsset?: SearchIndexAsset;
  /** Post-commit activity record (ProjectsService.recordActivity / equivalent). */
  recordExportActivity?: RecordExportActivity;
  /** [T-366b] 素材包导出接线(可选缝,unit-test 可 stub;未接线 → op 诚实拒)。 */
  materialExport?: MaterialExportWiring;
}

export interface ProductionService {
  getProduction(ctx: RequestContext, outputId: string): Promise<ProductionRow>;
  /** 候选准备只读；输出归属错误仍抛出，缺制作记录返回 null。 */
  readProduction(ctx: RequestContext, outputId: string): Promise<ProductionRow | null>;
  updateProduction(
    ctx: RequestContext,
    outputId: string,
    patch: {
      productionMode?: string;
      status?: string;
      recordingConfig?: Record<string, unknown>;
      subtitleConfig?: Record<string, unknown>;
    },
  ): Promise<ProductionRow>;
  confirmEditingPlan(
    ctx: RequestContext,
    outputId: string,
    body: {
      expectedRevision: number;
      plan: Record<string, unknown>;
    },
  ): Promise<ProductionRow>;
  removeEditingPlanBroll(
    ctx: RequestContext,
    outputId: string,
    body: { expectedRevision: number; assetId: string },
  ): Promise<ProductionRow>;
  createSegment(
    ctx: RequestContext,
    productionId: string,
    body: {
      title: string;
      position: number;
      startMs: number;
      endMs: number;
      // SEAM-04:溯源脚本段 id(可选);透传给仓库,无则落 null。
      scriptSectionId?: string | null;
    },
  ): Promise<ProductionSegmentRow>;
  listSegments(
    ctx: RequestContext,
    productionId: string,
  ): Promise<ProductionSegmentRow[]>;
  requestExport(
    ctx: RequestContext,
    productionId: string,
    body: { format: string; resolution: string; aspectRatio: string },
  ): Promise<ExportRecordRow>;
  completeExport(
    ctx: RequestContext,
    exportId: string,
    body: { resultAssetId: string },
  ): Promise<ExportRecordRow>;
  // [T-366b] 素材包统一导出:聚合项目全部素材 + 口播稿 + 编导说明 → 本地 zip →
  // 只落对象存储的一次性产物 → 返回签名下载 URL(productions.exports.materials)。
  exportMaterials(
    ctx: RequestContext,
    productionId: string,
  ): Promise<MaterialExportResult>;
}

// bitrate has no contract input field but is a non-null DTO field. Derive it from
// the resolution at request time (plan open-question #3 — fixed lookup), so the
// queued record already carries a sensible value.
function bitrateForResolution(resolution: string): number {
  switch (resolution) {
    case "2160p":
      return 35_000_000;
    case "1440p":
      return 16_000_000;
    case "1080p":
      return 8_000_000;
    case "720p":
      return 5_000_000;
    case "480p":
      return 2_500_000;
    default:
      return 8_000_000;
  }
}

export function createProductionService(deps: ServiceDeps): ProductionService {
  function repoFor(ctx: RequestContext): ProductionRepository {
    return createProductionRepository(deps.db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
      // [T-332 S2] 父锚账号维度下推:repo 每个读写点经 content_output → project 的
      // strict 门闭合(§3.2);未选号 → AccountRequiredError(引导态禁读写)。
      accountId: ctx.accountId ?? null,
      groupId:ctx.groupId??null,
      assertOutputOwned:deps.assertOutputOwned?(id)=>deps.assertOutputOwned!(ctx,id):undefined,
    });
  }

  return {
    async readProduction(ctx, outputId) {
      return repoFor(ctx).findProductionByOutput(outputId);
    },

    async getProduction(ctx, outputId) {
      // Backs outputs.production.get — get-or-create so the initial page load
      // resolves a real row even before the creator enters production.
      const repo=repoFor(ctx),existing=await repo.findProductionByOutput(outputId);
      if(existing)return existing;
      await assertWritableWorkspace(deps.db,ctx);
      return repo.ensureProductionForOutput(outputId);
    },

    async updateProduction(ctx, outputId, patch) {
      await assertWritableWorkspace(deps.db,ctx);
      const repo = repoFor(ctx);
      const production = await repo.getProductionByOutput(outputId);

      const extra: { startedAt?: string | null } = {};
      if (patch.status !== undefined) {
        const fromIdx = STATUS_ORDER.indexOf(
          production.status as (typeof STATUS_ORDER)[number],
        );
        const toIdx = STATUS_ORDER.indexOf(
          patch.status as (typeof STATUS_ORDER)[number],
        );
        // Forward-only, adjacent step. Unknown enum (-1) or any non-+1 delta is
        // illegal (skip or backward) → ConflictError (§12).
        if (fromIdx < 0 || toIdx < 0 || toIdx - fromIdx !== 1) {
          throw new ConflictError(
            `Illegal production status transition: ${production.status} -> ${patch.status}`,
          );
        }
        // Entering `recording` from `drafting` stamps startedAt if unset.
        if (patch.status === "recording" && production.startedAt === null) {
          extra.startedAt = deps.now();
        }
      }

      return repo.updateProduction(production.id, { ...patch, ...extra });
    },

    async confirmEditingPlan(ctx, outputId, body) {
      await assertWritableWorkspace(deps.db,ctx);
      const repo = repoFor(ctx);
      const production = await repo.getProductionByOutput(outputId);
      const updated = await repo.confirmEditingPlan(
        production.id,
        body.expectedRevision,
        body.plan,
      );
      if (!updated) {
        throw new ConflictError(
          "分镜已被其他操作更新，请刷新后再确认，避免覆盖较新的剪辑方案",
        );
      }
      return updated;
    },

    async removeEditingPlanBroll(ctx, outputId, body) {
      await assertWritableWorkspace(deps.db,ctx);
      const repo = repoFor(ctx);
      const production = await repo.getProductionByOutput(outputId);
      const recordingConfig = (production.recordingConfig ?? {}) as Record<
        string,
        unknown
      >;
      const rawPlan = recordingConfig.videoEditingPlan;
      if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
        throw new ConflictError("当前没有可编辑的已确认分镜，请刷新后重新分场");
      }
      const plan = rawPlan as Record<string, unknown>;
      if (plan.revision !== body.expectedRevision) {
        throw new ConflictError(
          "分镜已被其他操作更新，请刷新后再删除，避免覆盖较新的剪辑方案",
        );
      }
      const decisions =
        plan.decisions &&
        typeof plan.decisions === "object" &&
        !Array.isArray(plan.decisions)
          ? (plan.decisions as Record<string, unknown>)
          : {};
      const renderProps =
        plan.renderProps &&
        typeof plan.renderProps === "object" &&
        !Array.isArray(plan.renderProps)
          ? (plan.renderProps as Record<string, unknown>)
          : {};
      const filterByAssetId = (value: unknown, key: "assetId" | "file") =>
        Array.isArray(value)
          ? value.filter((entry) => {
              if (
                !entry ||
                typeof entry !== "object" ||
                Array.isArray(entry)
              ) {
                return true;
              }
              return (entry as Record<string, unknown>)[key] !== body.assetId;
            })
          : [];
      const excluded = new Set(
        Array.isArray(plan.excludedAssetIds)
          ? plan.excludedAssetIds.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
      );
      excluded.add(body.assetId);
      const nextDecisions = { ...decisions };
      nextDecisions.broll = filterByAssetId(decisions.broll, "assetId");
      // 旧总导演方向可能仍引用被删除的素材；局部重统筹完成前宁可安全降级，也不能复活旧引用。
      delete nextDecisions.direction;
      delete nextDecisions.directorReview;
      const nextRenderProps = { ...renderProps };
      nextRenderProps.broll = filterByAssetId(renderProps.broll, "file");
      delete nextRenderProps.direction;
      const nextPlan: Record<string, unknown> = {
        ...plan,
        // 旧成片任务只属于上一 revision；删除后不得再作为当前分镜的恢复/采纳线索。
        sourceRenderTaskId: null,
        excludedAssetIds: [...excluded].sort(),
        decisions: nextDecisions,
        renderProps: nextRenderProps,
        inventory: filterByAssetId(plan.inventory, "assetId"),
      };
      delete nextPlan.revision;
      const updated = await repo.confirmEditingPlan(
        production.id,
        body.expectedRevision,
        nextPlan,
      );
      if (!updated) {
        throw new ConflictError(
          "分镜已被其他操作更新，请刷新后再删除，避免覆盖较新的剪辑方案",
        );
      }
      return updated;
    },

    async createSegment(ctx, productionId, body) {
      await assertWritableWorkspace(deps.db,ctx);
      return repoFor(ctx).createSegment(productionId, body);
    },

    async listSegments(ctx, productionId) {
      return repoFor(ctx).listSegments(productionId);
    },

    async requestExport(ctx, productionId, body) {
      await assertWritableWorkspace(deps.db,ctx);
      // Mock render is async/out-of-band; the export sits `queued` until
      // completeExport drives it to `ready` (plan Step 3).
      return repoFor(ctx).createExport(productionId, {
        ...body,
        bitrate: bitrateForResolution(body.resolution),
      });
    },

    async completeExport(ctx, exportId, body) {
      const repo = repoFor(ctx);
      const current = await repo.getExport(exportId); // ownership gate

      // Idempotency (SPEC §22): a re-delivered complete returns the already-ready
      // row WITHOUT re-running the fan-out (no double primary-asset link / index).
      if (current.status === "ready") {
        return current;
      }
      // Only an in-flight export may complete (§12: queued|rendering → ready).
      if (current.status !== "queued" && current.status !== "rendering") {
        throw new ConflictError(
          `Export cannot complete from status: ${current.status}`,
        );
      }

      await assertWritableWorkspace(deps.db,ctx);
      if(ctx.groupId&&!deps.assertAssetOwned)throw new OwnershipError("结果素材归属验证不可用");
      await deps.assertAssetOwned?.(ctx,body.resultAssetId);
      // 1. Durable main write — the export fact (status ready + resultAssetId).
      const completed = await repo.completeExportRow(exportId, {
        resultAssetId: body.resultAssetId,
        status: "ready",
      });

      // 2. Cross-module fan-out via PUBLIC service seams (no repo import). The
      //    object file itself was staged through MockObjectStorage upstream
      //    (SPEC §15: Production never touches S3). Resolve the owning output to
      //    drive the ContentOutput active→ready primary-asset link.
      const production = await repo.getProductionById(completed.productionId);

      // 3. Post-commit side-effects run AFTER the main write succeeds; a failure
      //    records a retryable state, never rolls back the export fact (SPEC §11).
      if (deps.setPrimaryOutputAsset) {
        try {
          await deps.setPrimaryOutputAsset(ctx, {
            outputId: production.contentOutputId,
            assetId: body.resultAssetId,
          });
        } catch {
          // swallow — derived link is retryable, never fatal to the export fact.
        }
      }
      if (deps.searchIndexAsset) {
        try {
          await deps.searchIndexAsset(ctx, {
            entityType: "asset",
            entityId: body.resultAssetId,
            title: `导出视频 ${completed.format}`,
            body: `${completed.resolution} ${completed.aspectRatio}`,
          });
        } catch {
          // swallow — derived index is retryable.
        }
      }
      if (deps.recordExportActivity) {
        try {
          await deps.recordExportActivity(ctx, {
            outputId: production.contentOutputId,
            exportId: completed.id,
            resultAssetId: body.resultAssetId,
          });
        } catch {
          // swallow — the activity log is derived, retryable.
        }
      }

      return completed;
    },

    // [T-366b] 素材包统一导出(SPEC §4.2)。所有权门:repo.getProductionById 按
    // ctx 收窄(跨用户/未知 → OwnershipError → 404);production → content_output →
    // 属主项目经注入的 Projects 公开缝反查(解析不出同 404,不泄露存在性)。聚合与
    // 打包在 material-export.ts 纯函数层(可 stub 单测);zip 只落对象存储并换签名下载
    // URL，跳过 asset 落库 —— P-04 本地打包,全程不出网。
    async exportMaterials(ctx, productionId) {
      const wiring = deps.materialExport;
      if (!wiring) {
        // 组合根没接线 = 该环境不支持素材包导出;诚实拒,不静默空包。
        throw new UnsupportedOperationError("productions.exports.materials");
      }
      const repo = repoFor(ctx);
      const production = await repo.getProductionById(productionId); // ownership gate
      const projectId = await wiring.resolveProjectIdByOutput(
        ctx,
        production.contentOutputId,
      );
      if (!projectId) {
        throw new OwnershipError();
      }
      const bundle = await aggregateMaterialExport(
        ctx,
        { projectId, nowIso: deps.now() },
        wiring.ports,
      );
      const stored = await wiring.storeDownloadArtifact(ctx, {
        name: bundle.zipFileName,
        bytes: bundle.zipBytes,
      });
      return {
        assetId: null,
        downloadUrl: stored.url,
        // 文件名用打包时的人话名(素材包-<项目>-<日期>.zip)。
        fileName: bundle.zipFileName,
        fileCount: bundle.fileCount,
        totalBytes: bundle.totalBytes,
        hasDecisions: bundle.hasDecisions,
      };
    },
  };
}
