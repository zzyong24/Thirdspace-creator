import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, lt, or,isNull } from "drizzle-orm";
import type { Db } from "@creatoros/backend";
import { projects, contentOutputs } from "../../schema/projects";
import { withWorkspaceParentWrite, type WorkspaceWriteTx } from "../../workspace-write";
import { requireAccountId } from "@creatoros/backend";
import {requireWorkspace,assertWritableWorkspace,workspaceFilter,workspaceKey,workspaceStamp} from "../../workspace-scope";
import { outputConversionReceipt,type OutputConversionReceipt,articleCandidateSection,type ArticleCandidateProposal,outputConversionContext,type OutputConversionContext,graphicPostCardBriefs,type GraphicPostCardBrief,ErrorCode, type RequestContext, type CreativeResult, type CreativeCapability, type CreativeKind, type CreativeOwner, type CreativeBundle } from "@creatoros/contract";
import type { ProjectsService } from "../projects";
import { creativeResults, creativeResultBundles } from "../../schema/creative-results";

type OutputType = "image" | "video" | "article";
type Platform = "xiaohongshu" | "douyin" | "kuaishou" | "wechatOfficialAccount";
export type CreativeCell = {outputType: OutputType; platform: Platform | null; kind: CreativeKind; owner: CreativeOwner};
type Cell = CreativeCell;
type Status = CreativeResult["status"];
const rows: ReadonlyArray<{outputType: OutputType; platforms: readonly (Platform | null)[]; kinds: readonly CreativeKind[]; owner: CreativeOwner}> = [
  {outputType: "image", platforms: [null, "xiaohongshu"], kinds: ["title", "body", "summary", "tags", "cardBriefs", "cover", "image_card"], owner: "graphic_post"},
  {outputType: "video", platforms: [null, "douyin", "kuaishou", "xiaohongshu"], kinds: ["script"], owner: "output_script"},
  {outputType: "article", platforms: [null, "wechatOfficialAccount"], kinds: ["title", "body", "sections", "summary", "cover", "image_card"], owner: "wechat_article"},
  {outputType: "image", platforms: ["xiaohongshu"], kinds: ["publish_title", "description", "publish_tags", "publish_cover"], owner: "publication"},
  {outputType: "video", platforms: ["douyin", "kuaishou", "xiaohongshu"], kinds: ["publish_title", "description", "publish_tags", "publish_cover"], owner: "publication"},
];
const cells: Cell[] = rows.flatMap((row) => row.platforms.flatMap((platform) => row.kinds.map((kind) => ({outputType: row.outputType, platform, kind, owner: row.owner}))));
function sha(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function fail(code: string, message: string): never { const error = new Error(message) as Error & {code: string}; error.code = code; throw error; }
// SEMANTIC_BOUNDARY_ALLOW: 仅按明确协议错误码区分执行前拒绝与提交未知，不判断内容。
export const conversionInputRejectionCodes=new Set<string>([ErrorCode.OwnershipError,ErrorCode.ValidationError,ErrorCode.ConflictError,
 "OUTPUT_NOT_OWNED","SOURCE_ANCHOR_CONFLICT","SOURCE_SELECTION_INVALID","SOURCE_VERSION_CONFLICT","SOURCE_TEXT_REQUIRED",
 "IDEMPOTENCY_CONFLICT","TARGET_PLATFORM_MISMATCH","UNSUPPORTED_CONVERSION","UNSUPPORTED_DELIVERABLE","VERSION_CONFLICT"]);
function owner(ctx: RequestContext) { return {userId: ctx.userId, ...workspaceStamp(workspaceKey(ctx))}; }
function uniqueRequest<T>(values: T[]): T | undefined {if(values.length>1)return fail("IDEMPOTENCY_CONFLICT","同组历史请求来自多个真实账号，请使用原结果ID恢复");return values[0];}
function cellFor(outputType: string, platform: string | null, kind: CreativeKind) {
  const cell = cells.find((candidate) => candidate.outputType === outputType && candidate.platform === platform && candidate.kind === kind);
  if (!cell) fail("UNSUPPORTED_DELIVERABLE", "当前作品形式与平台不支持这个交付项");
  return cell;
}
type CandidateValue = ArticleCandidateProposal["proposedSections"] | string | string[] | GraphicPostCardBrief[] | Array<{assetId: string; assetFileId: string; order: number; role: "cover" | "card"; cardId?:string}>;
export interface CreativeResultAdapter {
  readonly owner: CreativeOwner;
  /** Probe actual runtime readiness; absence of a port is never supported. */
  probe(ctx: RequestContext, cell: Cell): Promise<{state: "supported" | "known_unavailable" | "unknown"; reasonCode: string | null; lastVerifiedAt: string | null}>;
  enqueue(ctx: RequestContext, input: {outputId: string; projectId: string; targetPlatform: string | null; kind: CreativeKind;
    clientRequestId: string; sourceItemId?: string; targetSectionId?: string; ruleOverrides?: Record<string, unknown>;conversion?:OutputConversionContext}): Promise<{
      candidateId: string; taskId: string; baseVersionId: string | null; ruleSnapshotRef: string | null;
      appliedRules: "applied" | "not_applied"; sourceRefs: unknown[]; status: Status;
    }>;
  /** Re-submit the owner's immutable original task input, never today's project/rules. */
  retryFrozen?(ctx: RequestContext, input: {candidateId: string; clientRequestId: string}): Promise<{
    candidateId: string; taskId: string; baseVersionId: string | null; ruleSnapshotRef: string | null;
    appliedRules: "applied" | "not_applied"; sourceRefs: unknown[]; status: Status;
  }>;
  read(ctx: RequestContext, candidateId: string,projection?:{kind:CreativeKind}): Promise<{status: Status; value: CandidateValue | null; errorCode: string | null}>;
  adopt(ctx: RequestContext, input: {candidateId: string; kind: CreativeKind; expected: Record<string, unknown>;
    editedValue: CandidateValue; clientRequestId: string;includeFactItems?:boolean}): Promise<{versionId?: string; publicationId?: string; revisionId?: string}>;
}
export interface CreativeResultsDeps {
  projects: Pick<ProjectsService, "getOutput" | "getProject">;
  adapters: Partial<Record<CreativeOwner, CreativeResultAdapter>>;
  now?: () => string;
  nextId?: () => string;
}
type ResultRow = typeof creativeResults.$inferSelect;
type BundleRow = typeof creativeResultBundles.$inferSelect;
function resultOf(row: ResultRow, value: CandidateValue | null = null): CreativeResult {
  return {resultId: row.id, projectId: row.projectId, outputId: row.outputId, outputType: row.outputType as OutputType,
    targetPlatform: row.targetPlatform as Platform | null, targetSectionId: row.targetSectionId,
    kind: row.kind as CreativeKind, status: row.status as Status,
    typedCandidateRef: row.candidateId ? {owner: row.owner as CreativeOwner, id: row.candidateId} : null,
    taskId: row.taskId, baseVersionId: row.baseVersionId, ruleSnapshotRef: row.ruleSnapshotRef,
    appliedRules: row.appliedRules as "applied" | "not_applied", sourceRefs: row.sourceRefs as unknown[],
    value, retryRequestId:row.retryOf&&!row.candidateId?row.clientRequestId:null, errorCode: row.errorCode, retryOf: row.retryOf, createdAt: row.createdAt, updatedAt: row.updatedAt};
}
function bundleStatus(items: Array<{status: Status}>): CreativeBundle["status"] {
  if (items.every((item) => item.status === "queued")) return "queued";
  if (items.every((item) => item.status === "cancelled")) return "cancelled";
  const success = items.some((item) => item.status === "succeeded" || item.status === "adopted");
  const failure = items.some((item) => item.status === "failed" || item.status === "cancelled");
  if (items.every((item) => item.status === "succeeded" || item.status === "adopted")) return "complete";
  if (items.every((item) => item.status === "failed" || item.status === "cancelled")) return "failed";
  if (success && failure) return "partial_completed";
  return "running";
}

export function createCreativeResultsService(db: Db, deps: CreativeResultsDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const nextId = deps.nextId ?? randomUUID;
  async function withOutputWrite<T>(ctx:RequestContext,outputId:string,work:(tx:WorkspaceWriteTx)=>Promise<T>):Promise<T>{
    return withWorkspaceParentWrite(db,ctx,{table:projects,id:projects.id,userId:projects.userId,groupId:projects.groupId,accountId:projects.accountId,
      via:[{table:contentOutputs,id:contentOutputs.id,parentId:contentOutputs.projectId}]},[outputId],async tx=>{
      const [parent]=await tx.select({archivedAt:projects.archivedAt}).from(projects).innerJoin(contentOutputs,eq(contentOutputs.projectId,projects.id)).where(eq(contentOutputs.id,outputId));
      if(!parent||parent.archivedAt)return fail("OUTPUT_NOT_OWNED","项目已归档，不能新增创作副作用");
      return work(tx);
    });
  }
  async function getOutput(ctx: RequestContext, outputId: string) {
    // The projects service is the account ownership port. Never infer ownership from a submitted accountId.
    try { return await deps.projects.getOutput(ctx, outputId); }
    catch (error) {
      if ((error as {code?: string}).code === ErrorCode.OwnershipError) return fail("OUTPUT_NOT_OWNED", "作品不存在");
      throw error;
    }
  }
  async function scopedResult(ctx: RequestContext, resultId: string) {
    const scope = owner(ctx);
    const [row] = await db.select().from(creativeResults).where(and(eq(creativeResults.id, resultId), eq(creativeResults.userId, scope.userId), workspaceFilter(creativeResults,ctx)));
    if (!row) return fail("OUTPUT_NOT_OWNED", "结果不存在");
    const output = await getOutput(ctx, row.outputId);
    if (output.projectId !== row.projectId) return fail("OUTPUT_NOT_OWNED", "结果归属不一致");
    return row;
  }
  async function readResult(ctx: RequestContext, row: ResultRow): Promise<CreativeResult> {
    if (row.status === "adopted") return resultOf(row);
    if (!row.candidateId) return resultOf(row);
    const adapter = deps.adapters[row.owner as CreativeOwner];
    if (!adapter) return resultOf(row);
    const read = await adapter.read(ctx, row.candidateId,{kind:row.kind as CreativeKind});
    if (read.status !== row.status || read.errorCode !== row.errorCode) {
      await db.update(creativeResults).set({status: read.status, errorCode: read.errorCode, updatedAt: now()})
        .where(and(eq(creativeResults.id, row.id), eq(creativeResults.status, row.status)));
    }
    return {...resultOf(row, read.value), status: read.status, errorCode: read.errorCode};
  }
  async function generate(ctx: RequestContext, input: {outputId: string; kind: CreativeKind; targetPlatform?: Platform | null;
    clientRequestId: string; sourceItemId?: string; targetSectionId?: string; ruleOverrides?: Record<string, unknown>; bundleId?: string; retryOf?: string; reservedId?: string;conversion?:OutputConversionContext}): Promise<CreativeResult> {
    const scope = owner(ctx);await assertWritableWorkspace(db,ctx);
    const unbound=(id:string)=>and(eq(creativeResults.id,id),eq(creativeResults.userId,scope.userId),workspaceFilter(creativeResults,ctx),
      isNull(creativeResults.candidateId),isNull(creativeResults.taskId),isNull(creativeResults.adoptionReceipt),or(eq(creativeResults.status,"queued"),eq(creativeResults.status,"failed")));
    const conversion=input.conversion===undefined?undefined:outputConversionContext.parse(input.conversion);
    if(conversion && (input.sourceItemId || input.ruleOverrides))return fail("SOURCE_SELECTION_INVALID","转换不能混用其他生成来源或当前规则");
    const output = await getOutput(ctx, input.outputId);
    const savedPlatform = (output as typeof output & {targetPlatform?: string | null}).targetPlatform ?? null;
    if (input.targetPlatform && savedPlatform && input.targetPlatform !== savedPlatform) return fail("TARGET_PLATFORM_MISMATCH", "作品目标平台与请求不一致");
    const targetPlatform = input.targetPlatform === undefined ? savedPlatform : input.targetPlatform;
    if(conversion && (conversion.request.targetType!==output.contentType||conversion.request.sourceOutputId===output.id||
      (conversion.request.targetPlatform!==undefined && conversion.request.targetPlatform!==savedPlatform)))return fail("TARGET_PLATFORM_MISMATCH","转换目标与真实作品不一致");
    const cell = cellFor(output.contentType, targetPlatform, input.kind);
    if (input.targetSectionId && (!["article","image"].includes(output.contentType) || input.kind !== "image_card"))
      return fail("UNSUPPORTED_DELIVERABLE", "只有文章或图文配图可以指定目标页");
    const requestDigest = sha({outputId: input.outputId, kind: input.kind, targetPlatform,
      sourceItemId: input.sourceItemId ?? null, targetSectionId: input.targetSectionId ?? null,
      ruleOverrides: input.ruleOverrides ?? null, retryOf: input.retryOf ?? null,...(conversion?{conversion}:{})});
    const existing=uniqueRequest(await db.select().from(creativeResults).where(and(eq(creativeResults.userId, scope.userId),
      workspaceFilter(creativeResults,ctx), eq(creativeResults.clientRequestId, input.clientRequestId))));
    if (existing) {
      if (existing.requestDigest !== requestDigest) return fail("IDEMPOTENCY_CONFLICT", "同一请求号对应不同输入");
      if (existing.candidateId || (existing.status !== "queued" && !(conversion&&existing.status==="failed"&&!existing.taskId))) return readResult(ctx, existing);
      // Submission may have been interrupted after the durable reservation. The owner
      // receives the same request key, so its enqueue must return the original task.
    }
    const adapter = deps.adapters[cell.owner];
    if (!adapter || adapter.owner !== cell.owner) {
      if (existing) await db.update(creativeResults).set({status: "failed", errorCode: "ADAPTER_NOT_READY", updatedAt: now()}).where(unbound(existing.id));
      return fail("CAPABILITY_UNAVAILABLE", "ADAPTER_NOT_READY");
    }
    const ability = await adapter.probe(ctx, cell);
    if (ability.state !== "supported") {
      if (existing) await db.update(creativeResults).set({status: "failed", errorCode: ability.reasonCode ?? "NOT_VERIFIED", updatedAt: now()}).where(unbound(existing.id));
      return fail("CAPABILITY_UNAVAILABLE", ability.reasonCode ?? "NOT_VERIFIED");
    }
    let resultId = existing?.id ?? input.reservedId ?? nextId();
    if (!existing) await withOutputWrite(ctx,output.id,async tx=>tx.insert(creativeResults).values({id: resultId, userId: scope.userId, accountId: scope.accountId, groupId:scope.groupId,
      projectId: output.projectId, outputId: input.outputId, outputType: output.contentType, targetPlatform,
      targetSectionId: input.targetSectionId ?? null,
      kind: input.kind, owner: cell.owner, requestDigest, clientRequestId: input.clientRequestId,
      retryOf: input.retryOf ?? null, conversionContext:conversion??null,bundleId: input.bundleId ?? null, createdAt: now(), updatedAt: now()}).onConflictDoNothing());
    const winner=uniqueRequest(await db.select().from(creativeResults).where(and(eq(creativeResults.userId,scope.userId),workspaceFilter(creativeResults,ctx),eq(creativeResults.clientRequestId,input.clientRequestId))));
    if(!winner || winner.requestDigest!==requestDigest)return fail("IDEMPOTENCY_CONFLICT","同一请求号对应不同输入");
    resultId=winner.id;
    if(winner.candidateId || (winner.status!=="queued"&&!(conversion&&winner.status==="failed"&&!winner.taskId)))return readResult(ctx,winner);
    try {
      const task = await adapter.enqueue(ctx, {outputId: input.outputId, projectId: output.projectId, targetPlatform,
        kind: input.kind, clientRequestId: input.clientRequestId, sourceItemId: input.sourceItemId,
        targetSectionId: input.targetSectionId, ruleOverrides: input.ruleOverrides,conversion});
      // A durable result ID exists before enqueue. Re-entry uses the same owner request key.
      await db.update(creativeResults).set({candidateId: task.candidateId, taskId: task.taskId,
        baseVersionId: task.baseVersionId, ruleSnapshotRef: task.ruleSnapshotRef, appliedRules: task.appliedRules,
        sourceRefs: task.sourceRefs, status: task.status,errorCode:null, updatedAt: now()}).where(unbound(resultId));
    } catch (error) {
      const code=(error as {code?:string})?.code;
      const durable=Boolean(conversion || (output.contentType==="image" && input.kind==="image_card" && input.targetSectionId));
      const rejected=durable&&code!==undefined&&conversionInputRejectionCodes.has(code);
      const changed=await db.update(creativeResults).set({status: durable&&!rejected?"queued":"failed", errorCode: rejected?code:durable?"GENERATION_SUBMISSION_UNKNOWN":"GENERATION_SUBMISSION_FAILED", updatedAt: now()}).where(unbound(resultId)).returning({id:creativeResults.id});
      if(!changed.length&&!rejected){const winner=await scopedResult(ctx,resultId);if(winner.taskId||winner.adoptionReceipt)return readResult(ctx,winner);}
      throw error;
    }
    return readResult(ctx, await scopedResult(ctx, resultId));
  }
  async function getBundle(ctx: RequestContext, bundleId: string): Promise<CreativeBundle> {
    const scope = owner(ctx);
    const [row] = await db.select().from(creativeResultBundles).where(and(eq(creativeResultBundles.id, bundleId),
      eq(creativeResultBundles.userId, scope.userId), workspaceFilter(creativeResultBundles,ctx)));
    if (!row) return fail("OUTPUT_NOT_OWNED", "作品套装不存在");
    if (!row.outputId) return fail("CONVERSION_PENDING", "目标作品正在创建，请使用原转换请求恢复");
    const output = await getOutput(ctx, row.outputId);
    if (output.projectId !== row.projectId) return fail("OUTPUT_NOT_OWNED", "作品套装归属不一致");
    const selected = row.items as Array<{kind: CreativeKind; targetPlatform: Platform | null; targetSectionId?: string; resultId: string}>;
    const items = await Promise.all(selected.map(async (item) => {
      const result = await readResult(ctx, await scopedResult(ctx, item.resultId));
      return {...item, status: result.status, errorCode: result.errorCode};
    }));
    return {bundleId: row.id, outputId: row.outputId, status: bundleStatus(items), items, createdAt: row.createdAt};
  }
  return {
    async reserveConversionFields(ctx:RequestContext,bundleId:string) {
      const scope=owner(ctx);await assertWritableWorkspace(db,ctx);
      const [prior]=await db.select().from(creativeResultBundles).where(and(eq(creativeResultBundles.id,bundleId),eq(creativeResultBundles.userId,scope.userId),workspaceFilter(creativeResultBundles,ctx)));
      if(!prior?.outputId)return fail("CONVERSION_PENDING","转换目标尚未绑定");
      const output=await getOutput(ctx,prior.outputId);
      if(output.projectId!==prior.projectId)return fail("OUTPUT_NOT_OWNED","转换目标归属不一致");
      const conversion=outputConversionContext.parse(prior.conversionContext);
      if(conversion.request.targetType!==output.contentType)return fail("TARGET_PLATFORM_MISMATCH","转换目标类型不一致");
      const targetPlatform=output.targetPlatform as Platform|null;
      if(conversion.request.targetPlatform!==undefined&&conversion.request.targetPlatform!==targetPlatform)return fail("TARGET_PLATFORM_MISMATCH","转换目标平台不一致");
      // SEMANTIC_BOUNDARY_ALLOW: whole 固定协议必需项；selected 原样落实用户授权字段，不进行语义映射。
      const wholeFields={article:["title","summary","sections"],image:["title","body","cardBriefs"],video:["script"]} as const;
      const fields:CreativeKind[]=conversion.request.mode==="selected"?[...conversion.request.targetFields]:[...wholeFields[conversion.request.targetType]];
      return withOutputWrite(ctx,output.id,async tx=>{
        const [bundle]=await tx.select().from(creativeResultBundles).where(and(eq(creativeResultBundles.id,bundleId),eq(creativeResultBundles.userId,scope.userId),workspaceFilter(creativeResultBundles,ctx))).for("update");
        if(!bundle||bundle.outputId!==output.id||!isDeepStrictEqual(bundle.conversionContext,prior.conversionContext))return fail("VERSION_CONFLICT","转换预约已变化");
        const plans:Array<{kind:CreativeKind;targetPlatform:Platform|null;resultId:string;clientRequestId:string}>=[];
        const existingItems=bundle.items as Array<{kind:CreativeKind;resultId:string}>;
        if(existingItems.length){
          if(existingItems.length!==fields.length||existingItems.some((item,i)=>item.kind!==fields[i]))return fail("SOURCE_ANCHOR_CONFLICT","转换字段映射被改变");
          for(const item of existingItems){
            const [row]=await tx.select().from(creativeResults).where(and(eq(creativeResults.id,item.resultId),eq(creativeResults.userId,scope.userId),workspaceFilter(creativeResults,ctx)));
            if(!row||row.bundleId!==bundle.id||row.outputId!==output.id||row.kind!==item.kind||!isDeepStrictEqual(row.conversionContext,bundle.conversionContext))return fail("SOURCE_ANCHOR_CONFLICT","转换字段的原结果不存在或来源改变");
            plans.push({kind:item.kind,targetPlatform,resultId:row.id,clientRequestId:row.clientRequestId});
          }
          return plans;
        }

        for(const kind of fields){
          const cell=cellFor(output.contentType,targetPlatform,kind),clientRequestId=`conversion-field-${bundle.id}-${kind}`;
          const requestDigest=sha({outputId:output.id,kind,targetPlatform,sourceItemId:null,targetSectionId:null,ruleOverrides:null,retryOf:null,conversion});
          await tx.insert(creativeResults).values({id:nextId(),userId:scope.userId,accountId:scope.accountId,groupId:scope.groupId,projectId:output.projectId,outputId:output.id,
            outputType:output.contentType,targetPlatform,kind,owner:cell.owner,requestDigest,clientRequestId,conversionContext:conversion,bundleId:bundle.id,
            sourceRefs:[conversion.sourceAnchor],createdAt:now(),updatedAt:now()}).onConflictDoNothing();
          const [row]=await tx.select().from(creativeResults).where(and(eq(creativeResults.userId,scope.userId),workspaceFilter(creativeResults,ctx),eq(creativeResults.clientRequestId,clientRequestId)));
          if(!row||row.requestDigest!==requestDigest||row.bundleId!==bundle.id)return fail("IDEMPOTENCY_CONFLICT","转换字段预约不一致");
          plans.push({kind,targetPlatform,resultId:row.id,clientRequestId});
        }
        await tx.update(creativeResultBundles).set({items:plans.map(({clientRequestId,...item})=>item)}).where(eq(creativeResultBundles.id,bundle.id));
        return plans;
      });
    },
    async getConversionReceipt(ctx:RequestContext,bundleId:string):Promise<OutputConversionReceipt> {
      const scope=owner(ctx);
      const [bundle]=await db.select().from(creativeResultBundles).where(and(eq(creativeResultBundles.id,bundleId),eq(creativeResultBundles.userId,scope.userId),workspaceFilter(creativeResultBundles,ctx)));
      if(!bundle?.outputId)return fail("CONVERSION_PENDING","转换目标尚未绑定");
      const output=await getOutput(ctx,bundle.outputId),conversion=outputConversionContext.parse(bundle.conversionContext);
      if(output.projectId!==bundle.projectId||output.contentType!==conversion.request.targetType)return fail("OUTPUT_NOT_OWNED","转换目标归属不一致");
      const mapping=bundle.items as Array<{kind:CreativeKind;resultId:string}>;
      if(!mapping.length)return fail("CONVERSION_PENDING","转换字段尚未预约");
      const items=await Promise.all(mapping.map(async item=>{
        const row=await scopedResult(ctx,item.resultId);
        if(row.bundleId!==bundle.id||row.outputId!==bundle.outputId||row.kind!==item.kind||!isDeepStrictEqual(row.conversionContext,bundle.conversionContext))return fail("SOURCE_ANCHOR_CONFLICT","转换结果与预约映射不一致");
        const result=await readResult(ctx,row),adoption=row.adoptionReceipt as {versionId?:string}|null;
        if(adoption&&(!adoption.versionId||!row.adoptionClientRequestId))return fail("SOURCE_ANCHOR_CONFLICT","转换采用缺少真实版本回执");
        return {targetField:item.kind,resultId:row.id,taskId:result.taskId,status:result.status,errorCode:result.errorCode,
          adoption:adoption?{status:"adopted",versionId:adoption.versionId,clientRequestId:row.adoptionClientRequestId}:{status:"not_adopted"}};
      }));
      return outputConversionReceipt.parse({targetOutputId:output.id,targetType:output.contentType,resultId:items[0]!.resultId,taskId:items[0]!.taskId,bundleId:bundle.id,
        sourceAnchor:conversion.sourceAnchor,requestSummary:conversion.request,targetFields:mapping.map(item=>item.kind),items,status:bundleStatus(items),});
    },
    async listCapabilities(ctx: RequestContext, input: {accountId?: string; projectId?: string; outputId?: string}): Promise<{items: CreativeCapability[]}> {
      requireWorkspace(ctx);await assertWritableWorkspace(db,ctx,{allowArchived:true});
      if (!ctx.groupId && input.accountId !== undefined && requireAccountId(ctx.accountId,"creative-results capabilities") !== input.accountId) return fail("OUTPUT_NOT_OWNED", "账号不存在");
      if (input.outputId) {
        const output = await getOutput(ctx, input.outputId);
        if (input.projectId && output.projectId !== input.projectId) return fail("OUTPUT_NOT_OWNED", "作品不属于项目");
      } else if (input.projectId) {
        await deps.projects.getProject(ctx, input.projectId);
      }
      const output = input.outputId ? await getOutput(ctx, input.outputId) : null;
      const outputType = output?.contentType ?? null;
      const savedPlatform = output ? ((output as typeof output & {targetPlatform?: string | null}).targetPlatform ?? null) : null;
      const items = await Promise.all(cells.filter((cell) => (!outputType || cell.outputType === outputType)
        && (!savedPlatform || cell.platform === savedPlatform)).map(async (cell): Promise<CreativeCapability> => {
        const publicCell = {outputType: cell.outputType, platform: cell.platform, kind: cell.kind};
        const adapter = deps.adapters[cell.owner];
        if (!adapter || adapter.owner !== cell.owner) return {...publicCell, state: "known_unavailable", reasonCode: "ADAPTER_NOT_READY", lastVerifiedAt: now()};
        const result = await adapter.probe(ctx, cell);
        return {...publicCell, state: result.state, reasonCode: result.reasonCode, lastVerifiedAt: result.lastVerifiedAt};
      }));
      return {items};
    },
    generate,
    async get(ctx: RequestContext, resultId: string) { return readResult(ctx, await scopedResult(ctx, resultId)); },
    async list(ctx: RequestContext, input: {outputId: string; bundleId?: string; cursor?: string; pageSize?: number}) {
      const scope = owner(ctx); await getOutput(ctx, input.outputId);
      const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
      const cursor = input.cursor ? JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as {createdAt: string; id: string} : null;
      const where = and(eq(creativeResults.userId, scope.userId), workspaceFilter(creativeResults,ctx),
        eq(creativeResults.outputId, input.outputId), input.bundleId ? eq(creativeResults.bundleId, input.bundleId) : undefined,
        cursor ? or(lt(creativeResults.createdAt, cursor.createdAt), and(eq(creativeResults.createdAt, cursor.createdAt), lt(creativeResults.id, cursor.id))) : undefined);
      const rows = await db.select().from(creativeResults).where(where).orderBy(desc(creativeResults.createdAt), desc(creativeResults.id)).limit(pageSize + 1);
      const items = await Promise.all(rows.slice(0, pageSize).map((row) => readResult(ctx, row)));
      const last = rows[pageSize - 1];
      return {items, nextCursor: rows.length > pageSize && last ? Buffer.from(JSON.stringify({createdAt: last.createdAt, id: last.id})).toString("base64url") : null};
    },
    async adopt(ctx: RequestContext, input: {resultId: string; expected: Record<string, unknown>; editedValue: CandidateValue; clientRequestId: string;includeFactItems?:boolean}) {
      const row = await scopedResult(ctx, input.resultId);
      const digest = sha(input);
      if (row.adoptionReceipt) {
        if (row.adoptionDigest !== digest) return fail("IDEMPOTENCY_CONFLICT", "该候选已经以其他内容采纳");
        return row.adoptionReceipt as Record<string, unknown>;
      }
      await assertWritableWorkspace(db,ctx);
      const candidate = await readResult(ctx, row);
      if(input.includeFactItems&&row.kind!=="sections")return fail("UNSUPPORTED_DELIVERABLE","只有文章结构段落可明确采用关联事实清单");
      const expectedOwner = input.expected.owner;
      if (expectedOwner !== row.owner) return fail("OWNER_MISMATCH", "候选归属类型不匹配");
      const media = row.kind === "cover" || row.kind === "image_card" || row.kind === "publish_cover";
      if (candidate.status !== "adopted" && candidate.status !== (media ? "awaiting_confirmation" : "succeeded"))
        return fail("CANDIDATE_NOT_READY", "候选尚不可采纳");
      const tags = row.kind === "tags" || row.kind === "publish_tags";
      if (media ? !Array.isArray(input.editedValue) || input.editedValue.some((item) => typeof item !== "object" || item === null || !("assetFileId" in item))
        : row.kind==="sections" ? !articleCandidateSection.array().safeParse(input.editedValue).success
        : row.kind==="cardBriefs" ? !graphicPostCardBriefs.safeParse(input.editedValue).success
        : tags ? !Array.isArray(input.editedValue) || input.editedValue.some((item) => typeof item !== "string")
          : typeof input.editedValue !== "string") return fail("UNSUPPORTED_DELIVERABLE", "候选内容类型与交付项不符");
      if (!row.candidateId) return fail("CANDIDATE_NOT_READY", "候选尚未生成");
      const adapter = deps.adapters[row.owner as CreativeOwner];
      if (!adapter) return fail("CAPABILITY_UNAVAILABLE", "ADAPTER_NOT_READY");
      const cell = cellFor(row.outputType, row.targetPlatform, row.kind as CreativeKind);
      if (cell.owner !== row.owner || adapter.owner !== cell.owner)
        return fail("OWNER_MISMATCH", "候选归属类型与交付项不匹配");
      const receipt = await adapter.adopt(ctx, {candidateId: row.candidateId, kind: row.kind as CreativeKind,
        expected: input.expected, editedValue: input.editedValue, clientRequestId: input.clientRequestId,...(input.includeFactItems!==undefined?{includeFactItems:input.includeFactItems}:{})});
      const response = {owner: row.owner, resultId: row.id, status: "adopted" as const, ...receipt};
      await withOutputWrite(ctx,row.outputId,async tx=>{
        const saved=await tx.update(creativeResults).set({status: "adopted", adoptionReceipt: response, adoptionDigest: digest,adoptionClientRequestId:input.clientRequestId, updatedAt: now()})
          .where(and(eq(creativeResults.id,row.id),eq(creativeResults.userId,ctx.userId),workspaceFilter(creativeResults,ctx),isNull(creativeResults.adoptionReceipt))).returning();
        if(!saved.length){const [prior]=await tx.select().from(creativeResults).where(and(eq(creativeResults.id,row.id),eq(creativeResults.userId,ctx.userId),workspaceFilter(creativeResults,ctx)));
          if(!prior?.adoptionReceipt||prior.adoptionDigest!==digest)return fail("IDEMPOTENCY_CONFLICT","原owner已提交，创作结果需沿原回执恢复");
        }
      });
      return response;
    },
    async retry(ctx: RequestContext, resultId: string, clientRequestId: string) {
      await assertWritableWorkspace(db,ctx);
      const row=await scopedResult(ctx,resultId),scope=owner(ctx);
      if(clientRequestId.length<8||clientRequestId.length>128)return fail("SOURCE_SELECTION_INVALID","重试请求号无效");
      const requestDigest=sha({retryOf:row.id,outputId:row.outputId,kind:row.kind,targetPlatform:row.targetPlatform});
      const keyWhere=and(eq(creativeResults.userId,scope.userId),workspaceFilter(creativeResults,ctx),eq(creativeResults.clientRequestId,clientRequestId));
      const checkPrior=(prior:ResultRow)=>{if(prior.requestDigest!==requestDigest)return fail("IDEMPOTENCY_CONFLICT","重试请求号对应不同结果");return prior;};
      const found=uniqueRequest(await db.select().from(creativeResults).where(keyWhere));
      let pending=found?checkPrior(found):undefined;
      if(pending?.candidateId)return readResult(ctx,pending);
      if(!pending){const current=await readResult(ctx,row);if(current.status!=="failed"&&current.status!=="cancelled")return fail("CANDIDATE_NOT_READY","该结果不可重试");}
      const adapter=deps.adapters[row.owner as CreativeOwner];
      if(!adapter?.retryFrozen||!row.candidateId)return fail("CAPABILITY_UNAVAILABLE","RETRY_CONTEXT_NOT_FROZEN");
      const ability=await adapter.probe(ctx,cellFor(row.outputType,row.targetPlatform,row.kind as CreativeKind));
      if(ability.state!=="supported")return fail("CAPABILITY_UNAVAILABLE",ability.reasonCode??"NOT_VERIFIED");
      if(!pending){
        try{pending=await withOutputWrite(ctx,row.outputId,async tx=>{
          const prior=uniqueRequest(await tx.select().from(creativeResults).where(keyWhere));if(prior)return checkPrior(prior);
          let bundle:typeof creativeResultBundles.$inferSelect|undefined;
          if(row.bundleId){
            [bundle]=await tx.select().from(creativeResultBundles).where(and(eq(creativeResultBundles.id,row.bundleId),eq(creativeResultBundles.userId,scope.userId),workspaceFilter(creativeResultBundles,ctx))).for("update");
            if(!bundle)return fail("OUTPUT_NOT_OWNED","作品套装不存在");
            const afterLock=uniqueRequest(await tx.select().from(creativeResults).where(keyWhere));if(afterLock)return checkPrior(afterLock);
            if(!(bundle.items as Array<{resultId:string}>).some(item=>item.resultId===row.id))return fail("VERSION_CONFLICT","套装失败项已由其他重试替换");
          }
          const [reserved]=await tx.insert(creativeResults).values({id:nextId(),userId:scope.userId,accountId:scope.accountId,groupId:scope.groupId,
            projectId:row.projectId,outputId:row.outputId,outputType:row.outputType,targetPlatform:row.targetPlatform,targetSectionId:row.targetSectionId,
            kind:row.kind,owner:row.owner,candidateId:null,taskId:null,baseVersionId:row.baseVersionId,ruleSnapshotRef:row.ruleSnapshotRef,
            sourceRefs:row.sourceRefs,appliedRules:row.appliedRules,requestDigest,clientRequestId,status:"queued",errorCode:"RETRY_SUBMISSION_PENDING",
            retryOf:row.id,conversionContext:row.conversionContext,bundleId:row.bundleId,createdAt:now(),updatedAt:now()}).returning();
          if(!reserved)throw Error("重试预约未保存");
          if(bundle)await tx.update(creativeResultBundles).set({items:(bundle.items as Array<{resultId:string}>).map(item=>item.resultId===row.id?{...item,resultId:reserved.id}:item)}).where(eq(creativeResultBundles.id,bundle.id));
          return reserved;
        });}catch(error){const winner=uniqueRequest(await db.select().from(creativeResults).where(keyWhere));if(!winner)throw error;pending=checkPrior(winner);}
      }
      if(pending.candidateId)return readResult(ctx,pending);
      const unbound=and(eq(creativeResults.id,pending.id),eq(creativeResults.userId,scope.userId),workspaceFilter(creativeResults,ctx),isNull(creativeResults.candidateId),isNull(creativeResults.taskId),isNull(creativeResults.adoptionReceipt));
      try{
        const retried=await adapter.retryFrozen(ctx,{candidateId:row.candidateId,clientRequestId});
        // SEMANTIC_BOUNDARY_ALLOW: 只比较真实冻结来源和规则，不选择创作内容。
        if(retried.baseVersionId!==row.baseVersionId||retried.ruleSnapshotRef!==row.ruleSnapshotRef||!isDeepStrictEqual(retried.sourceRefs,row.sourceRefs))return fail("SOURCE_UNAVAILABLE","重试任务未保留原始资料和规则快照");
        await db.update(creativeResults).set({candidateId:retried.candidateId,taskId:retried.taskId,status:retried.status,errorCode:null,updatedAt:now()}).where(unbound);
      }catch(error){await db.update(creativeResults).set({errorCode:"RETRY_SUBMISSION_UNKNOWN",updatedAt:now()}).where(unbound);throw error;}
      return readResult(ctx,await scopedResult(ctx,pending.id));
    },
    async createBundle(ctx: RequestContext, input: {outputId: string; items: Array<{kind: CreativeKind; targetPlatform?: Platform | null; targetSectionId?: string}>; clientRequestId: string}) {
      const scope = owner(ctx);await assertWritableWorkspace(db,ctx); const output = await getOutput(ctx, input.outputId);
      const digest = sha({outputId: input.outputId, items: input.items});
      const old=uniqueRequest(await db.select().from(creativeResultBundles).where(and(eq(creativeResultBundles.userId, scope.userId),
        workspaceFilter(creativeResultBundles,ctx), eq(creativeResultBundles.clientRequestId, input.clientRequestId))));
      if (old && old.requestDigest !== digest) return fail("IDEMPOTENCY_CONFLICT", "套装请求号对应不同内容");
      if (!input.items.length || input.items.length > 12) return fail("UNSUPPORTED_DELIVERABLE", "套装交付项数量无效");
      const selected = old ? old.items as Array<{kind: CreativeKind; targetPlatform: Platform | null; targetSectionId?: string; resultId: string; requestId: string}> : input.items.map((item, index) => {
        const platform = item.targetPlatform === undefined ? ((output as typeof output & {targetPlatform?: string | null}).targetPlatform ?? null) : item.targetPlatform;
        cellFor(output.contentType, platform, item.kind);
        return {kind: item.kind, targetPlatform: platform as Platform | null,
          ...(item.targetSectionId ? {targetSectionId: item.targetSectionId} : {}),
          resultId: nextId(), requestId: `${input.clientRequestId}:${index}`};
      });
      // Reserve the complete manifest first. A crash can resume each deterministic item key.
      const bundleId = old?.id ?? nextId();
      if (!old) await withOutputWrite(ctx,output.id,async tx => {
        await tx.insert(creativeResultBundles).values({id: bundleId, userId: scope.userId, accountId: scope.accountId, groupId:scope.groupId,
          projectId: output.projectId, outputId: input.outputId, items: selected, requestDigest: digest,
          clientRequestId: input.clientRequestId, createdAt: now()});
        await tx.insert(creativeResults).values(selected.map((item) => ({
          id: item.resultId, userId: scope.userId, accountId: scope.accountId, groupId:scope.groupId, projectId: output.projectId,
          outputId: input.outputId, outputType: output.contentType, targetPlatform: item.targetPlatform,
          targetSectionId: item.targetSectionId ?? null,
          kind: item.kind, owner: cellFor(output.contentType, item.targetPlatform, item.kind).owner,
          requestDigest: sha({outputId: input.outputId, kind: item.kind, targetPlatform: item.targetPlatform,
            sourceItemId: null, targetSectionId: item.targetSectionId ?? null,
            ruleOverrides: null, retryOf: null}), clientRequestId: item.requestId,
          bundleId, createdAt: now(), updatedAt: now(),
        })));
      });
      for (const item of selected) {
        try { await generate(ctx, {outputId: input.outputId, kind: item.kind, targetPlatform: item.targetPlatform,
          targetSectionId: item.targetSectionId, clientRequestId: item.requestId, bundleId, reservedId: item.resultId}); }
        catch (error) {
          await db.update(creativeResults).set({status: "failed", errorCode: (error as {code?: string}).code ?? "GENERATION_SUBMISSION_FAILED",
            updatedAt: now()}).where(and(eq(creativeResults.id, item.resultId), eq(creativeResults.status, "queued")));
        }
      }
      return getBundle(ctx, bundleId);
    },
    getBundle,
    async listBundles(ctx: RequestContext, input: {outputId: string; cursor?: string; pageSize?: number}) {
      const scope = owner(ctx); await getOutput(ctx, input.outputId);
      const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
      const cursor = input.cursor ? JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as {createdAt: string; id: string} : null;
      const rows = await db.select().from(creativeResultBundles).where(and(eq(creativeResultBundles.userId, scope.userId),
        workspaceFilter(creativeResultBundles,ctx), eq(creativeResultBundles.outputId, input.outputId),
        cursor ? or(lt(creativeResultBundles.createdAt, cursor.createdAt), and(eq(creativeResultBundles.createdAt, cursor.createdAt), lt(creativeResultBundles.id, cursor.id))) : undefined))
        .orderBy(desc(creativeResultBundles.createdAt), desc(creativeResultBundles.id)).limit(pageSize + 1);
      const items = await Promise.all(rows.slice(0, pageSize).map((row: BundleRow) => getBundle(ctx, row.id)));
      const last = rows[pageSize - 1];
      return {items, nextCursor: rows.length > pageSize && last ? Buffer.from(JSON.stringify({createdAt: last.createdAt, id: last.id})).toString("base64url") : null};
    },
  };
}
export type CreativeResultsService = ReturnType<typeof createCreativeResultsService>;
