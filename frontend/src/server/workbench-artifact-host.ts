import "server-only";
import {randomUUID} from "node:crypto";
import type {Db} from "@creatoros/backend";
import {createExecutionLeaseService,createWorkbenchArtifactService,type WorkbenchArtifactBlobPort} from "@creatoros/backend/modules/execution";
import type {ChatProductionCompositionDeps} from "@creatoros/backend/modules/ai-runtime";
import {workbenchCapabilitySchema,workbenchHostCallSchema,workbenchResultSchema,workbenchArtifactRegisterRequestSchema,workbenchArtifactReadRequestSchema,type WorkbenchResult} from "@creatoros/contract/agent-workbench";
import type {ExecutionRef} from "@creatoros/contract/execution-worker";
import {createWorkbenchNativeClient,NativeFileError,type NativeFileAction} from "./workbench-native-client";

type Host=NonNullable<ChatProductionCompositionDeps["workbenchHost"]>;
type FilePort=(ref:ExecutionRef,operationId:string,action:NativeFileAction)=>Promise<unknown>;
const MAX_BYTES=20*1024*1024;
const registerSchema=workbenchArtifactRegisterRequestSchema;
const readSchema=workbenchArtifactReadRequestSchema;
const catalog=[
 workbenchCapabilitySchema.parse({name:"artifact.register",schemaVersion:1,description:"把当前任务中的真实文件保存为可回读的产物版本，返回产物引用。",
  inputSchema:{type:"object",properties:{path:{type:"string",minLength:1,maxLength:2048},mime:{type:"string",enum:["text/html","text/markdown","text/csv","image/png","application/pdf"]},
   artifactId:{type:"string"},expectedVersion:{type:"integer",minimum:0},provenance:{type:"array",items:{type:"string"}}},required:["path","mime"],additionalProperties:false},
  resultSchema:{type:"object"},effects:["task_write"],requiredCapabilities:["task.artifacts"],platforms:["macos","windows"]}),
 workbenchCapabilitySchema.parse({name:"artifact.read",schemaVersion:1,description:"按版本分页读取本任务已保存的产物。",
  inputSchema:{type:"object",properties:{artifactId:{type:"string"},version:{type:"integer",minimum:1},offset:{type:"integer",minimum:0},limit:{type:"integer",minimum:1,maximum:128000}},required:["artifactId","version"],additionalProperties:false},
  resultSchema:{type:"object"},effects:["read"],requiredCapabilities:["task.artifacts"],platforms:["macos","windows"]}),
];
const failed=(operationId:string,code:string):WorkbenchResult=>workbenchResultSchema.parse({operationId,status:"failed",artifactRefs:[],progressCursor:null,
 error:{code,retryable:false,dispatched:false,nextAction:"fix_input"}});
const unknown=(operationId:string):WorkbenchResult=>workbenchResultSchema.parse({operationId,status:"unknown",artifactRefs:[],progressCursor:null,
 error:{code:"artifact_result_unknown",retryable:false,dispatched:true,nextAction:"reconcile"}});
