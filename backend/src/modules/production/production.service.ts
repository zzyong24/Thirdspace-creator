import {
  productionEditorSaveBody, productionEditorApplyBody, productionEditorRestoreBody, productionEditorHistoryQuery, productionEditorRequestId,
  type RequestContext, type ProductionEditorDocument, type ProductionEditorVersion,
  type ProductionEditorSaveBody, type ProductionEditorApplyBody, type ProductionEditorRestoreBody,
  productionEditorRenderBody, executionTaskSpec, type ProductionEditorRenderRequest, type ExecutionTaskSpec,
} from "@creatoros/contract";
import { createProductionEditorRepository, editingPlan, editorRevision } from "./production-editor.repository";
import { prepareEditorPlan, applyEditorEdits, itemDigest, unsupportedEditorFields, validateEditorChanges, type EditorPlan } from "./production-editor-plan";
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
  /** ContentOutput active→ready primary-asset link (ProjectsService.patchOutput). */
  setPrimaryOutputAsset?: SetPrimaryOutputAsset;
  /** Post-commit search index upsert (SearchService.upsertDocument). */
  searchIndexAsset?: SearchIndexAsset;
  /** Post-commit activity record (ProjectsService.recordActivity / equivalent). */
  recordExportActivity?: RecordExportActivity;
  /** [T-366b] 素材包导出接线(可选缝,unit-test 可 stub;未接线 → op 诚实拒)。 */
  materialExport?: MaterialExportWiring;
  /** 新增/替换媒体：当前账号的真实 Asset，且明确加入当前项目。 */
  assertEditorAsset?: (ctx:RequestContext,input:{projectId:string;assetId:string},transaction?:Db)=>Promise<void>;
  /** 沿既有 execution live dispatch 提交，不能只建 queued 行却不启动。 */
  createEditorRender?: (ctx:RequestContext,input:{spec:ExecutionTaskSpec;projectId:string;contentOutputId:string;attemptId:string})=>Promise<{id:string}>;
  readEditorRenderAsset?: (ctx:RequestContext,taskId:string)=>Promise<{assetId:string|null}>;
}

