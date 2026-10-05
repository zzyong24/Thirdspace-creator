import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@creatoros/backend";
import {workspaceKey,workspaceStamp,workspaceFilter,requireWorkspace,assertWritableWorkspace} from "../../workspace-scope";
import type { RequestContext } from "@creatoros/contract";
import { COVER_VISUAL_REQUIREMENTS_MAX, type CoverContext } from "@creatoros/ai-worker/cover";
import type { AssetsService } from "../assets";
import type { GraphicPostsService } from "../graphic-posts";
import type { ProjectsService } from "../projects";
import { outputMediaAttempts } from "../../schema/creative-results";
import { graphicSeriesBasis,graphicSeriesSnapshot,readFrozenGraphicSeries,readFrozenCoverContext, readFrozenGraphicCardContext } from "../ai-runtime/frozen-cover-context";
import {withWorkspaceParentWrite,type WorkspaceWriteTx} from "../../workspace-write";
import {projects,contentOutputs} from "../../schema/projects";
import {artifacts} from "../../schema/artifacts";
import {accountGroups} from "../../schema/account-groups";
import {aiTasks} from "../../schema/ai";
import type { CreativeResultAdapter } from "./creative-results.service";

type Task = {id: string; taskType: string; status: string; projectId: string | null; contentOutputId: string | null; inputData: Record<string, unknown>};
type Result = {resultType: string; assetId: string | null; resultData: Record<string, unknown>};
// SEMANTIC_BOUNDARY_ALLOW: This hash is only an idempotency identity; it makes no creative choice.
function digest(value: unknown) { return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
function error(code: string, message: string): never { const value = new Error(message) as Error & {code: string}; value.code = code; throw value; }

export interface GraphicPostMediaPorts {
  db: Db;
  graphicPosts: Pick<GraphicPostsService, "getGraphicPost" | "getVersion" | "createVersion">;
  projects: Pick<ProjectsService, "getProject">;
  assets: Pick<AssetsService, "getAsset" | "assertAssetFileOwned" | "getAssetFileDownloadUrl"> & Partial<Pick<AssetsService,"readImageReference">>;
  findTaskByAttempt?: (ctx:RequestContext,taskType:"cover.generate"|"graphic.card.generate",attemptId:string)=>Promise<Task|null>;
  submitCover(ctx: RequestContext, input: {attemptId: string; projectId: string; inputData: Record<string, unknown>}): Promise<{id: string; status: string}>;
  submitCard(ctx: RequestContext, input: {attemptId: string; projectId: string; inputData: Record<string, unknown>}): Promise<{id: string; status: string}>;
  readTask(ctx: RequestContext, taskId: string): Promise<Task>;
  listResults(ctx: RequestContext, taskId: string): Promise<Result[]>;
  confirmTask(ctx: RequestContext, taskId: string): Promise<unknown>;
  probeCover(ctx: RequestContext): Promise<{ready: boolean; reasonCode?: string; lastVerifiedAt?: string | null}>;
  probeCard(ctx: RequestContext): Promise<{ready: boolean; reasonCode?: string; lastVerifiedAt?: string | null}>;
  freezeCoverContext(ctx: RequestContext, input: {projectId: string; topic: string; fullText: string}): Promise<CoverContext>;
  now?: () => string;
  nextId?: () => string;
}

/**
 * Graphic cover reuses the existing cover.brief -> image.generate -> pending Asset
 * chain. The immutable output/task binding lives here; image bytes and candidate
 * activation remain with AI/Assets, and the formal document stays with graphic-posts.
 */
export function createGraphicPostMediaAdapter(ports: GraphicPostMediaPorts): CreativeResultAdapter {
  const now = ports.now ?? (() => new Date().toISOString());
  const nextId = ports.nextId ?? randomUUID;
  const scope = (ctx: RequestContext) => {requireWorkspace(ctx);return{userId:ctx.userId,...workspaceStamp(workspaceKey(ctx)),namespace:workspaceKey(ctx).id};};
  // SEMANTIC_BOUNDARY_ALLOW: 只锁当前真实group→project/output→artifact并核冻结版本；不做内容选取。
  async function submission<T>(ctx:RequestContext,parent:{projectId:string;outputId:string;artifactId?:string;baseVersionId?:string},commit:(tx:WorkspaceWriteTx,frozen:RequestContext)=>Promise<T>):Promise<T>{
    const admission=ctx.groupId?{...ctx,accountId:null,membershipVersion:undefined}:ctx;
    return withWorkspaceParentWrite(ports.db,admission,{table:projects,id:projects.id,userId:projects.userId,accountId:projects.accountId,groupId:projects.groupId,lock:"share",via:[{table:contentOutputs,id:contentOutputs.id,parentId:contentOutputs.projectId}]},[parent.outputId],async tx=>{
      const [project]=await tx.select().from(projects).where(eq(projects.id,parent.projectId));
      const [output]=await tx.select().from(contentOutputs).where(eq(contentOutputs.id,parent.outputId));
      if(!project||output?.projectId!==project.id||project.archivedAt||project.status==="archived")return error("OUTPUT_NOT_OWNED","项目已归档或归属改变，不能提交新图片任务");
      let frozen=admission;
      if(admission.groupId){const [group]=await tx.select().from(accountGroups).where(and(eq(accountGroups.id,admission.groupId),eq(accountGroups.userId,admission.userId)));
        if(!group||admission.groupVersion!==undefined&&admission.groupVersion!==group.version)return error("OUTPUT_NOT_OWNED","原冻结账号组版本已改变");
        frozen={...admission,groupVersion:group.version,membershipVersion:undefined};}
      if(parent.artifactId){const [artifact]=await tx.select().from(artifacts).where(and(eq(artifacts.id,parent.artifactId),eq(artifacts.userId,ctx.userId),workspaceFilter(artifacts,admission),eq(artifacts.projectId,parent.projectId),eq(artifacts.contentOutputId,parent.outputId))).for("share");
        if(!artifact||artifact.archivedAt||parent.baseVersionId&&artifact.currentVersionId!==parent.baseVersionId)return error("VERSION_CONFLICT","原稿在冻结期间已变化，请重新读取");}
      return commit(tx,frozen);
    });
  }
  // 当前作品父先授权；原任务、结果、确认只沿真实不可搬AI行的冻结身份读取，绝不按平台筛选重盖owner。
  async function historyContext(ctx:RequestContext,row:typeof outputMediaAttempts.$inferSelect):Promise<RequestContext>{
    if(!row.groupId)return ctx;
    const [task]=await ports.db.select().from(aiTasks).where(and(eq(aiTasks.id,row.taskId),eq(aiTasks.userId,ctx.userId)));
    if(!task||task.projectId!==row.projectId||task.contentOutputId!==row.outputId||row.groupVersion!==null&&row.groupVersion!==task.groupVersion||row.membershipVersion!==null&&row.membershipVersion!==task.membershipVersion)return error("MEDIA_BINDING_MISMATCH","原图片任务冻结身份与绑定不符");
    if(!task.groupId&&!task.accountId)return error("MEDIA_BINDING_MISMATCH","原图片任务缺少可证明来源");
    return {...ctx,accountId:task.accountId,groupId:task.groupId??undefined,groupVersion:task.groupVersion??undefined,membershipVersion:task.membershipVersion??undefined};
  }
  async function binding(ctx: RequestContext, taskId: string) {
    const identity = scope(ctx);
    const [row] = await ports.db.select().from(outputMediaAttempts).where(and(eq(outputMediaAttempts.taskId, taskId),
      eq(outputMediaAttempts.userId, identity.userId), workspaceFilter(outputMediaAttempts,ctx)));
    if (!row) return error("MEDIA_CANDIDATE_NOT_FOUND", "这不是图文媒体候选");
    if (row.kind !== "cover" && row.kind !== "image_card") return error("MEDIA_BINDING_MISMATCH", "图片任务与作品绑定不一致");
    const post = await ports.graphicPosts.getGraphicPost(ctx, row.outputId);
    if (post.projectId !== row.projectId) return error("MEDIA_BINDING_MISMATCH", "封面任务项目归属不一致");
    const originalContext=await historyContext(ctx,row);
    const task = await ports.readTask(originalContext, taskId);
    const frozen = task.inputData;
    const expectedTaskType = row.kind === "cover" ? "cover.generate" : "graphic.card.generate";
    if (task.id!==taskId||task.taskType !== expectedTaskType || task.projectId !== row.projectId || task.contentOutputId !== row.outputId ||
        frozen.outputId !== row.outputId || frozen.contentOutputId !== row.outputId ||
        frozen.projectId !== row.projectId || frozen.artifactId !== post.artifactId || frozen.kind !== row.kind) {
      return error("MEDIA_BINDING_MISMATCH", "图片任务与作品归属不一致");
    }
    const baseVersionId = String(frozen.baseVersionId ?? "");
    const snapshot = row.kind === "cover" ? readFrozenCoverContext(frozen) : readFrozenGraphicCardContext(frozen);
    if (!snapshot) return error("MEDIA_BINDING_MISMATCH", "图片任务缺少创建时的上下文快照");
    const base=await ports.graphicPosts.getVersion(ctx, row.outputId, baseVersionId);
    if(row.kind==="image_card")readFrozenGraphicSeries(frozen,base.document);
    return {row, post, task, baseVersionId,originalContext};
  }
  async function media(ctx: RequestContext, taskId: string) {
    const bound = await binding(ctx, taskId);
    const status = bound.task.status;
    if (status === "queued" || status === "running" || status === "failed" || status === "cancelled") {
      return {bound, status, value: null, errorCode: status === "failed" ? "GENERATION_FAILED" : null};
    }
    if (status !== "awaiting_confirmation" && status !== "succeeded") return error("CANDIDATE_NOT_READY", "封面任务状态无效");
    const results = (await ports.listResults(bound.originalContext, taskId)).filter((item) => item.resultType === "generated_asset");
    if (results.length !== 1) return error("MEDIA_BINDING_MISMATCH", "封面任务没有唯一的真实图片结果");
    const result = results[0]!;
    const assetId = result.assetId ?? (typeof result.resultData.assetId === "string" ? result.resultData.assetId : null);
    if (!assetId || result.resultData.assetId !== assetId || result.resultData.assetType !== "image") {
      return error("MEDIA_BINDING_MISMATCH", "封面候选与图片结果不一致");
    }
    const asset = await ports.assets.getAsset(ctx, assetId);
    const assetFileId = bound.row.assetFileId ?? (typeof result.resultData.assetFileId === "string"?result.resultData.assetFileId:asset.currentFileId);
    if (!assetFileId || (asset.status !== "pending" && asset.status !== "active")) return error("ASSET_NOT_CONFIRMED", "封面图片文件不可用");
    if ((bound.row.assetId && bound.row.assetId !== assetId) ||
        (bound.row.assetFileId && bound.row.assetFileId !== assetFileId)) {
      return error("MEDIA_BINDING_MISMATCH", "封面候选图片与首次回执不一致");
    }
    if (!bound.row.assetId) {
      await ports.db.update(outputMediaAttempts).set({assetId, assetFileId}).where(and(eq(outputMediaAttempts.id, bound.row.id),
        isNull(outputMediaAttempts.assetId), isNull(outputMediaAttempts.assetFileId)));
      const [frozen] = await ports.db.select().from(outputMediaAttempts).where(eq(outputMediaAttempts.id, bound.row.id));
      if (frozen?.assetId !== assetId || frozen.assetFileId !== assetFileId) {
        return error("MEDIA_BINDING_MISMATCH", "封面图片绑定被并发修改");
      }
    }
    await ports.assets.assertAssetFileOwned(ctx, assetId, assetFileId, asset.status === "active");
    await ports.assets.getAssetFileDownloadUrl(ctx, assetId, assetFileId);
    const value = [{assetId, assetFileId, order: 0, role: bound.row.kind === "cover" ? "cover" as const : "card" as const,
      ...(bound.task.inputData.targetSectionId?{cardId:String(bound.task.inputData.targetSectionId)}:{})}];
    return {bound, status: "awaiting_confirmation" as const, value, errorCode: null};
  }
  return {
    owner: "graphic_post",
    async probe(ctx, cell) {
      if (cell.outputType !== "image" || (cell.kind !== "cover" && cell.kind !== "image_card") || cell.owner !== "graphic_post") {
        return {state: "known_unavailable", reasonCode: "ADAPTER_NOT_READY", lastVerifiedAt: null};
      }
      try {
        const result = cell.kind === "cover" ? await ports.probeCover(ctx) : await ports.probeCard(ctx);
        return {state: result.ready ? "supported" : "known_unavailable", reasonCode: result.ready ? null : (result.reasonCode ?? "ADAPTER_NOT_READY"),
          lastVerifiedAt: result.lastVerifiedAt ?? now()};
      } catch { return {state: "unknown", reasonCode: "NOT_VERIFIED", lastVerifiedAt: now()}; }
    },
    async enqueue(ctx, input) {
      if (input.kind !== "cover" && input.kind !== "image_card") return error("UNSUPPORTED_DELIVERABLE", "图片交付项无效");
      if(input.targetSectionId && input.kind!=="image_card")return error("UNSUPPORTED_DELIVERABLE","只有图卡可指定目标页");
      if (input.sourceItemId) return error("SOURCE_UNAVAILABLE", "封面生成尚未接入雷达来源快照");
      const ruleKeys = Object.keys(input.ruleOverrides ?? {});
      if (ruleKeys.some((key) => key !== "visualRequirements")) return error("CAPABILITY_UNAVAILABLE", "封面暂不能应用这些临时规则");
      const visualRequirements = input.ruleOverrides?.visualRequirements;
      if (visualRequirements !== undefined && (typeof visualRequirements !== "string" || visualRequirements.length > COVER_VISUAL_REQUIREMENTS_MAX)) {
        return error("UNSUPPORTED_DELIVERABLE", `画面要求需为 ${COVER_VISUAL_REQUIREMENTS_MAX} 字以内的文字`);
      }
      const identity = scope(ctx);
      const oldRows=await ports.db.select().from(outputMediaAttempts).where(and(eq(outputMediaAttempts.userId, identity.userId),
        workspaceFilter(outputMediaAttempts,ctx), eq(outputMediaAttempts.clientRequestId, input.clientRequestId)));
      if(oldRows.length>1)return error("IDEMPOTENCY_CONFLICT","同组旧账号存在多个原请求，请使用明确候选ID");const [old]=oldRows;
      if (old) {
        if (old.outputId !== input.outputId || old.kind !== input.kind) return error("IDEMPOTENCY_CONFLICT", "同一请求号已用于另一作品");
        const observed = await media(ctx, old.taskId);
        if ((observed.bound.task.inputData.visualRequirements ?? null) !== (visualRequirements ?? null) ||
            (observed.bound.task.inputData.targetSectionId??null)!==(input.targetSectionId??null)) {
          return error("IDEMPOTENCY_CONFLICT", "同一请求号对应不同画面要求");
        }
        return {candidateId: old.taskId, taskId: old.taskId, baseVersionId: observed.bound.baseVersionId,
          ruleSnapshotRef: null, appliedRules: "not_applied",
          sourceRefs: [],
          status: observed.status as "queued" | "running" | "awaiting_confirmation" | "failed" | "cancelled"};
      }
      const attemptId=`creative-${input.kind}:${digest([identity.namespace, input.clientRequestId]).slice(7)}`;
      // Lost submit acknowledgement recovers the original server-owned task before reading a changed draft.
      const recovered=await ports.findTaskByAttempt?.(ctx,input.kind==="cover"?"cover.generate":"graphic.card.generate",attemptId);
      if(recovered){
        const frozen=recovered.inputData;
        if(frozen.outputId!==input.outputId||frozen.projectId!==input.projectId||frozen.kind!==input.kind||
          (frozen.targetSectionId??null)!==(input.targetSectionId??null)||(frozen.visualRequirements??null)!==(visualRequirements??null))return error("IDEMPOTENCY_CONFLICT","同请求已对应另一页或画面要求");
        await submission(ctx,{projectId:input.projectId,outputId:input.outputId},async(tx)=>{
          const [original]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,recovered.id),eq(aiTasks.userId,ctx.userId)));
          if(ctx.groupId&&(!original||original.projectId!==input.projectId||original.contentOutputId!==input.outputId||!isDeepStrictEqual(original.inputData,frozen)||original.groupId!==ctx.groupId))return error("MEDIA_BINDING_MISMATCH","原已提交任务冻结身份不可证明，不能重签恢复");
          await tx.insert(outputMediaAttempts).values({id:nextId(),userId:identity.userId,accountId:identity.accountId,groupId:identity.groupId,
          groupVersion:original?.groupVersion??null,membershipVersion:original?.membershipVersion??null,projectId:input.projectId,outputId:input.outputId,kind:input.kind,taskId:recovered.id,candidateId:recovered.id,
          clientRequestId:input.clientRequestId,requestDigest:digest(frozen),createdAt:now()}).onConflictDoNothing();});
        const observed=await media(ctx,recovered.id);
        return {candidateId:recovered.id,taskId:recovered.id,baseVersionId:observed.bound.baseVersionId,ruleSnapshotRef:null,
          appliedRules:"not_applied",sourceRefs:[],status:observed.status as "queued"|"running"|"awaiting_confirmation"|"failed"|"cancelled"};
      }
      if(ctx.groupId)await assertWritableWorkspace(ports.db,ctx);
      const post = await ports.graphicPosts.getGraphicPost(ctx, input.outputId);
      if (post.projectId !== input.projectId || (input.targetPlatform && post.targetPlatform && post.targetPlatform !== input.targetPlatform)) {
        return error("MEDIA_BINDING_MISMATCH", "封面目标作品不一致");
      }
      const project = await ports.projects.getProject(ctx, post.projectId);
      if(project.archivedAt||project.status==="archived")return error("OUTPUT_NOT_OWNED","项目已归档，不能创建新图片任务");
      const current = post.current;
      let seriesSnapshot:Record<string,unknown>|undefined;
      if(input.targetSectionId){
        try{seriesSnapshot=graphicSeriesSnapshot(current,input.targetSectionId);}catch{return error("UNSUPPORTED_DELIVERABLE","指定图卡不存在或身份重复");}
        const ref=current.seriesProfile?.referenceImage;
        if(ref){
          await ports.assets.assertAssetFileOwned(ctx,ref.assetId,ref.assetFileId,true);
          if(!ports.assets.readImageReference)return error("CAPABILITY_UNAVAILABLE","当前无法读取统一参考的精确文件");
          const proof=await ports.assets.readImageReference(ctx,ref.assetId,ref.assetFileId);
          if(proof.fileId!==ref.assetFileId)return error("MEDIA_BINDING_MISMATCH","参考图片读回了其他文件");
          seriesSnapshot.referenceProof={assetId:ref.assetId,assetFileId:ref.assetFileId,checksum:proof.checksum,mimeType:proof.mimeType};
        }
      }
      const fullText = [current.title, current.body, current.summary].filter(Boolean).join("\n\n");
      const topic = current.title || project.title;
      const contextSnapshot = await ports.freezeCoverContext(ctx, {projectId: post.projectId, topic, fullText});
      const requestDigest = digest({outputId: input.outputId, kind: input.kind, baseVersionId: post.currentVersionId,
        visualRequirements: visualRequirements ?? null, targetSectionId:input.targetSectionId??null,seriesSnapshot,contextSnapshot});
      const submit = input.kind === "cover" ? ports.submitCover : ports.submitCard;
      const frozenContext=await submission(ctx,{projectId:post.projectId,outputId:input.outputId,artifactId:post.artifactId,baseVersionId:post.currentVersionId},async(_tx,frozen)=>frozen);
      const task = await submit(frozenContext, {attemptId,
        projectId: post.projectId, inputData: {projectId: post.projectId, contentOutputId: input.outputId,
          outputId: input.outputId, artifactId: post.artifactId, baseVersionId: post.currentVersionId,
          targetPlatform: input.targetPlatform,
          kind: input.kind, topic,
          ...(input.targetSectionId?{targetSectionId:input.targetSectionId,contentType:"graphic_post",seriesSnapshot}:{}),
          ...(input.kind === "cover" ? {coverContextSnapshot: contextSnapshot} : {cardContextSnapshot: contextSnapshot}),
          ...(visualRequirements ? {visualRequirements} : {}),
          scriptSnapshot: {artifactId: post.artifactId, versionId: post.currentVersionId, fullText},
        }});
      await submission(frozenContext,{projectId:post.projectId,outputId:input.outputId},async tx=>{await tx.insert(outputMediaAttempts).values({id: nextId(), userId: identity.userId, accountId: identity.accountId,groupId:identity.groupId,groupVersion:frozenContext.groupVersion??null,membershipVersion:frozenContext.membershipVersion??null,
        projectId: post.projectId, outputId: input.outputId, kind: input.kind, taskId: task.id,
        candidateId: task.id, clientRequestId: input.clientRequestId, requestDigest, createdAt: now()}).onConflictDoNothing();});
      const observed = await media(ctx, task.id);
      return {candidateId: task.id, taskId: task.id, baseVersionId: observed.bound.baseVersionId,
        ruleSnapshotRef: null, appliedRules: "not_applied", sourceRefs: [],
        status: observed.status as "queued" | "running" | "awaiting_confirmation" | "failed" | "cancelled"};
    },
    async read(ctx, candidateId) {
      const observed = await media(ctx, candidateId);
      return {status: observed.status as "queued" | "running" | "awaiting_confirmation" | "failed" | "cancelled",
        value: observed.value, errorCode: observed.errorCode};
    },
    async retryFrozen(ctx, input) {
      const original = await binding(ctx, input.candidateId);
      if (original.task.status !== "failed" && original.task.status !== "cancelled") {
        return error("CANDIDATE_NOT_READY", "只有失败或取消的封面可重试");
      }
      const identity = scope(ctx);
      const frozen = original.task.inputData;
      const snapshot = original.row.kind === "cover" ? readFrozenCoverContext(frozen) : readFrozenGraphicCardContext(frozen);
      if (!snapshot) return error("SOURCE_UNAVAILABLE", "原图片任务没有可重试的冻结上下文");
      const oldRows=await ports.db.select().from(outputMediaAttempts).where(and(eq(outputMediaAttempts.userId, identity.userId),
        workspaceFilter(outputMediaAttempts,ctx), eq(outputMediaAttempts.clientRequestId, input.clientRequestId)));
      if(oldRows.length>1)return error("IDEMPOTENCY_CONFLICT","同组旧账号存在多个原请求，请使用明确候选ID");const [old]=oldRows;
      if (old) {
        if (old.outputId !== original.row.outputId || old.kind !== original.row.kind || old.requestDigest !== digest({retryOf: original.row.taskId, frozen})) {
          return error("IDEMPOTENCY_CONFLICT", "重试请求号已用于其他图片任务");
        }
        const observed = await media(ctx, old.taskId);
        return {candidateId: old.taskId, taskId: old.taskId, baseVersionId: observed.bound.baseVersionId,
          ruleSnapshotRef: null, appliedRules: "not_applied", sourceRefs: [], status: observed.status as "queued" | "running" | "awaiting_confirmation" | "failed" | "cancelled"};
      }
      const attemptId = `creative-${original.row.kind}-retry:${digest([identity.namespace, input.clientRequestId]).slice(7)}`;
      const submit = original.row.kind === "cover" ? ports.submitCover : ports.submitCard;
      const frozenContext=await submission(original.originalContext,{projectId:original.row.projectId,outputId:original.row.outputId},async()=>original.originalContext);
      const task = await submit(frozenContext, {attemptId, projectId: original.row.projectId, inputData: structuredClone(frozen)});
      await submission(frozenContext,{projectId:original.row.projectId,outputId:original.row.outputId},async tx=>{await tx.insert(outputMediaAttempts).values({id: nextId(), userId: identity.userId, accountId: identity.accountId,groupId:identity.groupId,groupVersion:frozenContext.groupVersion??null,membershipVersion:frozenContext.membershipVersion??null,
        projectId: original.row.projectId, outputId: original.row.outputId, kind: original.row.kind, taskId: task.id,
        candidateId: task.id, clientRequestId: input.clientRequestId, requestDigest: digest({retryOf: original.row.taskId, frozen}),
        createdAt: now()}).onConflictDoNothing();});
      const observed = await media(ctx, task.id);
      return {candidateId: task.id, taskId: task.id, baseVersionId: observed.bound.baseVersionId,
        ruleSnapshotRef: null, appliedRules: "not_applied", sourceRefs: [], status: observed.status as "queued" | "running" | "awaiting_confirmation" | "failed" | "cancelled"};
    },
    async adopt(ctx, input) {
      if ((input.kind !== "cover" && input.kind !== "image_card") || input.expected.owner !== "graphic_post" || typeof input.expected.versionId !== "string") {
        return error("OWNER_MISMATCH", "图片采纳目标不一致");
      }
      const observed = await media(ctx, input.candidateId);
      if (observed.bound.row.kind !== input.kind) return error("MEDIA_BINDING_MISMATCH", "图片候选类型与采纳目标不一致");
      if (observed.status !== "awaiting_confirmation" || !observed.value) return error("CANDIDATE_NOT_READY", "尚未生成真实图片");
      if (!isDeepStrictEqual(input.editedValue, observed.value)) return error("MEDIA_BINDING_MISMATCH", "只能采纳这次任务实际生成的图片文件");
      const base = await ports.graphicPosts.getVersion(ctx, observed.bound.row.outputId, observed.bound.baseVersionId);
      const before = await ports.graphicPosts.getGraphicPost(ctx, observed.bound.row.outputId);
      if (observed.bound.task.status !== "succeeded" && before.currentVersionId !== input.expected.versionId) {
        return error("VERSION_CONFLICT", "图文稿已更新，请重新审读封面");
      }
      const target = before.currentVersionId === input.expected.versionId
        ? before.current : (await ports.graphicPosts.getVersion(ctx, observed.bound.row.outputId, input.expected.versionId)).document;
      // SEMANTIC_BOUNDARY_ALLOW: exact frozen image text comparison only; no aesthetic/content judgment.
      if(observed.bound.task.inputData.targetSectionId && !isDeepStrictEqual(graphicSeriesBasis(base.document),graphicSeriesBasis(target)))return error("VERSION_CONFLICT","逐页规划、正文来源或统一参考已变化，请重新审读生成");
      if (!isDeepStrictEqual([base.document.title, base.document.body, base.document.summary],
          [target.title, target.body, target.summary])) return error("VERSION_CONFLICT", "生成图片所依据的正文已变化，请重新生成图片");
      // For an already confirmed task, construct from expected's immutable document:
      // createVersion replays a saved receipt, or its CAS rejects any new stale write.
      // A task can already be succeeded after an earlier confirm. Confirm only once;
      // if Artifact CAS then conflicts, the activated image remains in the library.
      if (observed.bound.task.status !== "succeeded") await ports.confirmTask(observed.bound.originalContext, input.candidateId);
      const selected = observed.value[0]!;
      const imageUses = input.kind === "cover"
        ? [selected, ...target.imageUses.filter((item) => item.role !== "cover").map((item, index) => ({...item, order: index + 1}))]
        : selected.cardId
          ? (()=>{
            const replaced=target.imageUses.some(item=>item.role==="card"&&item.cardId===selected.cardId);
            const uses=replaced?target.imageUses.map(item=>item.role==="card"&&item.cardId===selected.cardId?{...selected,order:item.order}:item):[...target.imageUses,selected];
            const cards=target.cardBriefs??[];
            // SEMANTIC_BOUNDARY_ALLOW: derives display order from user-specified page IDs, preserving unbound old photo order.
            const boundUses=cards.flatMap(card=>uses.filter(item=>item.role==="card"&&item.cardId===card.cardId));
            const pageIds=new Set(cards.map(card=>card.cardId));
            let cursor=0;
            return uses.map(item=>item.role==="card"&&item.cardId&&pageIds.has(item.cardId)?boundUses[cursor++]!:item).map((item,order)=>({...item,order}));
          })()
          : [...target.imageUses, {...selected, order: target.imageUses.length, role: "card" as const}];
      const document = {...target, imageUses};
      const version = await ports.graphicPosts.createVersion(ctx, observed.bound.row.outputId, {
        expectedCurrentVersionId: input.expected.versionId, document,
        clientRequestId: `creative-${input.kind}:${input.clientRequestId}`,
      });
      return {versionId: version.versionId};
    },
  };
}

