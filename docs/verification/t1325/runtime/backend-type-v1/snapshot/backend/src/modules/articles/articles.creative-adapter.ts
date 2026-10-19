import {createHash} from "node:crypto";
import {articleCandidateSection,type RequestContext} from "@creatoros/contract";
import type {ArticlesService} from "./articles.service";
import type { CreativeResultAdapter } from "../creative-results/creative-results.service";
import type { ArticleTextResultsService } from "./articles.text-results";

const isTextKind = (kind: string): kind is "title" | "summary" | "body" =>
  kind === "title" || kind === "summary" || kind === "body";

/** The article owner creates a single requested text field and adopts it through its version CAS. */
export function createArticleCreativeResultAdapter(input: {
  service: ArticleTextResultsService;
  articles?:ArticlesService;
  readTaskType?:(ctx:RequestContext,id:string)=>Promise<string>;
  probeTextGeneration(ctx: RequestContext): Promise<{ready: boolean; reasonCode?: string; lastVerifiedAt?: string}>;
}): CreativeResultAdapter {
  async function structural(ctx:RequestContext,id:string) {
    if(!input.readTaskType)return false;
    const taskType=await input.readTaskType(ctx,id);
    if(taskType==="wechat.article-draft") {if(!input.articles)throw new Error("文章结构候选 owner 未接通");return true;}
    if(taskType!=="wechat.article-text")throw new Error("文章候选任务类型不匹配");
    return false;
  }
  return {
    owner: "wechat_article",
    async probe(ctx, cell) {
      if (!isTextKind(cell.kind) && !(cell.kind==="sections"&&input.articles&&input.readTaskType)) return {state: "known_unavailable", reasonCode: "ADAPTER_NOT_READY", lastVerifiedAt: null};
      const status = await input.probeTextGeneration(ctx);
      return status.ready
        ? {state: "supported", reasonCode: null, lastVerifiedAt: status.lastVerifiedAt ?? null}
        : {state: "known_unavailable", reasonCode: status.reasonCode ?? "ADAPTER_NOT_READY", lastVerifiedAt: status.lastVerifiedAt ?? null};
    },
    async enqueue(ctx, request) {
      if(request.conversion||request.kind==="sections") {
        if(!input.articles||!input.readTaskType||!["title","summary","sections"].includes(request.kind))throw new Error("文章结构交付项尚未接通");
        // SEMANTIC_BOUNDARY_ALLOW: 同一原请求的字段共享一个稳定 owner attempt，不选择内容。
        const attempt=request.conversion?`conversion-article-${createHash("sha256").update(request.conversion.request.clientRequestId).digest("hex")}`:request.clientRequestId;
        const generated=await input.articles.generateCandidate(ctx,request.outputId,attempt,undefined,undefined,request.conversion);
        const state=await input.articles.readCandidateState(ctx,generated.candidateId);
        return {candidateId:generated.candidateId,taskId:generated.taskId,baseVersionId:state.baseVersionId,sourceRefs:state.sourceRefs,
          ruleSnapshotRef:null,appliedRules:"not_applied",status:state.status};
      }
      if (!isTextKind(request.kind)) throw new Error("文章交付项尚未接通");
      const candidate = await input.service.generate(ctx, {outputId: request.outputId, kind: request.kind,
        targetPlatform: request.targetPlatform, clientRequestId: request.clientRequestId,
        sourceItemId: request.sourceItemId, ruleOverrides: request.ruleOverrides});
      return {candidateId: candidate.candidateId, taskId: candidate.taskId,
        baseVersionId: candidate.baseVersionId, sourceRefs: candidate.sourceRefs,
        ruleSnapshotRef: candidate.ruleSnapshotRef?.versionId ?? null, appliedRules: candidate.appliedRules,
        status: candidate.status};
    },
    async read(ctx, candidateId,projection) {
      if(await structural(ctx,candidateId)) {
        if(!projection||!["title","summary","sections"].includes(projection.kind))throw new Error("文章结构投影字段无效");
        const state=await input.articles!.readCandidateState(ctx,candidateId),candidate=state.candidate;
        const value=!candidate?null:projection.kind==="title"?candidate.proposedTitle:projection.kind==="summary"?candidate.proposedSummary:candidate.proposedSections;
        return {status:state.status,value,errorCode:state.errorCode};
      }
      const candidate = await input.service.getCandidate(ctx, candidateId);
      return {status: candidate.status, value: candidate.value,
        errorCode: candidate.status === "failed" ? "GENERATION_FAILED" : null};
    },
    async adopt(ctx, request) {
      if(await structural(ctx,request.candidateId)) {
        if(request.expected.owner!=="wechat_article"||typeof request.expected.versionId!=="string")throw new Error("文章结构候选目标版本无效");
        const state=await input.articles!.readCandidateState(ctx,request.candidateId);
        if(state.status!=="succeeded"||!state.candidate)throw new Error("文章结构候选尚未完成");
        const base={expectedCurrentVersionId:request.expected.versionId,clientRequestId:request.clientRequestId};
        if(request.kind==="sections") {
          const edited=articleCandidateSection.array().parse(request.editedValue);
          // SEMANTIC_BOUNDARY_ALLOW: 整项回执只在完整投影采用后成立；逐段旧接口保持原协议。
          if(!edited.length||edited.length!==state.candidate.proposedSections.length||edited.some((s,i)=>s.sectionId!==state.candidate!.proposedSections[i]!.sectionId))throw new Error("请选择完整段落投影进行采用");
          const result=await input.articles!.adoptCandidate(ctx,request.candidateId,{...base,selectedSectionIds:edited.map(s=>s.sectionId),selectedMetadataFields:request.includeFactItems?["factItems"]:[],editedSections:edited});
          return {versionId:result.versionId};
        }
        if((request.kind!=="title"&&request.kind!=="summary")||typeof request.editedValue!=="string")throw new Error("文章结构字段编辑值无效");
        const result=await input.articles!.adoptCandidate(ctx,request.candidateId,{...base,selectedSectionIds:[],selectedMetadataFields:[request.kind],editedMetadata:{[request.kind]:request.editedValue}});
        return {versionId:result.versionId};
      }
      if (request.expected.owner !== "wechat_article" || typeof request.expected.versionId !== "string" ||
        !isTextKind(request.kind) || typeof request.editedValue !== "string") throw new Error("文章候选目标无效");
      const result = await input.service.adopt(ctx, {candidateId: request.candidateId, kind: request.kind,
        expectedCurrentVersionId: request.expected.versionId, editedValue: request.editedValue,
        clientRequestId: request.clientRequestId});
      return {versionId: result.versionId};
    },
    async retryFrozen(ctx, request) {
      if(await structural(ctx,request.candidateId))return input.articles!.retryFrozenCandidate(ctx,request.candidateId,request.clientRequestId);
      const retry = await input.service.retryFrozen(ctx, request.candidateId, request.clientRequestId);
      return {candidateId: retry.candidateId, taskId: retry.taskId, status: retry.status,
        baseVersionId: retry.baseVersionId, sourceRefs: retry.sourceRefs,
        ruleSnapshotRef: retry.ruleSnapshotRef?.versionId ?? null, appliedRules: retry.appliedRules};
    },
  };
}