function record(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("INVALID_NATIVE_FILE_REPLY");
 return value as Record<string,unknown>;
}
function integer(value:unknown):number{
 if(!Number.isSafeInteger(value)||Number(value)<0)throw new Error("INVALID_NATIVE_FILE_REPLY");
 return Number(value);
}
function decodePage(value:unknown):Uint8Array{
 if(typeof value!=="string"||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
  throw new Error("INVALID_NATIVE_FILE_REPLY");
 const bytes=Buffer.from(value,"base64");
 if(bytes.toString("base64")!==value)throw new Error("INVALID_NATIVE_FILE_REPLY");
 return bytes;
}

/** 仅在桌面私有文件宿主存在时装配；所有身份从当前 execution lease 读取。 */
export function createWorkbenchArtifactHost(db:Db,options:{platform?:NodeJS.Platform;desktop?:boolean;socketPath?:string;
 now?:()=>string;blobs:WorkbenchArtifactBlobPort;filePort?:FilePort}):(Host&{verifyArtifacts:ReturnType<typeof createWorkbenchArtifactService>["verifyArtifacts"]})|undefined{
 const platform=options.platform??process.platform,desktop=options.desktop??process.env.CREATOROS_DESKTOP==="1";
 const socketPath=options.socketPath??process.env.CREATOROS_WORKBENCH_SOCKET;
 if(!["darwin","win32"].includes(platform)||!desktop||!socketPath)return undefined;
 const leases=createExecutionLeaseService(db,{now:options.now});
 const client=createWorkbenchNativeClient({withLease:(ref,mode,action)=>leases.withLease(ref,mode,async({task,context})=>{
  if(!context.accountId||context.accountId!==task.accountId)throw new NativeFileError("ACCOUNT_SCOPE_INVALID",false);
  return action({context:{userId:context.userId,accountId:context.accountId},task});
 })},{platform,desktop,socketPath});
 const file=options.filePort??client.file;
 const artifacts=createWorkbenchArtifactService(db,{blobs:options.blobs,now:options.now,
  async readTaskFile(scope,relativePath){
   const stat=record(await file(scope.ref,randomUUID(),{kind:"stat",path:relativePath}));
   const size=integer(stat.size),version=integer(stat.version);
   if(stat.isDirectory!==false||size<1||size>MAX_BYTES||version<1)throw new Error("INVALID_ARTIFACT_FILE");
   const bytes=Buffer.alloc(size);
   for(let offset=0;offset<size;){
    const page=record(await file(scope.ref,randomUUID(),{kind:"read",path:relativePath,offset,limit:Math.min(128_000,size-offset)}));
    const slice=decodePage(page.contentBase64);
    if(integer(page.total)!==size||integer(page.version)!==version||slice.byteLength<1||slice.byteLength>size-offset)
     throw new Error("ARTIFACT_FILE_CHANGED");
    bytes.set(slice,offset);offset+=slice.byteLength;
   }
   const final=record(await file(scope.ref,randomUUID(),{kind:"stat",path:relativePath}));
   if(final.isDirectory!==false||integer(final.size)!==size||integer(final.version)!==version)throw new Error("ARTIFACT_FILE_CHANGED");
   return {bytes,version};
  },
 });
 return {catalog,platform:platform==="win32"?"windows":"macos",capabilities:["task.artifacts"],verifyArtifacts:artifacts.verifyArtifacts,
  async dispatch(rawCall,{signal}){
   signal.throwIfAborted();
   const call=workbenchHostCallSchema.parse(rawCall),{context,invocation}=call;
   if(!catalog.some(item=>item.name===invocation.name)||invocation.schemaVersion!==1)return failed(context.operationId,"invalid_capability");
   const ref={executionTaskId:context.taskId,attempt:context.attempt,fenceToken:context.fenceToken};
   try{
    await leases.withLease(ref,"admission",async({task})=>{
     if(task.id!==context.taskId||task.userId!==context.userId||task.accountId!==context.accountId||task.leaseOwner!==context.leaseId)
      throw new Error("ARTIFACT_SCOPE_INVALID");
    });
   }catch{return failed(context.operationId,"artifact_scope_invalid");}
   if(invocation.name==="artifact.register"){
    const input=registerSchema.safeParse(invocation.input);
    if(!input.success)return failed(context.operationId,"invalid_input");
    try{
     const metadata=await artifacts.register(ref,context.operationId,input.data);
     signal.throwIfAborted();
     return workbenchResultSchema.parse({operationId:context.operationId,status:"succeeded",artifactRefs:[`${metadata.artifactId}@${metadata.version}`],progressCursor:null,
      content:[{type:"text",text:JSON.stringify(metadata)}]});
    }catch(error){
     if(signal.aborted)throw error;
     if(error instanceof NativeFileError&&!error.dispatched)return failed(context.operationId,error.code.toLowerCase());
     return unknown(context.operationId);
    }
   }
   const input=readSchema.safeParse(invocation.input);
   if(!input.success)return failed(context.operationId,"invalid_input");
   try{
    const page=await artifacts.read({userId:context.userId,accountId:context.accountId,requestId:context.operationId,source:"ai"},
     context.taskId,input.data.artifactId,input.data.version,input.data.offset,input.data.limit);
    signal.throwIfAborted();
    const binary=page.metadata.mime==="image/png"||page.metadata.mime==="application/pdf";
    let content:{text:string;encoding:"utf8"}|{contentBase64:string;encoding:"base64"};
    if(binary)content={contentBase64:Buffer.from(page.bytes).toString("base64"),encoding:"base64"};
    else try{content={text:new TextDecoder("utf-8",{fatal:true}).decode(page.bytes),encoding:"utf8"};}
    catch{content={contentBase64:Buffer.from(page.bytes).toString("base64"),encoding:"base64"};}
    return workbenchResultSchema.parse({operationId:context.operationId,status:"succeeded",artifactRefs:[`${page.metadata.artifactId}@${page.metadata.version}`],progressCursor:null,
     content:[{type:"text",text:JSON.stringify({mime:page.metadata.mime,hash:page.metadata.hash,total:page.total,nextOffset:page.nextOffset,...content})}]});
   }catch(error){if(signal.aborted)throw error;return failed(context.operationId,"artifact_read_failed");}
  },
 };
}
