import {nativeChangedMediaIds} from './production-script-markdown';
import {readProductionNativeScene,type NativeSerializedTimelineTracks} from '@creatoros/contract';
import {createWorkEditorCandidateService} from '../ai-runtime/work-editor-candidate';
import {productionScriptReadBody,productionScriptProposeBody,type WorkEditorContext,type WorkEditorCandidate} from '@creatoros/contract';
import {applyNativeEditorEdits,nativeProbeMediaCatalog} from "./production-native-editor";
import {assertWritableWorkspace} from "../../workspace-scope";
import {isProductionOverlayReference} from "./production-overlay-capture";
import {createProductionRoughCutReservations} from './production-rough-cut-reservation';
import {createProductionConversion,type ProductionConversionPorts} from './production-conversion.service';
import type {ProductionOverlayBinding} from './production-overlay-capture';
import type {createProductionTranscripts} from './production-transcripts.service';
import {createProductionSources,type SourcePorts} from "./production-sources";
import {
  ErrorCode,productionPlanV2,productionReferencePlan,
  productionEditorSaveBody, productionEditorApplyBody, productionEditorRestoreBody, productionEditorHistoryQuery, productionEditorRequestId,
  type RequestContext, type ProductionEditorDocument, type ProductionEditorVersion,
  type ProductionEditorSaveBody, type ProductionEditorApplyBody, type ProductionEditorRestoreBody,
  productionEditorPreviewBody,type ProductionEditorPreviewBody,type ProductionEditorPreview,
  productionEditorRenderBody, executionTaskSpec, type ProductionEditorRenderRequest, type ExecutionTaskSpec,
} from "@creatoros/contract";
import {mapMainTrack} from "./production-main-track";
import {applyV2EditorEdits} from "./production-v2-edits";
import {compileV2RenderablePlan} from "./production-v2-compile";
import {compileV1RenderProps} from "./production-v1-compile";
import {buildProductionPreview,type ResolveEditorMedia} from "./production-preview";
import { createProductionEditorRepository, editingPlan, editorRevision, type ProductionVersionSavedEvent } from "./production-editor.repository";
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
  /** 原保存版本 INSERT 后同一事务运行；旧可选媒体无证明不得因此阻断合法保存。 */
  onVersionSaved?: (ctx:RequestContext,event:ProductionVersionSavedEvent,tx:Db)=>Promise<void>;
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
  /** 新增/替换媒体：当前账号的真实 Asset，且明确加入当前项目。 */
  roughCut?:()=>ReturnType<typeof createProductionRoughCutReservations>;
  transcripts?:()=>ReturnType<typeof createProductionTranscripts>;
  conversionPorts?:Pick<ProductionConversionPorts,'readLegacyMain'>;
  sourcePorts?:SourcePorts;
  resolveEditorMedia?:ResolveEditorMedia;
  /** 编导v3候选执行时按已登记确切文件重读类型/时长，不能相信客户端mediaMetadata。 */
  readNativeEditorMedia?:(ctx:RequestContext,input:{projectId:string;assetId:string;assetFileId:string},transaction?:Db)=>Promise<{kind:'video'|'audio'|'image';durationTick:number|null}>;
  /** 只读该正式保存版本的原 immutable file capture；草稿变更仅保留仍同身份的触点。 */
  readEditorOverlayBindings?:(ctx:RequestContext,input:{outputId:string;revision:number;planDigest:string},tx?:Db)=>Promise<ProductionOverlayBinding[]>;
  assertEditorAsset?: (ctx:RequestContext,input:{projectId:string;assetId:string;assetFileId?:string;fileDigest?:string},transaction?:Db)=>Promise<void>;
  /** 沿既有 execution live dispatch 提交，不能只建 queued 行却不启动。 */
  createEditorRender?: (ctx:RequestContext,input:{spec:ExecutionTaskSpec;projectId:string;contentOutputId:string;attemptId:string})=>Promise<{id:string}>;
  readEditorRenderAsset?: (ctx:RequestContext,taskId:string)=>Promise<{assetId:string|null}>;
}

export interface ProductionService {
 readEditorScript(ctx:RequestContext,outputId:string,body:unknown):Promise<WorkEditorContext>;
 proposeEditorScript(ctx:RequestContext,outputId:string,body:unknown):Promise<WorkEditorCandidate>;
 createRoughCut(ctx:RequestContext,outputId:string,body:unknown):ReturnType<ReturnType<typeof createProductionRoughCutReservations>['create']>;
 getRoughCut(ctx:RequestContext,outputId:string,requestId:string):ReturnType<ReturnType<typeof createProductionRoughCutReservations>['get']>;
 adoptRoughCut(ctx:RequestContext,outputId:string,body:unknown):ReturnType<ReturnType<typeof createProductionRoughCutReservations>['adopt']>;

