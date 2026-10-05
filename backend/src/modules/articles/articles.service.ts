import { optionalScriptContext,optionalProjectImageLibrary,type ProjectScriptSourcePorts } from "../projects/project-script-source.port";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, type Db, articleAnchors, articleCandidates, requireAccountId } from "@creatoros/backend";
import {
  projectImageSource,workCommitReceipt,type WorkCommitReceipt,articleSourceRef,outputConversionContext,type OutputConversionContext,
  articleCandidateEdits,type ArticleCandidateEdits,articleCandidateProposal, articleDocument, ErrorCode,
  type ArticleCandidate, type ArticleCandidateProposal, type ArticleDocument,
  type ArticleResource, type ArticleSourceRef, type ArticleWriteResult,
  type RequestContext,
} from "@creatoros/contract";
import type {FrozenConversionSource} from "../creative-results/conversion-source.service";
import type { ProjectsService } from "../projects";
import type { ArtifactsService } from "../artifacts";

class ArticleConflict extends Error { readonly code = ErrorCode.ConflictError; }
class ArticleValidation extends Error { readonly code = ErrorCode.ValidationError; }
class ArticleOwnership extends Error { readonly code = ErrorCode.OwnershipError; }

export const emptyArticleDocument = (): ArticleDocument => ({
  schemaVersion: 1, title: "", titleSourceRefs: [], summary: "", summarySourceRefs: [], sections: [], factItems: [], visualBriefs: [], imageUses: [], coverImageUse: null,
});

export function renderArticle(document: ArticleDocument): string {
  return [document.title.trim(), document.summary.trim(),
    ...document.sections.map((section) => [section.heading.trim(), section.body.trim()].filter(Boolean).join("\n\n")),
  ].filter(Boolean).join("\n\n");
}

