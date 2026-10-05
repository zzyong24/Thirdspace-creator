import {isDeepStrictEqual} from "node:util";
import {createHash, randomUUID} from "node:crypto";
import {and, eq, isNull} from "drizzle-orm";
import type {Db} from "@creatoros/backend";
import {requireAccountId} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {COVER_VISUAL_REQUIREMENTS_MAX, type CoverContext} from "@creatoros/ai-worker/cover";
import type {ArticlesService} from "../articles";
import type {AssetsService} from "../assets";
import type {ProjectsService} from "../projects";
import {readFrozenCoverContext,readFrozenGraphicCardContext} from "../ai-runtime/frozen-cover-context";
import {outputMediaAttempts} from "../../schema/creative-results";
import type {CreativeResultAdapter} from "./creative-results.service";

type Task = {id:string;taskType:string;status:string;projectId:string|null;contentOutputId:string|null;inputData:Record<string,unknown>};
type Result = {resultType:string;assetId:string|null;resultData:Record<string,unknown>};
// SEMANTIC_BOUNDARY_ALLOW: hash identifies a request; it does not choose content.
const digest=(value:unknown)=>`sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
function fail(code:string,message:string):never {const error=new Error(message) as Error&{code:string};error.code=code;throw error;}

export interface ArticleCoverMediaPorts {
  db:Db;
  articles:Pick<ArticlesService,"getArticle"|"getVersion"|"createVersion">;
  projects:Pick<ProjectsService,"getProject">;
  assets:Pick<AssetsService,"getAsset"|"assertAssetFileOwned"|"getAssetFileDownloadUrl">;
  submitCover(ctx:RequestContext,input:{attemptId:string;projectId:string;inputData:Record<string,unknown>}):Promise<{id:string;status:string}>;
  submitCard(ctx:RequestContext,input:{attemptId:string;projectId:string;inputData:Record<string,unknown>}):Promise<{id:string;status:string}>;
  readTask(ctx:RequestContext,taskId:string):Promise<Task>;
  listResults(ctx:RequestContext,taskId:string):Promise<Result[]>;
  confirmTask(ctx:RequestContext,taskId:string):Promise<unknown>;
  probeCover(ctx:RequestContext):Promise<{ready:boolean;reasonCode?:string;lastVerifiedAt?:string|null}>;
  probeCard(ctx:RequestContext):Promise<{ready:boolean;reasonCode?:string;lastVerifiedAt?:string|null}>;
  freezeCoverContext(ctx:RequestContext,input:{projectId:string;topic:string;fullText:string}):Promise<CoverContext>;
  now?:()=>string;nextId?:()=>string;
}

export function createArticleCoverMediaAdapter(ports:ArticleCoverMediaPorts):CreativeResultAdapter {
  const now=ports.now??(()=>new Date().toISOString()),nextId=ports.nextId??randomUUID;
  const scope=(ctx:RequestContext)=>({userId:ctx.userId,accountId:requireAccountId(ctx.accountId,"article-cover")});
  async function bound(ctx:RequestContext,taskId:string){
    const identity=scope(ctx);
    const [row]=await ports.db.select().from(outputMediaAttempts).where(and(eq(outputMediaAttempts.taskId,taskId),
      eq(outputMediaAttempts.userId,identity.userId),eq(outputMediaAttempts.accountId,identity.accountId)));
    if(!row)return fail("MEDIA_CANDIDATE_NOT_FOUND","文章封面候选不存在");
    if(row.kind!=="cover"&&row.kind!=="image_card")return fail("MEDIA_BINDING_MISMATCH","文章图片候选类型不符");
    const article=await ports.articles.getArticle(ctx,row.outputId);
    const task=await ports.readTask(ctx,taskId),input=task.inputData;
    const expectedTaskType=row.kind==="cover"?"cover.generate":"graphic.card.generate";
    const snapshot=row.kind==="cover"?readFrozenCoverContext(input):readFrozenGraphicCardContext(input);
    if(article.projectId!==row.projectId||task.taskType!==expectedTaskType||task.projectId!==row.projectId||
      task.contentOutputId!==row.outputId||input.outputId!==row.outputId||input.contentOutputId!==row.outputId||
      input.projectId!==row.projectId||input.artifactId!==article.artifactId||input.kind!==row.kind||
      (row.kind==="image_card"&&input.contentType!=="article")||
      !snapshot)return fail("MEDIA_BINDING_MISMATCH","文章图片任务与作品不符");
    const baseVersionId=String(input.baseVersionId??"");
    const base=await ports.articles.getVersion(ctx,row.outputId,baseVersionId);
    if(row.kind==="image_card" && (typeof input.targetSectionId!=="string"||
      !base.document.sections.some(section=>section.sectionId===input.targetSectionId)))
      return fail("MEDIA_BINDING_MISMATCH","图卡目标段落不属于原文章版本");
    return {row,article,task,baseVersionId};
  }
  async function observed(ctx:RequestContext,taskId:string){
    const binding=await bound(ctx,taskId),status=binding.task.status;
    if(["queued","running","failed","cancelled"].includes(status))return {binding,status,value:null,errorCode:status==="failed"?"GENERATION_FAILED":null};
    if(status!=="awaiting_confirmation"&&status!=="succeeded")return fail("CANDIDATE_NOT_READY","文章封面任务状态无效");
    const results=(await ports.listResults(ctx,taskId)).filter(row=>row.resultType==="generated_asset");
    if(results.length!==1)return fail("MEDIA_BINDING_MISMATCH","文章封面缺少唯一真实图片");
    const result=results[0]!,assetId=result.assetId??String(result.resultData.assetId??"");
    if(!assetId||result.resultData.assetId!==assetId||result.resultData.assetType!=="image")return fail("MEDIA_BINDING_MISMATCH","文章封面图片结果不符");
    const asset=await ports.assets.getAsset(ctx,assetId),assetFileId=asset.currentFileId;
    if(!assetFileId||(asset.status!=="pending"&&asset.status!=="active"))return fail("ASSET_NOT_CONFIRMED","文章封面图片文件不可用");
    if((binding.row.assetId&&binding.row.assetId!==assetId)||(binding.row.assetFileId&&binding.row.assetFileId!==assetFileId))
      return fail("MEDIA_BINDING_MISMATCH","文章封面图片回执已变化");
    if(!binding.row.assetId){
      await ports.db.update(outputMediaAttempts).set({assetId,assetFileId}).where(and(eq(outputMediaAttempts.id,binding.row.id),
        isNull(outputMediaAttempts.assetId),isNull(outputMediaAttempts.assetFileId)));
      const [locked]=await ports.db.select().from(outputMediaAttempts).where(eq(outputMediaAttempts.id,binding.row.id));
      if(locked?.assetId!==assetId||locked.assetFileId!==assetFileId)return fail("MEDIA_BINDING_MISMATCH","文章封面图片被并发修改");
    }
    await ports.assets.assertAssetFileOwned(ctx,assetId,assetFileId,asset.status==="active");
    await ports.assets.getAssetFileDownloadUrl(ctx,assetId,assetFileId);
    return {binding,status:"awaiting_confirmation" as const,value:[{assetId,assetFileId,order:0,
      role:binding.row.kind==="cover"?"cover" as const:"card" as const}],errorCode:null};
  }
  return {owner:"wechat_article",
    async probe(ctx,cell){
      if(cell.owner!=="wechat_article"||cell.outputType!=="article"||(cell.kind!=="cover"&&cell.kind!=="image_card"))
        return {state:"known_unavailable",reasonCode:"ADAPTER_NOT_READY",lastVerifiedAt:null};
      try{const result=cell.kind==="cover"?await ports.probeCover(ctx):await ports.probeCard(ctx);return {state:result.ready?"supported":"known_unavailable",
        reasonCode:result.ready?null:result.reasonCode??"ADAPTER_NOT_READY",lastVerifiedAt:result.lastVerifiedAt??now()};}
      catch{return {state:"unknown",reasonCode:"NOT_VERIFIED",lastVerifiedAt:now()};}
    },
    async enqueue(ctx,input){
      if(input.kind!=="cover"&&input.kind!=="image_card")return fail("UNSUPPORTED_DELIVERABLE","文章图片类型无效");
      if(input.kind==="image_card"&&!input.targetSectionId)return fail("UNSUPPORTED_DELIVERABLE","请先选择正文段落再生成图卡");
      if(input.kind==="cover"&&input.targetSectionId)return fail("UNSUPPORTED_DELIVERABLE","文章封面不属于正文段落");
      if(input.sourceItemId)return fail("SOURCE_UNAVAILABLE","文章封面尚未接入雷达来源快照");
      const visualRequirements=input.ruleOverrides?.visualRequirements;
      if(Object.keys(input.ruleOverrides??{}).some(key=>key!=="visualRequirements")||
        (visualRequirements!==undefined&&(typeof visualRequirements!=="string"||visualRequirements.length>COVER_VISUAL_REQUIREMENTS_MAX)))
        return fail("CAPABILITY_UNAVAILABLE","文章封面画面要求无效");
      const identity=scope(ctx);
      const [old]=await ports.db.select().from(outputMediaAttempts).where(and(eq(outputMediaAttempts.userId,identity.userId),
        eq(outputMediaAttempts.accountId,identity.accountId),eq(outputMediaAttempts.clientRequestId,input.clientRequestId)));
      if(old){if(old.outputId!==input.outputId||old.kind!==input.kind)return fail("IDEMPOTENCY_CONFLICT","请求号已用于其他作品");
        const value=await observed(ctx,old.taskId);
        if(value.binding.task.inputData.targetSectionId!==input.targetSectionId)
          return fail("IDEMPOTENCY_CONFLICT","请求号已用于另一正文段落");
        return {candidateId:old.taskId,taskId:old.taskId,baseVersionId:value.binding.baseVersionId,
          ruleSnapshotRef:null,appliedRules:value.binding.task.inputData.visualRequirements?"applied":"not_applied",sourceRefs:[],status:value.status as "queued"|"running"|"awaiting_confirmation"|"failed"|"cancelled"};}
      const article=await ports.articles.getArticle(ctx,input.outputId);
      if(article.projectId!==input.projectId||input.targetPlatform&&input.targetPlatform!=="wechatOfficialAccount")
        return fail("MEDIA_BINDING_MISMATCH","文章封面目标不符");
      const project=await ports.projects.getProject(ctx,article.projectId);
      const selectedSection=input.kind==="image_card"?article.current.sections.find(section=>section.sectionId===input.targetSectionId):null;
      if(input.kind==="image_card"&&!selectedSection)return fail("SOURCE_UNAVAILABLE","所选正文段落已不存在，请重新选择");
      const fullText=input.kind==="image_card"?
        [article.current.title,selectedSection?.heading,selectedSection?.body].filter(Boolean).join("\n\n"):
        [article.current.title,article.current.summary,
          ...article.current.sections.map(section=>[section.heading,section.body].filter(Boolean).join("\n\n"))].filter(Boolean).join("\n\n");
      const topic=article.current.title||project.title;
      const coverContextSnapshot=await ports.freezeCoverContext(ctx,{projectId:article.projectId,topic,fullText});
      const frozen={projectId:article.projectId,outputId:input.outputId,contentOutputId:input.outputId,
        ...(input.kind==="image_card"?{contentType:"article"}:{}),
        artifactId:article.artifactId,baseVersionId:article.currentVersionId,targetPlatform:input.targetPlatform,
        kind:input.kind,topic,...(input.kind==="cover"?{coverContextSnapshot}:{cardContextSnapshot:coverContextSnapshot}),
        ...(input.kind==="image_card"?{targetSectionId:input.targetSectionId}:{}),
        ...(visualRequirements?{visualRequirements}:{}),
        scriptSnapshot:{artifactId:article.artifactId,versionId:article.currentVersionId,fullText}};
      const submit=input.kind==="cover"?ports.submitCover:ports.submitCard;
      const task=await submit(ctx,{attemptId:`article-${input.kind}:${digest([identity.accountId,input.clientRequestId]).slice(7)}`,
        projectId:article.projectId,inputData:frozen});
      await ports.db.insert(outputMediaAttempts).values({id:nextId(),userId:identity.userId,accountId:identity.accountId,
        projectId:article.projectId,outputId:input.outputId,kind:input.kind,taskId:task.id,candidateId:task.id,
        clientRequestId:input.clientRequestId,requestDigest:digest(frozen),createdAt:now()}).onConflictDoNothing();
      const value=await observed(ctx,task.id);
      return {candidateId:task.id,taskId:task.id,baseVersionId:value.binding.baseVersionId,
        ruleSnapshotRef:null,appliedRules:visualRequirements?"applied":"not_applied",sourceRefs:[],status:value.status as "queued"|"running"|"awaiting_confirmation"|"failed"|"cancelled"};
    },
    async read(ctx,candidateId){const value=await observed(ctx,candidateId);return {status:value.status as "queued"|"running"|"awaiting_confirmation"|"failed"|"cancelled",value:value.value,errorCode:value.errorCode};},
    async adopt(ctx,input){
      if((input.kind!=="cover"&&input.kind!=="image_card")||input.expected.owner!=="wechat_article"||typeof input.expected.versionId!=="string")return fail("OWNER_MISMATCH","文章图片采纳目标不符");
      const value=await observed(ctx,input.candidateId);
      if(value.binding.row.kind!==input.kind)return fail("MEDIA_BINDING_MISMATCH","文章图片采纳类型与候选不符");
      if(value.status!=="awaiting_confirmation"||!value.value)return fail("CANDIDATE_NOT_READY","文章封面尚未生成");
      if(!isDeepStrictEqual(input.editedValue,value.value))return fail("MEDIA_BINDING_MISMATCH","只能采纳任务真实生成的图片");
      const before=await ports.articles.getArticle(ctx,value.binding.row.outputId);
      if(value.binding.task.status!=="succeeded"&&before.currentVersionId!==input.expected.versionId)return fail("VERSION_CONFLICT","文章已更新，请重新生成封面");
      const base=await ports.articles.getVersion(ctx,value.binding.row.outputId,value.binding.baseVersionId),selected=value.value[0]!;
      const target=before.currentVersionId===input.expected.versionId?before.current:
        (await ports.articles.getVersion(ctx,value.binding.row.outputId,input.expected.versionId)).document;
      const targetSectionId=value.binding.task.inputData.targetSectionId;
      // SEMANTIC_BOUNDARY_ALLOW: exact frozen image text/section identity only, not editorial meaning.
      if(input.kind==="cover") {
        if(!isDeepStrictEqual([base.document.title,base.document.summary,base.document.sections],
          [target.title,target.summary,target.sections]))return fail("VERSION_CONFLICT","生成封面所依据的正文已变化，请重新生成封面");
      } else {
        const oldSection=base.document.sections.find(section=>section.sectionId===targetSectionId);
        const newSection=target.sections.find(section=>section.sectionId===targetSectionId);
        if(!oldSection||!newSection||!isDeepStrictEqual([base.document.title,oldSection.heading,oldSection.body],
          [target.title,newSection.heading,newSection.body]))return fail("VERSION_CONFLICT","配图所依据的段落已变化，请重新生成配图");
      }
      // Confirmed tasks still save through receipt/CAS. Reconstructing from expected's
      // immutable document keeps replay stable and cannot overwrite a newer draft.
      if(value.binding.task.status!=="succeeded")await ports.confirmTask(ctx,input.candidateId);
      const document=input.kind==="cover"?
        {...target,coverImageUse:{assetId:selected.assetId,assetFileId:selected.assetFileId,sourceKind:"generated" as const,reviewState:"selected" as const}}:
        {...target,imageUses:[...target.imageUses.filter(use=>use.sectionId!==targetSectionId),
          {sectionId:targetSectionId as string,assetId:selected.assetId,assetFileId:selected.assetFileId,
            sourceKind:"generated" as const,reviewState:"selected" as const}]};
      const version=await ports.articles.createVersion(ctx,value.binding.row.outputId,{expectedCurrentVersionId:input.expected.versionId,
        document,clientRequestId:`creative-article-${input.kind}:${input.clientRequestId}`});
      return {versionId:version.versionId};
    },
    async retryFrozen(ctx,input){
      const old=await bound(ctx,input.candidateId);
      if(old.task.status!=="failed"&&old.task.status!=="cancelled")return fail("CANDIDATE_NOT_READY","该文章封面不可重试");
      const identity=scope(ctx),frozen=structuredClone(old.task.inputData);
      const [prior]=await ports.db.select().from(outputMediaAttempts).where(and(eq(outputMediaAttempts.userId,identity.userId),
        eq(outputMediaAttempts.accountId,identity.accountId),eq(outputMediaAttempts.clientRequestId,input.clientRequestId)));
      if(prior){if(prior.outputId!==old.row.outputId||prior.requestDigest!==digest({retryOf:old.task.id,frozen}))return fail("IDEMPOTENCY_CONFLICT","重试请求号已用于其他图片");
        const value=await observed(ctx,prior.taskId);return {candidateId:prior.taskId,taskId:prior.taskId,baseVersionId:value.binding.baseVersionId,
          ruleSnapshotRef:null,appliedRules:frozen.visualRequirements?"applied":"not_applied",sourceRefs:[],status:value.status as "queued"|"running"|"awaiting_confirmation"|"failed"|"cancelled"};}
      const submit=old.row.kind==="cover"?ports.submitCover:ports.submitCard;
      const task=await submit(ctx,{attemptId:`article-${old.row.kind}-retry:${digest([identity.accountId,input.clientRequestId]).slice(7)}`,
        projectId:old.row.projectId,inputData:frozen});
      await ports.db.insert(outputMediaAttempts).values({id:nextId(),userId:identity.userId,accountId:identity.accountId,
        projectId:old.row.projectId,outputId:old.row.outputId,kind:old.row.kind,taskId:task.id,candidateId:task.id,
        clientRequestId:input.clientRequestId,requestDigest:digest({retryOf:old.task.id,frozen}),createdAt:now()}).onConflictDoNothing();
      const value=await observed(ctx,task.id);return {candidateId:task.id,taskId:task.id,baseVersionId:value.binding.baseVersionId,
        ruleSnapshotRef:null,appliedRules:frozen.visualRequirements?"applied":"not_applied",sourceRefs:[],status:value.status as "queued"|"running"|"awaiting_confirmation"|"failed"|"cancelled"};
    },
  };
}

export function combineArticleResultAdapters(text:CreativeResultAdapter,media:CreativeResultAdapter):CreativeResultAdapter {
  return {owner:"wechat_article",
    probe:(ctx,cell)=>cell.kind==="cover"||cell.kind==="image_card"?media.probe(ctx,cell):text.probe(ctx,cell),
    enqueue:(ctx,input)=>input.kind==="cover"||input.kind==="image_card"?media.enqueue(ctx,input):text.enqueue(ctx,input),
    async read(ctx,candidateId,projection){try{return await media.read(ctx,candidateId);}catch(reason){
      if((reason as {code?:string}).code!=="MEDIA_CANDIDATE_NOT_FOUND")throw reason;
      return text.read(ctx,candidateId,projection);
    }},
    adopt:(ctx,input)=>input.kind==="cover"||input.kind==="image_card"?media.adopt(ctx,input):text.adopt(ctx,input),
    retryFrozen:text.retryFrozen&&media.retryFrozen?async(ctx,input)=>{
      try{await media.read(ctx,input.candidateId);return media.retryFrozen!(ctx,input);}catch(reason){
        if((reason as {code?:string}).code!=="MEDIA_CANDIDATE_NOT_FOUND")throw reason;
        return text.retryFrozen!(ctx,input);
      }
    }:undefined,
  };
}