 assertAssetAsrReservation:ReturnType<typeof createProductionTranscripts>["assertAssetAsrReservation"];
 prepareEditorConversion(ctx:RequestContext,outputId:string,body:unknown):ReturnType<ReturnType<typeof createProductionConversion>["prepare"]>;
 getEditorConversion(ctx:RequestContext,outputId:string,requestId:string):ReturnType<ReturnType<typeof createProductionConversion>["get"]>;
 adoptEditorConversion(ctx:RequestContext,outputId:string,body:unknown):ReturnType<ReturnType<typeof createProductionConversion>["adopt"]>;
 createEditorTranscript(ctx:RequestContext,outputId:string,body:unknown):ReturnType<ReturnType<typeof createProductionTranscripts>["create"]>;
 getEditorTranscript(ctx:RequestContext,outputId:string,requestId:string):ReturnType<ReturnType<typeof createProductionTranscripts>["get"]>;
 adoptEditorTranscript(ctx:RequestContext,outputId:string,body:unknown):ReturnType<ReturnType<typeof createProductionTranscripts>["adopt"]>;
 retryEditorSource(ctx:RequestContext,outputId:string,body:unknown):ReturnType<ReturnType<typeof createProductionSources>["get"]>;
 prepareEditorSource(ctx:RequestContext,outputId:string,body:unknown):ReturnType<ReturnType<typeof createProductionSources>["get"]>;
 getEditorSource(ctx:RequestContext,outputId:string,requestId:string):ReturnType<ReturnType<typeof createProductionSources>["get"]>;
 adoptEditorSource(ctx:RequestContext,outputId:string,body:unknown):Promise<ProductionEditorVersion>;
  previewEditor(ctx:RequestContext,outputId:string,body:ProductionEditorPreviewBody):Promise<ProductionEditorPreview>;
  getEditor(ctx:RequestContext,outputId:string,forUpdate?:boolean):Promise<ProductionEditorDocument>;
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
  const conversion=()=>{if(!deps.sourcePorts||!deps.conversionPorts)throw new UnsupportedOperationError("production.editor.convert");return createProductionConversion(deps.db,{now:deps.now,nextId:deps.nextId,onVersionSaved:deps.onVersionSaved,ports:{...deps.conversionPorts,source:deps.sourcePorts,sourceGet:(ctx,id,requestId,tx)=>createProductionSources({...deps,db:tx??deps.db,ports:deps.sourcePorts}).get(ctx,id,requestId)}});};

