import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {workbenchRendererDiagnostics} from "./workbench-html-diagnostics";
import type {Db} from "@creatoros/backend";
import {ConflictError,OwnershipError,WorkbenchArtifactPendingError,createExecutionLeaseService,createWorkbenchArtifactService,type WorkbenchArtifactBlobPort} from "@creatoros/backend/modules/execution";
import type {ChatProductionCompositionDeps} from "@creatoros/backend/modules/ai-runtime";
import {workbenchCapabilitySchema,workbenchHostCallSchema,workbenchResultSchema,workbenchArtifactRegisterRequestSchema,workbenchArtifactReadRequestSchema,workbenchArtifactVersionsRequestSchema,workbenchArtifactCopyRequestSchema,type WorkbenchResult} from "@creatoros/contract/agent-workbench";
import {agenticToolOutcomeSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {createWorkbenchNativeClient,NativeFileError,type NativeFileAction} from "./workbench-native-client";

type Host=NonNullable<ChatProductionCompositionDeps["workbenchHost"]>;
type FilePort=(ref:ExecutionRef,operationId:string,action:NativeFileAction)=>Promise<unknown>;
const MAX_BYTES=20*1024*1024;
const registerSchema=workbenchArtifactRegisterRequestSchema;
const readSchema=workbenchArtifactReadRequestSchema;
const versionsSchema=workbenchArtifactVersionsRequestSchema;
const copySchema=workbenchArtifactCopyRequestSchema;
const REGISTER_GUIDANCE="新建产物请省略 artifactId、expectedVersion 和 baseArtifactRef，由服务生成 ID；修订先调用 artifact.versions/artifact.read，使用真实 artifactId、当前 expectedVersion 及匹配的 baseArtifactRef。provenance 可省略；填写时仅传本任务已结算调用的真实 execution callId，不传工具名或说明文字。修正参数后再调用，不要原样重试。";
const COPY_GUIDANCE="artifact.copy 使用同会话真实 sourceArtifactId/sourceVersion 精确复制已登记字节为独立新 artifact@1；不写任务文件，也不生成原产物下一版。targetPath 后缀须与源 MIME 匹配：HTML .html、Markdown .md、CSV .csv、PDF .pdf、PNG .png。PNG 上限 2 MiB，其他已支持 MIME 上限 20 MiB。无需转写正文或 base64；修正参数后再调用，不要原样重试。";
const legacyCopy=workbenchCapabilitySchema.parse({name:"artifact.copy",schemaVersion:1,description:"把当前对话中已登记的 PNG 精确版本复制到本任务，供新版 HTML 安全引用。",
 inputSchema:{type:"object",properties:{sourceArtifactId:{type:"string"},sourceVersion:{type:"integer",minimum:1},targetPath:{type:"string"}},required:["sourceArtifactId","sourceVersion","targetPath"],additionalProperties:false},
 resultSchema:{type:"object"},effects:["task_write"],requiredCapabilities:["task.artifacts"],platforms:["macos","windows"]});
const catalog=[
 workbenchCapabilitySchema.parse({name:"artifact.register",schemaVersion:1,description:"把当前任务中的真实文件保存为可回读版本；修订已有产物时同时提交 artifactId、expectedVersion 和相同的 baseArtifactRef。",
  inputSchema:{type:"object",properties:{path:{type:"string",minLength:1,maxLength:2048},mime:{type:"string",enum:["text/html","text/markdown","text/csv","image/png","application/pdf"]},
   artifactId:{type:"string"},expectedVersion:{type:"integer",minimum:0},baseArtifactRef:{type:"object",properties:{artifactId:{type:"string"},version:{type:"integer",minimum:1}},required:["artifactId","version"],additionalProperties:false},
   provenance:{type:"array",items:{type:"string"}}},required:["path","mime"],additionalProperties:false},
  resultSchema:{type:"object"},effects:["task_write"],requiredCapabilities:["task.artifacts"],platforms:["macos","windows"]}),
 workbenchCapabilitySchema.parse({name:"artifact.read",schemaVersion:1,description:"按版本分页读取当前对话已保存的产物。",
  inputSchema:{type:"object",properties:{artifactId:{type:"string"},version:{type:"integer",minimum:1},offset:{type:"integer",minimum:0},limit:{type:"integer",minimum:1,maximum:128000}},required:["artifactId","version"],additionalProperties:false},
  resultSchema:{type:"object"},effects:["read"],requiredCapabilities:["task.artifacts"],platforms:["macos","windows"]}),
 workbenchCapabilitySchema.parse({name:"artifact.versions",schemaVersion:1,description:"列出当前对话中已正式保存的产物版本。",
  inputSchema:{type:"object",properties:{artifactId:{type:"string"},cursor:{type:"string"},limit:{type:"integer",minimum:1,maximum:50}},additionalProperties:false},
  resultSchema:{type:"object"},effects:["read"],requiredCapabilities:["task.artifacts"],platforms:["macos","windows"]}),
 workbenchCapabilitySchema.parse({...legacyCopy,schemaVersion:2,description:COPY_GUIDANCE}),
];
const failed=(operationId:string,code:string):WorkbenchResult=>workbenchResultSchema.parse({operationId,status:"failed",artifactRefs:[],progressCursor:null,
 error:{code,retryable:false,dispatched:false,nextAction:"fix_input"}});
const unknown=(operationId:string):WorkbenchResult=>workbenchResultSchema.parse({operationId,status:"unknown",artifactRefs:[],progressCursor:null,
 error:{code:"artifact_result_unknown",retryable:false,dispatched:true,nextAction:"reconcile"}});
const confirmedNoCommit=(operationId:string,code:string):WorkbenchResult=>workbenchResultSchema.parse({operationId,status:"failed",artifactRefs:[],progressCursor:null,
 error:{code,retryable:true,dispatched:true,confirmedNoCommit:true,nextAction:"retry"}});
const invalidArtifactInput=(operationId:string,recovery:string,dispatched=false):WorkbenchResult=>workbenchResultSchema.parse({operationId,status:"failed",artifactRefs:[],progressCursor:null,
 error:{code:"invalid_input",recovery,retryable:false,dispatched,...(dispatched?{confirmedNoCommit:true}:{}),nextAction:"fix_input"}});
const invalidRegister=(operationId:string,reason:string,dispatched=false)=>invalidArtifactInput(operationId,`${reason}。${REGISTER_GUIDANCE}`,dispatched);
const invalidCopy=(operationId:string,reason:string,dispatched=false)=>invalidArtifactInput(operationId,`${reason}。${COPY_GUIDANCE}`,dispatched);
const pendingArtifact=(operationId:string,error:WorkbenchArtifactPendingError):WorkbenchResult=>workbenchResultSchema.parse({operationId,status:"failed",artifactRefs:[],progressCursor:null,
 error:{code:"artifact_revision_pending",retryable:false,dispatched:true,confirmedNoCommit:true,nextAction:"wait",
  recovery:`本次操作未提交；另一操作 ${error.pendingOperationId} 正在登记或等待核对。先通过 artifact.versions 查看该 pendingOperationId 并等待；如需对账，请核对上述原操作。待其完成后，用 artifact.versions/artifact.read 获取最新版本，再决定是否继续修订或复制。`}});
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
 return {catalog,legacyFrozenCapabilities:[legacyCopy],platform:platform==="win32"?"windows":"macos",capabilities:["task.artifacts"],verifyArtifacts:artifacts.verifyArtifacts,
  async dispatch(rawCall,{signal}){
   signal.throwIfAborted();
   const call=workbenchHostCallSchema.parse(rawCall),{context,invocation}=call;
   if(![...catalog,legacyCopy].some(item=>item.name===invocation.name&&item.schemaVersion===invocation.schemaVersion))return failed(context.operationId,"invalid_capability");
   const ref={executionTaskId:context.taskId,attempt:context.attempt,fenceToken:context.fenceToken};
   try{
    await leases.withLease(ref,"admission",async({task})=>{
     if(task.id!==context.taskId||task.userId!==context.userId||task.accountId!==context.accountId||task.leaseOwner!==context.leaseId)
      throw new Error("ARTIFACT_SCOPE_INVALID");
    });
   }catch{return failed(context.operationId,"artifact_scope_invalid");}
   if(invocation.name==="artifact.register"){
    const input=registerSchema.safeParse(invocation.input);
    if(!input.success)return invalidRegister(context.operationId,"登记参数格式或来源版本不匹配");
    if(input.data.artifactId&&input.data.expectedVersion===undefined)
     return invalidRegister(context.operationId,"提供 artifactId 代表修订已有产物，必须声明当前 expectedVersion");
    if(!input.data.artifactId&&input.data.expectedVersion!==undefined)
     return invalidRegister(context.operationId,"新建产物不得声明 expectedVersion");
    try{
     const metadata=await artifacts.register(ref,context.operationId,input.data);
     signal.throwIfAborted();
     // register 已离开租约事务；只按不可变 operation/hash 回读，不读可变任务路径。
     // 诊断失败不撤销已完成登记，也不把未知计数伪装为通过。
     let rendering=workbenchRendererDiagnostics(metadata.mime,metadata.hash);
     if(metadata.mime==="text/html")try{
      const bytes=await options.blobs.read({userId:context.userId,accountId:context.accountId,requestId:context.operationId,source:"ai"},
       {taskId:metadata.taskId,operationId:context.operationId,hash:metadata.hash,mime:"text/html"});
      if(bytes.byteLength===metadata.size&&createHash("sha256").update(bytes).digest("hex")===metadata.hash)
       rendering=workbenchRendererDiagnostics(metadata.mime,metadata.hash,bytes);
     }catch{/* 安全正文与已登记版本继续可交付。 */}
     signal.throwIfAborted();
     // 首条正文保持 strict artifact schema 和既有工具 summary；诊断独立附加给 Agent。
     return workbenchResultSchema.parse({operationId:context.operationId,status:"succeeded",artifactRefs:[`${metadata.artifactId}@${metadata.version}`],progressCursor:null,
      content:[{type:"text",text:JSON.stringify(metadata)},{type:"text",text:JSON.stringify(rendering)}]});
    }catch(error){
     if(signal.aborted)throw error;
     if(error instanceof NativeFileError&&!error.dispatched)return failed(context.operationId,error.code.toLowerCase());
     try{if(await artifacts.inspectOperation(ref,context.operationId)==="confirmed_no_commit"){
      // 只在服务证明没有 pending/committed 写入后转换确定性身份/版本校验失败。
      // 已提交或待核对的异常仍走 unknown，不能误报无写入后重复执行。
      if(error instanceof WorkbenchArtifactPendingError)return pendingArtifact(context.operationId,error);
      if(error instanceof ConflictError||error instanceof OwnershipError)
       return invalidRegister(context.operationId,"产物身份、版本或来源引用未通过登记校验",true);
      return confirmedNoCommit(context.operationId,"artifact_not_committed");
     }}catch{}
     return unknown(context.operationId);
    }
   }
   if(invocation.name==="artifact.copy"){
    const input=copySchema.safeParse(invocation.input);if(!input.success)return invalidCopy(context.operationId,"复制参数不符合要求");
    if(invocation.schemaVersion===1&&!input.data.targetPath.toLowerCase().endsWith(".png"))return invalidCopy(context.operationId,"此任务冻结的旧版复制工具仅支持 PNG");
    try{
     const metadata=await artifacts.copy(ref,context.operationId,input.data,invocation.schemaVersion as 1|2);signal.throwIfAborted();
     let rendering=workbenchRendererDiagnostics(metadata.mime,metadata.hash);
     if(metadata.mime==="text/html")try{
      const bytes=await options.blobs.read({userId:context.userId,accountId:context.accountId,requestId:context.operationId,source:"ai"},
       {taskId:metadata.taskId,operationId:context.operationId,hash:metadata.hash,mime:"text/html"});
      if(bytes.byteLength===metadata.size&&createHash("sha256").update(bytes).digest("hex")===metadata.hash)
       rendering=workbenchRendererDiagnostics(metadata.mime,metadata.hash,bytes);
     }catch{/* 诊断缺失不改写精确复制结果。 */}
     signal.throwIfAborted();
     return workbenchResultSchema.parse({operationId:context.operationId,status:"succeeded",artifactRefs:[`${metadata.artifactId}@${metadata.version}`],progressCursor:null,
      content:[{type:"text",text:JSON.stringify(metadata)},...(invocation.schemaVersion===2?[{type:"text" as const,text:JSON.stringify(rendering)}]:[])]});
    }catch(error){
     if(signal.aborted)throw error;
     try{if(await artifacts.inspectOperation(ref,context.operationId)==="confirmed_no_commit"){
      if(error instanceof WorkbenchArtifactPendingError)return pendingArtifact(context.operationId,error);
      if(error instanceof ConflictError||error instanceof OwnershipError)
       return invalidCopy(context.operationId,"来源产物、版本、图片依赖或目标路径未通过复制校验",true);
      return confirmedNoCommit(context.operationId,"artifact_not_committed");
     }}catch{}
     return unknown(context.operationId);
    }
   }
   if(invocation.name==="artifact.versions"){
    const input=versionsSchema.safeParse(invocation.input);if(!input.success)return failed(context.operationId,"invalid_input");
    try{
     const listing=await artifacts.versions({userId:context.userId,accountId:context.accountId,requestId:context.operationId,source:"ai"},context.taskId,input.data);
     return workbenchResultSchema.parse({operationId:context.operationId,status:"succeeded",artifactRefs:listing.items.map(item=>`${item.artifactId}@${item.version}`),progressCursor:listing.nextCursor,
      content:[{type:"text",text:JSON.stringify(listing)}]});
    }catch(error){if(signal.aborted)throw error;return failed(context.operationId,"artifact_versions_failed");}
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
  async commitAndSettle(rawCall,input){
   const call=workbenchHostCallSchema.parse(rawCall),outcome=agenticToolOutcomeSchema.parse(input.outcome);
   if(!["artifact.register","artifact.copy"].includes(call.invocation.name))throw new Error("ARTIFACT_ATOMIC_COMMIT_UNSUPPORTED");
   const ref={executionTaskId:call.context.taskId,attempt:call.context.attempt,fenceToken:call.context.fenceToken};
   return artifacts.commitAndSettleArtifact(ref,{operationId:call.context.operationId,claimId:input.claimId,
    toolName:call.invocation.name,toolCallId:input.toolCallId,outcome});
  },
  async markUnknown(rawCall,input){
   const call=workbenchHostCallSchema.parse(rawCall);
   if(!["artifact.register","artifact.copy"].includes(call.invocation.name))return;
   const ref={executionTaskId:call.context.taskId,attempt:call.context.attempt,fenceToken:call.context.fenceToken};
   await artifacts.markUnknown(ref,{operationId:call.context.operationId,claimId:input.claimId,toolCallId:input.toolCallId,toolName:input.toolName});
  },
 };
}
