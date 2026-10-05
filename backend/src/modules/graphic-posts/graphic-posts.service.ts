import {aiTasks,projects as projectionProjects} from "@creatoros/backend";
import type {WorkspaceWriteTx} from "../../workspace-write";
import {workspaceFilter,workspaceStamp,workspaceKey} from "../../workspace-scope";
import {withWorkspaceWrite} from "../../workspace-write";
import {optionalScriptContext,optionalProjectImageLibrary,type ProjectScriptSourcePorts } from "../projects/project-script-source.port";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, type Db, requireAccountId } from "@creatoros/backend";
import {
  projectImageSource,outputConversionContext,type OutputConversionContext,
  workCommitReceipt,type WorkCommitReceipt,ErrorCode,graphicPostCardBriefs,type GraphicPostTextValue, graphicPostDocument, graphicPostTextKind, graphicPostSourceRef,
  type GraphicPostDocument, type GraphicPostResource, type GraphicPostSourceRef,
  type GraphicPostTextCandidate, type GraphicPostTextKind,
  type GraphicPostWriteResult, type RequestContext,
} from "@creatoros/contract";
import type {FrozenConversionSource} from "../creative-results/conversion-source.service";
import type { ProjectsService } from "../projects";
import type { ArtifactsService } from "../artifacts";
import { graphicPostAnchors, graphicPostTextCandidates } from "./graphic-posts.schema";

class GraphicPostConflict extends Error { readonly code = ErrorCode.ConflictError; }
class GraphicPostValidation extends Error { readonly code = ErrorCode.ValidationError; }
class GraphicPostOwnership extends Error { readonly code = ErrorCode.OwnershipError; }

// SEMANTIC_BOUNDARY_ALLOW: 只按明确字段核验值类型和稳定身份，不选择卡片内容。
function parseTextCandidateValue(kind:GraphicPostTextKind,value:unknown):GraphicPostTextValue {
  return kind==="cardBriefs"?graphicPostCardBriefs.parse(value):kind==="tags"?graphicPostDocument.shape.tags.parse(value):graphicPostDocument.shape.title.parse(value);
}

export const emptyGraphicPostDocument = (): GraphicPostDocument => ({
  schemaVersion: 1, title: "", body: "", summary: "", tags: [],
  imageUses: [], sourceRefs: [], ruleSnapshotRef: null,
});

function sourceRefKey(ref: GraphicPostSourceRef): string {
  // SEMANTIC_BOUNDARY_ALLOW: Exact reference identity only; no content or creative matching.
  return JSON.stringify(ref);
}

