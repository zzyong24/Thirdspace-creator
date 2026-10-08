import {workspaceKey,workspaceFilter,workspaceStamp,assertWritableWorkspace} from "@creatoros/backend";
import { createHash } from 'node:crypto';
import { ENDPOINTS, emptyTopicWorkspaceConfig, topicWorkspaceResource, topicRecommendationContext, type RequestContext, type AudienceTaskAssessment } from '@creatoros/contract';
import { and, eq, desc, isNull, inArray, sql, topicWorkspaces, topicProposalFeedback, aiTasks, aiTaskResults, candidates, type Db } from '@creatoros/backend';
import { ConflictError } from '../execution';
import { OwnershipError } from './candidate.errors';
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export interface TopicWorkspaceDeps {db:Db;now:()=>string;assertProject?(ctx:RequestContext,id:string):Promise<unknown>;currentPositioningVersion?(ctx:RequestContext):Promise<string|null>}
export function createTopicWorkspaceService(deps:TopicWorkspaceDeps){
 const {db,now}=deps;
 const scope=(ctx:RequestContext)=>({userId:ctx.userId,...workspaceStamp(workspaceKey(ctx))});
 const where=(s:ReturnType<typeof scope>)=>and(eq(topicWorkspaces.userId,s.userId),workspaceFilter(topicWorkspaces,s));
 async function get(ctx:RequestContext){const s=scope(ctx);const [r]=await db.select().from(topicWorkspaces).where(where(s));return topicWorkspaceResource.parse(r?{version:r.version,config:r.config,updatedAt:r.updatedAt}:{version:0,config:emptyTopicWorkspaceConfig(),updatedAt:null});}
 async function validateProjects(ctx:RequestContext,config:ReturnType<typeof emptyTopicWorkspaceConfig>){
  for(const id of new Set([...config.problems,...config.authorMaterials].map(m=>m.projectId).filter((id):id is string=>!!id))){if(!deps.assertProject)throw new ConflictError('缺少项目归属校验端口');await deps.assertProject(ctx,id);}
 }
 async function save(ctx:RequestContext,raw:unknown){await assertWritableWorkspace(db,ctx);const cmd=ENDPOINTS.saveTopicWorkspace.body!.parse(raw),s=scope(ctx);await validateProjects(ctx,cmd.config);
  return db.transaction(async tx=>{
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${JSON.stringify([s.userId,workspaceKey(s),'topic-workspace'])})::bigint)`);
   const [r]=await tx.select().from(topicWorkspaces).where(where(s)).for('update');
   const receipts=record(r?.receipts),key=digest(cmd.idempotencyKey),hash=digest({config:cmd.config,expectedVersion:cmd.expectedVersion});
   const prior=record(receipts[key]);if(prior.hash){if(prior.hash!==hash)throw new ConflictError('幂等键内容不同');return topicWorkspaceResource.parse(prior.result);}
   if((r?.version??0)!==cmd.expectedVersion)throw new ConflictError('配置版本已变化，请重新载入');
   const result=topicWorkspaceResource.parse({version:(r?.version??0)+1,config:cmd.config,updatedAt:now()});
   const values={version:result.version,config:result.config,updatedAt:result.updatedAt!,receipts:{...receipts,[key]:{hash,result}}};
   if(r)await tx.update(topicWorkspaces).set(values).where(where(s));else await tx.insert(topicWorkspaces).values({...s,...values});
   return result;
  });
 }
 async function recommendationContext(ctx:RequestContext,projectId:string|null=null){
  if(projectId){if(!deps.assertProject)throw new ConflictError('缺少项目归属校验端口');await deps.assertProject(ctx,projectId);}
  const s=scope(ctx),w=await get(ctx),positioningVersionId=await deps.currentPositioningVersion?.(ctx)??null;
  const feedback=await db.select().from(topicProposalFeedback).where(and(eq(topicProposalFeedback.userId,s.userId),workspaceFilter(topicProposalFeedback,s),projectId?eq(topicProposalFeedback.projectId,projectId):isNull(topicProposalFeedback.projectId))).orderBy(desc(topicProposalFeedback.createdAt)).limit(300);
  const dropped=await db.select().from(candidates).where(and(eq(candidates.userId,s.userId),workspaceFilter(candidates,s),eq(candidates.status,'dropped'))).orderBy(desc(candidates.updatedAt)).limit(100);
  // 候选任务按真实任务归属过滤；未知AI任务引用不当成全局材料召回。
  const taskIds=[...new Set(dropped.map(c=>c.aiTaskId?.split('#')[0]).filter((id):id is string=>!!id))];
  const linked=taskIds.length?await db.select({id:aiTasks.id,projectId:aiTasks.projectId}).from(aiTasks).where(and(eq(aiTasks.userId,s.userId),workspaceFilter(aiTasks,s),inArray(aiTasks.id,taskIds))):[];
  const visibleDropped=dropped.filter(c=>c.aiTaskId?linked.some(t=>t.id===c.aiTaskId!.split('#')[0]&&t.projectId===projectId):projectId===null);
  const config={...w.config,problems:w.config.problems.filter(p=>p.projectId===null||p.projectId===projectId),authorMaterials:w.config.authorMaterials.filter(m=>(m.projectId===null||m.projectId===projectId)&&(w.config.contextMaterialIds===null||w.config.contextMaterialIds.includes(m.id)))};
  // 过滤项目材料后，只保留当前明确scope中的格子来源引用；不读取外部context正文。
  const refs=new Set([...config.problems,...config.authorMaterials].map(m=>m.id));
  config.contextMaterialIds=config.contextMaterialIds?.filter(id=>refs.has(id))??null;
  config.audienceGrid=config.audienceGrid.map(c=>({...c,sourceRefs:c.sourceRefs.filter(id=>refs.has(id))}));config.industryGrid=config.industryGrid.map(c=>({...c,sourceRefs:c.sourceRefs.filter(id=>refs.has(id))}));
  return topicRecommendationContext.parse({version:w.version,positioningVersionId,config,rejected:[...feedback.filter(f=>f.reason!=='tested').map(f=>({id:f.id,title:f.title,angle:f.angle,reason:`${f.reason} ${f.note}`,propositionKey:f.propositionKey,projectId:f.projectId})),...visibleDropped.map(c=>({id:c.id,title:c.title,angle:c.angle,reason:c.dropReason??'',propositionKey:String(record(record(c.card).audienceTask).propositionKey??''),projectId:null}))]});
 }
 async function assertCurrent(ctx:RequestContext,a:AudienceTaskAssessment){const w=await get(ctx);const p=await deps.currentPositioningVersion?.(ctx)??null;if(w.version!==a.workspaceVersion||p!==a.positioningVersionId)throw new ConflictError('定位或观众任务配置已变化，旧推荐待重审，请重新生成');}
 async function feedback(ctx:RequestContext,raw:unknown){await assertWritableWorkspace(db,ctx);const cmd=ENDPOINTS.saveTopicProposalFeedback.body!.parse(raw),s=scope(ctx);const hash=digest(cmd),id=`topic-feedback:${digest([s.userId,workspaceKey(s),cmd.idempotencyKey])}`;
  return db.transaction(async tx=>{
   const [prior]=await tx.select().from(topicProposalFeedback).where(eq(topicProposalFeedback.id,id));if(prior){if(prior.requestHash!==hash)throw new ConflictError('反馈幂等键内容不同');return {id,createdAt:prior.createdAt};}
   const [task]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,cmd.taskId),eq(aiTasks.userId,s.userId),workspaceFilter(aiTasks,s))).for('update');if(!task||task.taskType!=='topic.generate')throw new OwnershipError('选题任务不存在');
   const results=await tx.select().from(aiTaskResults).where(and(eq(aiTaskResults.aiTaskId,task.id),eq(aiTaskResults.resultType,'candidate_list')));if(results.length!==1)throw new ConflictError('候选结果不唯一');
   const data=record(results[0]!.resultData); const items=data.originalAudienceItems??data.items;const item=Array.isArray(items)?items.map(record).find(i=>i.proposalId===cmd.proposalId):undefined;if(!item)throw new ConflictError('选题候选不存在');
   const assessment=record(item.audienceTask),createdAt=now();
   await tx.insert(topicProposalFeedback).values({id,...s,taskId:task.id,projectId:task.projectId,proposalId:cmd.proposalId,propositionKey:String(assessment.propositionKey??''),title:String(item.title??''),angle:String(item.angle??''),reason:cmd.reason,note:cmd.note,positioningVersionId:typeof assessment.positioningVersionId==='string'?assessment.positioningVersionId:null,requestHash:hash,createdAt}).onConflictDoNothing();
   const [stored]=await tx.select().from(topicProposalFeedback).where(eq(topicProposalFeedback.id,id));if(!stored||stored.requestHash!==hash)throw new ConflictError('反馈幂等键内容不同');return {id,createdAt:stored.createdAt};
  });
 }
 return {get,save,recommendationContext,assertCurrent,feedback};
}
