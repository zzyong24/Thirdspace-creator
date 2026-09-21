import {createHash} from "node:crypto";
import {posix} from "node:path";
import {and,asc,eq,aiConversations,aiMessages,aiTasks,executionCalls,executionTasks,workbenchArtifactLineages,
 workbenchArtifactLineageVersions,OwnershipError,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {workbenchArtifactSchema,workbenchArtifactRegisterRequestSchema,workbenchArtifactVersionsRequestSchema,workbenchArtifactCopyRequestSchema,workbenchResultSchema,
 type WorkbenchArtifact} from "@creatoros/contract/agent-workbench";
import {agenticToolOutcomeSchema,checkpointToolCallSchema,chatToolProviderName,workbenchToolOutcome,workerToolResultReceiptSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import type {WorkbenchBlobMime} from "../assets";
import {createExecutionLeaseService} from "./execution-lease.service";
import {ConflictError} from "./execution.errors";
import {agenticToolOperationKey} from "./agentic-tool-binding";

const MAX_ARTIFACT_BYTES=20*1024*1024;
const inputSchema=workbenchArtifactRegisterRequestSchema;
type RegisterInput=typeof inputSchema._input;
type Stored={metadata:WorkbenchArtifact;operationId:string;requestDigest:string};
type Scope={userId:string;accountId:string;taskId:string;ref:ExecutionRef};
type ConversationScope=Scope&{conversationId:string};
type OperationBinding={toolCallId:string;toolName:string;claimId:string;executionAttempt?:number;executionFenceToken?:string;absentObservedAt?:string};
type PendingSource=({kind:"register";path:string;fileVersion:number;hash:string;baseArtifactRef?:{artifactId:string;version:number}}|
 {kind:"copy";sourceArtifactId:string;sourceVersion:number;sourceTaskId:string;sourceHash:string;targetPath:string})&OperationBinding;
export interface WorkbenchArtifactBlobPort {
 submit(ctx:RequestContext,input:{taskId:string;operationId:string;mime:WorkbenchBlobMime;bytes:Uint8Array}):Promise<{hash:string;size:number}>;
 read(ctx:RequestContext,input:{taskId:string;operationId:string;hash:string;mime:WorkbenchBlobMime}):Promise<Uint8Array>;
 inspect?(ctx:RequestContext,input:{taskId:string;operationId:string;hash:string;mime:WorkbenchBlobMime}):Promise<"present"|"absent"|"unknown">;
}
export interface WorkbenchArtifactFilePort {
 (scope:Scope,path:string):Promise<{bytes:Uint8Array;version:number}>;
}
const digest=(value:Uint8Array|string)=>createHash("sha256").update(value).digest("hex");
const pageCursor=(scope:string,artifactId:string,version:number)=>`v1:${digest(JSON.stringify([scope,artifactId,version])).slice(0,32)}`;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
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
function htmlImagePaths(bytes:Uint8Array,htmlPath:string):string[]{
 let html:string;try{html=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{return [];}
 const result:string[]=[];const seen=new Set<string>(),pattern=/<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/giu;
 for(const match of html.matchAll(pattern)){
  const source=(match[2]??"").replaceAll("&amp;","&");
  if(!source||source.length>2048||source.startsWith("/")||/[\\%?#:\x00-\x1f\x7f]/.test(source))continue;
  const parts=source.split("/");if(parts.some(part=>part===".."||!part))continue;
  const path=posix.join(posix.dirname(htmlPath),source);if(!path.toLowerCase().endsWith(".png")||seen.has(path))continue;
  seen.add(path);result.push(path);if(result.length===12)break;
 }
 return result;
}

/** 产物元数据属于原 execution task；字节只经 assets 服务端口存取。 */
export function createWorkbenchArtifactService(db:Db,deps:{readTaskFile?:WorkbenchArtifactFilePort;blobs:WorkbenchArtifactBlobPort;now?:()=>string}){
 const leases=createExecutionLeaseService(db,{now:deps.now}),now=deps.now??(()=>new Date().toISOString());
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
 async function conversationScope(store:Db,task:typeof executionTasks.$inferSelect):Promise<ConversationScope|null>{
  const payload=object(task.payload);
  if(payload.artifactProtocolVersion!==2)return null;
  return mappedConversationScope(store,task);
 }
 async function mappedConversationScope(store:Db,task:typeof executionTasks.$inferSelect):Promise<ConversationScope>{
  const payload=object(task.payload);
  const modelInput=object(payload.modelInput),conversationId=modelInput.conversationId;
  if(task.ownerType!=="ai_task"||typeof conversationId!=="string"||!conversationId||
   modelInput.kind!=="chat.run"||modelInput.userId!==task.userId||modelInput.accountId!==task.accountId)
   throw new ConflictError("聊天产物协议映射无效");
  const [business]=await store.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),
   eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,task.userId),eq(aiTasks.accountId,task.accountId)));
  const [conversation]=await store.select().from(aiConversations).where(and(eq(aiConversations.id,conversationId),
   eq(aiConversations.userId,task.userId),eq(aiConversations.accountId,task.accountId)));
  const sourceMessageId=modelInput.sourceMessageId;
  const [sourceMessage]=typeof sourceMessageId==="string"?await store.select().from(aiMessages).where(and(eq(aiMessages.id,sourceMessageId),eq(aiMessages.conversationId,conversationId),eq(aiMessages.role,"user"))):[];
  if(!business||business.taskType!=="copilot.assist"||object(business.inputData).conversationId!==conversationId||
   object(business.inputData).sourceMessageId!==sourceMessageId||!conversation||object(sourceMessage?.modelMetadata).chatTaskId!==business.id)
   throw new ConflictError("聊天产物协议映射无效");
  return {userId:task.userId,accountId:task.accountId,taskId:task.id,conversationId,ref:{executionTaskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken!}};
 }
 async function operationBinding(store:Db,task:typeof executionTasks.$inferSelect,call:typeof executionCalls.$inferSelect,expected:string):Promise<OperationBinding>{
  const calls=await store.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  const modelInput=object(object(task.payload).modelInput),tools=Array.isArray(modelInput.tools)?modelInput.tools:[];
  for(const model of calls.filter(row=>row.kind==="model"&&!row.parentCallId&&row.status==="settled"&&row.providerResult)){
   const content=object(model.providerResult).content;if(!Array.isArray(content))continue;
   for(const raw of content){const proposed=checkpointToolCallSchema.safeParse(raw);if(!proposed.success||agenticToolOperationKey(model.id,proposed.data.toolCallId)!==call.operationKey)continue;
    const frozen=tools.filter(item=>typeof object(item).name==="string"&&chatToolProviderName(String(object(item).name))===proposed.data.toolName);
    const toolName=frozen.length===1?String(object(frozen[0]).name):"";
    if(toolName!==expected)throw new ConflictError("产物工具调用与冻结定义不符");
    return {toolCallId:proposed.data.toolCallId,toolName,claimId:call.toolExecutionClaimId!};
   }
  }
  throw new ConflictError("产物工具调用来源缺失");
 }
 function pendingRow(lineage:typeof workbenchArtifactLineages.$inferSelect):Stored{
  const parsed=workbenchArtifactSchema.safeParse(lineage.pendingMetadata);
  if(!parsed.success||!lineage.pendingOperationId||!lineage.pendingRequestDigest)
   throw new ConflictError("产物谱系占位已损坏");
  return {metadata:parsed.data,operationId:lineage.pendingOperationId,requestDigest:lineage.pendingRequestDigest};
 }
 function artifactOutcome(row:Stored,toolName="artifact.register"){
  const workbench={operationId:row.operationId,status:"succeeded" as const,artifactRefs:[`${row.metadata.artifactId}@${row.metadata.version}`],progressCursor:null,
   content:[{type:"text" as const,text:JSON.stringify(row.metadata)}]};
  return agenticToolOutcomeSchema.parse({status:"ok",summary:JSON.stringify(row.metadata),evidence:[],data:{workbench},error:null,continuation:null,sideEffect:"committed"});
 }
 function settledReceiptMatches(call:typeof executionCalls.$inferSelect,row:Stored){
  if(call.status!=="settled"||!call.resultText)return false;
  try{
   const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText)),outcome=agenticToolOutcomeSchema.parse(receipt.output),workbench=workbenchResultSchema.parse(object(outcome.data).workbench);
   if(receipt.toolName!=="artifact.register"||outcome.status!=="ok"||outcome.sideEffect!=="committed"||workbench.status!=="succeeded"||workbench.operationId!==row.operationId||
    !workbench.artifactRefs.includes(`${row.metadata.artifactId}@${row.metadata.version}`))return false;
   return workbench.content.some(item=>{if(item.type!=="text")return false;try{return JSON.stringify(workbenchArtifactSchema.parse(JSON.parse(item.text)))===JSON.stringify(row.metadata);}catch{return false;}});
  }catch{return false;}
 }
 async function legacyRows(chat:Pick<ConversationScope,"userId"|"accountId"|"conversationId">){
  const businesses=(await db.select().from(aiTasks).where(and(eq(aiTasks.userId,chat.userId),eq(aiTasks.accountId,chat.accountId),eq(aiTasks.taskType,"copilot.assist"))))
   .filter(row=>object(row.inputData).kind==="chat.run"&&object(row.inputData).conversationId===chat.conversationId&&row.executionTaskId);
  const result:Array<{task:typeof executionTasks.$inferSelect;row:Stored}>=[];
  for(const business of businesses){
   const [task]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,business.executionTaskId!),eq(executionTasks.ownerId,business.id),eq(executionTasks.userId,chat.userId),eq(executionTasks.accountId,chat.accountId)));
   if(!task||object(task.payload).artifactProtocolVersion===2)continue;
   let mapped:ConversationScope;try{mapped=await mappedConversationScope(db,task);}catch{continue;}
   if(mapped.conversationId!==chat.conversationId)continue;
   let stored:Stored[];try{stored=records(task.payload);}catch{continue;}
   for(const row of stored)if(row.metadata.taskId===task.id)result.push({task,row});
  }
  return result;
 }
 async function ensureLegacyMigration(chat:Pick<ConversationScope,"userId"|"accountId"|"conversationId">,onlyArtifactId?:string){
  const candidates=(await legacyRows(chat)).filter(item=>!onlyArtifactId||item.row.metadata.artifactId===onlyArtifactId),groups=new Map<string,typeof candidates>();
  for(const candidate of candidates){const id=candidate.row.metadata.artifactId;groups.set(id,[...(groups.get(id)??[]),candidate]);}
  for(const [artifactId,rawGroup] of groups){
   const [existing]=await db.select().from(workbenchArtifactLineages).where(and(eq(workbenchArtifactLineages.userId,chat.userId),eq(workbenchArtifactLineages.accountId,chat.accountId),eq(workbenchArtifactLineages.conversationId,chat.conversationId),eq(workbenchArtifactLineages.artifactId,artifactId)));
   if(existing)continue;
   const group=[...rawGroup].sort((a,b)=>a.row.metadata.version-b.row.metadata.version||a.task.createdAt.localeCompare(b.task.createdAt));
   let reason:string|null=null;const prepared:Array<typeof group[number]&{call:typeof executionCalls.$inferSelect;binding:OperationBinding|null;metadata:WorkbenchArtifact}>=[];
   if(group.some((item,index)=>item.row.metadata.version!==index+1))reason="legacy_version_sequence_invalid";
   for(const item of group){
    if(reason)break;
    try{await verified(item.row,{userId:chat.userId,accountId:chat.accountId,requestId:`migration:${item.row.operationId}`,source:"ai"});}
    catch{reason="legacy_blob_unverified";break;}
    const [call]=await db.select().from(executionCalls).where(and(eq(executionCalls.id,item.row.operationId),eq(executionCalls.executionTaskId,item.task.id)));
    if(!call||call.kind!=="tool"){reason="legacy_call_missing";break;}
    let binding:OperationBinding|null=null;
    if(call.status==="settled"){if(!settledReceiptMatches(call,item.row)){reason="legacy_receipt_mismatch";break;}}
    else if(["started","unknown"].includes(call.status)&&call.toolExecutionClaimId){
     try{binding=await operationBinding(db,item.task,call,"artifact.register");}catch{reason="legacy_call_binding_invalid";break;}
    }else{reason="legacy_call_unsettled";break;}
    const metadata=workbenchArtifactSchema.parse({...item.row.metadata,...(item.row.metadata.mime==="text/html"&&item.row.metadata.htmlResources===undefined?{htmlResources:[]}:{})});
    prepared.push({...item,call,binding,metadata});
   }
   const stamp=now(),lineageId=`wal-${digest(JSON.stringify([chat.userId,chat.accountId,chat.conversationId,artifactId])).slice(0,40)}`;
   if(reason){
    await db.insert(workbenchArtifactLineages).values({id:lineageId,userId:chat.userId,accountId:chat.accountId,conversationId:chat.conversationId,artifactId,currentVersion:0,state:"migration_blocked",migrationReason:reason,createdAt:stamp,updatedAt:stamp}).onConflictDoNothing();
    continue;
   }
   await db.transaction(async tx=>{
    const [winner]=await tx.select().from(workbenchArtifactLineages).where(and(eq(workbenchArtifactLineages.userId,chat.userId),eq(workbenchArtifactLineages.accountId,chat.accountId),eq(workbenchArtifactLineages.conversationId,chat.conversationId),eq(workbenchArtifactLineages.artifactId,artifactId))).for("update");
    if(winner)return;
    for(const item of prepared){
     const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,item.row.operationId),eq(executionCalls.executionTaskId,item.task.id))).for("update");
     if(!call||call.status!==item.call.status||call.resultText!==item.call.resultText||call.toolExecutionClaimId!==item.call.toolExecutionClaimId)throw new ConflictError("旧产物调用在迁移期间改变");
    }
    await tx.insert(workbenchArtifactLineages).values({id:lineageId,userId:chat.userId,accountId:chat.accountId,conversationId:chat.conversationId,artifactId,currentVersion:prepared.length,state:"committed",lastOperationId:prepared.at(-1)?.row.operationId??null,createdAt:stamp,updatedAt:stamp});
    for(const item of prepared){
     if(item.binding){
      const outcome=artifactOutcome({...item.row,metadata:item.metadata}),receipt=workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId:item.binding.toolCallId,toolName:item.binding.toolName,output:outcome});
      await tx.update(executionCalls).set({status:"settled",usage:{totalTokens:0},totalTokens:0,resultText:JSON.stringify(receipt),updatedAt:stamp}).where(eq(executionCalls.id,item.call.id));
     }
     await tx.insert(workbenchArtifactLineageVersions).values({id:`wav-${digest(JSON.stringify([lineageId,item.metadata.version])).slice(0,40)}`,lineageId,artifactId,version:item.metadata.version,taskId:item.task.id,operationId:item.row.operationId,requestDigest:item.row.requestDigest,metadata:item.metadata,source:{kind:"migration",legacy:true},htmlResources:item.metadata.htmlResources??[],createdAt:stamp});
    }
   }).catch(async error=>{
    const [winner]=await db.select().from(workbenchArtifactLineages).where(and(eq(workbenchArtifactLineages.userId,chat.userId),eq(workbenchArtifactLineages.accountId,chat.accountId),eq(workbenchArtifactLineages.conversationId,chat.conversationId),eq(workbenchArtifactLineages.artifactId,artifactId)));
    if(!winner)throw error;
   });
  }
 }
 async function stageConversation(ref:ExecutionRef,operationId:string,input:ReturnType<typeof expectedInput>,requestDigest:string,scope:ConversationScope){
  const ctx={userId:scope.userId,accountId:scope.accountId,requestId:operationId,source:"ai"} satisfies RequestContext;
  const prior=await db.select().from(workbenchArtifactLineageVersions).where(and(
   eq(workbenchArtifactLineageVersions.taskId,scope.taskId),eq(workbenchArtifactLineageVersions.operationId,operationId)));
  if(prior[0]){
   if(prior[0].requestDigest!==requestDigest)throw new ConflictError("同一操作 ID 的产物参数已改变");
   const metadata=workbenchArtifactSchema.parse(prior[0].metadata),row={metadata,operationId,requestDigest};
   await verified(row,ctx);return metadata;
  }
  const existingPending=await db.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingOperationId,operationId));
  let snapshot:Awaited<ReturnType<WorkbenchArtifactFilePort>>|undefined;
  if(!existingPending[0]){
   if(!deps.readTaskFile)throw new ConflictError("当前宿主不支持产物登记");
   snapshot=await deps.readTaskFile(scope,input.path);
   if(!Number.isSafeInteger(snapshot.version)||snapshot.version<1||snapshot.bytes.byteLength<1||snapshot.bytes.byteLength>MAX_ARTIFACT_BYTES)
    throw new ConflictError("任务文件为空、过大或版本无效");
  }
  const prepared=existingPending[0]?pendingRow(existingPending[0]):await leases.withLease(ref,"admission",async({tx,task})=>{
   const store=tx as unknown as Db,chat=await conversationScope(store,task);
   if(!chat||chat.conversationId!==scope.conversationId)throw new ConflictError("聊天产物协议映射已改变");
   const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,operationId),eq(executionCalls.executionTaskId,task.id))).for("update");
   if(!call||call.kind!=="tool"||call.status!=="started"||!call.toolExecutionClaimId)
    throw new ConflictError("产物登记必须绑定已领取的原工具调用");
   const binding=await operationBinding(store,task,call,"artifact.register");
   const replay=await tx.select().from(workbenchArtifactLineageVersions).where(and(eq(workbenchArtifactLineageVersions.taskId,task.id),eq(workbenchArtifactLineageVersions.operationId,operationId)));
   if(replay[0]){
    if(replay[0].requestDigest!==requestDigest)throw new ConflictError("同一操作 ID 的产物参数已改变");
    return {metadata:workbenchArtifactSchema.parse(replay[0].metadata),operationId,requestDigest};
   }
   const artifactId=input.artifactId??`wa-${digest(JSON.stringify([scope.userId,scope.accountId,scope.conversationId,task.id,operationId])).slice(0,32)}`;
   const [lineage]=await tx.select().from(workbenchArtifactLineages).where(and(
    eq(workbenchArtifactLineages.userId,scope.userId),eq(workbenchArtifactLineages.accountId,scope.accountId),
    eq(workbenchArtifactLineages.conversationId,scope.conversationId),eq(workbenchArtifactLineages.artifactId,artifactId))).for("update");
   if(lineage?.pendingOperationId){
    if(lineage.pendingOperationId!==operationId)throw new ConflictError("产物当前有待核对的修订，请稍后重试");
    const row=pendingRow(lineage);if(row.requestDigest!==requestDigest)throw new ConflictError("同一操作 ID 的产物参数已改变");
    return row;
   }
   if(lineage?.state==="migration_blocked")throw new ConflictError("旧产物谱系待人工核对，只能只读使用");
   const current=lineage?.currentVersion??0;
   if(input.artifactId&&!lineage)throw new ConflictError("产物 ID 不属于当前对话");
   if(current!==(input.expectedVersion??0))throw new ConflictError(`产物版本已改变，当前为 ${current}`);
   if(current>0&&(!input.baseArtifactRef||input.baseArtifactRef.artifactId!==artifactId||input.baseArtifactRef.version!==current))
    throw new ConflictError("跨回合修订须声明当前来源版本");
   if(current===0&&input.baseArtifactRef)throw new ConflictError("新产物不得声明来源版本");
   for(const sourceId of input.provenance){
    const [source]=await tx.select({id:executionCalls.id}).from(executionCalls).where(and(eq(executionCalls.id,sourceId),eq(executionCalls.executionTaskId,task.id),eq(executionCalls.status,"settled")));
    if(!source)throw new ConflictError("产物来源引用不是本任务已结算调用");
   }
   const htmlResources:NonNullable<WorkbenchArtifact["htmlResources"]>=[];let htmlResourceBytes=0;
   if(input.mime==="text/html")for(const path of htmlImagePaths(snapshot!.bytes,input.path)){
    const image=records(task.payload).filter(row=>row.metadata.mime==="image/png"&&row.metadata.relativePath===path).at(-1);
    if(!image||htmlResourceBytes+image.metadata.size>2*1024*1024)continue;
    htmlResourceBytes+=image.metadata.size;htmlResources.push({path,artifactId:image.metadata.artifactId,version:image.metadata.version,
     taskId:image.metadata.taskId,hash:image.metadata.hash,size:image.metadata.size});
   }
   const metadata=workbenchArtifactSchema.parse({artifactId,version:current+1,mime:input.mime,size:snapshot!.bytes.byteLength,
    hash:digest(snapshot!.bytes),relativePath:input.path,taskId:task.id,provenance:input.provenance,
    ...(input.baseArtifactRef?{baseArtifactRef:input.baseArtifactRef}:{}),...(input.mime==="text/html"?{htmlResources}: {})});
   const source:PendingSource={kind:"register",path:input.path,fileVersion:snapshot!.version,hash:metadata.hash,...binding,executionAttempt:task.attempt,executionFenceToken:task.fenceToken!,
    ...(input.baseArtifactRef?{baseArtifactRef:input.baseArtifactRef}:{})};
   const stamp=now(),lineageId=lineage?.id??`wal-${digest(JSON.stringify([scope.userId,scope.accountId,scope.conversationId,artifactId])).slice(0,40)}`;
   if(lineage)await tx.update(workbenchArtifactLineages).set({state:"pending_blob",pendingOperationId:operationId,pendingTaskId:task.id,
    pendingRequestDigest:requestDigest,pendingMetadata:metadata,pendingSource:source,pendingHtmlResources:metadata.htmlResources??[],
    reconciliationClaimId:null,reconciliationLeaseExpiresAt:null,lastErrorCode:null,updatedAt:stamp}).where(eq(workbenchArtifactLineages.id,lineage.id));
   else await tx.insert(workbenchArtifactLineages).values({id:lineageId,userId:scope.userId,accountId:scope.accountId,
    conversationId:scope.conversationId,artifactId,currentVersion:0,state:"pending_blob",pendingOperationId:operationId,
    pendingTaskId:task.id,pendingRequestDigest:requestDigest,pendingMetadata:metadata,pendingSource:source,
    pendingHtmlResources:metadata.htmlResources??[],createdAt:stamp,updatedAt:stamp});
   return {metadata,operationId,requestDigest};
  });
  if(prepared.requestDigest!==requestDigest)throw new ConflictError("同一操作 ID 的产物参数已改变");
  try{await verified(prepared,ctx);}catch{
   if(!deps.readTaskFile)throw new ConflictError("当前宿主不支持产物登记");
   snapshot??=await deps.readTaskFile(scope,input.path);
   const frozenSource=existingPending[0]?object(existingPending[0].pendingSource):null;
   if(frozenSource&&frozenSource.kind==="register"&&frozenSource.fileVersion!==snapshot.version)throw new ConflictError("待登记源文件版本已改变");
   assertBytes(snapshot.bytes,prepared.metadata.hash,prepared.metadata.size);
   const saved=await deps.blobs.submit(ctx,{taskId:scope.taskId,operationId,mime:prepared.metadata.mime as WorkbenchBlobMime,bytes:snapshot.bytes});
   if(saved.hash!==prepared.metadata.hash||saved.size!==prepared.metadata.size)throw new ConflictError("产物存储回执与待登记摘要不一致");
  }
  await verified(prepared,ctx);
  return prepared.metadata;
 }
 async function conversationVersion(ctx:RequestContext,currentTaskId:string,artifactId:string,version:number):Promise<Stored|null>{
  const current=await owned(ctx,currentTaskId),chat=await conversationScope(db,current);if(!chat)return null;
  await ensureLegacyMigration(chat,artifactId);
  const [lineage]=await db.select().from(workbenchArtifactLineages).where(and(eq(workbenchArtifactLineages.userId,chat.userId),
   eq(workbenchArtifactLineages.accountId,chat.accountId),eq(workbenchArtifactLineages.conversationId,chat.conversationId),
   eq(workbenchArtifactLineages.artifactId,artifactId)));
  if(!lineage)return null;
  const [stored]=await db.select().from(workbenchArtifactLineageVersions).where(and(eq(workbenchArtifactLineageVersions.lineageId,lineage.id),eq(workbenchArtifactLineageVersions.version,version)));
  if(!stored)return null;
  return {metadata:workbenchArtifactSchema.parse(stored.metadata),operationId:stored.operationId,requestDigest:stored.requestDigest};
 }
 return {
  async inspectOperation(ref:ExecutionRef,operationId:string){
   return leases.withLease(ref,"settlement",async({tx,task})=>{
    const formal=records(task.payload).some(row=>row.operationId===operationId),legacyPending=records(task.payload,"workbenchArtifactPending").some(row=>row.operationId===operationId);
    const [lineage]=await tx.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingOperationId,operationId));
    const [indexed]=await tx.select({id:workbenchArtifactLineageVersions.id}).from(workbenchArtifactLineageVersions).where(and(eq(workbenchArtifactLineageVersions.taskId,task.id),eq(workbenchArtifactLineageVersions.operationId,operationId)));
    return formal||indexed?"committed" as const:legacyPending||lineage?"pending" as const:"confirmed_no_commit" as const;
   });
  },
  async register(ref:ExecutionRef,operationId:string,raw:RegisterInput):Promise<WorkbenchArtifact>{
   if(!operationId||operationId.length>160)throw new ConflictError("产物操作 ID 无效");
   const input=expectedInput(raw);
   const requestDigest=digest(JSON.stringify(input));
   const preflight=await leases.withLease(ref,"admission",async({tx,task})=>{
    if(task.kind!=="ai_task"||!task.accountId)throw new ConflictError("当前任务不支持产物登记");
    const existing=records(task.payload).find(row=>row.operationId===operationId);
    const pending=records(task.payload,"workbenchArtifactPending").find(row=>row.operationId===operationId);
    const conversation=await conversationScope(tx as unknown as Db,task);
    return {scope:{userId:task.userId,accountId:task.accountId,taskId:task.id,ref},existing,pending,conversation};
   });
   if(preflight.conversation)return stageConversation(ref,operationId,input,requestDigest,{...preflight.conversation,ref});
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
  async copy(ref:ExecutionRef,operationId:string,raw:unknown):Promise<WorkbenchArtifact>{
   if(!operationId||operationId.length>160)throw new ConflictError("产物操作 ID 无效");
   const input=workbenchArtifactCopyRequestSchema.parse(raw),requestDigest=digest(JSON.stringify(input));
   const scope=await leases.withLease(ref,"admission",async({tx,task})=>{
    const chat=await conversationScope(tx as unknown as Db,task);if(!chat)throw new ConflictError("旧产物协议不支持跨任务复制");return {...chat,ref};
   });
   const ctx={userId:scope.userId,accountId:scope.accountId,requestId:operationId,source:"ai"} satisfies RequestContext;
   const source=await conversationVersion(ctx,scope.taskId,input.sourceArtifactId,input.sourceVersion);
   if(!source||source.metadata.mime!=="image/png"||source.metadata.size>2*1024*1024)throw new OwnershipError("可复制图片不存在或超过大小限制");
   const sourceBytes=await verified(source,ctx);
   const existing=await db.select().from(workbenchArtifactLineageVersions).where(and(eq(workbenchArtifactLineageVersions.taskId,scope.taskId),eq(workbenchArtifactLineageVersions.operationId,operationId)));
   if(existing[0]){
    if(existing[0].requestDigest!==requestDigest)throw new ConflictError("同一操作 ID 的复制参数已改变");
    const metadata=workbenchArtifactSchema.parse(existing[0].metadata);await verified({metadata,operationId,requestDigest},ctx);return metadata;
   }
   const prepared=await leases.withLease(ref,"admission",async({tx,task})=>{
    const chat=await conversationScope(tx as unknown as Db,task);if(!chat||chat.conversationId!==scope.conversationId)throw new ConflictError("聊天产物协议映射已改变");
    const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,operationId),eq(executionCalls.executionTaskId,task.id))).for("update");
    if(!call||call.kind!=="tool"||call.status!=="started"||!call.toolExecutionClaimId)throw new ConflictError("产物复制必须绑定已领取的原工具调用");
    const binding=await operationBinding(tx as unknown as Db,task,call,"artifact.copy");
    const [pending]=await tx.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingOperationId,operationId)).for("update");
    if(pending){const row=pendingRow(pending);if(row.requestDigest!==requestDigest)throw new ConflictError("同一操作 ID 的复制参数已改变");return row;}
    if(records(task.payload).some(row=>row.metadata.relativePath===input.targetPath))throw new ConflictError("复制目标路径已被正式产物占用");
    const taskPending=await tx.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingTaskId,task.id));
    if(taskPending.some(item=>workbenchArtifactSchema.safeParse(item.pendingMetadata).data?.relativePath===input.targetPath))throw new ConflictError("复制目标路径已有待核对产物");
    const artifactId=`wa-${digest(JSON.stringify([scope.userId,scope.accountId,scope.conversationId,task.id,operationId])).slice(0,32)}`;
    const metadata=workbenchArtifactSchema.parse({artifactId,version:1,mime:"image/png",size:source.metadata.size,hash:source.metadata.hash,
     relativePath:input.targetPath,taskId:task.id,provenance:[],copiedFrom:{artifactId:source.metadata.artifactId,version:source.metadata.version,
      taskId:source.metadata.taskId,hash:source.metadata.hash}});
    const stamp=now(),lineageId=`wal-${digest(JSON.stringify([scope.userId,scope.accountId,scope.conversationId,artifactId])).slice(0,40)}`;
    const frozen:PendingSource={kind:"copy",sourceArtifactId:source.metadata.artifactId,sourceVersion:source.metadata.version,...binding,executionAttempt:task.attempt,executionFenceToken:task.fenceToken!,
     sourceTaskId:source.metadata.taskId,sourceHash:source.metadata.hash,targetPath:input.targetPath};
    await tx.insert(workbenchArtifactLineages).values({id:lineageId,userId:scope.userId,accountId:scope.accountId,conversationId:scope.conversationId,
     artifactId,currentVersion:0,state:"pending_blob",pendingOperationId:operationId,pendingTaskId:task.id,pendingRequestDigest:requestDigest,
     pendingMetadata:metadata,pendingSource:frozen,pendingHtmlResources:[],createdAt:stamp,updatedAt:stamp});
    return {metadata,operationId,requestDigest};
   });
   try{await verified(prepared,ctx);}catch{
    const saved=await deps.blobs.submit(ctx,{taskId:scope.taskId,operationId,mime:"image/png",bytes:sourceBytes});
    if(saved.hash!==prepared.metadata.hash||saved.size!==prepared.metadata.size)throw new ConflictError("复制存储回执与来源摘要不一致");
   }
   await verified(prepared,ctx);return prepared.metadata;
  },
  async markUnknown(ref:ExecutionRef,input:{operationId:string;claimId:string;toolCallId:string;toolName:string}){
   await leases.withLease(ref,"settlement",async({tx,task})=>{
    const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,input.operationId),eq(executionCalls.executionTaskId,task.id))).for("update");
    if(!call||call.status==="settled")return;
    if(call.toolExecutionClaimId!==input.claimId)throw new ConflictError("产物执行领取凭证已改变");
    const [lineage]=await tx.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingOperationId,input.operationId)).for("update");
    if(!lineage)return;
    const frozen=object(lineage.pendingSource);
    if(frozen.claimId!==input.claimId||frozen.toolCallId!==input.toolCallId||frozen.toolName!==input.toolName)
     throw new ConflictError("产物未知状态与冻结工具调用不符");
    await tx.update(workbenchArtifactLineages).set({state:"unknown",lastErrorCode:"artifact_result_unknown",
     pendingSource:frozen,updatedAt:now()})
     .where(eq(workbenchArtifactLineages.id,lineage.id));
   });
  },
  async reconcileArtifactOperation(ref:ExecutionRef,operationId:string,reconciliationClaimId?:string){
   const [lineage]=await db.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingOperationId,operationId));
   if(!lineage)return {status:"committed" as const};
   const binding=object(lineage.pendingSource),toolCallId=binding.toolCallId,toolName=binding.toolName,claimId=binding.claimId;
   if(typeof toolCallId!=="string"||typeof toolName!=="string"||typeof claimId!=="string")return {status:"unknown" as const};
   const row=pendingRow(lineage),ctx={userId:lineage.userId,accountId:lineage.accountId,requestId:operationId,source:"ai" as const};
   if(reconciliationClaimId&&(lineage.reconciliationClaimId!==reconciliationClaimId||!lineage.reconciliationLeaseExpiresAt||Date.parse(lineage.reconciliationLeaseExpiresAt)<=Date.parse(now())))
    throw new ConflictError("产物对账领取凭证已失效");
   try{
    await verified(row,ctx);
    const workbench={operationId,status:"succeeded" as const,artifactRefs:[`${row.metadata.artifactId}@${row.metadata.version}`],progressCursor:null,
     content:[{type:"text" as const,text:JSON.stringify(row.metadata)}]};
    const outcome=agenticToolOutcomeSchema.parse({status:"ok",summary:JSON.stringify(row.metadata),evidence:[],data:{workbench},error:null,continuation:null,sideEffect:"committed"});
    await this.commitAndSettleArtifact(ref,{operationId,claimId,toolName,toolCallId,outcome,reconciliationClaimId});return {status:"committed" as const,metadata:row.metadata};
   }catch(error){
    const inspected=deps.blobs.inspect?await deps.blobs.inspect(ctx,{taskId:row.metadata.taskId,operationId,mime:row.metadata.mime as WorkbenchBlobMime,hash:row.metadata.hash}).catch(()=>"unknown" as const):"unknown" as const;
    const source=object(lineage.pendingSource),observed=typeof source.absentObservedAt==="string"?Date.parse(source.absentObservedAt):NaN;
    if(inspected==="absent"&&typeof source.executionFenceToken==="string"&&source.executionFenceToken!==ref.fenceToken){
     if(!Number.isFinite(observed)||Date.parse(now())-observed<30_000){
      await leases.withLease(ref,"settlement",async({tx})=>tx.update(workbenchArtifactLineages).set({state:"unknown",reconciliationClaimId:null,reconciliationLeaseExpiresAt:null,
       pendingSource:{...source,absentObservedAt:now()},lastErrorCode:"artifact_blob_absent_recheck",updatedAt:now()}).where(and(eq(workbenchArtifactLineages.id,lineage.id),...(reconciliationClaimId?[eq(workbenchArtifactLineages.reconciliationClaimId,reconciliationClaimId)]:[]))));
      return {status:"unknown" as const};
     }
     const failed=await leases.withLease(ref,"settlement",async({tx,task})=>{
      const [current]=await tx.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.id,lineage.id)).for("update");
      const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,operationId),eq(executionCalls.executionTaskId,task.id))).for("update");
      if(!current||current.pendingOperationId!==operationId||!call||!["started","unknown"].includes(call.status)||call.toolExecutionClaimId!==claimId)throw new ConflictError("待确认失败的产物调用已改变");
      if(reconciliationClaimId&&(current.reconciliationClaimId!==reconciliationClaimId||!current.reconciliationLeaseExpiresAt||Date.parse(current.reconciliationLeaseExpiresAt)<=Date.parse(now())))throw new ConflictError("产物对账领取凭证已失效");
      const currentSource=object(current.pendingSource);
      if(currentSource.executionFenceToken===task.fenceToken||typeof currentSource.absentObservedAt!=="string"||Date.parse(now())-Date.parse(currentSource.absentObservedAt)<30_000)throw new ConflictError("产物无提交证明尚未满足复核间隔");
      const workbench=workbenchResultSchema.parse({operationId,status:"failed",artifactRefs:[],progressCursor:null,error:{code:"artifact_blob_absent",retryable:true,dispatched:true,confirmedNoCommit:true,nextAction:"retry"}});
      const outcome=workbenchToolOutcome(workbench,{name:toolName,schemaVersion:1,description:"持久产物原操作对账",inputSchema:{},resultSchema:{},effects:["task_write"],requiredCapabilities:["task.artifacts"],platforms:["macos","windows"]});
      const receipt=workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId,toolName,output:outcome}),stamp=now();
      await tx.update(executionCalls).set({status:"settled",usage:{totalTokens:0},totalTokens:0,resultText:JSON.stringify(receipt),updatedAt:stamp}).where(eq(executionCalls.id,call.id));
      await tx.update(workbenchArtifactLineages).set({state:"failed_confirmed",pendingOperationId:null,pendingTaskId:null,pendingRequestDigest:null,pendingMetadata:null,pendingSource:null,pendingHtmlResources:null,
       reconciliationClaimId:null,reconciliationLeaseExpiresAt:null,lastOperationId:operationId,lastErrorCode:"artifact_blob_absent",updatedAt:stamp}).where(eq(workbenchArtifactLineages.id,current.id));
      return outcome;
     });
     return {status:"failed_confirmed" as const,outcome:failed};
    }
    await leases.withLease(ref,"settlement",async({tx})=>tx.update(workbenchArtifactLineages).set({state:"unknown",reconciliationClaimId:null,reconciliationLeaseExpiresAt:null,lastErrorCode:"artifact_reconcile_unknown",updatedAt:now()}).where(and(eq(workbenchArtifactLineages.id,lineage.id),...(reconciliationClaimId?[eq(workbenchArtifactLineages.reconciliationClaimId,reconciliationClaimId)]:[])))).catch(()=>{});
    throw error;
   }
  },
  async commitAndSettleArtifact(ref:ExecutionRef,input:{operationId:string;claimId:string;toolName:string;toolCallId:string;outcome:unknown;reconciliationClaimId?:string}){
   if(!["artifact.register","artifact.copy"].includes(input.toolName))throw new ConflictError("当前工具不支持产物事务结算");
   const outcome=agenticToolOutcomeSchema.parse(input.outcome),workbench=workbenchResultSchema.safeParse(object(outcome.data).workbench);
   if(outcome.status!=="ok"||outcome.sideEffect!=="committed"||!workbench.success||workbench.data.status!=="succeeded"||
    workbench.data.operationId!==input.operationId)throw new ConflictError("产物正式回执与宿主结果不符");
   const [before]=await db.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingOperationId,input.operationId));
   if(before){
   const row=pendingRow(before),ctx={userId:before.userId,accountId:before.accountId,requestId:input.operationId,source:"ai" as const};
    if(!workbench.data.artifactRefs.includes(`${row.metadata.artifactId}@${row.metadata.version}`))throw new ConflictError("产物引用与占位不符");
    await verified(row,ctx);
    for(const resource of row.metadata.htmlResources??[]){
     const sourceTask=await owned(ctx,resource.taskId),source=records(sourceTask.payload).find(item=>item.metadata.artifactId===resource.artifactId&&
      item.metadata.version===resource.version&&item.metadata.taskId===resource.taskId&&item.metadata.relativePath===resource.path&&
      item.metadata.mime==="image/png"&&item.metadata.hash===resource.hash&&item.metadata.size===resource.size);
     if(!source)throw new ConflictError("HTML 图片清单来源已改变");await verified(source,ctx);
    }
   }
   return leases.withLease(ref,"settlement",async({tx,task})=>{
    const store=tx as unknown as Db,chat=await conversationScope(store,task);
    if(!chat)throw new ConflictError("旧产物协议不能进入跨回合事务结算");
    const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,input.operationId),eq(executionCalls.executionTaskId,task.id))).for("update");
    if(!call||call.kind!=="tool")throw new ConflictError("原工具调用不存在");
    if(call.status==="settled"){
     const saved=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText??""));
     if(saved.toolCallId!==input.toolCallId||saved.toolName!==input.toolName||JSON.stringify(saved.output)!==JSON.stringify(outcome))
      throw new ConflictError("已结算产物回执不能改写");
     return agenticToolOutcomeSchema.parse(saved.output);
    }
    if(!["started","unknown"].includes(call.status)||call.toolExecutionClaimId!==input.claimId)throw new ConflictError("产物执行领取凭证已改变");
    const [lineage]=await tx.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.pendingOperationId,input.operationId)).for("update");
    if(!lineage||lineage.userId!==chat.userId||lineage.accountId!==chat.accountId||lineage.conversationId!==chat.conversationId||lineage.pendingTaskId!==task.id)
     throw new ConflictError("待结算产物谱系不存在或归属已改变");
    if(call.status==="unknown"&&!input.reconciliationClaimId)throw new ConflictError("未知产物只能由专用对账端口结算");
    if(input.reconciliationClaimId&&(lineage.reconciliationClaimId!==input.reconciliationClaimId||!lineage.reconciliationLeaseExpiresAt||Date.parse(lineage.reconciliationLeaseExpiresAt)<=Date.parse(now())))
     throw new ConflictError("产物对账领取凭证已失效");
    const row=pendingRow(lineage);
    const frozenBinding=object(lineage.pendingSource);
    if(frozenBinding.claimId!==input.claimId||frozenBinding.toolCallId!==input.toolCallId||frozenBinding.toolName!==input.toolName)
     throw new ConflictError("产物正式回执与冻结工具调用不符");
    if(row.metadata.version!==lineage.currentVersion+1||row.metadata.taskId!==task.id||
     !workbench.data.artifactRefs.includes(`${row.metadata.artifactId}@${row.metadata.version}`))
     throw new ConflictError("待结算产物版本已改变");
    const expectedSummary=JSON.stringify(row.metadata);
    const receiptContent=workbench.data.status==="succeeded"?workbench.data.content:[];
    if(outcome.summary!==expectedSummary||receiptContent.length!==1||receiptContent[0]?.type!=="text"||receiptContent[0].text!==expectedSummary)
     throw new ConflictError("产物正式回执正文与冻结元数据不符");
    const commitCtx={userId:chat.userId,accountId:chat.accountId,requestId:input.operationId,source:"ai" as const};
    await verified(row,commitCtx);
    for(const resource of row.metadata.htmlResources??[]){
     const [sourceTask]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,resource.taskId),eq(executionTasks.userId,chat.userId),eq(executionTasks.accountId,chat.accountId)));
     const source=sourceTask&&records(sourceTask.payload).find(item=>item.metadata.artifactId===resource.artifactId&&item.metadata.version===resource.version&&item.metadata.taskId===resource.taskId&&item.metadata.relativePath===resource.path&&item.metadata.mime==="image/png"&&item.metadata.hash===resource.hash&&item.metadata.size===resource.size);
     if(!source)throw new ConflictError("HTML 图片清单来源已改变");await verified(source,commitCtx);
    }
    const prior=records(task.payload),pending=records(task.payload,"workbenchArtifactPending");
    if(prior.some(item=>item.operationId===input.operationId))throw new ConflictError("新协议任务出现旧路径双写");
    const stamp=now(),receipt=workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId:input.toolCallId,toolName:input.toolName,output:outcome});
    await tx.insert(workbenchArtifactLineageVersions).values({id:`wav-${digest(JSON.stringify([lineage.id,row.metadata.version])).slice(0,40)}`,
     lineageId:lineage.id,artifactId:row.metadata.artifactId,version:row.metadata.version,taskId:task.id,operationId:input.operationId,
     requestDigest:row.requestDigest,metadata:row.metadata,source:lineage.pendingSource??{},htmlResources:lineage.pendingHtmlResources??[],createdAt:stamp});
    await tx.update(workbenchArtifactLineages).set({currentVersion:row.metadata.version,state:"committed",pendingOperationId:null,
     pendingTaskId:null,pendingRequestDigest:null,pendingMetadata:null,pendingSource:null,pendingHtmlResources:null,
     reconciliationClaimId:null,reconciliationLeaseExpiresAt:null,lastOperationId:input.operationId,lastErrorCode:null,updatedAt:stamp}).where(eq(workbenchArtifactLineages.id,lineage.id));
    await tx.update(executionTasks).set({payload:{...task.payload as Record<string,unknown>,
     workbenchArtifactPending:pending.filter(item=>item.operationId!==input.operationId),workbenchArtifactVersions:[...prior,row]}}).where(eq(executionTasks.id,task.id));
    await tx.update(executionCalls).set({status:"settled",usage:{totalTokens:0},totalTokens:0,resultText:JSON.stringify(receipt),updatedAt:stamp}).where(eq(executionCalls.id,call.id));
    return outcome;
   });
  },
  async versions(ctx:RequestContext,currentTaskId:string,raw:unknown){
   const input=workbenchArtifactVersionsRequestSchema.parse(raw),task=await owned(ctx,currentTaskId),chat=await conversationScope(db,task);
   if(!chat){
    const all=records(task.payload).filter(row=>!input.artifactId||row.metadata.artifactId===input.artifactId)
     .sort((a,b)=>a.metadata.artifactId.localeCompare(b.metadata.artifactId)||a.metadata.version-b.metadata.version);
    const taskScope=`task:${task.id}:filter:${input.artifactId??"*"}`,cursorIndex=input.cursor?all.findIndex(row=>pageCursor(taskScope,row.metadata.artifactId,row.metadata.version)===input.cursor):-1;
    if(input.cursor&&cursorIndex<0)throw new ConflictError("产物列表游标无效或不属于当前范围");
    const start=input.cursor?cursorIndex+1:0;
    const page=all.slice(start,start+input.limit);
    return {items:page.map(row=>({...row.metadata,status:"ready" as const})),nextCursor:start+page.length<all.length?pageCursor(taskScope,page.at(-1)!.metadata.artifactId,page.at(-1)!.metadata.version):null};
   }
   await ensureLegacyMigration(chat,input.artifactId);
   const lineages=await db.select().from(workbenchArtifactLineages).where(and(eq(workbenchArtifactLineages.userId,chat.userId),
    eq(workbenchArtifactLineages.accountId,chat.accountId),eq(workbenchArtifactLineages.conversationId,chat.conversationId)));
   const selected=lineages.filter(row=>!input.artifactId||row.artifactId===input.artifactId),ids=new Set(selected.map(row=>row.id));
   const versions=(await db.select().from(workbenchArtifactLineageVersions).orderBy(asc(workbenchArtifactLineageVersions.artifactId),asc(workbenchArtifactLineageVersions.version)))
    .filter(row=>ids.has(row.lineageId));
   const scopeKey=`conversation:${chat.userId}:${chat.accountId}:${chat.conversationId}:filter:${input.artifactId??"*"}`,cursorIndex=input.cursor?versions.findIndex(row=>pageCursor(scopeKey,row.artifactId,row.version)===input.cursor):-1;
   if(input.cursor&&cursorIndex<0)throw new ConflictError("产物列表游标无效或不属于当前会话");
   const start=input.cursor?cursorIndex+1:0,page=versions.slice(start,start+input.limit);
   return {items:page.map(row=>({...workbenchArtifactSchema.parse(row.metadata),status:"ready" as const})),
    nextCursor:start+page.length<versions.length?pageCursor(scopeKey,page.at(-1)!.artifactId,page.at(-1)!.version):null,
    lineages:selected.map(row=>({artifactId:row.artifactId,currentVersion:row.currentVersion,status:row.state==="committed"?"ready":row.state==="pending_blob"?"pending":row.state,
     pendingOperationId:row.pendingOperationId,lastOperationId:row.lastOperationId,lastErrorCode:row.lastErrorCode,migrationReason:row.migrationReason}))};
  },
  async listConversation(ctx:RequestContext,conversationId:string,raw:unknown){
   const accountId=ctx.accountId??"";if(!conversationId||!accountId)throw new OwnershipError("会话不存在");
   const [conversation]=await db.select().from(aiConversations).where(and(eq(aiConversations.id,conversationId),eq(aiConversations.userId,ctx.userId),eq(aiConversations.accountId,accountId)));
   if(!conversation)throw new OwnershipError("会话不存在");
   const input=workbenchArtifactVersionsRequestSchema.parse(raw);await ensureLegacyMigration({userId:ctx.userId,accountId,conversationId},input.artifactId);
   const lineages=(await db.select().from(workbenchArtifactLineages).where(and(
    eq(workbenchArtifactLineages.userId,ctx.userId),eq(workbenchArtifactLineages.accountId,accountId),eq(workbenchArtifactLineages.conversationId,conversationId))))
    .filter(row=>!input.artifactId||row.artifactId===input.artifactId),ids=new Set(lineages.map(row=>row.id));
   const versions=(await db.select().from(workbenchArtifactLineageVersions).orderBy(asc(workbenchArtifactLineageVersions.artifactId),asc(workbenchArtifactLineageVersions.version)))
    .filter(row=>ids.has(row.lineageId));
   const scopeKey=`conversation:${ctx.userId}:${accountId}:${conversationId}:filter:${input.artifactId??"*"}`,cursorIndex=input.cursor?versions.findIndex(row=>pageCursor(scopeKey,row.artifactId,row.version)===input.cursor):-1;
   if(input.cursor&&cursorIndex<0)throw new ConflictError("产物列表游标无效或不属于当前会话");
   const start=input.cursor?cursorIndex+1:0,page=versions.slice(start,start+input.limit);
   const blocked=new Set(lineages.filter(row=>row.state==="migration_blocked").map(row=>row.artifactId)),legacyItems:WorkbenchArtifact[]=[];
   if(blocked.size)for(const item of await legacyRows({userId:ctx.userId,accountId,conversationId}))if(blocked.has(item.row.metadata.artifactId)){
    try{await verified(item.row,ctx);legacyItems.push(workbenchArtifactSchema.parse(item.row.metadata));}catch{}
   }
   return {items:page.map(row=>({...workbenchArtifactSchema.parse(row.metadata),status:"ready" as const})),legacyItems:legacyItems.map(item=>({...item,status:"legacyReadOnly" as const})),
    nextCursor:start+page.length<versions.length?pageCursor(scopeKey,page.at(-1)!.artifactId,page.at(-1)!.version):null,
    lineages:lineages.map(row=>({artifactId:row.artifactId,currentVersion:row.currentVersion,status:row.state==="committed"?"ready":row.state==="pending_blob"?"pending":row.state,
     pendingOperationId:row.pendingOperationId,lastOperationId:row.lastOperationId,lastErrorCode:row.lastErrorCode,migrationReason:row.migrationReason}))};
  },
  async read(ctx:RequestContext,taskId:string,artifactId:string,version:number,offset:number,limit:number){
   if(!Number.isSafeInteger(version)||version<1||!Number.isSafeInteger(offset)||offset<0||
      !Number.isSafeInteger(limit)||limit<1||limit>128_000)throw new ConflictError("产物读取范围无效");
   const task=await owned(ctx,taskId);
   const row=await conversationVersion(ctx,taskId,artifactId,version)??records(task.payload).find(item=>item.metadata.artifactId===artifactId&&item.metadata.version===version);
   if(!row)throw new OwnershipError("产物不存在");
   const bytes=await verified(row,ctx);
   return {metadata:row.metadata,total:bytes.byteLength,bytes:bytes.slice(offset,offset+limit),
    nextOffset:offset+limit<bytes.byteLength?offset+limit:null};
  },
  async readAll(ctx:RequestContext,taskId:string,artifactId:string,version:number){
   if(!Number.isSafeInteger(version)||version<1)throw new ConflictError("产物版本无效");
   const task=await owned(ctx,taskId);
   const row=await conversationVersion(ctx,taskId,artifactId,version)??records(task.payload).find(item=>item.metadata.artifactId===artifactId&&item.metadata.version===version);
   if(!row)throw new OwnershipError("产物不存在");
   return {metadata:row.metadata,bytes:await verified(row,ctx)};
  },
  async readRelativeImage(ctx:RequestContext,taskId:string,relativePath:string,htmlMetadata?:WorkbenchArtifact){
   if(!relativePath||relativePath.length>2048)throw new ConflictError("图片相对路径无效");
   const task=await owned(ctx,taskId);
   if(htmlMetadata){
    if(htmlMetadata.taskId!==taskId||htmlMetadata.mime!=="text/html")throw new ConflictError("HTML 图片清单归属无效");
    if(htmlMetadata.htmlResources!==undefined){
     const resource=htmlMetadata.htmlResources.find(item=>item.path===relativePath);if(!resource)return null;
     const sourceTask=resource.taskId===task.id?task:await owned(ctx,resource.taskId);
     const exact=records(sourceTask.payload).find(item=>item.metadata.artifactId===resource.artifactId&&item.metadata.version===resource.version&&
      item.metadata.taskId===resource.taskId&&item.metadata.relativePath===resource.path&&item.metadata.mime==="image/png"&&
      item.metadata.hash===resource.hash&&item.metadata.size===resource.size);
     return exact?{metadata:exact.metadata,bytes:await verified(exact,ctx)}:null;
    }
    // 旧聊天 HTML 没有可证明的登记时清单，保守省略；非聊天任务继续原 task 范围兼容路径。
    if(object(object(task.payload).modelInput).kind==="chat.run")return null;
   }
   // 只查正式登记的当前任务版本；待登记文件及工作目录均不能成为预览资源。
   const row=records(task.payload).filter(item=>item.metadata.taskId===taskId&&
    item.metadata.mime==="image/png"&&item.metadata.relativePath===relativePath).at(-1);
   return row?{metadata:row.metadata,bytes:await verified(row,ctx)}:null;
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
 return {read:service.read,readAll:service.readAll,readRelativeImage:service.readRelativeImage,listConversation:service.listConversation,
  verifyArtifacts:service.verifyArtifacts};
}