function digest(value: unknown): string { return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
function unique(values: readonly string[]): boolean { return new Set(values).size === values.length; }

export interface ArticlePeerPorts extends ProjectScriptSourcePorts {
  resumeGeneration?: (ctx:RequestContext,input:{taskId:string;clientRequestId:string})=>Promise<{id:string}>;
  resolveConversionSource?: (ctx:RequestContext,input:OutputConversionContext)=>Promise<FrozenConversionSource>;
  findGenerationByAttempt?: (ctx:RequestContext,attemptId:string)=>Promise<{id:string;status:string;inputData:Record<string,unknown>;retryOfTaskId?:string|null}|null>;
  assertWorkSource?: (ctx:RequestContext,source:Extract<ArticleSourceRef,{kind:"moments_version"|"work_basis_version"}>,projectId:string)=>Promise<void>;
  assertOutputVersionSource?: (ctx: RequestContext, source: Extract<ArticleSourceRef,{kind:"output_version"}>, projectId: string) => Promise<void>;
  projects(db: Db): Pick<ProjectsService, "getProject" | "getOutput" | "createOutput">;
  artifacts(db: Db): Pick<ArtifactsService, "getArtifact" | "createArtifact" | "createVersion" | "listVersions" | "getVersionByAdoptionReceipt">;
  assertAssetFile(ctx: RequestContext, assetId: string, assetFileId: string, active: boolean): Promise<void>;
  resolveDocumentSource(ctx: RequestContext, projectId: string, assetId: string, assetFileId: string): Promise<{label: string; text: string} | null>;
  resolveSelectedBrand(ctx: RequestContext, versionId: string): Promise<{profileId: string; versionId: string; guidance: string} | null>;
  submitGeneration(ctx: RequestContext, input: { attemptId: string; projectId: string; inputData: Record<string, unknown>;retryOfTaskId?:string }): Promise<{ id: string; status: string }>;
  readGeneration(ctx: RequestContext, taskId: string): Promise<{
    taskType: string; status: string; inputData: Record<string, unknown>;executionTaskId?:string|null;
    results: Array<{ resultType: string; resultData: Record<string, unknown> }>;
  }>;
}

export interface ArticleCandidateState {
 status:"queued"|"running"|"succeeded"|"failed"|"cancelled";
 candidate:ArticleCandidate|null;outputId:string;baseVersionId:string;sourceRefs:ArticleSourceRef[];errorCode:string|null;
}

export interface ArticlesService {
  createOutput(ctx: RequestContext, projectId: string, input: {title: string; contentRole?: "traffic" | "trust" | "conversion"; targetPlatform?: string; clientRequestId?: string}): Promise<Awaited<ReturnType<ProjectsService["createOutput"]>>>;
  findOutputByCreationRequest(ctx: RequestContext, clientRequestId: string): Promise<Awaited<ReturnType<ProjectsService["getOutput"]>> | null>;
  getArticle(ctx: RequestContext, outputId: string): Promise<ArticleResource>;
  getVersion(ctx: RequestContext, outputId: string, versionId: string): Promise<ArticleWriteResult>;
  saveReceipt(ctx:RequestContext,outputId:string,input:Parameters<ArticlesService["createVersion"]>[2]):Promise<WorkCommitReceipt>;
  createVersion(ctx: RequestContext, outputId: string, input: {expectedCurrentVersionId: string; document: ArticleDocument; clientRequestId: string}): Promise<ArticleWriteResult>;
  generateCandidate(ctx: RequestContext, outputId: string, clientRequestId: string, brandProfileVersionId?: string,
    sourceAssets?: Array<{assetId: string; assetFileId: string}>,conversion?:OutputConversionContext): Promise<{taskId: string; candidateId: string; status: "queued" | "running" | "awaiting_confirmation" | "succeeded" | "failed" | "cancelled"}>;
  getCandidate(ctx: RequestContext, candidateId: string): Promise<ArticleCandidate>;
  readCandidateState(ctx:RequestContext,candidateId:string):Promise<ArticleCandidateState>;
  retryFrozenCandidate(ctx:RequestContext,candidateId:string,clientRequestId:string):Promise<{candidateId:string;taskId:string;status:ArticleCandidateState["status"];baseVersionId:string;sourceRefs:ArticleSourceRef[];ruleSnapshotRef:null;appliedRules:"not_applied"}>;
  adoptCandidate(ctx: RequestContext, candidateId: string, input: {expectedCurrentVersionId: string; selectedSectionIds: string[]; selectedMetadataFields: Array<"title" | "summary" | "factItems">; clientRequestId: string} & ArticleCandidateEdits): Promise<ArticleWriteResult>;
}

export function createArticlesService(db: Db, deps: ArticlePeerPorts & {now: () => string; nextId: (prefix: string) => string}): ArticlesService {
  const scope = (ctx: RequestContext) => ({userId: ctx.userId, accountId: requireAccountId(ctx.accountId, "articles")});
  async function anchor(ctx: RequestContext, outputId: string) {
    const owner = scope(ctx);
    const output = await deps.projects(db).getOutput(ctx, outputId);
    if (output.contentType !== "article") throw new ArticleOwnership("文章不存在");
    const [row] = await db.select().from(articleAnchors).where(and(eq(articleAnchors.outputId, outputId), eq(articleAnchors.userId, owner.userId), eq(articleAnchors.accountId, owner.accountId)));
    if (!row || row.projectId !== output.projectId) throw new ArticleOwnership("文章不存在");
    const artifact = await deps.artifacts(db).getArtifact(ctx, row.artifactId);
    if (artifact.artifactType !== "wechat_article" || artifact.projectId !== row.projectId || artifact.contentOutputId !== outputId) throw new ArticleConflict("文章锚点不一致");
    return {row, artifact, output};
  }
  async function documentFor(ctx: RequestContext, outputId: string, versionId?: string): Promise<ArticleWriteResult> {
    const {artifact} = await anchor(ctx, outputId);
    const version = (await deps.artifacts(db).listVersions(ctx, artifact.id)).find((v) => v.id === (versionId ?? artifact.currentVersionId));
    if (!version) throw new ArticleOwnership("文章版本不存在");
    const document = articleDocument.parse(version.contentData);
    // 已保存历史只读；素材旧文件失效在预览端逐张标识，不能改写这份不可变文章版本。
    return {versionId: version.id, document};
  }
  async function assertRefs(ctx: RequestContext, document: ArticleDocument, projectId: string, prior?: ArticleDocument,
    recheck?: {sectionIds?: ReadonlySet<string>; title?: boolean; summary?: boolean; factItems?: boolean;validatedImageFiles?:ReadonlySet<string>}) {
    if(document.metadataSource&&!isDeepStrictEqual(document.metadataSource,prior?.metadataSource)){
      if(!deps.assertScriptMetadataSource)throw new ArticleValidation("当前无法核验元数据来源，请重新读取脚本发布物料。");
      await deps.assertScriptMetadataSource(ctx,document.metadataSource,projectId);
    }
    const sections = document.sections;
    if (!unique(sections.map((s) => s.sectionId)) || sections.some((s, i) => s.order !== i)) throw new ArticleValidation("文章段落 ID 或顺序无效");
    if (!unique(document.factItems.map((f) => f.id))) throw new ArticleValidation("事实项 ID 重复");
    const ids = new Set(sections.map((s) => s.sectionId));
    if (!unique(document.visualBriefs.map((b) => b.sectionId)) || document.visualBriefs.some((b) => !ids.has(b.sectionId))) throw new ArticleValidation("视觉简报段落不存在或重复");
    if (!unique(document.imageUses.map((u) => u.sectionId)) || document.imageUses.some((u) => !ids.has(u.sectionId))) throw new ArticleValidation("配图段落不存在或重复");
    const refLocations = (doc: ArticleDocument) => [
      ...((doc.titleSourceRefs ?? []).map((ref) => ({location: "title", ref}))),
      ...((doc.summarySourceRefs ?? []).map((ref) => ({location: "summary", ref}))),
      ...doc.sections.flatMap((section) => section.sourceRefs.map((ref) => ({location: `section:${section.sectionId}`, ref}))),
      ...doc.factItems.flatMap((fact) => fact.sourceRefs.map((ref) => ({location: `fact:${fact.id}`, ref}))),
    ];
    const priorByLocation = new Map<string, Set<string>>();
    for (const {location, ref} of prior ? refLocations(prior) : []) {
      const values = priorByLocation.get(location) ?? new Set<string>();
      values.add(JSON.stringify(ref)); priorByLocation.set(location, values);
    }
    let currentProjectVersion: string | null = null;
    // SEMANTIC_BOUNDARY_ALLOW: location/ref equality only protects immutable old
    // citations across edits; it does not choose or interpret article evidence.
    for (const {location, ref} of refLocations(document)) {
      const forceCurrent = location === "title" ? recheck?.title : location === "summary" ? recheck?.summary
        : location.startsWith("section:") ? recheck?.sectionIds?.has(location.slice(8)) : recheck?.factItems;
      if (!forceCurrent && priorByLocation.get(location)?.has(JSON.stringify(ref))) continue;
      if (ref.kind === "project") {
        if (ref.id !== projectId) throw new ArticleOwnership("引用项目不属于当前文章");
        currentProjectVersion ??= (await deps.projects(db).getProject(ctx, projectId)).updatedAt;
        if (ref.versionId !== currentProjectVersion) throw new ArticleConflict("项目引用版本已变化，请重新审读");
      } else if (ref.kind === "project_script") {
        if (!deps.assertProjectScriptSource) throw new ArticleValidation("当前无法核验主脚本来源版本");
        await deps.assertProjectScriptSource(ctx, ref, projectId);
      } else if (ref.kind === "output_version") {
        if (!deps.assertOutputVersionSource) throw new ArticleValidation("当前无法核验作品来源版本");
        await deps.assertOutputVersionSource(ctx, ref, projectId);
      } else if(ref.kind==="moments_version"||ref.kind==="work_basis_version"){
        if(!deps.assertWorkSource)throw new ArticleValidation("当前无法核验组合来源版本");await deps.assertWorkSource(ctx,ref,projectId);
      } else {
        await deps.assertAssetFile(ctx, ref.id, ref.versionId, false);
      }
    }
    for (const use of document.imageUses) {
      // A previously selected immutable file can become unavailable later. Keep
      // its exact historical reference so a text edit still has a safe save path.
      const unchanged = prior?.imageUses.some((old) => old.sectionId === use.sectionId && old.assetId === use.assetId && old.assetFileId === use.assetFileId);
      if (!unchanged&&!recheck?.validatedImageFiles?.has(JSON.stringify([use.assetId,use.assetFileId]))) await deps.assertAssetFile(ctx, use.assetId, use.assetFileId, true);
    }
    if (document.coverImageUse) {
      const use = document.coverImageUse;
      const unchanged = prior?.coverImageUse?.assetId === use.assetId && prior.coverImageUse.assetFileId === use.assetFileId;
      if (!unchanged&&!recheck?.validatedImageFiles?.has(JSON.stringify([use.assetId,use.assetFileId]))) await deps.assertAssetFile(ctx, use.assetId, use.assetFileId, true);
    }
  }
  function candidateFromRow(row: typeof articleCandidates.$inferSelect): ArticleCandidate {
    return {candidateId: row.id, projectId: row.projectId, outputId: row.outputId, artifactId: row.artifactId,
      baseVersionId: row.baseVersionId, methodVersion: row.methodVersion, brandProfileVersionId: row.brandProfileVersionId,
      createdAt: row.createdAt, ...articleCandidateProposal.parse(row.proposal)};
  }
  return {
    async findOutputByCreationRequest(ctx, clientRequestId) {
      const owner = scope(ctx);
      const [row] = await db.select().from(articleAnchors).where(and(
        eq(articleAnchors.userId, owner.userId), eq(articleAnchors.accountId, owner.accountId),
        eq(articleAnchors.clientRequestId, clientRequestId),
      ));
      return row ? (await anchor(ctx, row.outputId)).output : null;
    },
    async createOutput(ctx, projectId, input) {
      const owner = scope(ctx);
      const requestDigest = digest({projectId, title: input.title, contentRole: input.contentRole ?? null, targetPlatform: input.targetPlatform ?? null});
      const receipt = async () => input.clientRequestId ? (await db.select().from(articleAnchors).where(and(
        eq(articleAnchors.userId, owner.userId), eq(articleAnchors.accountId, owner.accountId),
        eq(articleAnchors.clientRequestId, input.clientRequestId),
      )))[0] : undefined;
      const restore = async (row: typeof articleAnchors.$inferSelect) => {
        if (row.projectId !== projectId || (row.requestDigest && row.requestDigest !== requestDigest)) {
          throw new ArticleConflict("同一创建请求不能修改作品内容");
        }
        const {output} = await anchor(ctx, row.outputId);
        if (!row.requestDigest) {
          // Old receipts have no immutable creation digest. Recover only when
          // the currently owned metadata still matches the full request.
          const priorDigest = digest({projectId: output.projectId, title: output.title,
            contentRole: output.contentRole ?? null, targetPlatform: output.targetPlatform ?? null});
          if (priorDigest !== requestDigest) throw new ArticleConflict("旧创建回执与当前输入不一致，请使用新的创建请求");
        }
        return output;
      };
      const old = await receipt();
      if (old) return restore(old);
      try { return await db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        const projects = deps.projects(txDb);
        // 本地草稿不依赖完整 Brief 或平台绑定；归属仍由 owner 核验。
        await projects.getProject(ctx, projectId, true);
        if (input.targetPlatform && input.targetPlatform !== "wechatOfficialAccount") throw new ArticleValidation("文章目标平台不支持");
        const output = await projects.createOutput(ctx, projectId, {title: input.title, contentRole: input.contentRole, contentType: "article", targetPlatform: input.targetPlatform});
        const artifact = await deps.artifacts(txDb).createArtifact(ctx, {projectId, contentOutputId: output.id, title: input.title, artifactType: "wechat_article", stage: "script", initialContentData: emptyArticleDocument()});
        await tx.insert(articleAnchors).values({outputId: output.id, projectId, userId: owner.userId, accountId: owner.accountId,
          artifactId: artifact.id, clientRequestId: input.clientRequestId ?? null, requestDigest, createdAt: deps.now()});
        return output;
      }); } catch (error) {
        const winner = await receipt();
        if (!winner) throw error;
        return restore(winner);
      }
    },
    async getArticle(ctx, outputId) {
      const {row, artifact} = await anchor(ctx, outputId);
      const versions = await deps.artifacts(db).listVersions(ctx, artifact.id);
      const current = await documentFor(ctx, outputId);
      const scriptContext=await optionalScriptContext(ctx,row.projectId,deps);
      return {projectId: row.projectId, outputId, artifactId: artifact.id, currentVersionId: current.versionId, current: current.document,
        ...(scriptContext?{scriptContext}:{}),versions: versions.map((v) => ({id: v.id, versionNumber: v.versionNumber, createdAt: v.createdAt, changeSummary: v.changeSummary}))};
    },
    getVersion: documentFor,
    async saveReceipt(ctx,outputId,input){
      const {artifact}=await anchor(ctx,outputId),sourceDigest=digest({outputId, input});
      const receipt=await deps.artifacts(db).getVersionByAdoptionReceipt(ctx,artifact.id,`article-edit:${input.clientRequestId}`,sourceDigest);
      if(!receipt)throw new ArticleOwnership("保存回执不存在");
      return workCommitReceipt.parse({kind:"manual_save",owner:"wechat_article",clientRequestId:input.clientRequestId,requestDigest:receipt.adoptionSourceDigest!.slice(7),committedAt:receipt.createdAt,version:{kind:"artifact",artifactId:artifact.id,versionId:receipt.id}});
    },
    async createVersion(ctx, outputId, input) {
      const {row, artifact} = await anchor(ctx, outputId);
      const adoptionKey = `article-edit:${input.clientRequestId}`;
      const sourceDigest = digest({outputId, input});
      const receipt = await deps.artifacts(db).getVersionByAdoptionReceipt(ctx, artifact.id, adoptionKey, sourceDigest);
      if (receipt) return {versionId: receipt.id, document: articleDocument.parse(receipt.contentData)};
      const document = articleDocument.parse(input.document);
      const prior = await documentFor(ctx, outputId, input.expectedCurrentVersionId);
      await assertRefs(ctx, document, row.projectId, prior.document);
      const version = await deps.artifacts(db).createVersion(ctx, artifact.id, {expectedCurrentVersionId: input.expectedCurrentVersionId,
        contentText: renderArticle(document), contentData: document, changeSummary: "手工保存公众号文章",
        adoptionKey, adoptionSourceDigest: sourceDigest});
      return {versionId: version.id, document: articleDocument.parse(version.contentData)};
    },
    async generateCandidate(ctx, outputId, clientRequestId, brandProfileVersionId, sourceAssets = [], conversionInput) {
      const {row, artifact,output} = await anchor(ctx, outputId);
      if(conversionInput){
        const conversion=outputConversionContext.parse(conversionInput);
        if(conversion.request.targetType!=="article" || sourceAssets.length || brandProfileVersionId)
          throw new ArticleValidation("转换请求不能混入其他来源或未冻结品牌");
        if(!deps.findGenerationByAttempt || !deps.resolveConversionSource)throw new ArticleConflict("转换生成端口尚不可用");
        const result=(task:{id:string;status:string;inputData:Record<string,unknown>})=>{
          if(task.inputData.outputId!==outputId || !isDeepStrictEqual(task.inputData.conversion,conversion))
            throw new ArticleConflict("同请求已对应另一转换意图");
          return {taskId:task.id,candidateId:task.id,status:task.status as "queued"|"running"|"awaiting_confirmation"|"succeeded"|"failed"|"cancelled"};
        };
        const prior=await deps.findGenerationByAttempt(ctx,clientRequestId);if(prior)return result(prior);
        const targetPlatform=output.targetPlatform??null;
        if((targetPlatform!==null && targetPlatform!=="wechatOfficialAccount") ||
           (conversion.request.targetPlatform!==undefined && conversion.request.targetPlatform!==targetPlatform))
          throw new ArticleValidation("转换目标平台与文章作品不一致");
        const frozen=await deps.resolveConversionSource(ctx,conversion);
        if(frozen.projectId!==row.projectId || !isDeepStrictEqual(frozen.sourceAnchor,conversion.sourceAnchor))
          throw new ArticleOwnership("转换来源不属于当前文章项目");
        const text=JSON.stringify(frozen.content);
        if(text.length>200000)throw new ArticleValidation("转换来源过长，请缩减选区");
        const current=await documentFor(ctx,outputId);
        const taskInput={projectId:row.projectId,outputId,artifactId:artifact.id,baseVersionId:current.versionId,
          brief:"依据冻结作品选区转换为公众号文章",current:current.document,
          conversion:structuredClone(conversion),conversionConstraints:structuredClone(frozen.constraints),
          editingInstruction:conversion.request.mode==="selected"?"仅转换为这些明确授权字段："+conversion.request.targetFields.join("、"):"转换为完整文章候选，保留事实约束。",
          sourceRefs:[frozen.sourceAnchor],sourceMaterials:[{ref:frozen.sourceAnchor,label:"已保存作品的选定内容",text}],
          brandProfileVersionId:null,brandProfile:null};
        let task:{id:string;status:string};
        try{task=await deps.submitGeneration(ctx,{attemptId:clientRequestId,projectId:row.projectId,inputData:taskInput});}
        catch(error){const winner=await deps.findGenerationByAttempt(ctx,clientRequestId);if(winner)return result(winner);throw error;}
        return {taskId:task.id,candidateId:task.id,status:task.status as "queued"|"running"|"awaiting_confirmation"|"succeeded"|"failed"|"cancelled"};
      }
      const generationIntent = {outputId, brandProfileVersionId: brandProfileVersionId ?? null, sourceAssets};
      const priorTask = await deps.findGenerationByAttempt?.(ctx, clientRequestId);
      if (priorTask) {
        const input = priorTask.inputData;
        const originalIntent = input.generationIntent ?? {outputId: input.outputId, brandProfileVersionId: input.brandProfileVersionId ?? null,
          sourceAssets: ((input.sourceMaterials ?? []) as Array<{ref:{kind:string;id:string;versionId:string}}>).filter(source => source.ref.kind === "asset").map(source => ({assetId:source.ref.id,assetFileId:source.ref.versionId}))};
        if (input.conversion || !isDeepStrictEqual(originalIntent, generationIntent)) throw new ArticleConflict("同请求已对应另一文章或资料选择");
        return {taskId: priorTask.id, candidateId: priorTask.id, status: priorTask.status as "queued" | "running" | "awaiting_confirmation" | "succeeded" | "failed" | "cancelled"};
      }
      const current = await documentFor(ctx, outputId);
      const project = await deps.projects(db).getProject(ctx, row.projectId);
      const sourceRef: ArticleSourceRef = {kind: "project", id: row.projectId, versionId: project.updatedAt};
      const sourceText = [project.title, project.brief, JSON.stringify(project.briefDetail ?? {})].filter(Boolean).join("\n");
      if (sourceAssets.length > 20 || !unique(sourceAssets.map((source) => JSON.stringify([source.assetId, source.assetFileId])))) {
        throw new ArticleValidation("引用素材重复或超过数量上限");
      }
      const selectedSources: Array<{ref: ArticleSourceRef; label: string; text: string}> = [];
      for (const source of sourceAssets) {
        const resolved = await deps.resolveDocumentSource(ctx, row.projectId, source.assetId, source.assetFileId);
        if (!resolved?.text.trim()) throw new ArticleOwnership("所选项目资料不存在或未完成文本提取");
        // SEMANTIC_BOUNDARY_ALLOW: prompt length cap only bounds model input; the
        // explicit notice prevents treating omitted tail text as observed facts.
        const text = resolved.text.length > 60000 ? `${resolved.text.slice(0, 60000)}\n[资料过长：仅提供前 60000 字，后续内容未提供，不得推断。]` : resolved.text;
        selectedSources.push({ref: {kind: "asset", id: source.assetId, versionId: source.assetFileId}, label: resolved.label, text});
      }
      const mainScript = await deps.readProjectScript?.(ctx, row.projectId);
      if (mainScript) selectedSources.unshift(mainScript);
      // Brand is an explicit user-selected version. The injected positioning port
      // verifies current account ownership and selected state before any model call.
      const brandProfile = brandProfileVersionId ? await deps.resolveSelectedBrand(ctx, brandProfileVersionId) : null;
      if (brandProfileVersionId && (!brandProfile || brandProfile.versionId !== brandProfileVersionId)) throw new ArticleOwnership("选定的品牌版本在当前账号不可用");
      const task = await deps.submitGeneration(ctx, {attemptId: clientRequestId, projectId: row.projectId, inputData: {
        projectId: row.projectId, outputId, artifactId: artifact.id, baseVersionId: current.versionId,
        brief: project.brief.trim() || project.title, current: current.document, generationIntent,
        editingInstruction: mainScript ? "以已保存主脚本或大纲为依据扩写、润色并补充文章结构，保留事实边界；已有标题、简介及标签沿用，当前文章为人工修改基准，只提出候选。" : "依据项目简介及所选资料生成文章候选。",
        ...await optionalProjectImageLibrary(ctx,row.projectId,deps),
        sourceRefs: [sourceRef, ...selectedSources.map((source) => source.ref)],
        sourceMaterials: [{ref: sourceRef, label: "当前项目 Brief", text: sourceText}, ...selectedSources],
        brandProfileVersionId: brandProfile?.versionId ?? null, brandProfile,
      }});
      return {taskId: task.id, candidateId: task.id, status: task.status as "queued" | "running" | "awaiting_confirmation" | "succeeded" | "failed" | "cancelled"};
    },
    async getCandidate(ctx, candidateId) {
      const owner = scope(ctx);
      const [existing] = await db.select().from(articleCandidates).where(and(eq(articleCandidates.id, candidateId), eq(articleCandidates.userId, owner.userId), eq(articleCandidates.accountId, owner.accountId)));
      if (existing) { await anchor(ctx, existing.outputId); return candidateFromRow(existing); }
      const generation = await deps.readGeneration(ctx, candidateId);
      if (generation.taskType !== "wechat.article-draft" || !["awaiting_confirmation","succeeded"].includes(generation.status)) throw new ArticleConflict("文章候选尚未生成完成");
      const input = generation.inputData;
      const outputId = String(input.outputId ?? "");
      const {row, artifact} = await anchor(ctx, outputId);
      if (input.projectId !== row.projectId || input.artifactId !== artifact.id) throw new ArticleOwnership("文章候选归属不一致");
      const result = generation.results.find((v) => v.resultType === "wechat_article_candidate");
      if (!result) throw new ArticleConflict("生成任务缺少文章候选回执");
      const proposal = articleCandidateProposal.parse(result.resultData.proposal);
      const imageLibrary=projectImageSource.array().parse(input.imageLibrary??[]);
      // SEMANTIC_BOUNDARY_ALLOW: 仅核验模型所选图片来自本轮冻结真实文件目录，不评判语义。
      for(const brief of proposal.proposedVisualBriefs){
        if(input.imageLibrary!==undefined&&brief.proposedAssetId!==undefined&&!brief.proposedAssetFileId)throw new ArticleValidation("本次候选配图缺少精确文件身份。");
        if(brief.proposedAssetFileId!==undefined&&!imageLibrary.some(image=>image.assetId===brief.proposedAssetId&&image.assetFileId===brief.proposedAssetFileId))throw new ArticleValidation("候选配图不属于本次真实图片目录。");
      }
      const baseVersionId = String(input.baseVersionId ?? "");
      if (!(await deps.artifacts(db).listVersions(ctx, artifact.id)).some((v) => v.id === baseVersionId)) throw new ArticleConflict("候选基准文章版本不存在");
      await db.insert(articleCandidates).values({id: candidateId, projectId: row.projectId, outputId, artifactId: artifact.id,
        userId: owner.userId, accountId: owner.accountId, baseVersionId, methodVersion: "1.0.0",
        brandProfileVersionId: typeof input.brandProfileVersionId === "string" ? input.brandProfileVersionId : null,
        clientRequestId: candidateId, proposal, createdAt: deps.now()}).onConflictDoNothing();
      const [saved] = await db.select().from(articleCandidates).where(and(eq(articleCandidates.id, candidateId), eq(articleCandidates.userId, owner.userId), eq(articleCandidates.accountId, owner.accountId)));
      if (!saved) throw new ArticleConflict("文章候选保存失败");
      return candidateFromRow(saved);
    },
    async readCandidateState(ctx,candidateId){
      scope(ctx);
      const generation=await deps.readGeneration(ctx,candidateId);
      if(generation.taskType!=="wechat.article-draft")throw new ArticleValidation("任务不是文章结构候选");
      const input=generation.inputData,outputId=String(input.outputId??"");
      const {row,artifact}=await anchor(ctx,outputId);
      if(input.projectId!==row.projectId||input.artifactId!==artifact.id||typeof input.baseVersionId!=="string")throw new ArticleOwnership("文章任务归属不一致");
      const base=await documentFor(ctx,outputId,input.baseVersionId);
      // SEMANTIC_BOUNDARY_ALLOW: 轮询读回原历史基准，不用当前稿替代冻结输入。
      if(!isDeepStrictEqual(base.document,input.current))throw new ArticleConflict("文章任务冻结基准不一致");
      const conversion=input.conversion===undefined?null:outputConversionContext.parse(input.conversion);
      if(conversion&&conversion.request.targetType!=="article")throw new ArticleValidation("转换目标类型不一致");
      const sourceRefs=articleSourceRef.array().parse(input.sourceRefs??[]);
      if(conversion&&!sourceRefs.some(ref=>isDeepStrictEqual(ref,conversion.sourceAnchor)))throw new ArticleValidation("转换任务缺少冻结来源");
      const terminal=["awaiting_confirmation","succeeded"].includes(generation.status);
      const status=terminal?"succeeded":generation.status;
      if(!["queued","running","succeeded","failed","cancelled"].includes(status))throw new ArticleConflict("文章任务状态无效");
      return {status:status as ArticleCandidateState["status"],candidate:terminal?await this.getCandidate(ctx,candidateId):null,
        outputId,baseVersionId:base.versionId,sourceRefs,errorCode:status==="failed"?"GENERATION_FAILED":null};
    },
    async retryFrozenCandidate(ctx,candidateId,clientRequestId){
      const old=await this.readCandidateState(ctx,candidateId);
      if(clientRequestId.length<8||clientRequestId.length>128)throw new ArticleValidation("重试请求号无效");
      const original=await deps.readGeneration(ctx,candidateId),frozen=structuredClone(original.inputData);
      // 不可变旧稿可以继续用，执行前仍必须验证其当前归属与历史版本存在。
      for (const ref of old.sourceRefs) {
        if (ref.kind === "project_script") {
          if (!deps.assertProjectScriptSource) throw new ArticleValidation("当前无法核验原主脚本版本");
          await deps.assertProjectScriptSource(ctx, ref, String(frozen.projectId));
        }
      }
      if(original.executionTaskId){
        if(!deps.resumeGeneration)throw new ArticleValidation("原文章持久执行恢复端口尚未接通");
        const resumed=await deps.resumeGeneration(ctx,{taskId:candidateId,clientRequestId});
        if(resumed.id!==candidateId)throw new ArticleConflict("原执行恢复不能复制文章任务");
        const state=await this.readCandidateState(ctx,candidateId);
        if(state.outputId!==old.outputId||state.baseVersionId!==old.baseVersionId||!isDeepStrictEqual(state.sourceRefs,old.sourceRefs))throw new ArticleConflict("恢复未保留原稿基准或来源");
        return {candidateId,taskId:candidateId,status:state.status,baseVersionId:state.baseVersionId,sourceRefs:state.sourceRefs,ruleSnapshotRef:null,appliedRules:"not_applied"};
      }
      if(old.status!=="failed"&&old.status!=="cancelled")throw new ArticleValidation("只有失败或取消的文章结构任务可以重试");
      if(!deps.findGenerationByAttempt)throw new ArticleValidation("原文章任务恢复端口尚未接通");
      const recover=async()=>{
        const prior=await deps.findGenerationByAttempt!(ctx,clientRequestId);
        if(prior&&(prior.retryOfTaskId!==candidateId||!isDeepStrictEqual(prior.inputData,frozen)))throw new ArticleConflict("重试请求号对应不同任务或冻结输入");
        return prior;
      };
      let taskId=(await recover())?.id;
      if(!taskId){
        try {taskId=(await deps.submitGeneration(ctx,{attemptId:clientRequestId,projectId:String(frozen.projectId),inputData:frozen,retryOfTaskId:candidateId})).id;}
        catch(error){taskId=(await recover())?.id;if(!taskId)throw error;}
      }
      const state=await this.readCandidateState(ctx,taskId);
      if(state.outputId!==old.outputId||state.baseVersionId!==old.baseVersionId||!isDeepStrictEqual(state.sourceRefs,old.sourceRefs))throw new ArticleConflict("重试未保留原稿基准或来源");
      return {candidateId:taskId,taskId,status:state.status,baseVersionId:state.baseVersionId,sourceRefs:state.sourceRefs,ruleSnapshotRef:null,appliedRules:"not_applied"};
    },
    async adoptCandidate(ctx, candidateId, input) {
      const owner = scope(ctx);
      const [savedCandidate] = await db.select().from(articleCandidates).where(and(eq(articleCandidates.id, candidateId),
        eq(articleCandidates.userId, owner.userId), eq(articleCandidates.accountId, owner.accountId)));
      if (savedCandidate) {
        const {artifact: savedArtifact} = await anchor(ctx, savedCandidate.outputId);
        const receipt = await deps.artifacts(db).getVersionByAdoptionReceipt(ctx, savedArtifact.id,
          `article-candidate:${input.clientRequestId}`, digest({candidateId, input}));
        if (receipt) return {versionId: receipt.id, document: articleDocument.parse(receipt.contentData)};
      }
      const candidate = await this.getCandidate(ctx, candidateId);
      const {row, artifact} = await anchor(ctx, candidate.outputId);
      if (candidate.artifactId !== artifact.id) throw new ArticleConflict("文章候选锚点变化");
      const generation=await deps.readGeneration(ctx,candidateId);
      let conversionSource:Extract<ArticleSourceRef,{kind:"output_version"}>|null=null;
      if(generation.inputData.conversion!==undefined){
        const conversion=outputConversionContext.parse(generation.inputData.conversion);
        conversionSource=conversion.sourceAnchor;
        if(generation.inputData.outputId!==candidate.outputId || conversion.request.targetType!=="article")throw new ArticleOwnership("转换候选归属不一致");
        const request=conversion.request;
        if(request.mode==="selected" && ((input.selectedSectionIds.length>0 && !request.targetFields.includes("sections")) ||
          input.selectedMetadataFields.some(field=>field==="factItems"?!request.targetFields.includes("sections"):!request.targetFields.includes(field))))
          throw new ArticleValidation("所选字段未获本次转换授权");
      }

      // SEMANTIC_BOUNDARY_ALLOW: 采用字段附带已冻结真实来源，不让模型省略引用消除来源账本。
      const withConversionSource=(refs:ArticleSourceRef[])=>conversionSource && !refs.some(ref=>isDeepStrictEqual(ref,conversionSource))?[...refs,conversionSource]:refs;
      const versions = await deps.artifacts(db).listVersions(ctx, artifact.id);
      const prior = versions.find((v) => v.id === input.expectedCurrentVersionId);
      const baseVersion = versions.find((v) => v.id === candidate.baseVersionId);
      if (!prior || !baseVersion || artifact.currentVersionId !== input.expectedCurrentVersionId)
        throw new ArticleConflict("当前文章版本已变化，请刷新后继续采纳");
      const current = articleDocument.parse(prior.contentData);
      const base = articleDocument.parse(baseVersion.contentData);
      if (input.selectedSectionIds.length + input.selectedMetadataFields.length === 0) throw new ArticleValidation("请选择要采纳的内容");
      if (!unique(input.selectedSectionIds) || !unique(input.selectedMetadataFields)) throw new ArticleValidation("采纳选区重复");
      const selected = new Set(input.selectedSectionIds);
      let proposals = candidate.proposedSections.filter((s) => selected.has(s.sectionId));
      const edits=articleCandidateEdits.parse({...(input.editedMetadata!==undefined?{editedMetadata:input.editedMetadata}:{}),...(input.editedSections!==undefined?{editedSections:input.editedSections}:{})});
      if(edits.editedMetadata && Object.keys(edits.editedMetadata).some(field=>!input.selectedMetadataFields.includes(field as "title"|"summary")))throw new ArticleValidation("编辑字段不属于本次采用选择");
      if(edits.editedSections){
        if(!unique(edits.editedSections.map(s=>s.sectionId))||edits.editedSections.length!==proposals.length)throw new ArticleValidation("编辑段落必须对应完整采用选择");
        // SEMANTIC_BOUNDARY_ALLOW: 用户只改正文与小标题；不可改变原候选操作、定位、顺序和来源身份。
        const identity=({heading,body,...rest}:typeof proposals[number])=>rest;
        if(edits.editedSections.some((section,i)=>!isDeepStrictEqual(identity(section),identity(proposals[i]!))))throw new ArticleValidation("编辑段落改变了原候选操作、定位或来源");
        proposals=edits.editedSections;
      }
      if (proposals.length !== selected.size) throw new ArticleValidation("采纳段落不属于当前候选");
      // SEMANTIC_BOUNDARY_ALLOW: 只核验本次将写入的真实字段前值，不作内容语义判断。
      const metadata = new Set(input.selectedMetadataFields);
      if ((metadata.has("title") && !isDeepStrictEqual([base.title, base.titleSourceRefs ?? []], [current.title, current.titleSourceRefs ?? []])) ||
          (metadata.has("summary") && !isDeepStrictEqual([base.summary, base.summarySourceRefs ?? []], [current.summary, current.summarySourceRefs ?? []])) ||
          (metadata.has("factItems") && !isDeepStrictEqual(base.factItems, current.factItems)))
        throw new ArticleConflict("选定文章字段已被修改，请重新审读");
      const sectionContent = (section: typeof current.sections[number] | undefined) => section ?
        {sectionId: section.sectionId, heading: section.heading, headingLevel: section.headingLevel, body: section.body, sourceRefs: section.sourceRefs} : undefined;
      for (const item of proposals) {
        if (item.op === "replace" && (!isDeepStrictEqual(sectionContent(base.sections.find(s => s.sectionId === item.sectionId)),
            sectionContent(current.sections.find(s => s.sectionId === item.sectionId))) ||
            !isDeepStrictEqual(base.visualBriefs.find(v => v.sectionId === item.sectionId), current.visualBriefs.find(v => v.sectionId === item.sectionId))))
          throw new ArticleConflict("选定段落或配图简报已被修改，请重新审读");
      }
      const imageUses=current.imageUses.map(image=>({...image}));
      const imageMatchWarnings:string[]=[];
      const validatedImageFiles=new Set<string>();
      let imageSnapshotAvailable=true;
      if(proposals.length&&(deps.readProjectImageLibrary||candidate.proposedVisualBriefs.some(brief=>brief.proposedAssetId))){
        try{const task=await deps.readGeneration(ctx,candidateId);if(typeof task.inputData.imageLibraryMessage==="string")imageMatchWarnings.push(task.inputData.imageLibraryMessage);}
        catch{imageSnapshotAvailable=false;imageMatchWarnings.push("本次配图来源暂不可读取，已跳过新图片；正文已保留。");}
      }
      const sections = current.sections.map((s) => ({...s}));
      const visualBriefs = current.visualBriefs.map((v) => ({...v}));
      for (const item of proposals) {
        const next = {sectionId: item.sectionId, order: 0, heading: item.heading, headingLevel: item.headingLevel, body: item.body, sourceRefs: withConversionSource(item.sourceRefs)};
        if (item.op === "replace") {
          const index = sections.findIndex((s) => s.sectionId === item.sectionId);
          if (index < 0) throw new ArticleConflict("替换段落已不存在");
          sections[index] = next;
        } else {
          if (sections.some((s) => s.sectionId === item.sectionId)) throw new ArticleConflict("插入段落 ID 已存在");
          const index = item.afterSectionId === null ? -1 : sections.findIndex((s) => s.sectionId === item.afterSectionId);
          if (item.afterSectionId !== null && index < 0) throw new ArticleConflict("插入锚点已不存在");
          // SEMANTIC_BOUNDARY_ALLOW: 按候选明确的兄弟 ID 与冻结顺序落实插入位置；不凭存在推导已采用状态。
          const siblings = candidate.proposedSections.filter(p => p.op === "insert" && p.afterSectionId === item.afterSectionId);
          let insertionIndex = index;
          let previousPosition = index;
          for (const sibling of siblings) {
            const position = sections.findIndex(s => s.sectionId === sibling.sectionId);
            if (position < 0) continue;
            if (position <= previousPosition || !isDeepStrictEqual(sectionContent(sections[position]), sectionContent(sibling)))
              throw new ArticleConflict("候选插入位置的段落已改变，请重新审读");
            previousPosition = position;
            if (siblings.indexOf(sibling) < siblings.indexOf(item)) insertionIndex = position;
          }
          sections.splice(insertionIndex + 1, 0, next);
        }
        const brief = candidate.proposedVisualBriefs.find((b) => b.sectionId === item.sectionId);
        const briefIndex = visualBriefs.findIndex((b) => b.sectionId === item.sectionId);
        if (briefIndex >= 0) visualBriefs.splice(briefIndex, 1);
        if (brief) visualBriefs.push(brief);
        // 已有该段用户选定图片保留；模型只提出候选，用户采用正文时才落实新配图。
        if(brief?.proposedAssetId&&brief.proposedAssetFileId&&imageSnapshotAvailable&&!imageUses.some(image=>image.sectionId===item.sectionId)){
          try{
            if(deps.assertProjectImageFile)await deps.assertProjectImageFile(ctx,brief.proposedAssetId,brief.proposedAssetFileId,row.projectId);
            else await deps.assertAssetFile(ctx,brief.proposedAssetId,brief.proposedAssetFileId,true);
            validatedImageFiles.add(JSON.stringify([brief.proposedAssetId,brief.proposedAssetFileId]));
            imageUses.push({sectionId:item.sectionId,assetId:brief.proposedAssetId,assetFileId:brief.proposedAssetFileId,sourceKind:"existing",reviewState:"selected"});
          }catch{imageMatchWarnings.push(`“${item.heading||"正文段落"}”的匹配图片已不可用，已跳过；正文已保留。`);}
        }
      }
      const document = articleDocument.parse({...current,
        title: metadata.has("title") ? edits.editedMetadata?.title??candidate.proposedTitle : current.title,
        titleSourceRefs: metadata.has("title") ? withConversionSource(candidate.proposedTitleSourceRefs) : (current.titleSourceRefs ?? []),
        summary: metadata.has("summary") ? edits.editedMetadata?.summary??candidate.proposedSummary : current.summary,
        summarySourceRefs: metadata.has("summary") ? withConversionSource(candidate.proposedSummarySourceRefs) : (current.summarySourceRefs ?? []),
        factItems: metadata.has("factItems") ? candidate.proposedFactItems.map(f=>({...f,sourceRefs:withConversionSource(f.sourceRefs)})) : current.factItems,
        sections: sections.map((s, order) => ({...s, order})), visualBriefs,imageUses,
        ...(proposals.length&&(imageMatchWarnings.length||current.imageMatchWarnings!==undefined)?{imageMatchWarnings}:{}),
      });
      await assertRefs(ctx, document, row.projectId, current, {sectionIds: selected,
        title: metadata.has("title"), summary: metadata.has("summary"), factItems: metadata.has("factItems"),validatedImageFiles});
      const version = await deps.artifacts(db).createVersion(ctx, artifact.id, {expectedCurrentVersionId: input.expectedCurrentVersionId,
        contentText: renderArticle(document), contentData: document, changeSummary: "采纳公众号文章候选",
        adoptionKey: `article-candidate:${input.clientRequestId}`, adoptionSourceDigest: digest({candidateId, input})});
      return {versionId: version.id, document: articleDocument.parse(version.contentData)};
    },
  };
}
