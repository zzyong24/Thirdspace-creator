import {createExecutionRoute,frozenExecutionEngine,inheritExecutionRoute,frozenExecutionRoute,type ExecutionRoute} from '@creatoros/contract/execution-worker';
import {and,eq,sql,executionTasks,scheduledJobs,type Db} from '@creatoros/backend';
import {workspaceFilter} from '../../workspace-scope';
import type {RequestContext} from '@creatoros/contract';
import {createSettingsRepository,type RepoDeps} from '@creatoros/backend/modules/settings';
import {createEffectiveSkillSnapshotResolver,requiredSkillIdsForTask,type OfficialSkillProvider} from '@creatoros/backend/modules/ai-runtime';
export interface TransactionalTaskRuntimeDeps extends RepoDeps {
 officialSkills:OfficialSkillProvider;
 /** 私有组合根：只给无可信父路由的新任务捕获同store配置。 */
 resolveExecutionRoute?(ctx:RequestContext,tx:Db):Promise<ExecutionRoute>;
 /** 复用根原pinModelAuthority/readChannelModelAuthority；若内部读PG必须绑定tx，不能捕获root repository。 */
 readPinnedAuthority(ctx:RequestContext,tx:Db):Promise<{authority:'local'|'channel-managed';digest:string}>;
}
/** 组合根绑定helper：同一AI事务读取真实账号Skill overlay，不借root DB连接。 */
export function createTransactionalTaskRuntimeResolver(tx:Db,deps:TransactionalTaskRuntimeDeps){
 const settings=createSettingsRepository(tx,deps);
 const resolve=createEffectiveSkillSnapshotResolver({officialSkills:deps.officialSkills,groupOverlays:{listBySkillIds:(ctx,ids)=>settings.listAccountSkillOverlays(ctx,ids)},accountOverlays:{listBySkillIds:(ctx,ids)=>settings.listAccountSkillOverlays(ctx,ids)},now:deps.now});
 return async(ctx:RequestContext,taskType:string,inputData:Readonly<Record<string,unknown>>,trustedRoute?:import("@creatoros/contract/execution-worker").ExecutionRoute):Promise<Record<string,unknown>>=>{
  let executionRoute=trustedRoute?frozenExecutionRoute({executionRoute:trustedRoute}):undefined;
  // 从真实调度身份寻找父任务，不能信任客户端传入引擎/父ID。
  // 在创建业务task时即冻结，避免恢复扫描在后续attach之前领取子任务。
  const scheduled=inputData.scheduledRun as {version?:unknown;scheduledFor?:unknown}|undefined;
  if(taskType.startsWith('scheduled.')&&typeof inputData.jobId==='string'&&scheduled?.version===1&&typeof scheduled.scheduledFor==='string'){
   const [job]=await tx.select().from(scheduledJobs).where(and(eq(scheduledJobs.id,inputData.jobId),eq(scheduledJobs.userId,ctx.userId),workspaceFilter(scheduledJobs,ctx)));
   if(job&&taskType===`scheduled.${job.sourceKind}`){
    const parents=await tx.select().from(executionTasks).where(and(eq(executionTasks.kind,'automation_sync'),eq(executionTasks.ownerType,'scheduled_job'),eq(executionTasks.ownerId,job.id),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx),sql`${executionTasks.payload}->>'scheduledFor' = ${scheduled.scheduledFor}`)).for('update');
    if(parents.length>1)throw new Error('调度父执行不唯一，不能猜测子任务引擎');
    const parent=parents[0];
    if(parent){
     const payload=parent.payload as Record<string,unknown>;
     if((payload.job as {id?:unknown}|undefined)?.id!==job.id)throw new Error('调度父执行与真实作业不符');
     executionRoute=inheritExecutionRoute(payload);
    }
   }
  }
  if(!executionRoute){
   if(deps.resolveExecutionRoute)executionRoute=frozenExecutionRoute({executionRoute:await deps.resolveExecutionRoute(ctx,tx)});
   else{const preference=await settings.getPreferences(ctx);executionRoute=createExecutionRoute(preference?.assistantExecutionEngine==='codex'?'codex':'pi');}
  }
  if(taskType==='benchmark.transcribe')return {executionRoute}; // ASR不申请文本Skill，但原任务保留文本后处理路由。
  const required=requiredSkillIdsForTask(taskType,inputData),skillSnapshot=await resolve(ctx,required);
  if(executionRoute.schemaVersion===2||frozenExecutionEngine({executionRoute})==='codex')return {skillSnapshot,executionRoute};
  const authority=await deps.readPinnedAuthority(ctx,tx);
  return{skillSnapshot,executionRoute,modelAuthority:authority.authority,modelAuthorityDigest:authority.digest};
 };
}
