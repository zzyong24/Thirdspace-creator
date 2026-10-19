import {createHash,randomUUID} from "node:crypto";
import {and,eq,isNull,requireAccountId,type Db} from "@creatoros/backend";
import {publications,publicationRevisions} from "../../schema/publishing";
import type {RequestContext} from "@creatoros/contract";
import type {ProjectsService} from "../projects";
import {publicationTextCandidates,publicationResultAnchors,publicationResultAdoptions} from "./publication-results.schema";

type Platform="xiaohongshu"|"douyin"|"kuaishou";
type Kind="publish_title"|"description"|"publish_tags";
type Status="queued"|"running"|"succeeded"|"failed"|"cancelled";
type Task={taskType:string;status:string;inputData:Record<string,unknown>;results:Array<{resultType:string;resultData:Record<string,unknown>}>};
function fail(code:string,message:string):never{const e=new Error(message) as Error&{code:string};e.code=code;throw e;}
function hash(v:unknown){return createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function kind(raw:unknown):Kind{if(raw==="publish_title"||raw==="description"||raw==="publish_tags")return raw;return fail("UNSUPPORTED_DELIVERABLE","发布物料不支持该交付项");}
function platform(raw:unknown):Platform{if(raw==="xiaohongshu"||raw==="douyin"||raw==="kuaishou")return raw;return fail("UNSUPPORTED_DELIVERABLE","当前平台不支持这类发布物料");}
function valueFor(k:Kind,raw:unknown):string|string[]{
  if(k==="publish_tags"){
    if(!Array.isArray(raw)||raw.length>20||raw.some(v=>typeof v!=="string"||!v.trim()||v.length>50))fail("CANDIDATE_NOT_READY","发布标签候选无效");
    return raw as string[];
  }
  if(typeof raw!=="string"||raw.length>10000)fail("CANDIDATE_NOT_READY","发布文案候选无效");
  return raw;
}
function ruleRef(raw:unknown):{versionId:string}|null{
  if(raw===null)return null;
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||typeof (raw as {versionId?:unknown}).versionId!=="string"||
    !(raw as {versionId:string}).versionId)fail("SOURCE_UNAVAILABLE","发布规则快照格式无效");
  return {versionId:(raw as {versionId:string}).versionId};
}
export interface PublicationResultPorts{
  projects:Pick<ProjectsService,"getOutput"|"getProject">;
  submitGeneration(ctx:RequestContext,input:{attemptId:string;projectId:string;inputData:Record<string,unknown>}):Promise<{id:string}>;
  readGeneration(ctx:RequestContext,taskId:string):Promise<Task>;
  resolveCurrentRules?: (ctx:RequestContext,projectId:string)=>Promise<{versionId:string;guidance:string}|null>;
  assertRuleSnapshotRef?: (ctx:RequestContext,versionId:string)=>Promise<void>;
  assertCoverAssetFile?: (ctx:RequestContext,assetId:string,assetFileId:string)=>Promise<void>;
  now?:()=>string;nextId?:(prefix:string)=>string;
}

