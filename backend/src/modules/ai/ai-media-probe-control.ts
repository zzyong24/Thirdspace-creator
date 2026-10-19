import {createHash} from "node:crypto";
import {executionManifest,type RequestContext} from "@creatoros/contract";
import {and,eq,isNull,projects,aiTasks,aiTaskResults,aiTaskSteps,executionControlReceipts,type Db} from "@creatoros/backend";
import {isNotNull} from "drizzle-orm";
import {ConflictError,OwnershipError} from "./ai.errors";
import {workspaceFilter,workspaceStamp,workspaceKey} from "../../workspace-scope";
import {assertAiTaskWorkspaceAdmission} from "../scheduling";
import {lockWorkspaceMembership} from "../platform-account/membership-lock.service";
import {canonicalJson} from "./canonical-json";

type Task=typeof aiTasks.$inferSelect;
type Receipt={taskId:string;generation:number};
export function readableMediaProbeGeneration(task:Pick<Task,"runtimeData">):number|undefined {
 const raw=(task.runtimeData as Record<string,unknown> | null)?.probeRunGeneration;
 const value=raw===undefined?0:raw;
 return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:undefined;
}
export function mediaProbeGeneration(task:Pick<Task,"runtimeData">):number {
 const value=readableMediaProbeGeneration(task);
 if(value===undefined)throw new ConflictError("媒体处理轮次无效");
 return value;
}
function assertProbe(task:Task){
 if(task.taskType!=="exec.media.probe"||task.executionTaskId||task.leaseToken||task.leaseOwner||task.modelCallStartedAt)throw new ConflictError("该任务不能使用原媒体处理恢复");
 const spec=(task.inputData as Record<string,unknown>)?.spec as Record<string,unknown>|undefined;
 if(spec?.taskType!=="media.probe")throw new ConflictError("原媒体处理输入不一致");
}
// SEMANTIC_BOUNDARY_ALLOW: 规范 JSON 摘要仅校验冻结请求的机械同一性，不进行内容判断。
function canonical(value:unknown):string{
 if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
 if(value&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
 return JSON.stringify(value) ?? "null";
}
/** 原 AI task owner 的确定性媒体探针围栏；不更改模型账本和冻结输入。 */
export function createMediaProbeControl(deps:{db:Db;now:()=>string;nextId:(prefix:string)=>string}){
 const {db,now,nextId}=deps;
 const scope=(ctx:RequestContext,id:string)=>and(eq(aiTasks.id,id),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx));
 type Tx=Parameters<Parameters<Db["transaction"]>[0]>[0];
 async function owned(store:Db|Tx,ctx:RequestContext,id:string){const [task]=await store.select().from(aiTasks).where(scope(ctx,id));if(!task)throw new OwnershipError("媒体处理任务不存在");assertProbe(task);return task;}
 async function migratedLegacyOrigin(tx:Tx,task:Task):Promise<boolean>{
  if(!task.accountId||task.groupId!==`grp_legacy_${task.accountId}`||task.groupVersion!==null||task.membershipVersion!==null)return false;
  // SEMANTIC_BOUNDARY_ALLOW:只核原c5316506账号协议的持久key与canonical摘要，区分旧迁移行和新冻结损坏；不推断内容或当前归属。
  const oldFingerprint=`sha256:${createHash("sha256").update(canonicalJson({userId:task.userId,accountId:task.accountId,taskType:task.taskType,inputData:task.inputData,retryOfTaskId:task.retryOfTaskId})).digest("hex")}`;
  if(task.idempotencyKey===`${task.accountId}:${task.taskType}:${task.attemptId}`&&task.requestFingerprint===oldFingerprint)return true;
  const receipts=await tx.select().from(executionControlReceipts).where(and(eq(executionControlReceipts.userId,task.userId),eq(executionControlReceipts.accountId,task.accountId),eq(executionControlReceipts.requestDigest,requestDigest(task))));
  return receipts.some(receipt=>{const result=receipt.result;return receipt.idempotencyKey.startsWith("ai-deterministic-retry:")&&result!==null&&typeof result==="object"&&"taskId" in result&&result.taskId===task.id&&"generation" in result&&typeof result.generation==="number"&&Number.isSafeInteger(result.generation)&&result.generation>=0;});
 }
 async function locked(tx:Tx,ctx:RequestContext,id:string,admission=false){
  const snapshot=await owned(tx,ctx,id);
  if(admission){const legacy=await migratedLegacyOrigin(tx,snapshot),originalAdmission=legacy?{...snapshot,groupId:null}:snapshot;await assertAiTaskWorkspaceAdmission(tx,originalAdmission);const frozen=await lockWorkspaceMembership(tx,{userId:snapshot.userId,groupId:originalAdmission.groupId,accountId:snapshot.accountId,groupVersion:snapshot.groupVersion??undefined,membershipVersion:snapshot.membershipVersion??undefined,source:"ai",requestId:"probe-admission:"+id});if(legacy?frozen.groupId!==snapshot.groupId:snapshot.groupId&&(frozen.groupVersion!==snapshot.groupVersion||frozen.membershipVersion!==snapshot.membershipVersion))throw new ConflictError("原媒体处理冻结工作区版本已改变");
   if(snapshot.projectId){const [parent]=await tx.select().from(projects).where(and(eq(projects.id,snapshot.projectId),eq(projects.userId,snapshot.userId),workspaceFilter(projects,{groupId:snapshot.groupId,accountId:snapshot.accountId}))).for("share");if(!parent||parent.status==='archived')throw new OwnershipError("媒体处理原父项目不可写");}
  }
  const [task]=await tx.select().from(aiTasks).where(scope(ctx,id)).for("update");if(!task)throw new OwnershipError("媒体处理任务不存在");assertProbe(task);
  for(const field of ["userId","accountId","groupId","groupVersion","membershipVersion","projectId","attemptId","requestFingerprint","inputData"] as const)if(canonical(task[field])!==canonical(snapshot[field]))throw new ConflictError("原媒体处理冻结身份已改变");return task;
 }
 function requestDigest(task:Task){return createHash("sha256").update(canonical({operation:"media.probe.retry",taskId:task.id,taskType:task.taskType,requestFingerprint:task.requestFingerprint,inputData:task.inputData})).digest("hex");}
 async function priorReceipt(store:Db|Tx,task:Task,key:string,digest:string){
  // 历史account键按被授权原task的真实account精确读，绝不消费当前平台筛选或first(group rows)。
  const legacy=task.accountId?await store.select().from(executionControlReceipts).where(and(eq(executionControlReceipts.userId,task.userId),eq(executionControlReceipts.accountId,task.accountId),eq(executionControlReceipts.idempotencyKey,key))):[];
  const rows=legacy.length?legacy:task.groupId?await store.select().from(executionControlReceipts).where(and(eq(executionControlReceipts.userId,task.userId),eq(executionControlReceipts.groupId,task.groupId),isNull(executionControlReceipts.accountId),eq(executionControlReceipts.idempotencyKey,key))):[];
  if(rows.length>1)throw new ConflictError("原恢复回执归属歧义，请按原任务复核");const old=rows[0];if(!old){if(task.groupId&&!legacy.length){const historical=await store.select({id:executionControlReceipts.id}).from(executionControlReceipts).where(and(eq(executionControlReceipts.userId,task.userId),eq(executionControlReceipts.groupId,task.groupId),isNotNull(executionControlReceipts.accountId),eq(executionControlReceipts.idempotencyKey,key)));if(historical.length)throw new ConflictError("原组请求含旧账号回执，请按原真实任务复核");}return null;}const result=old.result;if(old.requestDigest!==digest||!result||typeof result!=="object"||!("taskId" in result)||result.taskId!==task.id||!("generation" in result)||typeof result.generation!=="number"||!Number.isSafeInteger(result.generation)||result.generation<0)throw new ConflictError("同一恢复请求不能用于不同任务");return{taskId:result.taskId,generation:result.generation};
 }
 return {
  async retry(ctx:RequestContext,input:{taskId:string;requestId:string}):Promise<Receipt>{
   if(input.requestId.length<8||input.requestId.length>128)throw new ConflictError("恢复请求号无效");const key=`ai-deterministic-retry:${input.requestId}`;
   try{return await db.transaction(async tx=>{const snapshot=await owned(tx,ctx,input.taskId),digest=requestDigest(snapshot),prior=await priorReceipt(tx,snapshot,key,digest);if(prior)return prior;
    const task=await locked(tx,ctx,input.taskId,true),winner=await priorReceipt(tx,task,key,digest);if(winner)return winner;
    if(!["failed","cancelled"].includes(task.status))throw new ConflictError("仅失败或已取消的媒体处理可以恢复");const generation=mediaProbeGeneration(task)+1;if(!Number.isSafeInteger(generation))throw new ConflictError("媒体处理轮次已超出范围");const receipt={taskId:task.id,generation};
    await tx.update(aiTasks).set({status:"queued",runtimeData:{...(task.runtimeData as Record<string,unknown>),probeRunGeneration:generation},startedAt:null,completedAt:null,errorMessage:null}).where(scope(ctx,task.id));await tx.insert(executionControlReceipts).values({id:nextId("probe-control"),userId:task.userId,...((!task.groupId||await migratedLegacyOrigin(tx,task))?{accountId:task.accountId,groupId:task.groupId}:workspaceStamp(workspaceKey({groupId:task.groupId,accountId:task.accountId}))),idempotencyKey:key,requestDigest:digest,result:receipt,createdAt:now()});return receipt;
   });}catch(error){const code=(error as {code?:string;cause?:{code?:string}})?.code??(error as {cause?:{code?:string}})?.cause?.code;if(code!=="23505")throw error;const task=await owned(db,ctx,input.taskId),old=await priorReceipt(db,task,key,requestDigest(task));if(!old)throw new ConflictError("同一恢复请求不能用于不同任务");return old;}
  },
  async cancel(ctx:RequestContext,id:string,generation:number):Promise<void>{
   await db.transaction(async tx=>{const task=await locked(tx,ctx,id);if(mediaProbeGeneration(task)!==generation)throw new ConflictError("媒体处理轮次已变化，请读取当前任务");
    if(["succeeded","failed","cancelled"].includes(task.status))return;
    await tx.update(aiTasks).set({status:"cancelled",completedAt:now()}).where(scope(ctx,id));});
  },
  async assertSettled(ctx:RequestContext,id:string,generation:number,probeDigest:string,transaction:Db):Promise<void>{
   const task=await locked(transaction as unknown as Tx,ctx,id);
   if(mediaProbeGeneration(task)!==generation||!["awaiting_confirmation","succeeded"].includes(task.status))throw new ConflictError("原片处理状态已变化，请读取当前结果");
   const results=await transaction.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,id));
   const settled=results.some(result=>{if(result.resultType!=="execution_manifest")return false;const manifest=executionManifest.safeParse((result.resultData as {manifest?:unknown}).manifest);return manifest.success&&manifest.data.taskType==="media.probe"&&(manifest.data.meta.deterministicGeneration??0)===generation&&(manifest.data.meta.probe as {probeDigest?:unknown}|undefined)?.probeDigest===probeDigest;});
   if(!settled)throw new ConflictError("当前原片处理没有匹配的成功回执");
  },
  async claim(ctx:RequestContext,id:string,generation:number):Promise<boolean>{
   return db.transaction(async tx=>{const snapshot=await owned(tx,ctx,id);if(snapshot.status!=="queued"||mediaProbeGeneration(snapshot)!==generation)return false;const task=await locked(tx,ctx,id,true);if(task.status!=="queued"||mediaProbeGeneration(task)!==generation)return false;
    await tx.update(aiTasks).set({status:"running",startedAt:now(),errorMessage:null}).where(scope(ctx,id));return true;});
  },
  async markFailed(ctx:RequestContext,id:string,generation:number,error:string):Promise<void>{
   await db.transaction(async tx=>{const task=await locked(tx,ctx,id);if(task.status!=="running"||mediaProbeGeneration(task)!==generation)return;
    await tx.update(aiTasks).set({status:"failed",completedAt:now(),errorMessage:error}).where(scope(ctx,id));});
  },
  async recordStep(ctx:RequestContext,id:string,generation:number,input:{stepNo:number;kind:string;text:string;toolCalls:unknown[]}):Promise<void>{
   await db.transaction(async tx=>{const task=await locked(tx,ctx,id);if(task.status!=="running"||mediaProbeGeneration(task)!==generation)return;
    await tx.insert(aiTaskSteps).values({id:nextId("ai-step"),aiTaskId:id,...input,createdAt:now()});});
  },
  async recordCandidate(ctx:RequestContext,id:string,generation:number,input:{resultType:string;resultData:Record<string,unknown>}):Promise<void>{
   await db.transaction(async tx=>{const task=await locked(tx,ctx,id);
    if(task.status!=="running"||mediaProbeGeneration(task)!==generation)throw new ConflictError("该媒体处理轮次已结束");
    const parsed=executionManifest.safeParse(input.resultData.manifest);
    const manifest=parsed.success?parsed.data:undefined;
    if(input.resultType!=="execution_manifest"||manifest?.taskType!=="media.probe"||manifest.meta?.deterministicGeneration!==generation)throw new ConflictError("媒体处理回执轮次不一致");
    await tx.insert(aiTaskResults).values({id:nextId("ai-result"),aiTaskId:id,...input});
    await tx.update(aiTasks).set({status:"awaiting_confirmation",completedAt:null,errorMessage:null}).where(scope(ctx,id));
   });
  },
 };
}
export type MediaProbeControl=ReturnType<typeof createMediaProbeControl>;