function mergeSourceRefs(prior: GraphicPostSourceRef[], incoming: GraphicPostSourceRef[]): GraphicPostSourceRef[] {
  const seen = new Set<string>();
  return [...prior, ...incoming].filter(ref => {
    const key = sourceRefKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function digest(value: unknown): string {
  // SEMANTIC_BOUNDARY_ALLOW: This digest is only an idempotency identity; it does not choose creative content.
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export interface GraphicPostPeerPorts extends ProjectScriptSourcePorts {
  resumeGeneration?: (ctx:RequestContext,input:{taskId:string;clientRequestId:string})=>Promise<{id:string}>;
  resolveConversionSource?: (ctx:RequestContext,input:OutputConversionContext)=>Promise<FrozenConversionSource>;
  findGenerationByAttempt?: (ctx:RequestContext,attemptId:string)=>Promise<{id:string;status:string;inputData:Record<string,unknown>}|null>;
  assertWorkSource?: (ctx:RequestContext,source:Extract<GraphicPostSourceRef,{kind:"moments_version"|"work_basis_version"}>,projectId:string)=>Promise<void>;
  assertOutputVersionSource?: (ctx: RequestContext, source: Extract<GraphicPostSourceRef,{kind:"output_version"}>, projectId: string) => Promise<void>;
  projects(db: Db): Pick<ProjectsService, "getProject" | "getOutput" | "createOutput">;
  artifacts(db: Db): Pick<ArtifactsService,
    "getArtifact" | "createArtifact" | "createVersion" | "listVersions" | "getVersionByAdoptionReceipt">;
  assertAssetFile(ctx: RequestContext, assetId: string, assetFileId: string, active: boolean): Promise<void>;
  /** Optional until the intelligence service exposes an immutable, account-scoped source reader. */
  assertIntelligenceSourceRef?: (ctx: RequestContext, ref: GraphicPostSourceRef) => Promise<void>;
  /** Optional until positioning exposes an account-scoped version reader. */
  assertRuleSnapshotRef?: (ctx: RequestContext, versionId: string) => Promise<void>;
  /** Submit only to a registered AI worker; no local fallback text is generated here. */
  submitTextGeneration?: (ctx: RequestContext, input: {
    attemptId: string; projectId: string; inputData: Record<string, unknown>;
  }) => Promise<{id: string; status: string}>;
  readTextGeneration?: (ctx: RequestContext, taskId: string) => Promise<{
    taskType: string; status: string; inputData: Record<string, unknown>;executionTaskId?:string|null;
    results: Array<{resultType: string; resultData: Record<string, unknown>}>;
  }>;
  resolveSourceItem?: (ctx: RequestContext, sourceItemId: string) => Promise<{
    ref: GraphicPostSourceRef; label: string; text: string;
  } | null>;
  resolveCurrentRules?: (ctx: RequestContext, projectId: string) => Promise<{
    versionId: string; guidance: string;
  } | null>;
}

export interface GraphicPostsService {
  findOutputByCreationRequest(ctx: RequestContext, clientRequestId: string): Promise<Awaited<ReturnType<ProjectsService["getOutput"]>> | null>;
  createOutput(ctx: RequestContext, projectId: string, input: {
    title: string; targetPlatform?: string; clientRequestId: string;
  }): Promise<Awaited<ReturnType<ProjectsService["createOutput"]>>>;
  getGraphicPost(ctx: RequestContext, outputId: string): Promise<GraphicPostResource>;
  getVersion(ctx: RequestContext, outputId: string, versionId: string): Promise<GraphicPostWriteResult>;
  saveReceipt(ctx:RequestContext,outputId:string,input:Parameters<GraphicPostsService["createVersion"]>[2]):Promise<WorkCommitReceipt>;
  createVersion(ctx: RequestContext, outputId: string, input: {
    expectedCurrentVersionId: string; document: GraphicPostDocument; clientRequestId: string;
  }): Promise<GraphicPostWriteResult>;
  generateTextCandidate(ctx: RequestContext, outputId: string, input: {
    kind: GraphicPostTextKind; clientRequestId: string; sourceItemId?: string;conversion?:OutputConversionContext;
    ruleOverrides?: Record<string, unknown>; targetPlatform?: string | null;
  }): Promise<{taskId: string; candidateId: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled"}>;
  getTextCandidate(ctx: RequestContext, candidateId: string): Promise<GraphicPostTextCandidate>;
  adoptTextCandidate(ctx: RequestContext, candidateId: string, input: {
    kind: GraphicPostTextKind; expectedCurrentVersionId: string;
    editedValue: GraphicPostTextValue; clientRequestId: string;
  }): Promise<GraphicPostWriteResult>;
  retryFrozenTextCandidate(ctx: RequestContext, oldCandidateId: string, clientRequestId: string): Promise<{
    taskId: string; candidateId: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    baseVersionId: string; sourceRefs: GraphicPostSourceRef[];
    ruleSnapshotRef: {versionId: string} | null;
    appliedRules: "applied" | "not_applied";
  }>;
}

export function createGraphicPostsService(db: Db, deps: GraphicPostPeerPorts & {
  now: () => string;
}): GraphicPostsService {
  const scope = (ctx:RequestContext)=>({userId:ctx.userId,...workspaceStamp(workspaceKey(ctx))});

  async function projectionOwner(tx:WorkspaceWriteTx,ctx:RequestContext,taskId:string,projectId:string,input:Record<string,unknown>,kind:string){
    const [parent]=await tx.select().from(projectionProjects).where(and(eq(projectionProjects.id,projectId),eq(projectionProjects.userId,ctx.userId),workspaceFilter(projectionProjects,ctx))).for('update');
    if(!parent)throw Error('候选原父归属已改变');
    const [original]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,taskId),eq(aiTasks.userId,ctx.userId))).for('share');
    if(!original){if(ctx.groupId)throw Error('候选缺少原真实冻结任务');return workspaceStamp(workspaceKey(ctx));}
    if(original.taskType!==kind||original.projectId!==projectId||!isDeepStrictEqual(original.inputData,input))throw Error('候选原冻结输入不符');
    if(original.groupId!==null){if(original.groupId!==parent.groupId)throw Error('候选原冻结组与父归属不符');return workspaceStamp(workspaceKey(original));}
    if(!original.accountId||parent.accountId!==original.accountId||(parent.groupId!==null&&parent.groupId!==`grp_legacy_${original.accountId}`))throw Error('旧候选缺少可证明的原账号父归属');
    // SEMANTIC_BOUNDARY_ALLOW: 旧物理父链证明归属；不凭当前member猜组、不重签原AI freeze。
    return{groupId:parent.groupId,accountId:original.accountId};
  }
  async function anchor(ctx: RequestContext, outputId: string) {
    const owner = scope(ctx);
    const output = await deps.projects(db).getOutput(ctx, outputId);
    if (output.contentType !== "image") throw new GraphicPostOwnership("图文作品不存在");
    const [row] = await db.select().from(graphicPostAnchors).where(and(
      eq(graphicPostAnchors.outputId, outputId), eq(graphicPostAnchors.userId, owner.userId),
      workspaceFilter(graphicPostAnchors,ctx),
    ));
    if (!row || row.projectId !== output.projectId) throw new GraphicPostOwnership("图文作品不存在");
    const artifact = await deps.artifacts(db).getArtifact(ctx, row.artifactId);
    if (artifact.artifactType !== "graphic_post" || artifact.projectId !== row.projectId || artifact.contentOutputId !== outputId) {
      throw new GraphicPostConflict("图文稿锚点不一致");
    }
    return { row, output, artifact };
  }

  async function documentFor(ctx: RequestContext, outputId: string, versionId?: string): Promise<GraphicPostWriteResult> {
    const { artifact } = await anchor(ctx, outputId);
    const versions = await deps.artifacts(db).listVersions(ctx, artifact.id);
    const version = versions.find(v => v.id === (versionId ?? artifact.currentVersionId));
    if (!version) throw new GraphicPostOwnership("图文稿版本不存在");
    return { versionId: version.id, document: graphicPostDocument.parse(version.contentData) };
  }

  async function assertDocument(ctx: RequestContext, projectId: string, doc: GraphicPostDocument, prior?: GraphicPostDocument,validatedImageFiles?:ReadonlySet<string>) {
    if(doc.seriesProfile?.referenceImage){
      const ref=doc.seriesProfile.referenceImage;
      // SEMANTIC_BOUNDARY_ALLOW: exact account/file ownership only, not style matching.
      if(!isDeepStrictEqual(ref,prior?.seriesProfile?.referenceImage))await deps.assertAssetFile(ctx,ref.assetId,ref.assetFileId,true);
    }
    for(const design of doc.designs??[]){
      if(design.target.kind==='card'&&!doc.cardBriefs?.some(card=>card.cardId===(design.target as {cardId:string}).cardId))throw new GraphicPostValidation('请先保留、解除或改绑该图卡设计');
      const previous=prior?.designs?.find(old=>old.target.kind===design.target.kind&&(old.target.kind==='cover'||(design.target.kind==='card'&&old.target.cardId===design.target.cardId)));
      for(const ref of design.document.mediaRefs){
        const unchanged=previous?.document.mediaRefs.some(old=>old.mediaId===ref.mediaId&&old.assetId===ref.assetId&&old.assetFileId===ref.assetFileId);
        if(!unchanged)await deps.assertAssetFile(ctx,ref.assetId,ref.assetFileId,true);
      }
    }
    if (doc.tags.some(tag => !tag.trim()) || new Set(doc.tags).size !== doc.tags.length) {
      throw new GraphicPostValidation("标签不能为空或重复");
    }
    if(doc.metadataSource&&!isDeepStrictEqual(doc.metadataSource,prior?.metadataSource)){
      if(!deps.assertScriptMetadataSource)throw new GraphicPostValidation("当前无法核验元数据来源，请重新读取脚本发布物料。");
      await deps.assertScriptMetadataSource(ctx,doc.metadataSource,projectId);
    }
    if (doc.imageUses.some((use, index) => use.order !== index) || doc.imageUses.filter(use => use.role === "cover").length > 1) {
      throw new GraphicPostValidation("图片顺序或封面选择无效");
    }
    const cardBindings=new Set<string>();
    for (const use of doc.imageUses) {
      // SEMANTIC_BOUNDARY_ALLOW: 仅落实用户明确图卡ID，不按顺序、名称或内容推断配图。
      if(use.cardId!==undefined){
        if(use.role!=="card"||cardBindings.has(use.cardId))throw new GraphicPostValidation("图卡配图身份或数量无效");cardBindings.add(use.cardId);
        if(!doc.cardBriefs?.some(card=>card.cardId===use.cardId)){
          const historical=prior?.imageUses.some(old=>old.role===use.role&&old.cardId===use.cardId&&old.assetId===use.assetId&&old.assetFileId===use.assetFileId);
          const wasValid=prior?.cardBriefs?.some(card=>card.cardId===use.cardId);
          if(!historical||wasValid)throw new GraphicPostValidation("请明确解除或改绑图卡配图后再删除该图卡");
        }
      }
      // Historical file references stay immutable and can survive a later asset removal.
      const unchanged = prior?.imageUses.some(old => old.role === use.role && old.cardId === use.cardId && old.assetId === use.assetId && old.assetFileId === use.assetFileId);
      if (!unchanged&&!validatedImageFiles?.has(JSON.stringify([use.assetId,use.assetFileId]))) await deps.assertAssetFile(ctx, use.assetId, use.assetFileId, true);
    }
    const locations = [{refs: doc.sourceRefs, priorRefs: prior?.sourceRefs},
      ...(doc.cardBriefs ?? []).map(card => ({refs: card.sourceRefs,
        priorRefs: prior?.cardBriefs?.find(old => old.cardId === card.cardId)?.sourceRefs}))];
    // SEMANTIC_BOUNDARY_ALLOW: 只按明确图卡 ID 分隔引用身份与历史豁免，不归类内容。
    for (const location of locations) {
      const seen = new Set<string>();
      for (const ref of location.refs) {
        const key = sourceRefKey(ref);
        if (seen.has(key)) throw new GraphicPostValidation("来源引用重复");
        seen.add(key);
        if (location.priorRefs?.some(old => sourceRefKey(old) === key)) continue;
        if (ref.kind === "project") {
          const project = await deps.projects(db).getProject(ctx, ref.id);
          if (project.id !== projectId) throw new GraphicPostOwnership("来源项目不属于当前图文稿");
          if (project.updatedAt !== ref.versionId) throw new GraphicPostConflict("来源项目版本已变化");
        } else if (ref.kind === "asset") {
          await deps.assertAssetFile(ctx, ref.id, ref.versionId, true);
        } else if (ref.kind === "project_script") {
          if (!deps.assertProjectScriptSource) throw new GraphicPostValidation("当前无法核验主脚本来源版本");
          await deps.assertProjectScriptSource(ctx, ref, projectId);
        } else if (ref.kind === "output_version") {
          if (!deps.assertOutputVersionSource) throw new GraphicPostValidation("当前无法核验作品来源版本");
          await deps.assertOutputVersionSource(ctx, ref, projectId);
        } else if(ref.kind==="moments_version"||ref.kind==="work_basis_version"){
          if(!deps.assertWorkSource)throw new GraphicPostValidation("当前无法核验组合来源版本");await deps.assertWorkSource(ctx,ref,projectId);
        } else {
          if (!deps.assertIntelligenceSourceRef) throw new GraphicPostValidation("当前无法核验雷达来源");
          await deps.assertIntelligenceSourceRef(ctx, ref);
        }
      }
    }
    if (doc.ruleSnapshotRef && doc.ruleSnapshotRef.versionId !== prior?.ruleSnapshotRef?.versionId) {
      if (!deps.assertRuleSnapshotRef) throw new GraphicPostValidation("当前无法核验定位规则版本");
      await deps.assertRuleSnapshotRef(ctx, doc.ruleSnapshotRef.versionId);
    }
  }

  return {
    async findOutputByCreationRequest(ctx, clientRequestId) {
      const owner = scope(ctx);
      const rows = await db.select().from(graphicPostAnchors).where(and(
        eq(graphicPostAnchors.userId, owner.userId), workspaceFilter(graphicPostAnchors,ctx),
        eq(graphicPostAnchors.clientRequestId, clientRequestId),
      ));
      if(rows.length>1)throw new GraphicPostConflict("原创建请求存在多个账号来源，请以真实作品ID读取");const row=rows[0];return row ? (await anchor(ctx, row.outputId)).output : null;
    },
    async createOutput(ctx, projectId, input) {
      const owner = scope(ctx);
      if (!input.clientRequestId || input.clientRequestId.length < 8 || input.clientRequestId.length > 128) {
        throw new GraphicPostValidation("创建请求标识无效");
      }
      if (input.targetPlatform && input.targetPlatform !== "xiaohongshu") {
        throw new GraphicPostValidation("所选平台当前不支持图文作品");
      }
      const requestDigest = digest({projectId, title: input.title, targetPlatform: input.targetPlatform ?? null});
      const oldRows = await db.select().from(graphicPostAnchors).where(and(
        eq(graphicPostAnchors.userId, owner.userId), workspaceFilter(graphicPostAnchors,ctx),
        eq(graphicPostAnchors.clientRequestId, input.clientRequestId),
      ));
      if(oldRows.length>1)throw new GraphicPostConflict("原创建请求存在多个账号来源，请以真实作品ID读取");const old=oldRows[0];
      if (old) {
        if (old.requestDigest !== requestDigest) throw new GraphicPostConflict("同一创建请求不能修改作品内容");
        await anchor(ctx, old.outputId);
        return deps.projects(db).getOutput(ctx, old.outputId);
      }
      try { return await withWorkspaceWrite(db,ctx,async tx => {
        const txDb = tx as unknown as Db;
        await deps.projects(txDb).getProject(ctx, projectId, true);
        const output = await deps.projects(txDb).createOutput(ctx, projectId, {
          title: input.title, contentType: "image", targetPlatform: input.targetPlatform,
        });
        const artifact = await deps.artifacts(txDb).createArtifact(ctx, {
          projectId, contentOutputId: output.id, title: input.title, artifactType: "graphic_post", stage: "script",
          initialContentData: emptyGraphicPostDocument(),
        });
        await tx.insert(graphicPostAnchors).values({
          outputId: output.id, projectId, userId: owner.userId, ...workspaceStamp(workspaceKey(ctx)),
          artifactId: artifact.id, clientRequestId: input.clientRequestId,
          requestDigest, createdAt: deps.now(),
        });
        return output;
      }); } catch (error) {
        // A concurrent retry may have committed the same request while this transaction lost the unique race.
        const [winner] = await db.select().from(graphicPostAnchors).where(and(
          eq(graphicPostAnchors.userId, owner.userId), workspaceFilter(graphicPostAnchors,ctx),
          eq(graphicPostAnchors.clientRequestId, input.clientRequestId),
        ));
        if (!winner) throw error;
        if (winner.requestDigest !== requestDigest) throw new GraphicPostConflict("同一创建请求不能修改作品内容");
        await anchor(ctx, winner.outputId);
        return deps.projects(db).getOutput(ctx, winner.outputId);
      }
    },
    async getGraphicPost(ctx, outputId) {
      const { row, output, artifact } = await anchor(ctx, outputId);
      const versions = await deps.artifacts(db).listVersions(ctx, artifact.id);
      const current = await documentFor(ctx, outputId);
      const scriptContext=await optionalScriptContext(ctx,row.projectId,deps);
      return {
        ...(scriptContext?{scriptContext}:{}),projectId: row.projectId, outputId, targetPlatform: output.targetPlatform as GraphicPostResource["targetPlatform"],
        artifactId: artifact.id, currentVersionId: current.versionId, current: current.document,
        versions: versions.map(v => ({id: v.id, versionNumber: v.versionNumber, createdAt: v.createdAt, changeSummary: v.changeSummary})),
      };
    },
    getVersion: documentFor,
    async saveReceipt(ctx,outputId,input){
      const {artifact}=await anchor(ctx,outputId),sourceDigest=digest({outputId, expectedCurrentVersionId: input.expectedCurrentVersionId, document: graphicPostDocument.parse(input.document)});
      const receipt=await deps.artifacts(db).getVersionByAdoptionReceipt(ctx,artifact.id,`graphic-post-edit:${input.clientRequestId}`,sourceDigest);
      if(!receipt)throw new GraphicPostOwnership("保存回执不存在");
      return workCommitReceipt.parse({kind:"manual_save",owner:"graphic_post",clientRequestId:input.clientRequestId,requestDigest:receipt.adoptionSourceDigest!.slice(7),committedAt:receipt.createdAt,version:{kind:"artifact",artifactId:artifact.id,versionId:receipt.id}});
    },
    async createVersion(ctx, outputId, input) {
      if (input.clientRequestId.length < 8 || input.clientRequestId.length > 128) throw new GraphicPostValidation("保存请求标识无效");
      const { row, artifact } = await anchor(ctx, outputId);
      const document = graphicPostDocument.parse(input.document);
      const adoptionKey = `graphic-post-edit:${input.clientRequestId}`;
      const sourceDigest = digest({outputId, expectedCurrentVersionId: input.expectedCurrentVersionId, document});
      const receipt = await deps.artifacts(db).getVersionByAdoptionReceipt(ctx, artifact.id, adoptionKey, sourceDigest);
      if (receipt) return {versionId: receipt.id, document: graphicPostDocument.parse(receipt.contentData)};
      const prior = await documentFor(ctx, outputId);
      if (prior.versionId !== input.expectedCurrentVersionId) throw new GraphicPostConflict("图文稿版本已变化，请刷新后再保存");
      await assertDocument(ctx, row.projectId, document, prior.document);
      const version = await deps.artifacts(db).createVersion(ctx, artifact.id, {
        expectedCurrentVersionId: input.expectedCurrentVersionId, contentData: document,
        contentText: [document.title, document.body, document.summary].filter(Boolean).join("\n\n"),
        changeSummary: "编辑图文稿", createdByType: "user", adoptionKey, adoptionSourceDigest: sourceDigest,
      });
      return {versionId: version.id, document: graphicPostDocument.parse(version.contentData)};
    },
    async generateTextCandidate(ctx, outputId, input) {
      if (!deps.submitTextGeneration || !deps.readTextGeneration) {
        const error = new Error("图文单项生成服务尚未接通") as Error & {code: string};
        error.code = "CAPABILITY_UNAVAILABLE";
        throw error;
      }
      graphicPostTextKind.parse(input.kind);
      if (!input.clientRequestId || input.clientRequestId.length < 8 || input.clientRequestId.length > 128) {
        throw new GraphicPostValidation("生成请求标识无效");
      }
      const ruleOverrides = input.ruleOverrides ?? {};
      if (JSON.stringify(ruleOverrides).length > 8192) throw new GraphicPostValidation("本次补充规则过长");
      const { row, artifact, output } = await anchor(ctx, outputId);
      if(input.conversion){
        const conversion=outputConversionContext.parse(input.conversion),request=conversion.request;
        if(request.targetType!=="image" || input.sourceItemId || Object.keys(ruleOverrides).length)
          throw new GraphicPostValidation("转换不能混入其他来源或未冻结规则");
        if(request.mode==="selected" && !request.targetFields.includes(input.kind))throw new GraphicPostValidation("字段未获本次转换授权");
        if(!deps.resolveConversionSource || !deps.findGenerationByAttempt)throw new GraphicPostConflict("转换生成端口尚不可用");
        const result=async(task:{id:string;inputData:Record<string,unknown>})=>{
          if(task.inputData.outputId!==outputId || task.inputData.kind!==input.kind || !isDeepStrictEqual(task.inputData.conversion,conversion))
            throw new GraphicPostConflict("同请求已对应另一转换意图或字段");
          const candidate=await this.getTextCandidate(ctx,task.id);return {taskId:task.id,candidateId:task.id,status:candidate.status};
        };
        const prior=await deps.findGenerationByAttempt(ctx,input.clientRequestId);if(prior)return result(prior);
        const targetPlatform=output.targetPlatform??null;
        if((targetPlatform!==null && targetPlatform!=="xiaohongshu") ||
           (request.targetPlatform!==undefined && request.targetPlatform!==targetPlatform) ||
           (input.targetPlatform!==undefined && input.targetPlatform!==targetPlatform))throw new GraphicPostValidation("转换目标平台与作品不一致");
        const frozen=await deps.resolveConversionSource(ctx,conversion);
        if(frozen.projectId!==row.projectId || !isDeepStrictEqual(frozen.sourceAnchor,conversion.sourceAnchor))throw new GraphicPostOwnership("转换来源不属于当前图文项目");
        const text=JSON.stringify(frozen.content);if(text.length>200000)throw new GraphicPostValidation("转换来源过长，请缩减选区");
        const current=await documentFor(ctx,outputId);
        const taskInput={projectId:row.projectId,outputId,targetPlatform,artifactId:artifact.id,baseVersionId:current.versionId,
          kind:input.kind,brief:"依据冻结作品选区创作指定图文字段",current:current.document,conversion:structuredClone(conversion),
          conversionConstraints:structuredClone(frozen.constraints),sourceRefs:[frozen.sourceAnchor],sourceMaterials:[{ref:frozen.sourceAnchor,label:"已保存作品的选定内容",text}],
          ruleSnapshotRef:null,ruleGuidance:"",ruleOverrides:{}};
        let task:{id:string};
        try{task=await deps.submitTextGeneration(ctx,{attemptId:input.clientRequestId,projectId:row.projectId,inputData:taskInput});}
        catch(error){const winner=await deps.findGenerationByAttempt(ctx,input.clientRequestId);if(winner)return result(winner);throw error;}
        return result({id:task.id,inputData:taskInput});
      }
      const generationIntent = {outputId, kind: input.kind, targetPlatform: input.targetPlatform ?? output.targetPlatform ?? null,
        sourceItemId: input.sourceItemId ?? null, ruleOverrides};
      const priorTask = await deps.findGenerationByAttempt?.(ctx, input.clientRequestId);
      if (priorTask) {
        const frozen = priorTask.inputData;
        const originalIntent = frozen.generationIntent ?? {outputId:frozen.outputId,kind:frozen.kind,targetPlatform:frozen.targetPlatform ?? null,
          sourceItemId: ((frozen.sourceRefs ?? []) as Array<{kind:string;id:string}>).find(ref=>ref.kind==="intelligence")?.id ?? null, ruleOverrides:frozen.ruleOverrides ?? {}};
        if (frozen.conversion || !isDeepStrictEqual(originalIntent, generationIntent)) throw new GraphicPostConflict("同请求已对应另一图文、字段或资料选择");
        const candidate = await this.getTextCandidate(ctx, priorTask.id);
        return {taskId:priorTask.id,candidateId:priorTask.id,status:candidate.status};
      }
      if (input.targetPlatform && output.targetPlatform && input.targetPlatform !== output.targetPlatform) {
        throw new GraphicPostConflict("作品目标平台与生成请求不一致");
      }
      const targetPlatform = input.targetPlatform === undefined ? output.targetPlatform ?? null : input.targetPlatform;
      if (targetPlatform && targetPlatform !== "xiaohongshu") throw new GraphicPostValidation("当前平台不支持图文单项生成");
      const current = await documentFor(ctx, outputId);
      const project = await deps.projects(db).getProject(ctx, row.projectId);
      const projectRef: GraphicPostSourceRef = {kind: "project", id: row.projectId, versionId: project.updatedAt};
      const sourceRefs: GraphicPostSourceRef[] = [projectRef];
      const sourceMaterials: Array<{ref:GraphicPostSourceRef;label:string;text:string}> = [{ref: projectRef, label: "当前项目", text: [project.title, project.brief, JSON.stringify(project.briefDetail ?? {})].filter(Boolean).join("\n")}];
      const mainScript = await deps.readProjectScript?.(ctx, row.projectId);
      if (mainScript) {sourceRefs.push(mainScript.ref);sourceMaterials.push(mainScript);}
      if (input.sourceItemId) {
        if (!deps.resolveSourceItem) throw new GraphicPostValidation("当前无法读取雷达来源");
        const source = await deps.resolveSourceItem(ctx, input.sourceItemId);
        if (!source?.text.trim()) throw new GraphicPostValidation("所选雷达来源缺少可用正文");
        if (source.ref.kind !== "intelligence" || source.ref.id !== input.sourceItemId) throw new GraphicPostConflict("雷达来源回执不一致");
        sourceRefs.push(source.ref);
        sourceMaterials.push(source);
      }
      const rules = deps.resolveCurrentRules ? await deps.resolveCurrentRules(ctx, row.projectId) : null;
      const ruleSnapshotRef = rules ? {versionId: rules.versionId} : null;
      const task = await deps.submitTextGeneration(ctx, {attemptId: input.clientRequestId, projectId: row.projectId, inputData: {
        projectId: row.projectId, outputId, targetPlatform,
        artifactId: artifact.id, baseVersionId: current.versionId,
        kind: input.kind, brief: project.brief.trim() || project.title, current: current.document, generationIntent,
        editingInstruction: mainScript ? "以已保存主脚本或大纲为依据扩写、润色并补充图文结构，保留事实边界和人工稿；正文与图卡沿用已有标题、简介及标签，仅生成候选。" : "依据项目简介及所选资料生成指定图文字段候选。",
        ...(input.kind==="cardBriefs"?await optionalProjectImageLibrary(ctx,row.projectId,deps):{}),
        sourceRefs, sourceMaterials, ruleSnapshotRef, ruleGuidance: rules?.guidance ?? "", ruleOverrides,
      }});
      if (task.status === "awaiting_confirmation") {
        const ready = await this.getTextCandidate(ctx, task.id);
        if (ready.status !== "succeeded") throw new GraphicPostConflict("图文候选任务未形成有效回执");
        return {taskId: task.id, candidateId: task.id, status: "succeeded" as const};
      }
      const status = task.status as "queued" | "running" | "succeeded" | "failed" | "cancelled";
      if (!["queued", "running", "succeeded", "failed", "cancelled"].includes(status)) throw new GraphicPostConflict("图文生成任务状态无效");
      return {taskId: task.id, candidateId: task.id, status};
    },
    async getTextCandidate(ctx, candidateId) {
      const owner = scope(ctx);
      const [saved] = await db.select().from(graphicPostTextCandidates).where(and(
        eq(graphicPostTextCandidates.id, candidateId), eq(graphicPostTextCandidates.userId, owner.userId),
        workspaceFilter(graphicPostTextCandidates,ctx),
      ));
      if (saved) {
        await anchor(ctx, saved.outputId);
        return {candidateId, outputId: saved.outputId, kind: graphicPostTextKind.parse(saved.kind),
          status: "succeeded" as const, value: parseTextCandidateValue(graphicPostTextKind.parse(saved.kind),saved.value), baseVersionId: saved.baseVersionId,
          sourceRefs: graphicPostSourceRef.array().parse(saved.sourceRefs),
          ruleSnapshotRef: saved.ruleSnapshotRef as GraphicPostTextCandidate["ruleSnapshotRef"],
          appliedRules: saved.appliedRules as GraphicPostTextCandidate["appliedRules"]};
      }
      if (!deps.readTextGeneration) {
        const error = new Error("图文单项生成服务尚未接通") as Error & {code: string};
        error.code = "CAPABILITY_UNAVAILABLE";
        throw error;
      }
      const generation = await deps.readTextGeneration(ctx, candidateId);
      if (generation.taskType !== "graphic.post-text") throw new GraphicPostOwnership("图文候选不存在");
      const taskInput = generation.inputData;
      const outputId = String(taskInput.outputId ?? "");
      const { row, artifact, output } = await anchor(ctx, outputId);
      if (taskInput.projectId !== row.projectId || taskInput.artifactId !== artifact.id ||
        (output.targetPlatform && taskInput.targetPlatform !== output.targetPlatform) ||
        (taskInput.targetPlatform !== null && taskInput.targetPlatform !== "xiaohongshu")) {
        throw new GraphicPostOwnership("图文候选归属不一致");
      }
      const kind = graphicPostTextKind.parse(taskInput.kind);
      const baseVersionId = String(taskInput.baseVersionId ?? "");
      if (!(await deps.artifacts(db).listVersions(ctx, artifact.id)).some(v => v.id === baseVersionId)) {
        throw new GraphicPostConflict("图文候选基准版本不存在");
      }
      const sourceRefs = graphicPostSourceRef.array().parse(taskInput.sourceRefs ?? []);
      const ruleSnapshotRef = taskInput.ruleSnapshotRef == null ? null :
        graphicPostDocument.shape.ruleSnapshotRef.parse(taskInput.ruleSnapshotRef);
      const appliedRules = ruleSnapshotRef || (taskInput.ruleOverrides && typeof taskInput.ruleOverrides === "object" &&
        Object.keys(taskInput.ruleOverrides).length > 0) ? "applied" as const : "not_applied" as const;
      const taskStatus = generation.status;
      if (taskStatus !== "succeeded" && taskStatus !== "awaiting_confirmation") {
        if (!["queued", "running", "failed", "cancelled"].includes(taskStatus)) throw new GraphicPostConflict("图文候选任务状态无效");
        return {candidateId, outputId, kind, status: taskStatus as "queued" | "running" | "failed" | "cancelled",
          value: null, baseVersionId, sourceRefs, ruleSnapshotRef, appliedRules};
      }
      const result = generation.results.find(v => v.resultType === "graphic_post_text_candidate");
      if (!result || result.resultData.kind !== kind) throw new GraphicPostConflict("生成任务缺少图文候选回执");
      const value = parseTextCandidateValue(kind,result.resultData.value);
      if(kind==="cardBriefs"){
        const library=projectImageSource.array().parse(taskInput.imageLibrary??[]);
        // SEMANTIC_BOUNDARY_ALLOW: 只核验模型建议的 exact pair 在本轮真实目录，不替模型选图。
        for(const card of graphicPostCardBriefs.parse(value))if(card.proposedImage&&!library.some(image=>image.assetId===card.proposedImage!.assetId&&image.assetFileId===card.proposedImage!.assetFileId))throw new GraphicPostValidation("图卡候选图片不属于本次真实目录。");
      }
      await withWorkspaceWrite(db,ctx,async tx=>{const frozenOwner=await projectionOwner(tx,ctx,candidateId,row.projectId,taskInput,"graphic.post-text");
      await tx.insert(graphicPostTextCandidates).values({
        id: candidateId, outputId, projectId: row.projectId, artifactId: artifact.id,
        userId: owner.userId, ...frozenOwner, baseVersionId, kind,
        value, sourceRefs, ruleSnapshotRef, appliedRules, createdAt: deps.now(),
      }).onConflictDoNothing();
      },{allowArchived:true});
      const [persisted] = await db.select().from(graphicPostTextCandidates).where(and(
        eq(graphicPostTextCandidates.id, candidateId), eq(graphicPostTextCandidates.userId, owner.userId),
        workspaceFilter(graphicPostTextCandidates,ctx),
      ));
      if (!persisted || persisted.outputId !== outputId || persisted.kind !== kind) throw new GraphicPostConflict("图文候选保存冲突");
      return {candidateId, outputId, kind, status: "succeeded" as const, value: parseTextCandidateValue(kind,persisted.value),
        baseVersionId, sourceRefs, ruleSnapshotRef, appliedRules};
    },
    async adoptTextCandidate(ctx, candidateId, input) {
      if (input.clientRequestId.length < 8 || input.clientRequestId.length > 128) throw new GraphicPostValidation("采纳请求标识无效");
      graphicPostTextKind.parse(input.kind);
      const candidate = await this.getTextCandidate(ctx, candidateId);
      if (candidate.status !== "succeeded" || candidate.value == null) throw new GraphicPostConflict("图文候选尚未生成完成");
      if (candidate.kind !== input.kind) throw new GraphicPostConflict("图文候选交付项不一致");
      const { row, artifact } = await anchor(ctx, candidate.outputId);
      const adoptionKey = `graphic-post-candidate:${input.clientRequestId}`;
      const sourceDigest = digest({candidateId, input});
      const receipt = await deps.artifacts(db).getVersionByAdoptionReceipt(ctx, artifact.id, adoptionKey, sourceDigest);
      if (receipt) return {versionId: receipt.id, document: graphicPostDocument.parse(receipt.contentData)};
      const prior = await documentFor(ctx, candidate.outputId, input.expectedCurrentVersionId);
      const generatedFrom = await documentFor(ctx, candidate.outputId, candidate.baseVersionId);
      // SEMANTIC_BOUNDARY_ALLOW: Exact target-field conflict check; this does not judge creative meaning.
      if (!isDeepStrictEqual(input.kind==="cardBriefs"?(prior.document.cardBriefs??[]):prior.document[input.kind],
        input.kind==="cardBriefs"?(generatedFrom.document.cardBriefs??[]):generatedFrom.document[input.kind])) {
        throw new GraphicPostConflict("要采用的字段已修改，请重新生成或审读候选");
      }
      const parsedValue=parseTextCandidateValue(input.kind,input.editedValue);
      const imageUses=prior.document.imageUses.map(image=>({...image}));
      const imageMatchWarnings:string[]=[];
      const validatedImageFiles=new Set<string>();
      let imageSnapshotAvailable=true;
      let editedValue=parsedValue;
      if(input.kind==="cardBriefs"){
        const original=graphicPostCardBriefs.parse(candidate.value),edited=graphicPostCardBriefs.parse(parsedValue);
        if(deps.readProjectImageLibrary||original.some(card=>card.proposedImage)){
          try{const task=await deps.readTextGeneration!(ctx,candidateId);if(typeof task.inputData.imageLibraryMessage==="string")imageMatchWarnings.push(task.inputData.imageLibraryMessage);}
          catch{imageSnapshotAvailable=false;imageMatchWarnings.push("本次配图来源暂不可读取，已跳过新图片；图卡文字已保留。");}
        }
        for(const card of edited){
          const image=card.proposedImage;
          // SEMANTIC_BOUNDARY_ALLOW: 用户可编辑图卡文字或取消建议图，不能把模型已审读文件身份换成另一文件。
          if(image&&!isDeepStrictEqual(image,original.find(value=>value.cardId===card.cardId)?.proposedImage))throw new GraphicPostValidation("采用的配图身份已改变，请在作品中单独换图。");
          if(image&&imageSnapshotAvailable&&!imageUses.some(use=>use.role==="card"&&use.cardId===card.cardId)){
            try{
              if(deps.assertProjectImageFile)await deps.assertProjectImageFile(ctx,image.assetId,image.assetFileId,row.projectId);
              else await deps.assertAssetFile(ctx,image.assetId,image.assetFileId,true);
              validatedImageFiles.add(JSON.stringify([image.assetId,image.assetFileId]));
              imageUses.push({...image,role:"card",cardId:card.cardId,order:imageUses.length});
            }catch{imageMatchWarnings.push(`“${card.title||"图卡"}”的匹配图片已不可用，已跳过；图卡文字已保留。`);}
          }
        }
        editedValue=edited.map(card=>{
          const next={...card,sourceRefs:mergeSourceRefs(card.sourceRefs,candidate.sourceRefs)};
          delete next.proposedImage;
          return next;
        });
      }
      const document = graphicPostDocument.parse({...prior.document, [input.kind]: editedValue,
        imageUses,...(input.kind==="cardBriefs"&&(imageMatchWarnings.length||prior.document.imageMatchWarnings!==undefined)?{imageMatchWarnings}:{}),
        sourceRefs: mergeSourceRefs(prior.document.sourceRefs, candidate.sourceRefs),
        ruleSnapshotRef: candidate.ruleSnapshotRef,
      });
      await assertDocument(ctx, row.projectId, document, prior.document,validatedImageFiles);
      const version = await deps.artifacts(db).createVersion(ctx, artifact.id, {
        expectedCurrentVersionId: input.expectedCurrentVersionId, contentData: document,
        contentText: [document.title, document.body, document.summary].filter(Boolean).join("\n\n"),
        changeSummary: `采纳图文${input.kind}候选`, createdByType: "user", adoptionKey,
        adoptionSourceDigest: sourceDigest,
      });
      return {versionId: version.id, document: graphicPostDocument.parse(version.contentData)};
    },
    async retryFrozenTextCandidate(ctx, oldCandidateId, clientRequestId) {
      const readTextGeneration = deps.readTextGeneration;
      const submitTextGeneration = deps.submitTextGeneration;
      if (!readTextGeneration || !submitTextGeneration) {
        const error = new Error("图文单项生成服务尚未接通") as Error & {code: string};
        error.code = "CAPABILITY_UNAVAILABLE";
        throw error;
      }
      if (clientRequestId.length < 8 || clientRequestId.length > 128) throw new GraphicPostValidation("重试请求标识无效");
      const previous = await readTextGeneration(ctx, oldCandidateId);
      if (previous.taskType !== "graphic.post-text" || (!previous.executionTaskId && !["failed", "cancelled"].includes(previous.status))) {
        throw new GraphicPostConflict("只有失败或取消的图文任务可以重试");
      }
      const frozen = previous.inputData;
      const outputId = String(frozen.outputId ?? "");
      const {row, output, artifact} = await anchor(ctx, outputId);
      if (frozen.projectId !== row.projectId || frozen.artifactId !== artifact.id ||
        (output.targetPlatform && frozen.targetPlatform !== output.targetPlatform) ||
        (frozen.targetPlatform !== null && frozen.targetPlatform !== "xiaohongshu")) {
        throw new GraphicPostOwnership("图文任务归属不一致");
      }
      graphicPostTextKind.parse(frozen.kind);
      const baseVersionId = String(frozen.baseVersionId ?? "");
      if (!(await deps.artifacts(db).listVersions(ctx, artifact.id)).some(v => v.id === baseVersionId)) {
        throw new GraphicPostConflict("原图文基准版本已不可用");
      }
      const sourceRefs = graphicPostSourceRef.array().parse(frozen.sourceRefs ?? []);
      const unavailable = (message: string): never => {
        const error = new Error(message) as Error & {code: string};
        error.code = "SOURCE_UNAVAILABLE";
        throw error;
      };
      for (const ref of sourceRefs) {
        try {
          if (ref.kind === "project") {
            const project = await deps.projects(db).getProject(ctx, ref.id);
            if (project.id !== row.projectId || project.updatedAt !== ref.versionId) unavailable("原项目来源版本已变化");
          } else if (ref.kind === "asset") {
            await deps.assertAssetFile(ctx, ref.id, ref.versionId, true);
          } else if (ref.kind === "project_script") {
            if (!deps.assertProjectScriptSource) throw new GraphicPostValidation("当前无法核验原主脚本版本");
            await deps.assertProjectScriptSource(ctx, ref, row.projectId);
          } else if (ref.kind === "output_version") {
            if (!deps.assertOutputVersionSource) throw new GraphicPostValidation("当前无法核验原作品来源版本");
            await deps.assertOutputVersionSource(ctx, ref, output.projectId);
          } else if (ref.kind === "moments_version" || ref.kind === "work_basis_version") {
            if (!deps.assertWorkSource) throw new GraphicPostValidation("当前无法核验原作品依据版本");
            await deps.assertWorkSource(ctx, ref, output.projectId);
          } else {
            const assertIntelligenceSourceRef = deps.assertIntelligenceSourceRef;
            if (!assertIntelligenceSourceRef) throw Object.assign(new Error("当前无法核验原雷达来源"), {code: "SOURCE_UNAVAILABLE"});
            await assertIntelligenceSourceRef(ctx, ref);
          }
        } catch { unavailable("原生成来源已不可用，请重新发起生成"); }
      }
      const ruleSnapshotRef = frozen.ruleSnapshotRef == null ? null :
        graphicPostDocument.shape.ruleSnapshotRef.parse(frozen.ruleSnapshotRef);
      if (ruleSnapshotRef) {
        const assertRuleSnapshotRef = deps.assertRuleSnapshotRef;
        if (!assertRuleSnapshotRef) throw Object.assign(new Error("当前无法核验原规则版本"), {code: "SOURCE_UNAVAILABLE"});
        try { await assertRuleSnapshotRef(ctx, ruleSnapshotRef.versionId); }
        catch { unavailable("原规则版本已不可用，请重新发起生成"); }
      }
      if(previous.executionTaskId&&!deps.resumeGeneration)throw new GraphicPostConflict("原图文持久执行恢复端口尚未接通");
      const task = previous.executionTaskId?await deps.resumeGeneration!(ctx,{taskId:oldCandidateId,clientRequestId}):await submitTextGeneration(ctx, {
        attemptId: clientRequestId, projectId: row.projectId,inputData: structuredClone(frozen),
      });
      if(previous.executionTaskId&&task.id!==oldCandidateId)throw new GraphicPostConflict("原图文恢复不能复制任务");
      const candidate = await this.getTextCandidate(ctx, task.id);
      return {taskId: task.id, candidateId: task.id, status: candidate.status,
        baseVersionId, sourceRefs, ruleSnapshotRef, appliedRules: candidate.appliedRules};
    },
  };
}