/** Owns per-platform publication text candidates and atomic revision adoption. */
export function createPublicationResultsService(db:Db,deps:PublicationResultPorts){
  const now=deps.now??(()=>new Date().toISOString());
  const nextId=deps.nextId??(()=>randomUUID());
  const scope=(ctx:RequestContext)=>({userId:ctx.userId,accountId:requireAccountId(ctx.accountId,"publication-results")});
  async function current(ctx:RequestContext,outputId:string,p:Platform){
    const owner=scope(ctx);
    const rows=await db.select().from(publications).where(and(eq(publications.userId,owner.userId),
      eq(publications.accountId,owner.accountId),eq(publications.contentOutputId,outputId),eq(publications.platform,p)));
    if(rows.length>1)fail("VERSION_CONFLICT","当前作品在该平台有多份发布记录，请先选择要编辑的发布记录");
    const pub=rows[0]??null;
    if(!pub)return {pub:null,revision:null};
    const [revision]=pub.currentRevisionId?await db.select().from(publicationRevisions).where(and(
      eq(publicationRevisions.id,pub.currentRevisionId),eq(publicationRevisions.publicationId,pub.id))):[];
    if(pub.currentRevisionId&&!revision)fail("VERSION_CONFLICT","发布修订指针无效");
    return {pub,revision:revision??null};
  }
  async function candidate(ctx:RequestContext,candidateId:string){
    const owner=scope(ctx);
    const [saved]=await db.select().from(publicationTextCandidates).where(and(eq(publicationTextCandidates.id,candidateId),
      eq(publicationTextCandidates.userId,owner.userId),eq(publicationTextCandidates.accountId,owner.accountId)));
    if(saved){await deps.projects.getOutput(ctx,saved.outputId);return {...saved,status:"succeeded" as const,value:valueFor(kind(saved.kind),saved.value)};}
    const task=await deps.readGeneration(ctx,candidateId);
    if(task.taskType!=="publication.text")fail("OUTPUT_NOT_OWNED","发布候选不存在");
    const outputId=String(task.inputData.outputId??"");
    const output=await deps.projects.getOutput(ctx,outputId);
    const p=platform(task.inputData.platform),k=kind(task.inputData.kind);
    if(output.projectId!==task.inputData.projectId||!["video","image"].includes(output.contentType)||
      (output.targetPlatform&&output.targetPlatform!==p))fail("OUTPUT_NOT_OWNED","发布候选与作品不匹配");
    const pubId=task.inputData.publicationId===null?null:String(task.inputData.publicationId??"");
    const baseRevisionId=task.inputData.baseRevisionId===null?null:String(task.inputData.baseRevisionId??"");
    if((pubId===null)!==(baseRevisionId===null)||pubId===""||baseRevisionId==="")fail("CANDIDATE_NOT_READY","发布候选基准版本无效");
    if(pubId){const [pub]=await db.select().from(publications).where(and(eq(publications.id,pubId),
      eq(publications.userId,owner.userId),eq(publications.accountId,owner.accountId),
      eq(publications.contentOutputId,outputId),eq(publications.platform,p)));
      if(!pub)fail("OUTPUT_NOT_OWNED","发布候选基准不属于当前作品");
      const [base]=await db.select().from(publicationRevisions).where(and(eq(publicationRevisions.id,baseRevisionId!),
        eq(publicationRevisions.publicationId,pub.id)));
      if(!base)fail("CANDIDATE_NOT_READY","发布候选基准修订不存在");
    }
    const refs=Array.isArray(task.inputData.sourceRefs)?task.inputData.sourceRefs:[];
    const frozenRule=ruleRef(task.inputData.ruleSnapshotRef);
    const appliedRules=frozenRule||Object.keys((task.inputData.ruleOverrides??{}) as Record<string,unknown>).length?"applied" as const:"not_applied" as const;
    if(task.status!=="awaiting_confirmation"&&task.status!=="succeeded"){
      if(!["queued","running","failed","cancelled"].includes(task.status))fail("CANDIDATE_NOT_READY","发布候选状态无效");
      return {id:candidateId,userId:owner.userId,accountId:owner.accountId,projectId:output.projectId,
        outputId,platform:p,kind:k,publicationId:pubId,baseRevisionId,sourceRefs:refs,ruleSnapshotRef:frozenRule,
        appliedRules,status:task.status as Status,value:null};
    }
    const result=task.results.find(r=>r.resultType==="publication_text_candidate"&&r.resultData.kind===k);
    if(!result)fail("CANDIDATE_NOT_READY","发布单项任务缺少有效结果");
    const value=valueFor(k,result.resultData.value);
    await db.insert(publicationTextCandidates).values({id:candidateId,...owner,projectId:output.projectId,outputId,
      platform:p,kind:k,value,publicationId:pubId,baseRevisionId,sourceRefs:refs,ruleSnapshotRef:frozenRule,
      appliedRules,createdAt:now()}).onConflictDoNothing();
    const [stored]=await db.select().from(publicationTextCandidates).where(and(eq(publicationTextCandidates.id,candidateId),
      eq(publicationTextCandidates.userId,owner.userId),eq(publicationTextCandidates.accountId,owner.accountId)));
    if(!stored||stored.outputId!==outputId||stored.kind!==k||stored.platform!==p)fail("IDEMPOTENCY_CONFLICT","发布候选持久化冲突");
    return {...stored,status:"succeeded" as const,value:valueFor(k,stored.value)};
  }
  return {
    candidate,
    async readCoverBase(ctx:RequestContext,outputId:string,rawPlatform:string){
      const p=platform(rawPlatform);
      const output=await deps.projects.getOutput(ctx,outputId);
      if(!["video","image"].includes(output.contentType)||(output.targetPlatform&&output.targetPlatform!==p))
        fail("UNSUPPORTED_OUTPUT_TYPE","作品与封面平台不匹配");
      const prior=await current(ctx,outputId,p);
      return {projectId:output.projectId,outputId,platform:p,outputType:output.contentType,
        outputTitle:output.title,publicationId:prior.pub?.id??null,baseRevisionId:prior.revision?.id??null,
        current:{title:prior.revision?.title??"",description:prior.revision?.description??"",
          platformTags:prior.revision?.platformTags??[],coverAssetId:prior.revision?.coverAssetId??null,
          coverAssetFileId:prior.revision?.coverAssetFileId??null}};
    },
    async verifyCoverBinding(ctx:RequestContext,input:{outputId:string;platform:string;projectId:string;
      publicationId:string|null;baseRevisionId:string|null}){
      const owner=scope(ctx),p=platform(input.platform);
      const output=await deps.projects.getOutput(ctx,input.outputId);
      if(output.projectId!==input.projectId||!["image","video"].includes(output.contentType)||
        (output.targetPlatform&&output.targetPlatform!==p))fail("OUTPUT_NOT_OWNED","封面任务与作品归属不一致");
      if(input.publicationId===null&&input.baseRevisionId===null)return;
      if(!input.publicationId||!input.baseRevisionId)fail("MEDIA_BINDING_MISMATCH","封面基准修订不完整");
      const [pub]=await db.select().from(publications).where(and(eq(publications.id,input.publicationId),
        eq(publications.userId,owner.userId),eq(publications.accountId,owner.accountId),
        eq(publications.contentOutputId,input.outputId),eq(publications.platform,p)));
      const [revision]=pub?await db.select().from(publicationRevisions).where(and(eq(publicationRevisions.id,input.baseRevisionId),
        eq(publicationRevisions.publicationId,pub.id))):[];
      if(!revision)fail("MEDIA_BINDING_MISMATCH","封面基准修订不属于当前作品");
    },
    async verifyFrozenGenerationInput(ctx:RequestContext,taskProjectId:string|null,inputData:Record<string,unknown>){
      const owner=scope(ctx);
      const outputId=String(inputData.outputId??"");
      const output=await deps.projects.getOutput(ctx,outputId);
      const p=platform(inputData.platform);
      kind(inputData.kind);
      if(output.projectId!==taskProjectId||inputData.projectId!==output.projectId||
        !["video","image"].includes(output.contentType)||(output.targetPlatform&&output.targetPlatform!==p)||
        inputData.outputType!==output.contentType)fail("OUTPUT_NOT_OWNED","发布生成任务与作品不匹配");
      const pubId=inputData.publicationId;
      const baseId=inputData.baseRevisionId;
      if(pubId===null&&baseId===null)return;
      if(typeof pubId!=="string"||typeof baseId!=="string")fail("CANDIDATE_NOT_READY","发布生成基准无效");
      const [pub]=await db.select().from(publications).where(and(eq(publications.id,pubId),
        eq(publications.userId,owner.userId),eq(publications.accountId,owner.accountId),
        eq(publications.contentOutputId,outputId),eq(publications.platform,p)));
      const [base]=pub?await db.select().from(publicationRevisions).where(and(eq(publicationRevisions.id,baseId),
        eq(publicationRevisions.publicationId,pub.id))):[];
      if(!base||hash({title:base.title,description:base.description,platformTags:base.platformTags})!==hash(inputData.current))
        fail("CANDIDATE_NOT_READY","发布生成任务的原修订内容不匹配");
    },
    async generate(ctx:RequestContext,input:{outputId:string;platform:string;kind:Kind;clientRequestId:string;
      sourceItemId?:string;ruleOverrides?:Record<string,unknown>}){
      scope(ctx);const p=platform(input.platform),k=kind(input.kind);
      if(input.sourceItemId)fail("SOURCE_UNAVAILABLE","发布文案暂未接通雷达来源正文");
      if(JSON.stringify(input.ruleOverrides??{}).length>8192)fail("CAPABILITY_UNAVAILABLE","本次规则过长");
      const output=await deps.projects.getOutput(ctx,input.outputId);
      if(!["video","image"].includes(output.contentType)||(output.targetPlatform&&output.targetPlatform!==p))
        fail("UNSUPPORTED_OUTPUT_TYPE","当前作品与发布平台不匹配");
      const project=await deps.projects.getProject(ctx,output.projectId);
      const prior=await current(ctx,input.outputId,p);
      const rules=deps.resolveCurrentRules?await deps.resolveCurrentRules(ctx,project.id):null;
      const sourceRefs=[{kind:"project",id:project.id,versionId:project.updatedAt}];
      const task=await deps.submitGeneration(ctx,{attemptId:input.clientRequestId,projectId:project.id,inputData:{
        projectId:project.id,outputId:input.outputId,platform:p,kind:k,publicationId:prior.pub?.id??null,
        baseRevisionId:prior.revision?.id??null,outputType:output.contentType,
        title:output.title,brief:project.brief,current:{title:prior.revision?.title??"",
          description:prior.revision?.description??"",platformTags:prior.revision?.platformTags??[]},
        sourceRefs,ruleSnapshotRef:rules?{versionId:rules.versionId}:null,ruleGuidance:rules?.guidance??"",
        ruleOverrides:input.ruleOverrides??{},
      }});
      const ready=await candidate(ctx,task.id);
      if(ready.outputId!==input.outputId||ready.kind!==k||ready.platform!==p)
        fail("IDEMPOTENCY_CONFLICT","生成请求已用于其他作品或交付项");
      return {taskId:task.id,candidateId:task.id,...ready};
    },
    async adopt(ctx:RequestContext,input:{candidateId:string;kind:Kind;editedValue:string|string[];clientRequestId:string;
      expected:{mode:"existing";publicationId:string;revisionId:string}|{mode:"create";outputId:string;platform:string;expectedAbsent:true}}){
      const item=await candidate(ctx,input.candidateId);
      if(item.status!=="succeeded"||item.kind!==input.kind)fail("CANDIDATE_NOT_READY","发布候选尚不可采纳");
      const edited=valueFor(item.kind,input.editedValue);
      const owner=scope(ctx);
      const requestDigest=hash({candidateId:input.candidateId,kind:input.kind,expected:input.expected,edited});
      const [receipt]=await db.select().from(publicationResultAdoptions).where(and(eq(publicationResultAdoptions.userId,owner.userId),
        eq(publicationResultAdoptions.accountId,owner.accountId),eq(publicationResultAdoptions.clientRequestId,input.clientRequestId)));
      if(receipt){if(receipt.requestDigest!==requestDigest)fail("IDEMPOTENCY_CONFLICT","同一采纳请求不能改换内容");
        return {publicationId:receipt.publicationId,revisionId:receipt.revisionId};}
      const frozenRule=ruleRef(item.ruleSnapshotRef);
      if(frozenRule){if(!deps.assertRuleSnapshotRef)fail("SOURCE_UNAVAILABLE","无法核验原发布规则版本");
        await deps.assertRuleSnapshotRef(ctx,frozenRule.versionId);}
      await deps.projects.getOutput(ctx,item.outputId);
      return db.transaction(async tx=>{
        const [existingReceipt]=await tx.select().from(publicationResultAdoptions).where(and(eq(publicationResultAdoptions.userId,owner.userId),
          eq(publicationResultAdoptions.accountId,owner.accountId),eq(publicationResultAdoptions.clientRequestId,input.clientRequestId)));
        if(existingReceipt){if(existingReceipt.requestDigest!==requestDigest)fail("IDEMPOTENCY_CONFLICT","同一采纳请求不能改换内容");
          return {publicationId:existingReceipt.publicationId,revisionId:existingReceipt.revisionId};}
        let pubId:string,base:typeof publicationRevisions.$inferSelect|null=null;
        if(input.expected.mode==="existing"){
          if(item.publicationId!==input.expected.publicationId||item.baseRevisionId!==input.expected.revisionId)
            fail("VERSION_CONFLICT","发布候选基准修订不匹配");
          const [pub]=await tx.select().from(publications).where(and(eq(publications.id,input.expected.publicationId),
            eq(publications.userId,owner.userId),eq(publications.accountId,owner.accountId),
            eq(publications.contentOutputId,item.outputId),eq(publications.platform,item.platform))).for("update");
          if(!pub||pub.currentRevisionId!==input.expected.revisionId)fail("VERSION_CONFLICT","发布物料已更新");
          const [row]=await tx.select().from(publicationRevisions).where(and(eq(publicationRevisions.id,input.expected.revisionId),
            eq(publicationRevisions.publicationId,pub.id)));
          if(!row)fail("VERSION_CONFLICT","发布基准修订不存在");
          base=row;pubId=pub.id;
        }else{
          if(item.publicationId!==null||item.baseRevisionId!==null||!input.expected.expectedAbsent||
            input.expected.outputId!==item.outputId||input.expected.platform!==item.platform)fail("VERSION_CONFLICT","首次发布物料目标不匹配");
          const existing=await tx.select({id:publications.id}).from(publications).where(and(eq(publications.userId,owner.userId),
            eq(publications.accountId,owner.accountId),eq(publications.contentOutputId,item.outputId),
            eq(publications.platform,item.platform))).limit(1);
          if(existing.length)fail("VERSION_CONFLICT","该平台已有发布记录，请重读当前版本");
          pubId=nextId("publication");
          await tx.insert(publicationResultAnchors).values({...owner,outputId:item.outputId,platform:item.platform,
            publicationId:pubId,createdAt:now()});
          await tx.insert(publications).values({id:pubId,...owner,contentOutputId:item.outputId,platform:item.platform,
            accountReference:"",status:"draft",currentRevisionId:null,createdAt:now(),updatedAt:now()});
        }
        const title=item.kind==="publish_title"?edited as string:base?.title??"";
        const description=item.kind==="description"?edited as string:base?.description??"";
        const platformTags=item.kind==="publish_tags"?edited as string[]:(base?.platformTags??[]) as string[];
        const revId=nextId("publication-revision");
        await tx.insert(publicationRevisions).values({id:revId,userId:owner.userId,publicationId:pubId,
          revisionNumber:(base?.revisionNumber??0)+1,title,description,platformTags,
          coverAssetId:base?.coverAssetId??null,coverAssetFileId:base?.coverAssetFileId??null,category:base?.category??"",series:base?.series??"",
          platformSettings:base?.platformSettings??{},createdAt:now()});
        const changed=await tx.update(publications).set({currentRevisionId:revId,updatedAt:now()})
          .where(and(eq(publications.id,pubId),eq(publications.userId,owner.userId),eq(publications.accountId,owner.accountId),
            base?eq(publications.currentRevisionId,base.id):isNull(publications.currentRevisionId))).returning({id:publications.id});
        if(changed.length!==1)fail("VERSION_CONFLICT","发布物料已更新");
        await tx.insert(publicationResultAdoptions).values({id:nextId("publication-adoption"),...owner,
          clientRequestId:input.clientRequestId,requestDigest,candidateId:input.candidateId,
          publicationId:pubId,revisionId:revId,createdAt:now()});
        return {publicationId:pubId,revisionId:revId};
      });
    },
    async adoptCover(ctx:RequestContext,input:{candidateId:string;outputId:string;platform:string;assetId:string;
      assetFileId:string;clientRequestId:string;
      expected:{mode:"existing";publicationId:string;revisionId:string}|{mode:"create";outputId:string;platform:string;expectedAbsent:true}}){
      const owner=scope(ctx),p=platform(input.platform);
      const output=await deps.projects.getOutput(ctx,input.outputId);
      if(!["image","video"].includes(output.contentType)||(output.targetPlatform&&output.targetPlatform!==p))
        fail("UNSUPPORTED_OUTPUT_TYPE","封面目标作品与平台不匹配");
      if(!deps.assertCoverAssetFile)fail("CAPABILITY_UNAVAILABLE","封面文件归属校验未装配");
      await deps.assertCoverAssetFile(ctx,input.assetId,input.assetFileId);
      const requestDigest=hash(input);
      const [receipt]=await db.select().from(publicationResultAdoptions).where(and(eq(publicationResultAdoptions.userId,owner.userId),
        eq(publicationResultAdoptions.accountId,owner.accountId),eq(publicationResultAdoptions.clientRequestId,input.clientRequestId)));
      if(receipt){if(receipt.requestDigest!==requestDigest)fail("IDEMPOTENCY_CONFLICT","同一封面采纳请求不能改换文件");
        return {publicationId:receipt.publicationId,revisionId:receipt.revisionId};}
      return db.transaction(async tx=>{
        let pubId:string,base:typeof publicationRevisions.$inferSelect|null=null;
        if(input.expected.mode==="existing"){
          const [pub]=await tx.select().from(publications).where(and(eq(publications.id,input.expected.publicationId),
            eq(publications.userId,owner.userId),eq(publications.accountId,owner.accountId),
            eq(publications.contentOutputId,input.outputId),eq(publications.platform,p))).for("update");
          if(!pub||pub.currentRevisionId!==input.expected.revisionId)fail("VERSION_CONFLICT","发布封面基准已变化");
          const [row]=await tx.select().from(publicationRevisions).where(and(eq(publicationRevisions.id,input.expected.revisionId),
            eq(publicationRevisions.publicationId,pub.id)));
          if(!row)fail("VERSION_CONFLICT","发布封面原修订不存在");
          pubId=pub.id;base=row;
        }else{
          if(!input.expected.expectedAbsent||input.expected.outputId!==input.outputId||input.expected.platform!==p)
            fail("VERSION_CONFLICT","首次发布封面目标不匹配");
          const existing=await tx.select({id:publications.id}).from(publications).where(and(eq(publications.userId,owner.userId),
            eq(publications.accountId,owner.accountId),eq(publications.contentOutputId,input.outputId),
            eq(publications.platform,p))).limit(1);
          if(existing.length)fail("VERSION_CONFLICT","已有发布记录，请重读封面基准");
          pubId=nextId("publication");
          await tx.insert(publicationResultAnchors).values({...owner,outputId:input.outputId,platform:p,
            publicationId:pubId,createdAt:now()});
          await tx.insert(publications).values({id:pubId,...owner,contentOutputId:input.outputId,platform:p,
            accountReference:"",status:"draft",currentRevisionId:null,createdAt:now(),updatedAt:now()});
        }
        const revId=nextId("publication-revision");
        await tx.insert(publicationRevisions).values({id:revId,userId:owner.userId,publicationId:pubId,
          revisionNumber:(base?.revisionNumber??0)+1,title:base?.title??"",description:base?.description??"",
          platformTags:base?.platformTags??[],coverAssetId:input.assetId,coverAssetFileId:input.assetFileId,
          category:base?.category??"",series:base?.series??"",platformSettings:base?.platformSettings??{},createdAt:now()});
        const changed=await tx.update(publications).set({currentRevisionId:revId,updatedAt:now()}).where(and(
          eq(publications.id,pubId),eq(publications.userId,owner.userId),eq(publications.accountId,owner.accountId),
          base?eq(publications.currentRevisionId,base.id):isNull(publications.currentRevisionId))).returning({id:publications.id});
        if(changed.length!==1)fail("VERSION_CONFLICT","发布封面已更新");
        await tx.insert(publicationResultAdoptions).values({id:nextId("publication-adoption"),...owner,
          clientRequestId:input.clientRequestId,requestDigest,candidateId:input.candidateId,
          publicationId:pubId,revisionId:revId,createdAt:now()});
        return {publicationId:pubId,revisionId:revId};
      });
    },
  };
}
export type PublicationResultsService=ReturnType<typeof createPublicationResultsService>;
