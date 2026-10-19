import {createHash,randomUUID} from "node:crypto";
import {and,eq,isNull,requireAccountId,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import type {CoverContext} from "@creatoros/ai-worker/cover";
import type {AssetsService} from "../assets";
import type {CreativeResultAdapter} from "../creative-results/creative-results.service";
import {outputMediaAttempts} from "../../schema/creative-results";
import {readFrozenCoverContext} from "../ai-runtime/frozen-cover-context";
import type {PublicationResultsService} from "./publication-results.service";

type Task={id:string;taskType:string;status:string;projectId:string|null;contentOutputId:string|null;inputData:Record<string,unknown>};
type Result={resultType:string;assetId:string|null;resultData:Record<string,unknown>};
function fail(code:string,message:string):never{const e=new Error(message) as Error&{code:string};e.code=code;throw e;}
function digest(raw:unknown){return createHash("sha256").update(JSON.stringify(raw)).digest("hex");}
type Expected={mode:"existing";publicationId:string;revisionId:string}|{mode:"create";outputId:string;platform:string;expectedAbsent:true};

export interface PublicationCoverPorts{
  db:Db;
  owner:Pick<PublicationResultsService,"readCoverBase"|"verifyCoverBinding"|"adoptCover">;
  assets:Pick<AssetsService,"getAsset"|"assertAssetFileOwned"|"getAssetFileDownloadUrl">;
  resolveCoverSource(ctx:RequestContext,input:{outputId:string;platform:string;outputType:string}):Promise<{
    topic:string;fullText:string;artifactId?:string;versionId?:string}>;
  freezeCoverContext(ctx:RequestContext,input:{projectId:string;topic:string;fullText:string}):Promise<CoverContext>;
  submitCover(ctx:RequestContext,input:{attemptId:string;projectId:string;inputData:Record<string,unknown>}):Promise<{id:string}>;
  readTask(ctx:RequestContext,id:string):Promise<Task>;
  listResults(ctx:RequestContext,id:string):Promise<Result[]>;
  confirmTask(ctx:RequestContext,id:string):Promise<unknown>;
  probeCover(ctx:RequestContext):Promise<{ready:boolean;reasonCode?:string;lastVerifiedAt?:string}>;
  now?:()=>string;nextId?:()=>string;
}

/** Output-bound real cover asset candidate, with Publishing owning the final revision CAS. */
export function createPublicationCoverCreativeResultAdapter(ports:PublicationCoverPorts):CreativeResultAdapter{
  const now=ports.now??(()=>new Date().toISOString()),nextId=ports.nextId??randomUUID;
  const scope=(ctx:RequestContext)=>({userId:ctx.userId,accountId:requireAccountId(ctx.accountId,"publication-cover")});
  async function bound(ctx:RequestContext,taskId:string){
    const owner=scope(ctx);
    const [row]=await ports.db.select().from(outputMediaAttempts).where(and(eq(outputMediaAttempts.taskId,taskId),
      eq(outputMediaAttempts.userId,owner.userId),eq(outputMediaAttempts.accountId,owner.accountId)));
    if(!row)fail("MEDIA_CANDIDATE_NOT_FOUND","发布封面候选不存在");
    if(row.kind!=="publish_cover")fail("MEDIA_BINDING_MISMATCH","媒体候选类型不符");
    const task=await ports.readTask(ctx,taskId),frozen=task.inputData;
    if(task.taskType!=="cover.generate"||task.projectId!==row.projectId||task.contentOutputId!==row.outputId||
      frozen.projectId!==row.projectId||frozen.outputId!==row.outputId||frozen.contentOutputId!==row.outputId||
      frozen.kind!=="publish_cover"||!readFrozenCoverContext(frozen))fail("MEDIA_BINDING_MISMATCH","封面任务与作品绑定不一致");
    const platform=String(frozen.targetPlatform??"");
    const publicationId=frozen.publicationId===null?null:String(frozen.publicationId??"");
    const baseRevisionId=frozen.baseRevisionId===null?null:String(frozen.baseRevisionId??"");
    await ports.owner.verifyCoverBinding(ctx,{outputId:row.outputId,projectId:row.projectId,platform,
      publicationId,baseRevisionId});
    return {row,task,platform,publicationId,baseRevisionId};
  }
  async function media(ctx:RequestContext,taskId:string){
    const b=await bound(ctx,taskId);
    if(["queued","running","failed","cancelled"].includes(b.task.status))return {b,status:b.task.status as "queued"|"running"|"failed"|"cancelled",value:null};
    if(b.task.status!=="awaiting_confirmation"&&b.task.status!=="succeeded")fail("CANDIDATE_NOT_READY","封面任务状态无效");
    const results=(await ports.listResults(ctx,taskId)).filter(r=>r.resultType==="generated_asset");
    if(results.length!==1)fail("MEDIA_BINDING_MISMATCH","封面任务缺少唯一真实图片结果");
    const result=results[0]!,assetId=result.assetId??result.resultData.assetId;
    if(typeof assetId!=="string"||result.resultData.assetId!==assetId||result.resultData.assetType!=="image")
      fail("MEDIA_BINDING_MISMATCH","封面结果不是绑定的图片");
    const asset=await ports.assets.getAsset(ctx,assetId);
    const assetFileId=asset.currentFileId;
    if(!assetFileId||!["pending","active"].includes(asset.status))fail("ASSET_NOT_CONFIRMED","封面文件不可用");
    if((b.row.assetId&&b.row.assetId!==assetId)||(b.row.assetFileId&&b.row.assetFileId!==assetFileId))
      fail("MEDIA_BINDING_MISMATCH","封面文件与首次绑定不一致");
    if(!b.row.assetId){
      await ports.db.update(outputMediaAttempts).set({assetId,assetFileId}).where(and(eq(outputMediaAttempts.id,b.row.id),
        isNull(outputMediaAttempts.assetId),isNull(outputMediaAttempts.assetFileId)));
      const [locked]=await ports.db.select().from(outputMediaAttempts).where(eq(outputMediaAttempts.id,b.row.id));
      if(locked?.assetId!==assetId||locked.assetFileId!==assetFileId)fail("MEDIA_BINDING_MISMATCH","封面文件被并发改换");
    }
    await ports.assets.assertAssetFileOwned(ctx,assetId,assetFileId,asset.status==="active");
    await ports.assets.getAssetFileDownloadUrl(ctx,assetId,assetFileId);
    return {b,status:"awaiting_confirmation" as const,value:[{assetId,assetFileId,order:0,role:"cover" as const}]};
  }
  return {
    owner:"publication",
    async probe(ctx,cell){
      if(cell.kind!=="publish_cover"||!cell.platform||!["video","image"].includes(cell.outputType))
        return {state:"known_unavailable",reasonCode:"ADAPTER_NOT_READY",lastVerifiedAt:null};
      const state=await ports.probeCover(ctx);
      return state.ready?{state:"supported",reasonCode:null,lastVerifiedAt:state.lastVerifiedAt??now()}:
        {state:"known_unavailable",reasonCode:state.reasonCode??"ADAPTER_NOT_READY",lastVerifiedAt:state.lastVerifiedAt??now()};
    },
    async enqueue(ctx,input){
      if(input.kind!=="publish_cover"||!input.targetPlatform)fail("UNSUPPORTED_DELIVERABLE","发布封面目标无效");
      if(input.sourceItemId)fail("SOURCE_UNAVAILABLE","发布封面暂未接通雷达来源正文");
      if(Object.keys(input.ruleOverrides??{}).length)fail("CAPABILITY_UNAVAILABLE","发布封面暂不支持本次规则覆盖");
      const identity=scope(ctx);
      const [old]=await ports.db.select().from(outputMediaAttempts).where(and(eq(outputMediaAttempts.userId,identity.userId),
        eq(outputMediaAttempts.accountId,identity.accountId),eq(outputMediaAttempts.clientRequestId,input.clientRequestId)));
      if(old){if(old.outputId!==input.outputId||old.kind!=="publish_cover")fail("IDEMPOTENCY_CONFLICT","请求号已用于其他媒体任务");
        const observed=await media(ctx,old.taskId);
        if(observed.b.platform!==input.targetPlatform)fail("IDEMPOTENCY_CONFLICT","请求号已用于另一发布平台");
        return {candidateId:old.taskId,taskId:old.taskId,baseVersionId:observed.b.baseRevisionId,
          ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[],status:observed.status};}
      const base=await ports.owner.readCoverBase(ctx,input.outputId,input.targetPlatform);
      if(base.projectId!==input.projectId)fail("OUTPUT_NOT_OWNED","封面作品项目不匹配");
      const source=await ports.resolveCoverSource(ctx,{outputId:input.outputId,platform:input.targetPlatform,
        outputType:base.outputType});
      const topic=source.topic.trim()||base.outputTitle;
      const fullText=[source.fullText,base.current.title,base.current.description].filter(Boolean).join("\n\n");
      const coverContextSnapshot=await ports.freezeCoverContext(ctx,{projectId:base.projectId,topic,fullText});
      const frozen={projectId:base.projectId,outputId:input.outputId,contentOutputId:input.outputId,
        kind:"publish_cover",targetPlatform:input.targetPlatform,publicationId:base.publicationId,
        baseRevisionId:base.baseRevisionId,topic,coverContextSnapshot,
        ...(source.artifactId?{artifactId:source.artifactId}:{}),
        scriptSnapshot:{...(source.artifactId?{artifactId:source.artifactId}:{}),
          ...(source.versionId?{versionId:source.versionId}:{}),fullText}};
      const task=await ports.submitCover(ctx,{attemptId:`publish-cover:${digest([identity.accountId,input.clientRequestId])}`,
        projectId:base.projectId,inputData:frozen});
      await ports.db.insert(outputMediaAttempts).values({id:nextId(),...identity,projectId:base.projectId,
        outputId:input.outputId,kind:"publish_cover",taskId:task.id,candidateId:task.id,
        clientRequestId:input.clientRequestId,requestDigest:digest(frozen),createdAt:now()}).onConflictDoNothing();
      const observed=await media(ctx,task.id);
      return {candidateId:task.id,taskId:task.id,baseVersionId:observed.b.baseRevisionId,
        ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[],status:observed.status};
    },
    async read(ctx,candidateId){const observed=await media(ctx,candidateId);
      return {status:observed.status,value:observed.value,errorCode:observed.status==="failed"?"GENERATION_FAILED":null};},
    async adopt(ctx,input){
      if(input.kind!=="publish_cover"||input.expected.owner!=="publication")fail("OWNER_MISMATCH","发布封面采纳目标不一致");
      const observed=await media(ctx,input.candidateId);
      if(observed.status!=="awaiting_confirmation"||!observed.value)fail("CANDIDATE_NOT_READY","尚未生成真实封面图片");
      if(JSON.stringify(input.editedValue)!==JSON.stringify(observed.value))fail("MEDIA_BINDING_MISMATCH","只能采纳本任务实际生成的图片");
      const expected=input.expected.mode==="existing"&&typeof input.expected.publicationId==="string"&&
        typeof input.expected.revisionId==="string"?{mode:"existing" as const,publicationId:input.expected.publicationId,
          revisionId:input.expected.revisionId}:input.expected.mode==="create"&&typeof input.expected.outputId==="string"&&
          typeof input.expected.platform==="string"&&input.expected.expectedAbsent===true?
          {mode:"create" as const,outputId:input.expected.outputId,platform:input.expected.platform,expectedAbsent:true as const}:null;
      if(!expected)fail("OWNER_MISMATCH","发布封面基准无效");
      const b=observed.b;
      if(expected.mode==="existing"?(b.publicationId!==expected.publicationId||b.baseRevisionId!==expected.revisionId):
        (b.publicationId!==null||b.baseRevisionId!==null||b.row.outputId!==expected.outputId||b.platform!==expected.platform))
        fail("VERSION_CONFLICT","封面候选基准版本已变化");
      const latest=await ports.owner.readCoverBase(ctx,b.row.outputId,b.platform);
      if(latest.publicationId!==b.publicationId||latest.baseRevisionId!==b.baseRevisionId)
        fail("VERSION_CONFLICT","发布封面已有新修订，请重新审读");
      if(b.task.status!=="succeeded")await ports.confirmTask(ctx,input.candidateId);
      const selected=observed.value[0]!;
      return ports.owner.adoptCover(ctx,{candidateId:input.candidateId,outputId:b.row.outputId,platform:b.platform,
        assetId:selected.assetId,assetFileId:selected.assetFileId,expected,clientRequestId:input.clientRequestId});
    },
    async retryFrozen(ctx,input){
      const previous=await bound(ctx,input.candidateId);
      if(previous.task.status!=="failed"&&previous.task.status!=="cancelled")
        fail("CANDIDATE_NOT_READY","该发布封面不可重试");
      const identity=scope(ctx),frozen=structuredClone(previous.task.inputData);
      if(!readFrozenCoverContext(frozen))fail("SOURCE_UNAVAILABLE","原封面没有可重试的上下文快照");
      const requestDigest=digest({retryOf:previous.task.id,frozen});
      const [prior]=await ports.db.select().from(outputMediaAttempts).where(and(eq(outputMediaAttempts.userId,identity.userId),
        eq(outputMediaAttempts.accountId,identity.accountId),eq(outputMediaAttempts.clientRequestId,input.clientRequestId)));
      if(prior){
        if(prior.kind!=="publish_cover"||prior.outputId!==previous.row.outputId||prior.requestDigest!==requestDigest)
          fail("IDEMPOTENCY_CONFLICT","重试请求号已用于其他发布封面");
        const value=await media(ctx,prior.taskId);
        return {candidateId:prior.taskId,taskId:prior.taskId,baseVersionId:value.b.baseRevisionId,
          ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[],status:value.status};
      }
      const task=await ports.submitCover(ctx,{attemptId:`publish-cover-retry:${digest([identity.accountId,input.clientRequestId])}`,
        projectId:previous.row.projectId,inputData:frozen});
      await ports.db.insert(outputMediaAttempts).values({id:nextId(),...identity,projectId:previous.row.projectId,
        outputId:previous.row.outputId,kind:"publish_cover",taskId:task.id,candidateId:task.id,
        clientRequestId:input.clientRequestId,requestDigest,createdAt:now()}).onConflictDoNothing();
      const value=await media(ctx,task.id);
      return {candidateId:task.id,taskId:task.id,baseVersionId:value.b.baseRevisionId,
        ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[],status:value.status};
    },
  };
}