  const editorFor=(ctx:RequestContext)=>createProductionEditorRepository(deps.db,{now:deps.now,nextId:deps.nextId,userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId,groupVersion:ctx.groupVersion,membershipVersion:ctx.membershipVersion,onVersionSaved:(event,tx)=>deps.onVersionSaved?.(ctx,event,tx)??Promise.resolve()});
  const mediaRefs=(plan:Record<string,unknown>|null)=>{
    const p=(plan?.editorVersion===2?plan.overlayDraft:plan?.renderProps) as EditorPlan["renderProps"]|undefined;
    return new Set([p?.talkingHead?.file,...(p?.broll??[]).map(b=>b.file),...(p?.scenes??[]).flatMap(s=>(s.cards??[]).filter(c=>c.kind==="image").map(c=>c.kind==="image"?c.file:undefined))].filter((v):v is string=>typeof v==="string"));
  };
  async function checkReferenceMedia(ctx:RequestContext,projectId:string,raw:Record<string,unknown>,tx:Db,previous?:Record<string,unknown>|null){
    const plan=productionReferencePlan.parse(structuredClone(raw));
    const oldNative=previous?.editorVersion===3?productionReferencePlan.parse(previous):null;
    if(itemDigest(plan.nativeSources??[])!==itemDigest(oldNative?.nativeSources??[])||itemDigest(plan.sourceTranscripts??[])!==itemDigest(oldNative?.sourceTranscripts??[]))throw new ConflictError('来源与转写须从真实处理结果采用，不能通过保存改写');
    for(const binding of plan.nativeSources??[]){const ref=plan.referenceEditor.mediaRefs.find(r=>r.mediaId===binding.mediaId);if(ref&&(ref.assetId!==binding.source.assetId||ref.assetFileId!==binding.source.assetFileId))throw new ConflictError('来源绑定的精确文件不能替换');}
    const prior=oldNative?.referenceEditor.mediaRefs??[];
    if(!deps.assertEditorAsset&&plan.referenceEditor.mediaRefs.length)throw new UnsupportedOperationError('production.editor.asset-validation');
    // SEMANTIC_BOUNDARY_ALLOW: 原生媒体ID绑定确切file，全部沿原服务验证权限，不挑选素材。
    for(const ref of plan.referenceEditor.mediaRefs){
      if(prior.some(old=>old.mediaId===ref.mediaId&&old.assetId===ref.assetId&&old.assetFileId===ref.assetFileId))continue;
      await deps.assertEditorAsset!(ctx,{projectId,assetId:ref.assetId,assetFileId:ref.assetFileId},tx);
    }
    return plan;
  }
  async function checkNewMedia(ctx:RequestContext,projectId:string,current:Record<string,unknown>|null,next:EditorPlan|import("@creatoros/contract").ProductionPlanV2,transaction:Db) {
    const before=mediaRefs(current);
    for(const assetId of mediaRefs(next)) {
      if(before.has(assetId))continue;
      if(next.editorVersion===2&&isProductionOverlayReference(assetId))continue;
      if(!deps.assertEditorAsset)throw new UnsupportedOperationError("production.editor.asset-validation");
      await deps.assertEditorAsset(ctx,{projectId,assetId},transaction);
    }
  }
  // SEMANTIC_BOUNDARY_ALLOW: 注册来源/转写与旧快照只按完整前值核验，不能通过普通保存伪造执行证据。
  function prepareV2Draft(raw:Record<string,unknown>,current:Record<string,unknown>|null) {
    const next=productionPlanV2.parse(structuredClone(raw));
    const previous=current?.editorVersion===2?productionPlanV2.parse(current):null;
    if(itemDigest(next.mainTrack.sources)!==itemDigest(previous?.mainTrack.sources??[]) ||
       itemDigest(next.sourceTranscripts)!==itemDigest(previous?.sourceTranscripts??[]))
      throw new ConflictError("来源与转写须从真实处理结果采用，不能通过保存改写");
    const snapshot=previous?.legacySnapshot ?? (current?structuredClone(current):undefined);
    if(next.legacySnapshot!==undefined && itemDigest(next.legacySnapshot)!==itemDigest(snapshot??null))
      throw new ConflictError("原始方案快照不可修改");
    if(snapshot!==undefined)next.legacySnapshot=snapshot;
    mapMainTrack(next.mainTrack);return next;
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
      groupId:ctx.groupId??null,
      assertOutputOwned:deps.assertOutputOwned?(id)=>deps.assertOutputOwned!(ctx,id):undefined,
    });
  }

  async function readEditorDocument(ctx:RequestContext,outputId:string,forUpdate=false):Promise<ProductionEditorDocument>{
    const {owned,row,plan}=await editorFor(ctx).read(outputId,forUpdate);
    return {outputId,projectId:owned.projectId,productionId:row?.id??null,revision:editorRevision(plan),state:plan?([1,2,3].includes(Number(plan.editorVersion))?'editable':'legacy'):'empty',plan,unsupportedFields:plan?.editorVersion===2||plan?.editorVersion===3?[]:unsupportedEditorFields(plan)};
  }
  const scriptCandidates=()=>createWorkEditorCandidateService({readProduction:readEditorDocument,readMedia:async(ctx,input)=>{
    if(!deps.readNativeEditorMedia)throw new UnsupportedOperationError('production.editor.native-media-read');
    return deps.readNativeEditorMedia(ctx,input);
  }});
  const sources=createProductionSources({...deps,ports:deps.sourcePorts});
  return {
    async readEditorScript(ctx,id,raw){const body=productionScriptReadBody.parse(raw);if(body.target.outputId!==id)throw new ConflictError('文字剪辑目标与当前作品不符');return scriptCandidates().read(ctx,body.target,{view:'script_markdown'});},
    async proposeEditorScript(ctx,id,raw){const body=productionScriptProposeBody.parse(raw);if(body.target.outputId!==id)throw new ConflictError('文字剪辑目标与当前作品不符');return scriptCandidates().propose(ctx,body.target,body.input);},
    assertAssetAsrReservation:(ctx,proof,tx)=>{if(!deps.transcripts)throw new UnsupportedOperationError("production.transcripts");return deps.transcripts().assertAssetAsrReservation(ctx,proof,tx);},
    prepareEditorConversion:(ctx,id,body)=>conversion().prepare(ctx,id,body),
    getEditorConversion:(ctx,id,requestId)=>conversion().get(ctx,id,requestId),
    adoptEditorConversion:(ctx,id,body)=>conversion().adopt(ctx,id,body),
    createEditorTranscript:(ctx,id,body)=>{if(!deps.transcripts)throw new UnsupportedOperationError("production.transcripts");return deps.transcripts().create(ctx,id,body);},
    getEditorTranscript:(ctx,id,requestId)=>{if(!deps.transcripts)throw new UnsupportedOperationError("production.transcripts");return deps.transcripts().get(ctx,id,requestId);},
    adoptEditorTranscript:(ctx,id,body)=>{if(!deps.transcripts)throw new UnsupportedOperationError("production.transcripts");return deps.transcripts().adopt(ctx,id,body);},
    retryEditorSource:sources.retry,prepareEditorSource:sources.prepare,getEditorSource:sources.get,adoptEditorSource:sources.adopt,
    async previewEditor(ctx,outputId,input) {
      const body=productionEditorPreviewBody.parse(input),{owned,plan}=await editorFor(ctx).read(outputId);
      if(editorRevision(plan)!==body.expectedRevision)throw new ConflictError("制作版本已变化，请重新读取；本地修改已保留");
      if(body.plan.editorVersion===3)throw new ConflictError('请在开源剪辑工作台预览当前工程');
      if(!deps.resolveEditorMedia)throw new UnsupportedOperationError("outputs.production.editor.preview");
      if(body.plan.editorVersion===2){const prepared=prepareV2Draft(body.plan,plan),exact=plan&&editorRevision(plan)>0?await deps.readEditorOverlayBindings?.(ctx,{outputId,revision:editorRevision(plan),planDigest:itemDigest(plan)})??[]:[];return buildProductionPreview(ctx,owned.projectId,prepared,deps.resolveEditorMedia,exact);}
      const prepared=prepareEditorPlan(body.plan,()=>deps.nextId("item"),plan?.editorVersion===1?(plan as EditorPlan).renderProps:undefined);
      if(!plan || plan.editorVersion===1)validateEditorChanges(prepared,plan as EditorPlan|null);
      return buildProductionPreview(ctx,owned.projectId,prepared,deps.resolveEditorMedia);
    },
    createRoughCut(ctx,id,body){if(!deps.roughCut)throw new UnsupportedOperationError('production.rough-cut');return deps.roughCut().create(ctx,id,body);},
    getRoughCut(ctx,id,key){if(!deps.roughCut)throw new UnsupportedOperationError('production.rough-cut');return deps.roughCut().get(ctx,id,key);},
    adoptRoughCut(ctx,id,body){if(!deps.roughCut)throw new UnsupportedOperationError('production.rough-cut');return deps.roughCut().adopt(ctx,id,body);},
    getEditor:readEditorDocument,
    async saveEditor(ctx,outputId,input) {
      const body=productionEditorSaveBody.parse(input);
      return editorFor(ctx).commit(outputId,{...body,requestDigest:itemDigest({op:"save",body})},async(current,projectId,transaction)=>{
        if(body.plan.editorVersion===3){
          if(current&&current.editorVersion!==3&&!body.replaceEditor)throw new ConflictError('请明确保存为开源剪辑稿，原方案会保留在历史版本');
          return checkReferenceMedia(ctx,projectId,body.plan,transaction,current);
        }
        if(current?.editorVersion===3)throw new ConflictError('请在开源剪辑工作台保存当前工程，或从历史明确恢复原方案');
        if(current?.editorVersion===2 && body.plan.editorVersion!==2)throw new ConflictError("请在粗剪工作台保存，避免旧方案覆盖主轨");
        if(body.plan.editorVersion===2){const next=prepareV2Draft(body.plan,current);await checkNewMedia(ctx,projectId,current,next,transaction);return next;}
        if(current?.editorVersion===1 && body.plan.editorVersion!==1)throw new ConflictError("请读取当前制作方案再保存，避免旧分场覆盖片段修改");
        const next=prepareEditorPlan(body.plan,()=>deps.nextId("item"),current?.editorVersion===1?(current as EditorPlan).renderProps:undefined);
        if(!current || current.editorVersion===1)validateEditorChanges(next,current as EditorPlan|null);
        await checkNewMedia(ctx,projectId,current,next,transaction);return next;
      });
    },
    async applyEditor(ctx,outputId,input) {
      const body=productionEditorApplyBody.parse(input);
      const mediaLineage:import("./production-main-track").ProductionOverlayMechanicalLineage[]=[];
      return editorFor(ctx).commit(outputId,{...body,source:"assistant",getMediaLineage:()=>mediaLineage,requestDigest:itemDigest({op:"apply",body})},async(current,projectId,transaction)=>{
        if(current?.editorVersion===3){
          const prior=productionReferencePlan.parse(current),media=nativeProbeMediaCatalog(prior);
          const required=new Set<string>();
          for(const edit of body.edits){
            if(edit.type!=='replaceNativeSceneTracks')throw new ConflictError('当前原生工程仅支持明确scene轨道候选');
            const scene=readProductionNativeScene(prior,edit.sceneId);if(!scene)throw new ConflictError('场景不存在');
            try{for(const mediaId of nativeChangedMediaIds(scene.tracks as unknown as NativeSerializedTimelineTracks,edit.tracks as unknown as NativeSerializedTimelineTracks))required.add(mediaId);}catch{throw new ConflictError('场景轨道结构无效');}
          }
          for(const ref of prior.referenceEditor.mediaRefs.filter(ref=>required.has(ref.mediaId))){
            if(!deps.readNativeEditorMedia){if(media.some(m=>m.mediaId===ref.mediaId))continue;throw new UnsupportedOperationError('production.editor.native-media-read');}
            const exact=await deps.readNativeEditorMedia(ctx,{projectId,assetId:ref.assetId,assetFileId:ref.assetFileId},transaction);
            const probe=media.find(m=>m.mediaId===ref.mediaId);
            if(probe){if(exact.kind!=='video')throw new ConflictError('原片媒体类型已变化');continue;}
            media.push({mediaId:ref.mediaId,...exact});
          }
          const next=applyNativeEditorEdits(current,body.edits,media);
          return checkReferenceMedia(ctx,projectId,next,transaction,current);
        }
        if(current?.editorVersion===2){const next=applyV2EditorEdits(productionPlanV2.parse(current),body.edits,()=>deps.nextId("clip"),value=>mediaLineage.push(value));await checkNewMedia(ctx,projectId,current,next,transaction);return next;}
        if(current?.editorVersion!==1)throw new ConflictError("请先保存制作方案，再编辑片段");
        const next=applyEditorEdits(current as EditorPlan,body.edits,()=>deps.nextId("item"));
        await checkNewMedia(ctx,projectId,current,next,transaction);return next;
      });
    },
    async restoreEditor(ctx,outputId,input) {
      const body=productionEditorRestoreBody.parse(input), repo=editorFor(ctx);
      const historical=await repo.version(outputId,body.sourceRevision);
      return repo.commit(outputId,{...body,source:"restore",restoreSourceRevision:body.sourceRevision,requestDigest:itemDigest({op:"restore",body})},async(current,projectId,transaction)=>{
        if(historical.plan.editorVersion===3)return checkReferenceMedia(ctx,projectId,historical.plan,transaction,historical.plan);
        if(historical.plan.editorVersion===2){
          const restored=productionPlanV2.parse(structuredClone(historical.plan));mapMainTrack(restored.mainTrack);return restored;
        }
        if(current?.editorVersion===2)throw new ConflictError("历史方案没有主轨，请先明确转换后再恢复");
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
        if(plan.editorVersion===2){
          const exact=await deps.readEditorOverlayBindings?.(ctx,{outputId,revision:body.revision,planDigest:itemDigest(plan)},transaction)??[],compiled=compileV2RenderablePlan(productionPlanV2.parse(plan),exact);
          if(!deps.assertEditorAsset)throw new UnsupportedOperationError("production.editor.asset-validation");
          const unavailable=new Set<string>(),verified:typeof compiled.mediaBindings=[];
          for(const binding of compiled.mediaBindings){try{await deps.assertEditorAsset(ctx,{projectId,...binding},transaction);verified.push(binding);}catch(error){const code=(error as {code?:string}).code;if(!binding.role||![ErrorCode.ConflictError,'ENOENT','NoSuchKey','NotFound'].includes(code??''))throw error;unavailable.add(binding.mountAs);}}
          const precise=new Set(compiled.mediaBindings.map(b=>b.mountAs)),otherFiles=new Set([...compiled.props.broll.map(b=>b.file),...compiled.props.scenes.flatMap(s=>s.cards.filter(c=>c.kind==="image").map(c=>c.kind==="image"?c.file:""))].filter(ref=>!precise.has(ref)));
          for(const assetId of otherFiles){try{await deps.assertEditorAsset(ctx,{projectId,assetId},transaction);}catch(error){const code=(error as {code?:string}).code;if(![ErrorCode.ConflictError,'ENOENT','NoSuchKey','NotFound'].includes(code??''))throw error;unavailable.add(assetId);}}
          if(unavailable.size){compiled.props.broll=compiled.props.broll.filter(b=>!unavailable.has(b.file));compiled.props.scenes=compiled.props.scenes.map(s=>({...s,cards:s.cards.filter(c=>c.kind!=='image'||!unavailable.has(c.file))}));}
          return executionTaskSpec.parse({taskType:"video.render",goal:`生成视频：${compiled.props.meta.title}`,
            inputs:[...verified.map(b=>({assetId:b.assetId,assetFileId:b.assetFileId,fileDigest:b.fileDigest,mountAs:b.mountAs})),...Array.from(otherFiles).filter(assetId=>!unavailable.has(assetId)).map(assetId=>({assetId,mountAs:assetId}))],params:{props:compiled.props},constraints:{timeoutSec:null,network:"deny",maxOutputMB:512}});
        }
        const prepared=prepareEditorPlan(plan);
        // 所有输入真实读取；渲染的是历史版本，素材不因新草稿而被替换。
        if(!deps.assertEditorAsset)throw new UnsupportedOperationError("production.editor.asset-validation");
        for(const assetId of mediaRefs(prepared))await deps.assertEditorAsset(ctx,{projectId,assetId},transaction);
        return executionTaskSpec.parse({taskType:"video.render",goal:`生成视频：${prepared.renderProps.meta.title}`,
          inputs:[...mediaRefs(prepared)].map(assetId=>({assetId,mountAs:assetId})),params:{props:compileV1RenderProps(prepared.renderProps)},
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
      const repo=repoFor(ctx),existing=await repo.findProductionByOutput(outputId);
      if(existing)return existing;
      await assertWritableWorkspace(deps.db,ctx);
      return repo.ensureProductionForOutput(outputId);
    },

    async updateProduction(ctx, outputId, patch) {
      await assertWritableWorkspace(deps.db,ctx);
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
          if([1,2,3].includes(Number(incoming.editorVersion)))throw new ConflictError("请使用保存制作方案，避免覆盖已保存版本");
          const expectedRevision=editorRevision(incoming);
          await editorFor(ctx).commit(outputId,{expectedRevision,requestId:legacyRequest(ctx,patch),requestDigest:itemDigest({op:"legacy-put",body:patch}),source:"legacy",productionPatch:validatePatch},async current=>{
            if(current&&[1,2,3].includes(Number(current.editorVersion)))throw new ConflictError("请在制作工作台保存当前方案");
            return incoming;
          });
          return repo.getProductionByOutput(outputId);
        }
      }
      return repo.updateProduction(production.id, validatePatch(production));
    },

    async confirmEditingPlan(ctx, outputId, body) {
      await assertWritableWorkspace(deps.db,ctx);
      const repo = repoFor(ctx);
      await repo.getProductionByOutput(outputId);
      await editorFor(ctx).commit(outputId,{expectedRevision:body.expectedRevision,requestId:legacyRequest(ctx,body),requestDigest:itemDigest({op:"legacy-confirm",body}),source:"legacy"},async current=>{
        if(current&&[1,2,3].includes(Number(current.editorVersion)))throw new ConflictError("请在制作工作台保存当前方案，避免旧分场覆盖片段修改");
        return body.plan;
      });
      return repo.getProductionByOutput(outputId);
    },

    async removeEditingPlanBroll(ctx, outputId, body) {
      await assertWritableWorkspace(deps.db,ctx);
      const repo = repoFor(ctx);
      await repo.getProductionByOutput(outputId);
      await editorFor(ctx).commit(outputId,{expectedRevision:body.expectedRevision,requestId:legacyRequest(ctx,body),requestDigest:itemDigest({op:"legacy-remove",body}),source:"legacy"},async plan=>{
      if(!plan)throw new ConflictError("当前没有可编辑的已确认分镜，请刷新后重新分场");
      if([1,2,3].includes(Number(plan.editorVersion)))throw new ConflictError("请在工作台选中要移除的片段");
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
