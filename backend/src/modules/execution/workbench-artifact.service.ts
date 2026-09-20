import {createHash} from "node:crypto";
import {and,eq,executionCalls,executionTasks,OwnershipError,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {workbenchArtifactSchema,workbenchArtifactRegisterRequestSchema,type WorkbenchArtifact} from "@creatoros/contract/agent-workbench";
import type {ExecutionRef} from "@creatoros/contract/execution-worker";
import type {WorkbenchBlobMime} from "../assets";
import {createExecutionLeaseService} from "./execution-lease.service";
import {ConflictError} from "./execution.errors";

const MAX_ARTIFACT_BYTES=20*1024*1024;
const inputSchema=workbenchArtifactRegisterRequestSchema;
type RegisterInput=typeof inputSchema._input;
type Stored={metadata:WorkbenchArtifact;operationId:string;requestDigest:string};
type Scope={userId:string;accountId:string;taskId:string;ref:ExecutionRef};
export interface WorkbenchArtifactBlobPort {
 submit(ctx:RequestContext,input:{taskId:string;operationId:string;mime:WorkbenchBlobMime;bytes:Uint8Array}):Promise<{hash:string;size:number}>;
 read(ctx:RequestContext,input:{taskId:string;operationId:string;hash:string;mime:WorkbenchBlobMime}):Promise<Uint8Array>;
}
export interface WorkbenchArtifactFilePort {
 (scope:Scope,path:string):Promise<{bytes:Uint8Array;version:number}>;
}
const digest=(value:Uint8Array|string)=>createHash("sha256").update(value).digest("hex");
function records(payload:unknown,key:"workbenchArtifactVersions"|"workbenchArtifactPending"="workbenchArtifactVersions"):Stored[]{
 if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new ConflictError("任务载荷已损坏");
 const raw=(payload as Record<string,unknown>)[key];
 if(raw===undefined)return [];
 if(!Array.isArray(raw)||raw.length>1000)throw new ConflictError("任务产物索引已损坏");
 return raw.map(item=>{
  if(!item||typeof item!=="object"||Array.isArray(item))throw new ConflictError("任务产物索引已损坏");
  const row=item as Record<string,unknown>,parsed=workbenchArtifactSchema.safeParse(row.metadata);
  if(!parsed.success||typeof row.operationId!=="string"||!row.operationId||
   typeof row.requestDigest!=="string"||!/^[a-f0-9]{64}$/.test(row.requestDigest))
   throw new ConflictError("任务产物索引已损坏");
  return {metadata:parsed.data,operationId:row.operationId,requestDigest:row.requestDigest};
 });
}
function expectedInput(raw:RegisterInput){
 const input=inputSchema.parse(raw);
 if(input.artifactId && input.expectedVersion===undefined)throw new ConflictError("修改产物须声明当前版本");
 if(!input.artifactId && input.expectedVersion!==undefined)throw new ConflictError("新产物不得声明旧版本");
 return {...input,provenance:[...new Set(input.provenance??[])]};
}
function assertBytes(bytes:Uint8Array,hash:string,size:number){
 if(bytes.byteLength!==size||digest(bytes)!==hash)throw new ConflictError("产物字节与登记摘要不符");
}

/** 产物元数据属于原 execution task；字节只经 assets 服务端口存取。 */
export function createWorkbenchArtifactService(db:Db,deps:{readTaskFile?:WorkbenchArtifactFilePort;blobs:WorkbenchArtifactBlobPort;now?:()=>string}){
 const leases=createExecutionLeaseService(db,{now:deps.now});
 async function owned(ctx:RequestContext,taskId:string){
  const [task]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,taskId),
   eq(executionTasks.userId,ctx.userId),eq(executionTasks.accountId,ctx.accountId??"")));
  if(!task||!task.accountId)throw new OwnershipError("执行任务不存在");
  return task;
 }
 async function verified(row:Stored,ctx:RequestContext){
  const bytes=await deps.blobs.read(ctx,{taskId:row.metadata.taskId,operationId:row.operationId,
   hash:row.metadata.hash,mime:row.metadata.mime as WorkbenchBlobMime});
  assertBytes(bytes,row.metadata.hash,row.metadata.size);
  return bytes;
 }
 return {
  async register(ref:ExecutionRef,operationId:string,raw:RegisterInput):Promise<WorkbenchArtifact>{
   if(!operationId||operationId.length>160)throw new ConflictError("产物操作 ID 无效");
   const input=expectedInput(raw);
   const requestDigest=digest(JSON.stringify(input));
   const preflight=await leases.withLease(ref,"admission",async({task})=>{
    if(task.kind!=="ai_task"||!task.accountId)throw new ConflictError("当前任务不支持产物登记");
    const existing=records(task.payload).find(row=>row.operationId===operationId);
    const pending=records(task.payload,"workbenchArtifactPending").find(row=>row.operationId===operationId);
    return {scope:{userId:task.userId,accountId:task.accountId,taskId:task.id,ref},existing,pending};
   });
   const ctx={userId:preflight.scope.userId,accountId:preflight.scope.accountId,
    requestId:operationId,source:"ai"} satisfies RequestContext;
   if(preflight.existing){
    if(preflight.existing.requestDigest!==requestDigest)throw new ConflictError("同一操作 ID 的产物参数已改变");
    await verified(preflight.existing,ctx);
    return preflight.existing.metadata;
   }
   const filePort=deps.readTaskFile;
   if(!filePort)throw new ConflictError("当前宿主不支持产物登记");
   let snapshot:Awaited<ReturnType<WorkbenchArtifactFilePort>>|undefined;
   if(!preflight.pending){
    snapshot=await filePort(preflight.scope,input.path);
    if(!Number.isSafeInteger(snapshot.version)||snapshot.version<1||snapshot.bytes.byteLength<1||
       snapshot.bytes.byteLength>MAX_ARTIFACT_BYTES)throw new ConflictError("任务文件为空、过大或版本无效");
   }
   // 先在原任务账本提交待登记摘要；崩溃后同键只能恢复这份字节，不能改认后来的工作文件。
   const prepared:{status:"existing"|"pending";row:Stored}=preflight.pending?
    {status:"pending",row:preflight.pending}:await leases.withLease(ref,"admission",async({tx,task})=>{
     if(task.kind!=="ai_task"||task.userId!==preflight.scope.userId||task.accountId!==preflight.scope.accountId)
      throw new ConflictError("任务归属已改变");
     const prior=records(task.payload),pending=records(task.payload,"workbenchArtifactPending");
     const retry=prior.find(row=>row.operationId===operationId);
     if(retry){
      if(retry.requestDigest!==requestDigest)throw new ConflictError("同一操作 ID 的产物参数已改变");
      return {status:"existing" as const,row:retry};
     }
     const pendingRetry=pending.find(row=>row.operationId===operationId);
     if(pendingRetry){
      if(pendingRetry.requestDigest!==requestDigest)throw new ConflictError("同一操作 ID 的产物参数已改变");
      return {status:"pending" as const,row:pendingRetry};
     }
     if(prior.length+pending.length>=1000)throw new ConflictError("任务产物版本数量已达上限");
     const artifactId=input.artifactId??`wa-${digest(JSON.stringify([task.id,operationId])).slice(0,32)}`;
     if(pending.some(row=>row.metadata.artifactId===artifactId))throw new ConflictError("当前产物已有待完成登记");
     const versions=prior.filter(row=>row.metadata.artifactId===artifactId);
     const current=versions.length?Math.max(...versions.map(row=>row.metadata.version)):0;
     if(input.artifactId&&current===0)throw new ConflictError("产物 ID 不属于当前任务");
     if(current!==(input.expectedVersion??0))throw new ConflictError("产物版本已改变，请重新读取");
     for(const sourceId of input.provenance){
      const [source]=await tx.select({id:executionCalls.id}).from(executionCalls).where(and(
       eq(executionCalls.id,sourceId),eq(executionCalls.executionTaskId,task.id)));
      if(!source)throw new ConflictError("产物来源引用不属于当前任务");
     }
     const metadata=workbenchArtifactSchema.parse({artifactId,version:current+1,mime:input.mime,
      size:snapshot!.bytes.byteLength,hash:digest(snapshot!.bytes),relativePath:input.path,taskId:task.id,provenance:input.provenance});
     const row={metadata,operationId,requestDigest};
     await tx.update(executionTasks).set({payload:{...task.payload as Record<string,unknown>,
      workbenchArtifactPending:[...pending,row]}}).where(eq(executionTasks.id,task.id));
     return {status:"pending" as const,row};
    });
   if(prepared.row.requestDigest!==requestDigest)throw new ConflictError("同一操作 ID 的产物参数已改变");
   if(prepared.status==="existing"){
    await verified(prepared.row,ctx);return prepared.row.metadata;
   }
   try{await verified(prepared.row,ctx);}catch{
    snapshot??=await filePort(preflight.scope,input.path);
    assertBytes(snapshot.bytes,prepared.row.metadata.hash,prepared.row.metadata.size);
    const saved=await deps.blobs.submit(ctx,{taskId:preflight.scope.taskId,operationId,
     mime:input.mime,bytes:snapshot.bytes});
    if(saved.hash!==prepared.row.metadata.hash||saved.size!==prepared.row.metadata.size)
     throw new ConflictError("产物存储回执与待登记摘要不一致");
   }
   return leases.withLease(ref,"admission",async({tx,task})=>{
    if(task.userId!==preflight.scope.userId||task.accountId!==preflight.scope.accountId)
     throw new ConflictError("任务归属已改变");
    const prior=records(task.payload),retry=prior.find(row=>row.operationId===operationId);
    if(retry){
     if(retry.requestDigest!==requestDigest)throw new ConflictError("同一操作 ID 的产物参数已改变");
     await verified(retry,ctx);return retry.metadata;
    }
    const pending=records(task.payload,"workbenchArtifactPending");
    const row=pending.find(item=>item.operationId===operationId);
    if(!row||row.requestDigest!==requestDigest||JSON.stringify(row.metadata)!==JSON.stringify(prepared.row.metadata))
     throw new ConflictError("待登记产物已改变");
    await verified(row,ctx);
    await tx.update(executionTasks).set({payload:{...task.payload as Record<string,unknown>,
     workbenchArtifactPending:pending.filter(item=>item.operationId!==operationId),
     workbenchArtifactVersions:[...prior,row]}}).where(eq(executionTasks.id,task.id));
    return row.metadata;
   });
  },
  async read(ctx:RequestContext,taskId:string,artifactId:string,version:number,offset:number,limit:number){
   if(!Number.isSafeInteger(version)||version<1||!Number.isSafeInteger(offset)||offset<0||
      !Number.isSafeInteger(limit)||limit<1||limit>128_000)throw new ConflictError("产物读取范围无效");
   const task=await owned(ctx,taskId);
   const row=records(task.payload).find(item=>item.metadata.artifactId===artifactId&&item.metadata.version===version);
   if(!row)throw new OwnershipError("产物不存在");
   const bytes=await verified(row,ctx);
   return {metadata:row.metadata,total:bytes.byteLength,bytes:bytes.slice(offset,offset+limit),
    nextOffset:offset+limit<bytes.byteLength?offset+limit:null};
  },
  async verifyArtifacts(scope:{userId:string;accountId:string;taskId:string},refs:string[]):Promise<boolean>{
   if(!refs.length||refs.length>100)return false;
   try{
    const ctx={userId:scope.userId,accountId:scope.accountId,requestId:"artifact-verify",
     source:"ai"} satisfies RequestContext;
    const task=await owned(ctx,scope.taskId),all=records(task.payload);
    for(const ref of refs){
     const match=/^(.+)@([1-9][0-9]*)$/.exec(ref);
     if(!match)return false;
     const row=all.find(item=>item.metadata.artifactId===match[1]&&item.metadata.version===Number(match[2]));
     if(!row)return false;
     await verified(row,ctx);
    }
    return true;
   }catch{return false;}
  },
 };
}

/** 预览、导出入口只注入读端口，不装配任务文件读取能力。 */
export function createWorkbenchArtifactReadService(db:Db,deps:{blobs:WorkbenchArtifactBlobPort;now?:()=>string}){
 const service=createWorkbenchArtifactService(db,deps);
 return {read:service.read,verifyArtifacts:service.verifyArtifacts};
}