export interface ProductionService {
  getEditor(ctx:RequestContext,outputId:string):Promise<ProductionEditorDocument>;
  saveEditor(ctx:RequestContext,outputId:string,body:ProductionEditorSaveBody):Promise<ProductionEditorVersion>;
  applyEditor(ctx:RequestContext,outputId:string,body:ProductionEditorApplyBody):Promise<ProductionEditorVersion>;
  restoreEditor(ctx:RequestContext,outputId:string,body:ProductionEditorRestoreBody):Promise<ProductionEditorVersion>;
  getEditorReceipt(ctx:RequestContext,outputId:string,requestId:string):Promise<ProductionEditorVersion|null>;
  getEditorVersion(ctx:RequestContext,outputId:string,revision:number):Promise<ProductionEditorVersion>;
  listEditorVersions(ctx:RequestContext,outputId:string,query:{limit?:number;offset?:number}):Promise<{items:Array<Omit<ProductionEditorVersion,"plan">>;total:number}>;
  renderEditor(ctx:RequestContext,outputId:string,input:{revision:number;requestId:string}):Promise<ProductionEditorRenderRequest>;
  listEditorRenders(ctx:RequestContext,outputId:string,query:{limit?:number;offset?:number}):Promise<{items:ProductionEditorRenderRequest[];total:number}>;
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
  const editorFor=(ctx:RequestContext)=>createProductionEditorRepository(deps.db,{now:deps.now,nextId:deps.nextId,userId:ctx.userId,accountId:ctx.accountId??null});
  const mediaRefs=(plan:Record<string,unknown>|null)=>{
    const p=plan?.renderProps as EditorPlan["renderProps"]|undefined;
    return new Set([p?.talkingHead?.file,...(p?.broll??[]).map(b=>b.file),...(p?.scenes??[]).flatMap(s=>(s.cards??[]).filter(c=>c.kind==="image").map(c=>c.kind==="image"?c.file:undefined))].filter((v):v is string=>typeof v==="string"));
  };
  async function checkNewMedia(ctx:RequestContext,projectId:string,current:Record<string,unknown>|null,next:EditorPlan,transaction:Db) {
    const before=mediaRefs(current);
    for(const assetId of mediaRefs(next)) {
      if(before.has(assetId))continue;
      if(!deps.assertEditorAsset)throw new UnsupportedOperationError("production.editor.asset-validation");
      await deps.assertEditorAsset(ctx,{projectId,assetId},transaction);
    }
  }
  // SEMANTIC_BOUNDARY_ALLOW: 精确请求摘要仅用于回执幂等，不理解创作内容。
  const legacyRequest=(ctx:RequestContext,payload:unknown)=>`legacy-${itemDigest({requestId:ctx.requestId,payload}).slice(7)}`;
  function repoFor(ctx: RequestContext): ProductionRepository {
    return createProductionRepository(deps.db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
      // [T-332 S2] 父锚账号维度下推:repo 每个读写点经 content_output → project 的
      // strict 门闭合(§3.2);未选号 → AccountRequiredError(引导态禁读写)。
      accountId: ctx.accountId ?? null,
    });
  }

  return {
    async getEditor(ctx,outputId) {
      const {owned,row,plan}=await editorFor(ctx).read(outputId);
      return {outputId,projectId:owned.projectId,productionId:row?.id??null,revision:editorRevision(plan),
        state:plan?(plan.editorVersion===1?"editable":"legacy"):"empty",plan,unsupportedFields:unsupportedEditorFields(plan)};
    },
    async saveEditor(ctx,outputId,input) {
      const body=productionEditorSaveBody.parse(input);
      return editorFor(ctx).commit(outputId,{...body,requestDigest:itemDigest({op:"save",body})},async(current,projectId,transaction)=>{
        if(current?.editorVersion===1 && body.plan.editorVersion!==1)throw new ConflictError("请读取当前制作方案再保存，避免旧分场覆盖片段修改");
        const next=prepareEditorPlan(body.plan,()=>deps.nextId("item"),current?.editorVersion===1?(current as EditorPlan).renderProps:undefined);
        if(!current || current.editorVersion===1)validateEditorChanges(next,current as EditorPlan|null);
        await checkNewMedia(ctx,projectId,current,next,transaction);return next;
      });
    },
    async applyEditor(ctx,outputId,input) {
      const body=productionEditorApplyBody.parse(input);
      return editorFor(ctx).commit(outputId,{...body,source:"assistant",requestDigest:itemDigest({op:"apply",body})},async(current,projectId,transaction)=>{
        if(current?.editorVersion!==1)throw new ConflictError("请先保存制作方案，再编辑片段");
        const next=applyEditorEdits(current as EditorPlan,body.edits,()=>deps.nextId("item"));
        await checkNewMedia(ctx,projectId,current,next,transaction);return next;
      });
    },
    async restoreEditor(ctx,outputId,input) {
      const body=productionEditorRestoreBody.parse(input), repo=editorFor(ctx);
      const historical=await repo.version(outputId,body.sourceRevision);
      return repo.commit(outputId,{...body,source:"restore",requestDigest:itemDigest({op:"restore",body})},async(current,projectId,transaction)=>{
        const next=prepareEditorPlan(historical.plan,()=>deps.nextId("item"));await checkNewMedia(ctx,projectId,current,next,transaction);return next;
      });
    },
    async getEditorReceipt(ctx,outputId,requestId) {return editorFor(ctx).receipt(outputId,productionEditorRequestId.parse(requestId));},
    async getEditorVersion(ctx,outputId,revision) {
      if(!Number.isInteger(revision)||revision<0)throw new ConflictError("版本号无效");
      return editorFor(ctx).version(outputId,revision);
    },
    async listEditorVersions(ctx,outputId,input) {const q=productionEditorHistoryQuery.parse(input);return editorFor(ctx).versions(outputId,q.limit,q.offset);},
    async renderEditor(ctx,outputId,input) {
      const body=productionEditorRenderBody.parse(input), repo=editorFor(ctx);
      // 权限在 reserve 中先校验；没有接线不得产生假任务。
      const frozen=await repo.reserveRender(outputId,{...body,requestDigest:itemDigest({op:"render",body})},async(plan,projectId,transaction)=>{
        if(!deps.createEditorRender)throw new UnsupportedOperationError("outputs.production.editor.render");
        const prepared=prepareEditorPlan(plan);
        // 所有输入真实读取；渲染的是历史版本，素材不因新草稿而被替换。
        if(!deps.assertEditorAsset)throw new UnsupportedOperationError("production.editor.asset-validation");
        for(const assetId of mediaRefs(prepared))await deps.assertEditorAsset(ctx,{projectId,assetId},transaction);
        return executionTaskSpec.parse({taskType:"video.render",goal:`生成视频：${prepared.renderProps.meta.title}`,
          inputs:[...mediaRefs(prepared)].map(assetId=>({assetId,mountAs:assetId})),params:{props:prepared.renderProps},
          constraints:{timeoutSec:null,network:"deny",maxOutputMB:512}});
      });
      if(frozen.request.taskId)return frozen.request;
      if(!deps.createEditorRender)throw new UnsupportedOperationError("outputs.production.editor.render");
      const task=await deps.createEditorRender(ctx,{spec:frozen.request.spec,projectId:frozen.projectId,contentOutputId:outputId,attemptId:frozen.request.attemptId});
      return repo.attachRender(outputId,body.requestId,{taskId:task.id});
    },
    async listEditorRenders(ctx,outputId,input) {
      const q=productionEditorHistoryQuery.parse(input),repo=editorFor(ctx),result=await repo.renders(outputId,q.limit,q.offset);
      if(deps.readEditorRenderAsset)for(let i=0;i<result.items.length;i++) {
        const item=result.items[i]!;if(!item.taskId || item.assetId)continue;
        const adopted=await deps.readEditorRenderAsset(ctx,item.taskId);
        if(adopted.assetId)result.items[i]=await repo.attachRender(outputId,item.requestId,{assetId:adopted.assetId});
      }
      return result;
    },
    async readProduction(ctx, outputId) {
      return repoFor(ctx).findProductionByOutput(outputId);
    },

    async getProduction(ctx, outputId) {
      // Backs outputs.production.get — get-or-create so the initial page load
      // resolves a real row even before the creator enters production.
      return repoFor(ctx).ensureProductionForOutput(outputId);
    },

    async updateProduction(ctx, outputId, patch) {
      const repo = repoFor(ctx);
      const production = await repo.getProductionByOutput(outputId);

      const validatePatch = (row: ProductionRow) => {
        const extra: { startedAt?: string | null } = {};
        if (patch.status !== undefined) {
          const fromIdx = STATUS_ORDER.indexOf(row.status as (typeof STATUS_ORDER)[number]);
          const toIdx = STATUS_ORDER.indexOf(patch.status as (typeof STATUS_ORDER)[number]);
          if (fromIdx < 0 || toIdx < 0 || toIdx - fromIdx !== 1) {
            throw new ConflictError(`Illegal production status transition: ${row.status} -> ${patch.status}`);
          }
          if (patch.status === "recording" && row.startedAt === null) extra.startedAt = deps.now();
        }
        return { ...patch, ...extra };
      };
      if(patch.recordingConfig!==undefined) {
        const currentPlan=editingPlan(production.recordingConfig), incoming=editingPlan(patch.recordingConfig);
        if(incoming && itemDigest(incoming)!==itemDigest(currentPlan)) {
          if(incoming.editorVersion===1)throw new ConflictError("请使用保存制作方案，避免覆盖已保存版本");
          const expectedRevision=editorRevision(incoming);
          await editorFor(ctx).commit(outputId,{expectedRevision,requestId:legacyRequest(ctx,patch),requestDigest:itemDigest({op:"legacy-put",body:patch}),source:"legacy",productionPatch:validatePatch},async current=>{
            if(current?.editorVersion===1)throw new ConflictError("请在制作工作台保存当前方案");
            return incoming;
          });
          return repo.getProductionByOutput(outputId);
        }
      }
      return repo.updateProduction(production.id, validatePatch(production));
    },

    async confirmEditingPlan(ctx, outputId, body) {
      const repo = repoFor(ctx);
      await repo.getProductionByOutput(outputId);
      await editorFor(ctx).commit(outputId,{expectedRevision:body.expectedRevision,requestId:legacyRequest(ctx,body),requestDigest:itemDigest({op:"legacy-confirm",body}),source:"legacy"},async current=>{
        if(current?.editorVersion===1)throw new ConflictError("请在制作工作台保存当前方案，避免旧分场覆盖片段修改");
        return body.plan;
      });
      return repo.getProductionByOutput(outputId);
    },

    async removeEditingPlanBroll(ctx, outputId, body) {
      const repo = repoFor(ctx);
      await repo.getProductionByOutput(outputId);
      await editorFor(ctx).commit(outputId,{expectedRevision:body.expectedRevision,requestId:legacyRequest(ctx,body),requestDigest:itemDigest({op:"legacy-remove",body}),source:"legacy"},async plan=>{
      if(!plan)throw new ConflictError("当前没有可编辑的已确认分镜，请刷新后重新分场");
      if(plan.editorVersion===1)throw new ConflictError("请在工作台选中要移除的片段");
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
        return nextPlan;
      });
      return repo.getProductionByOutput(outputId);
    },

    async createSegment(ctx, productionId, body) {
      return repoFor(ctx).createSegment(productionId, body);
    },

    async listSegments(ctx, productionId) {
      return repoFor(ctx).listSegments(productionId);
    },

    async requestExport(ctx, productionId, body) {
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
