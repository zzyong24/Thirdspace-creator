import {createHash} from "node:crypto";
import {executionManifest,type RequestContext} from "@creatoros/contract";
import {and,eq,aiTasks,aiTaskResults,aiTaskSteps,executionControlReceipts,type Db} from "@creatoros/backend";
import {ConflictError,OwnershipError} from "./ai.errors";

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
 const scope=(ctx:RequestContext,id:string)=>{
  if(!ctx.accountId)throw new OwnershipError("请先选择账号");
  return and(eq(aiTasks.id,id),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,ctx.accountId));
 };
 type Tx=Parameters<Parameters<Db["transaction"]>[0]>[0];
 async function locked(tx:Tx,ctx:RequestContext,id:string){
  const [task]=await tx.select().from(aiTasks).where(scope(ctx,id)).for("update");
  if(!task)throw new OwnershipError("媒体处理任务不存在");assertProbe(task);return task;
 }
 return {
  async retry(ctx:RequestContext,input:{taskId:string;requestId:string}):Promise<Receipt>{
   if(input.requestId.length<8||input.requestId.length>128)throw new ConflictError("恢复请求号无效");
   try{return await db.transaction(async tx=>{
    const task=await locked(tx,ctx,input.taskId);
    const key=`ai-deterministic-retry:${input.requestId}`;
    const digest=createHash("sha256").update(canonical({operation:"media.probe.retry",taskId:task.id,taskType:task.taskType,requestFingerprint:task.requestFingerprint,inputData:task.inputData})).digest("hex");
    const [old]=await tx.select().from(executionControlReceipts).where(and(eq(executionControlReceipts.userId,ctx.userId),eq(executionControlReceipts.accountId,ctx.accountId!),eq(executionControlReceipts.idempotencyKey,key))).for("update");
    if(old){if(old.requestDigest!==digest)throw new ConflictError("同一恢复请求不能用于不同任务");return old.result as Receipt;}
    if(!["failed","cancelled"].includes(task.status))throw new ConflictError("仅失败或已取消的媒体处理可以恢复");
    const generation=mediaProbeGeneration(task)+1;
    if(!Number.isSafeInteger(generation))throw new ConflictError("媒体处理轮次已超出范围");
    const receipt={taskId:task.id,generation};
    await tx.update(aiTasks).set({status:"queued",runtimeData:{...(task.runtimeData as Record<string,unknown>),probeRunGeneration:generation},startedAt:null,completedAt:null,errorMessage:null}).where(scope(ctx,task.id));
    await tx.insert(executionControlReceipts).values({id:nextId("probe-control"),userId:ctx.userId,accountId:ctx.accountId!,idempotencyKey:key,requestDigest:digest,result:receipt,createdAt:now()});
    return receipt;
   });}catch(error){
    const code=(error as {code?:string;cause?:{code?:string}})?.code ?? (error as {cause?:{code?:string}})?.cause?.code;
    if(code!=="23505")throw error;
    // 唯一键竞争整体回滚后重新鉴权并读取赢家，不能泄漏数据库异常。
    const [task]=await db.select().from(aiTasks).where(scope(ctx,input.taskId));
    if(!task)throw new OwnershipError("媒体处理任务不存在");assertProbe(task);
    const digest=createHash("sha256").update(canonical({operation:"media.probe.retry",taskId:task.id,taskType:task.taskType,requestFingerprint:task.requestFingerprint,inputData:task.inputData})).digest("hex");
    const [old]=await db.select().from(executionControlReceipts).where(and(eq(executionControlReceipts.userId,ctx.userId),eq(executionControlReceipts.accountId,ctx.accountId!),eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:${input.requestId}`)));
    if(!old||old.requestDigest!==digest)throw new ConflictError("同一恢复请求不能用于不同任务");return old.result as Receipt;
   }
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
   return db.transaction(async tx=>{const task=await locked(tx,ctx,id);if(task.status!=="queued"||mediaProbeGeneration(task)!==generation)return false;
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