/** One owner surface routes text and real media through their respective ports. */
export function combineGraphicPostResultAdapters(text: CreativeResultAdapter, media: CreativeResultAdapter): CreativeResultAdapter {
  const isMedia = (kind: string) => kind === "cover" || kind === "image_card";
  return {
    owner: "graphic_post",
    probe: (ctx, cell) => isMedia(cell.kind) ? media.probe(ctx, cell) : text.probe(ctx, cell),
    enqueue: (ctx, input) => isMedia(input.kind) ? media.enqueue(ctx, input) : text.enqueue(ctx, input),
    read: async (ctx, candidateId,projection) => {
      // Media task IDs have a binding; text candidates do not. A missing binding
      // should not be mistaken for a media ownership failure.
      try { return await media.read(ctx, candidateId); }
      catch (reason) { if ((reason as {code?: string}).code !== "MEDIA_CANDIDATE_NOT_FOUND") throw reason; }
      return text.read(ctx, candidateId,projection);
    },
    adopt: (ctx, input) => isMedia(input.kind) ? media.adopt(ctx, input) : text.adopt(ctx, input),
    retryFrozen: text.retryFrozen && media.retryFrozen ? async (ctx, input) => {
      try { await media.read(ctx, input.candidateId); return media.retryFrozen!(ctx, input); }
      catch (reason) { if ((reason as {code?: string}).code !== "MEDIA_CANDIDATE_NOT_FOUND") throw reason; }
      return text.retryFrozen!(ctx, input);
    } : undefined,
  };
}
