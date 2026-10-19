import {withWorkspaceWrite} from "../../workspace-write";
import {aiTasks,projects as projectionProjects} from "@creatoros/backend";
import type {WorkspaceWriteTx} from "../../workspace-write";
import {workspaceFilter,workspaceStamp,workspaceKey,requireWorkspace} from "../../workspace-scope";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, requireAccountId, type Db } from "@creatoros/backend";
import { articleDocument, articleSourceRef, type ArticleSourceRef, type RequestContext } from "@creatoros/contract";
import { articleTextCandidates } from "../../schema/articles";
import type { ProjectsService } from "../projects";
import type { ArticlesService } from "./articles.service";

type Kind = "title" | "summary" | "body";
type Status = "queued" | "running" | "succeeded" | "failed" | "cancelled";
type Candidate = {candidateId: string; outputId: string; kind: Kind; status: Status; value: string | null;
  baseVersionId: string; sourceRefs: ArticleSourceRef[]; ruleSnapshotRef: {versionId: string} | null;
  appliedRules: "applied" | "not_applied"};

function fail(code: string, message: string): never {
  const error = new Error(message) as Error & {code: string}; error.code = code; throw error;
}
function kindOf(raw: unknown): Kind {
  if (raw === "title" || raw === "summary" || raw === "body") return raw;
  return fail("UNSUPPORTED_DELIVERABLE", "文章不支持这个单项结果");
}
const sourceRefsSchema = articleSourceRef.array();
function distinctSourceRefs(refs: ArticleSourceRef[]): ArticleSourceRef[] {
  // SEMANTIC_BOUNDARY_ALLOW: Exact immutable reference IDs/versions, not creative source selection.
  const seen = new Set<string>();
  return refs.filter(ref => {
    const key = JSON.stringify(["output_version", "moments_version", "work_basis_version"].includes(ref.kind) ? ref : [ref.kind, "id" in ref ? ref.id : undefined, ref.versionId]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface ArticleTextResultPorts {
  resumeGeneration?: (ctx:RequestContext,input:{taskId:string;clientRequestId:string})=>Promise<{id:string}>;
  articles: Pick<ArticlesService, "getArticle" | "getVersion" | "createVersion">;
  projects: Pick<ProjectsService, "getProject" | "getOutput">;
  submitGeneration(ctx: RequestContext, input: {attemptId: string; projectId: string; inputData: Record<string, unknown>}): Promise<{id: string; status: string}>;
  readGeneration(ctx: RequestContext, taskId: string): Promise<{taskType: string; status: string;executionTaskId?:string|null;
    inputData: Record<string, unknown>; results: Array<{resultType: string; resultData: Record<string, unknown>}>}>;
  resolveCurrentRules?: (ctx: RequestContext, projectId: string) => Promise<{versionId: string; guidance: string} | null>;
  assertRuleSnapshotRef?: (ctx: RequestContext, versionId: string) => Promise<void>;
  now: () => string;
  nextId: (prefix: string) => string;
}

/** Owns only single-field article candidates. The existing whole-article candidate path remains independent. */
export function createArticleTextResultsService(db: Db, deps: ArticleTextResultPorts) {
  const account = (ctx: RequestContext) => {requireWorkspace(ctx);return workspaceKey(ctx);};
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
  async function taskFor(ctx: RequestContext, taskId: string) {
    account(ctx);
    const task = await deps.readGeneration(ctx, taskId);
    if (task.taskType !== "wechat.article-text") fail("OUTPUT_NOT_OWNED", "文章候选不存在");
    const outputId = String(task.inputData.outputId ?? "");
    const article = await deps.articles.getArticle(ctx, outputId);
    const output = await deps.projects.getOutput(ctx, outputId);
    if (output.contentType !== "article" || task.inputData.projectId !== article.projectId ||
      task.inputData.artifactId !== article.artifactId ||
      (output.targetPlatform && task.inputData.targetPlatform !== output.targetPlatform) ||
      (task.inputData.targetPlatform !== null && task.inputData.targetPlatform !== "wechatOfficialAccount")) {
      fail("OUTPUT_NOT_OWNED", "文章候选归属不一致");
    }
    const kind = kindOf(task.inputData.kind);
    const baseVersionId = String(task.inputData.baseVersionId ?? "");
    await deps.articles.getVersion(ctx, outputId, baseVersionId);
    const sourceRefs = sourceRefsSchema.parse(task.inputData.sourceRefs ?? []);
    const ruleSnapshotRef = task.inputData.ruleSnapshotRef == null ? null : parseRuleRef(task.inputData.ruleSnapshotRef);
    const appliedRules = ruleSnapshotRef || hasOverrides(task.inputData.ruleOverrides) ? "applied" as const : "not_applied" as const;
    return {task, article, output, outputId, kind, baseVersionId, sourceRefs, ruleSnapshotRef, appliedRules};
  }
  function parseRuleRef(raw: unknown): {versionId: string} {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof (raw as {versionId?: unknown}).versionId !== "string" ||
      !(raw as {versionId: string}).versionId) fail("SOURCE_UNAVAILABLE", "文章规则引用格式无效");
    return {versionId: (raw as {versionId: string}).versionId};
  }
  function hasOverrides(raw: unknown) { return !!raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length > 0; }
  async function getCandidate(ctx: RequestContext, candidateId: string): Promise<Candidate> {
    account(ctx);
    const [saved] = await db.select().from(articleTextCandidates).where(and(eq(articleTextCandidates.id, candidateId),
      eq(articleTextCandidates.userId, ctx.userId), workspaceFilter(articleTextCandidates,ctx)));
    if (saved) {
      await deps.articles.getArticle(ctx, saved.outputId);
      return {candidateId, outputId: saved.outputId, kind: kindOf(saved.kind), status: "succeeded", value: saved.value,
        baseVersionId: saved.baseVersionId, sourceRefs: sourceRefsSchema.parse(saved.sourceRefs),
        ruleSnapshotRef: saved.ruleSnapshotRef as Candidate["ruleSnapshotRef"],
        appliedRules: saved.appliedRules as Candidate["appliedRules"]};
    }
    const {task, article, outputId, kind, baseVersionId, sourceRefs, ruleSnapshotRef, appliedRules} = await taskFor(ctx, candidateId);
    if (task.status !== "awaiting_confirmation" && task.status !== "succeeded") {
      if (!["queued", "running", "failed", "cancelled"].includes(task.status)) fail("CANDIDATE_NOT_READY", "文章候选状态无效");
      return {candidateId, outputId, kind, status: task.status as Status, value: null, baseVersionId,
        sourceRefs, ruleSnapshotRef, appliedRules};
    }
    const result = task.results.find(row => row.resultType === "wechat_article_text_candidate");
    if (!result || result.resultData.kind !== kind || typeof result.resultData.value !== "string") {
      fail("CANDIDATE_NOT_READY", "文章单项任务缺少有效候选回执");
    }
    const candidateValue=result.resultData.value;
      await withWorkspaceWrite(db,ctx,async tx=>{const frozenOwner=await projectionOwner(tx,ctx,candidateId,article.projectId,task.inputData,"wechat.article-text");
    await tx.insert(articleTextCandidates).values({id: candidateId, projectId: article.projectId,
      outputId, artifactId: article.artifactId, userId: ctx.userId, ...frozenOwner, baseVersionId,
      kind, value: candidateValue, sourceRefs, ruleSnapshotRef, appliedRules, createdAt: deps.now(),
    }).onConflictDoNothing();
      },{allowArchived:true});
    const [persisted] = await db.select().from(articleTextCandidates).where(and(eq(articleTextCandidates.id, candidateId),
      eq(articleTextCandidates.userId, ctx.userId), workspaceFilter(articleTextCandidates,ctx)));
    if (!persisted || persisted.outputId !== outputId || persisted.kind !== kind) fail("IDEMPOTENCY_CONFLICT", "文章候选持久化冲突");
    return {candidateId, outputId, kind, status: "succeeded", value: persisted.value, baseVersionId,
      sourceRefs, ruleSnapshotRef, appliedRules};
  }
  return {
    async generate(ctx: RequestContext, input: {outputId: string; kind: Kind; targetPlatform?: string | null;
      clientRequestId: string; sourceItemId?: string; ruleOverrides?: Record<string, unknown>}) {
      account(ctx); kindOf(input.kind);
      if (input.clientRequestId.length < 8 || input.clientRequestId.length > 128) fail("IDEMPOTENCY_CONFLICT", "文章生成请求标识无效");
      if (input.sourceItemId) fail("SOURCE_UNAVAILABLE", "文章单项生成尚未接通雷达正文来源");
      if (JSON.stringify(input.ruleOverrides ?? {}).length > 8192) fail("CAPABILITY_UNAVAILABLE", "本次规则过长");
      const article = await deps.articles.getArticle(ctx, input.outputId);
      if (input.kind === "body" && (article.current.imageUses.length || article.current.visualBriefs.length)) {
        fail("CAPABILITY_UNAVAILABLE", "已有配图的长文暂不能整体替换正文，请用文章工作台逐段编辑");
      }
      const output = await deps.projects.getOutput(ctx, input.outputId);
      if (output.contentType !== "article" || (input.targetPlatform && output.targetPlatform && input.targetPlatform !== output.targetPlatform)) {
        fail("UNSUPPORTED_OUTPUT_TYPE", "文章作品与目标平台不一致");
      }
      const targetPlatform = input.targetPlatform === undefined ? output.targetPlatform ?? null : input.targetPlatform;
      if (targetPlatform && targetPlatform !== "wechatOfficialAccount") fail("UNSUPPORTED_OUTPUT_TYPE", "当前平台不支持文章单项生成");
      const project = await deps.projects.getProject(ctx, article.projectId);
      const projectRef: ArticleSourceRef = {kind: "project", id: project.id, versionId: project.updatedAt};
      const rule = deps.resolveCurrentRules ? await deps.resolveCurrentRules(ctx, project.id) : null;
      const task = await deps.submitGeneration(ctx, {attemptId: input.clientRequestId, projectId: project.id, inputData: {
        projectId: project.id, outputId: input.outputId, artifactId: article.artifactId,
        baseVersionId: article.currentVersionId, kind: input.kind, targetPlatform,
        brief: project.brief.trim() || project.title, current: article.current,
        sourceRefs: [projectRef], sourceMaterials: [{ref: projectRef, label: "当前项目", text: [project.title, project.brief,
          JSON.stringify(project.briefDetail ?? {})].filter(Boolean).join("\n")}],
        ruleSnapshotRef: rule ? {versionId: rule.versionId} : null,
        ruleGuidance: rule?.guidance ?? "", ruleOverrides: input.ruleOverrides ?? {},
      }});
      const candidate = await getCandidate(ctx, task.id);
      if (candidate.outputId !== input.outputId || candidate.kind !== input.kind) {
        fail("IDEMPOTENCY_CONFLICT", "文章生成请求已用于其他作品或交付项");
      }
      return {taskId: task.id, ...candidate};
    },
    getCandidate,
    async adopt(ctx: RequestContext, input: {candidateId: string; kind: Kind; expectedCurrentVersionId: string;
      editedValue: string; clientRequestId: string}) {
      const candidate = await getCandidate(ctx, input.candidateId);
      if (candidate.status !== "succeeded" || candidate.kind !== input.kind) fail("CANDIDATE_NOT_READY", "文章候选尚不可采纳");
      if (candidate.ruleSnapshotRef) {
        if (!deps.assertRuleSnapshotRef) fail("SOURCE_UNAVAILABLE", "当前无法核验文章规则版本");
        await deps.assertRuleSnapshotRef(ctx, candidate.ruleSnapshotRef.versionId);
      }
      const article = await deps.articles.getArticle(ctx, candidate.outputId);
      const base = await deps.articles.getVersion(ctx, candidate.outputId, input.expectedCurrentVersionId);
      const doc = base.document;
      const generatedFrom = await deps.articles.getVersion(ctx, candidate.outputId, candidate.baseVersionId);
      const field = input.kind === "body" ? "sections" : input.kind;
      // SEMANTIC_BOUNDARY_ALLOW: Structural equality guards only the selected field, without semantic judgment.
      const provenanceField=input.kind==="title"?"titleSourceRefs":input.kind==="summary"?"summarySourceRefs":null;
      if (!isDeepStrictEqual(doc[field], generatedFrom.document[field]) ||
          (provenanceField!==null && !isDeepStrictEqual(doc[provenanceField]??[],generatedFrom.document[provenanceField]??[]))) {
        fail("VERSION_CONFLICT", "要采用的字段已修改，请重新生成或审读候选");
      }
      const sourceRefs = distinctSourceRefs(candidate.sourceRefs);
      let next = doc;
      if (input.kind === "title") next = {...doc, title: input.editedValue, titleSourceRefs: sourceRefs};
      else if (input.kind === "summary") next = {...doc, summary: input.editedValue, summarySourceRefs: sourceRefs};
      else {
        if (doc.imageUses.length || doc.visualBriefs.length) fail("CAPABILITY_UNAVAILABLE", "已有配图的长文暂不能整体替换正文，请用文章工作台逐段编辑");
        // SEMANTIC_BOUNDARY_ALLOW: Stable identity for idempotent save replay, not a creative choice.
        next = {...doc, sections: [{sectionId: doc.sections[0]?.sectionId ?? `article-section-${createHash("sha256").update(candidate.candidateId).digest("hex")}`,
          order: 0, heading: "", headingLevel: 2, body: input.editedValue, sourceRefs}]};
      }
      const document = articleDocument.parse(next);
      if (!article.artifactId) fail("OUTPUT_NOT_OWNED", "文章稿锚点不存在");
      try {
        return await deps.articles.createVersion(ctx, candidate.outputId, {expectedCurrentVersionId: input.expectedCurrentVersionId,
          document, clientRequestId: input.clientRequestId});
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ConflictError") {
          fail("VERSION_CONFLICT", error instanceof Error ? error.message : "文章版本已变化，请刷新后重新审读");
        }
        throw error;
      }
    },
    async retryFrozen(ctx: RequestContext, oldCandidateId: string, clientRequestId: string) {
      const prior = await taskFor(ctx, oldCandidateId);
      if (!prior.task.executionTaskId && !["failed", "cancelled"].includes(prior.task.status)) fail("CANDIDATE_NOT_READY", "只有失败或取消的文章任务可以重试");
      const project = await deps.projects.getProject(ctx, prior.article.projectId);
      for (const ref of prior.sourceRefs) {
        if (ref.kind === "project") {
          // The task already contains the old project's complete sourceMaterials.
          // A newer project edit must not silently replace or invalidate that snapshot.
          if (ref.id !== project.id) fail("SOURCE_UNAVAILABLE", "原项目来源不属于当前文章");
        } else fail("SOURCE_UNAVAILABLE", "原素材来源需在文章工作台重新选择");
      }
      if (prior.ruleSnapshotRef) {
        if (!deps.assertRuleSnapshotRef) fail("SOURCE_UNAVAILABLE", "当前无法核验原规则版本");
        await deps.assertRuleSnapshotRef(ctx, prior.ruleSnapshotRef.versionId);
      }
      if(prior.task.executionTaskId&&!deps.resumeGeneration)fail("CAPABILITY_UNAVAILABLE","原文章文字持久执行恢复端口尚未接通");
      const task = prior.task.executionTaskId?await deps.resumeGeneration!(ctx,{taskId:oldCandidateId,clientRequestId}):await deps.submitGeneration(ctx, {attemptId: clientRequestId,
        projectId: project.id, inputData: structuredClone(prior.task.inputData)});
      if(prior.task.executionTaskId&&task.id!==oldCandidateId)fail("SOURCE_UNAVAILABLE","原文章文字恢复不能复制任务");
      const candidate = await getCandidate(ctx, task.id);
      return {taskId: task.id, candidateId: task.id, status: candidate.status,
        baseVersionId: candidate.baseVersionId, sourceRefs: candidate.sourceRefs,
        ruleSnapshotRef: candidate.ruleSnapshotRef, appliedRules: candidate.appliedRules};
    },
  };
}
export type ArticleTextResultsService = ReturnType<typeof createArticleTextResultsService>;
