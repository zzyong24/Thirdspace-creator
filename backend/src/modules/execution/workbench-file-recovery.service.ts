import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {z} from "zod";
import {and,asc,eq,inArray,isNull,sql,executionCalls,executionTasks,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {workbenchFileRequestSchema,type WorkbenchCapability} from "@creatoros/contract/agent-workbench";
import {chatWorkerInputSchema,workerProviderReceiptSchema,workerToolResultReceiptSchema,agenticToolOutcomeSchema} from "@creatoros/contract/execution-worker";
import {createAgenticToolBinding} from "./agentic-tool-binding";
import {ConflictError,OwnershipError} from "./execution.errors";
import {defineWorkbenchChatTool} from "../ai-runtime/chat-tool-gate";
import {prepareChatToolDefinitions} from "../ai-runtime/chat-tool-definitions";
import {readmitUnclaimedFile} from "./workbench-file-predispatch-recovery";

const sha=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const hash=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const nativeFileWriteRecordSchema=z.object({schemaVersion:z.literal(1),scopeKey:z.string(),operationId:z.string(),requestDigest:hash,
 path:z.string(),expectedVersion:version.nullable(),observedBaseVersion:version,contentSha256:hash,byteLength:z.number().int().min(0).max(1_000_000),
 admittedAttempt:z.number().int().positive(),fenceToken:z.string().min(1).max(160),state:z.enum(["prepared","committed"]),resultVersion:version.nullable()}).strict();
export type FileReceiptQuery={scope:{userId:string;accountId:string;taskId:string;attempt:number;fenceToken:string},operationId:string,path:string,expectedVersion:number|null,contentSha256:string,byteLength:number};
export const fileWriteRequestDigest=(scopeKey:string,operationId:string,path:string,expectedVersion:number|null,contentSha256:string,byteLength:number)=>
 `sha256:${sha(JSON.stringify(["creatoros-file-write-v1",scopeKey,operationId,path,expectedVersion,contentSha256,byteLength]))}`;

/** Only the named Native receipt reader may be supplied. It has no write port.
 * Legacy observed-state adoption is deliberately absent until quiescence review.
 */
type RecoveryControl={signal:AbortSignal;shouldStop():boolean};
export function createWorkbenchFileRecoveryService(db:Db,deps:{capabilities:readonly WorkbenchCapability[];readReceipt(query:FileReceiptQuery,signal?:AbortSignal):Promise<unknown>;now?:()=>string;
 afterReconciled?:(taskId:string,control?:RecoveryControl)=>Promise<void>;shouldStop?:()=>boolean}){
 const now=deps.now??(()=>new Date().toISOString());
 const capabilities=deps.capabilities.filter(cap=>["files.write","files.edit"].includes(cap.name));
 const prepared=prepareChatToolDefinitions(Object.fromEntries(capabilities.map(cap=>[cap.name,defineWorkbenchChatTool(cap,async()=>{throw Error("RECOVERY_CANNOT_WRITE");})])),{workbenchCapabilities:capabilities});
 type Tx=Parameters<Parameters<Db["transaction"]>[0]>[0];
 async function snapshot(tx:Tx,ctx:RequestContext,taskId:string,operationId:string,readmission?:{check():void}){
  if(!ctx.accountId)throw new OwnershipError("当前账号不存在");
  const [task]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,taskId),eq(executionTasks.userId,ctx.userId),eq(executionTasks.accountId,ctx.accountId))).for("update");
  if(!task)throw new OwnershipError("任务不存在");
  const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  const call=calls.find(row=>row.id===operationId);
  const payload=task.payload as Record<string,unknown>|null,input=chatWorkerInputSchema.safeParse(payload?.modelInput);
  if(task.kind!=="ai_task"||task.ownerType!=="ai_task"||!input.success||input.data.executionEngine!=="pi"||
   input.data.userId!==task.userId||input.data.accountId!==task.accountId||payload?.aiTaskId!==task.ownerId||!call)
   throw new ConflictError("文件恢复缺少原任务绑定");
  const setup=await prepared;
  const tools=Object.fromEntries(setup.definitions.map(def=>[def.name,{...def,parameters:setup.parameters[def.name]!.parameters}]));
  const bound=createAgenticToolBinding(tools).forCall(task,calls,call);
  const definition=setup.definitions.find(def=>def.name===bound.executionToolName);
  const frozen=input.data.tools.filter(def=>def.name===bound.executionToolName);
  const model=calls.find(row=>row.id===bound.modelCallId);
  const savedReadmissions=payload.filePredispatchRecoveries;
  const hasReadmission=savedReadmissions&&typeof savedReadmissions==="object"&&Object.hasOwn(savedReadmissions,call.id);
  if(readmission && ((task.status==="paused"&&call.toolExecutionClaimId===null)||(hasReadmission&&!(call.toolExecutionClaimId&&["unknown","started"].includes(call.status))))){
   return {replayed:await readmitUnclaimedFile({tx,task,calls,call,tools,definition,capability:capabilities.find(cap=>cap.name==="files.edit"),stamp:now(),check:readmission.check})};
  }
  // Keep the original predicates and short-circuit order. Only fixed diagnostic
  // labels may leave this gate: never values, schema issues, claims or receipts.
  const reason=!definition?"TOOL_DEFINITION_MISSING":frozen.length!==1?"FROZEN_TOOL_NOT_UNIQUE":
   !isDeepStrictEqual(frozen[0],definition)?"FROZEN_TOOL_MISMATCH":bound.execution!=="host"?"TOOL_EXECUTION_MISMATCH":
   bound.effect!=="committed"?"TOOL_EFFECT_MISMATCH":bound.validationOutcome?"PROPOSAL_NOT_EXECUTABLE":
   !model?"MODEL_MISSING":model.status!=="settled"?"MODEL_NOT_SETTLED":model.totalTokens===null?"MODEL_USAGE_MISSING":
   !workerProviderReceiptSchema.safeParse(model.providerResult).success?"MODEL_RECEIPT_INVALID":
   call.parentCallId?"PARENT_CALL_NOT_ALLOWED":!call.toolExecutionClaimId?"EXECUTION_CLAIM_MISSING":
   call.startedAttempt===null?"STARTED_ATTEMPT_MISSING":call.startedAttempt>task.attempt?"STARTED_ATTEMPT_AHEAD":
   call.providerJob!==null?"PROVIDER_JOB_PRESENT":call.providerResult!==null?"PROVIDER_RESULT_PRESENT":
   call.resultRef!==null?"RESULT_REF_PRESENT":call.retryOfCallId!==null?"RETRY_SOURCE_PRESENT":
   call.rejectionCode!==null?"REJECTION_CODE_PRESENT":call.reservedTokens!==0?"RESERVED_TOKENS_MISMATCH":
   call.accountingBasis!=="tokens"?"ACCOUNTING_BASIS_MISMATCH":calls.some(c=>c.parentCallId===call.id)?"CHILD_CALLS_PRESENT":
   calls.filter(c=>c.operationKey===call.operationKey).length!==1?"OPERATION_NOT_UNIQUE":null;
  if(reason)throw new ConflictError(`文件恢复身份或调用证据不匹配 [${reason}]`);
  const operation=bound.executionToolName==="files.edit"?"edit":"write";
  const request=workbenchFileRequestSchema.parse({...bound.input as object,operation});
  if(request.operation!=="write"&&request.operation!=="edit")throw new ConflictError("仅支持文件写入回执");
  const bytes=Buffer.from(request.content,"utf8"),path=request.path.normalize("NFC"),expectedVersion=request.expectedVersion??null;
  const scopeKey=[task.userId,task.accountId,task.id].map(id=>sha(id!)).join(":");
  const contentSha256=`sha256:${sha(bytes)}`,byteLength=bytes.length;
  const requestDigest=fileWriteRequestDigest(scopeKey,call.id,path,expectedVersion,contentSha256,byteLength);
  if(call.status==="settled"){
   const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText??"null"));
   const output=agenticToolOutcomeSchema.parse(receipt.output),data=output.data as Record<string,unknown>|null;
   const evidence=data?.recoveryEvidence as Record<string,unknown>|undefined;
   if(receipt.toolCallId!==bound.toolCallId||receipt.toolName!==bound.toolName||evidence?.kind!=="native_receipt"||evidence.requestDigest!==requestDigest||
    evidence.originalCallId!==call.id||evidence.inputDigest!==call.inputDigest||output.sideEffect!=="committed"||call.totalTokens!==0)
    throw new ConflictError("已有文件回执不能覆盖");
   return {replayed:{taskId,operationId,status:"settled" as const,verificationKind:"native_receipt" as const,version:Number(evidence.resultVersion),hash:String(evidence.contentSha256),size:Number(evidence.byteLength)}};
  }
  if(!["paused","unknown_result"].includes(task.status)||task.leaseOwner!==null||task.leaseExpiresAt!==null||!task.fenceToken||
   !["started","unknown"].includes(call.status)||call.resultText!==null||call.totalTokens!==null||call.usage!==null)
   throw new ConflictError("任务须已停止且原文件调用尚未结算");
  return {task,call,bound,scopeKey,requestDigest,query:{scope:{userId:task.userId,accountId:task.accountId!,taskId,attempt:task.attempt,fenceToken:task.fenceToken},operationId,path,expectedVersion,contentSha256,byteLength},
   snapshotDigest:sha(JSON.stringify({task,calls}))};
 }
 const check=(control?:RecoveryControl)=>{control?.signal.throwIfAborted();if(control?.shouldStop()||deps.shouldStop?.())throw Error("FILE_RECOVERY_STOPPED");};
 async function finish<T extends {status:string}>(result:T,taskId:string,control?:RecoveryControl){
  check(control);
  if(result.status==="settled"&&deps.afterReconciled){
   const [task]=await db.select({status:executionTasks.status}).from(executionTasks).where(eq(executionTasks.id,taskId));
   check(control);
   if(task?.status==="unknown_result")await deps.afterReconciled(taskId,control);
  }
  return result;
 }
 async function reconcile(ctx:RequestContext,taskId:string,operationId:string,control?:RecoveryControl){
  check(control);
  await prepared;
  const before=await db.transaction(tx=>snapshot(tx,ctx,taskId,operationId,ctx.source==="user"&&!control?{check:()=>check(control)}:undefined));
  check(control);
  if(before.replayed)return finish(before.replayed,taskId,control);
  const unknown={taskId,operationId,status:"unknown" as const,verificationKind:null,version:null,hash:null,size:null};
  // No transaction is held across Native I/O. Missing/damaged records never
  // authorize re-execution or legacy current-state inference.
  let raw:unknown;try{raw=await deps.readReceipt(before.query!,control?.signal);}catch{return unknown;}
  check(control);
  const reply=z.discriminatedUnion("status",[
   z.object({status:z.literal("absent")}).strict(),
   z.object({status:z.enum(["prepared","committed"]),receipt:nativeFileWriteRecordSchema}).strict(),
  ]).parse(raw);
  if(reply.status==="absent")return unknown;
  const r=reply.receipt,q=before.query!;
  if(r.scopeKey!==before.scopeKey||r.operationId!==operationId||r.requestDigest!==before.requestDigest||r.path!==q.path||
   r.expectedVersion!==q.expectedVersion||r.contentSha256!==q.contentSha256||r.byteLength!==q.byteLength||
   r.admittedAttempt!==before.call!.startedAttempt||r.observedBaseVersion>=Number.MAX_SAFE_INTEGER||
   (r.expectedVersion===null?r.observedBaseVersion!==0:r.expectedVersion!==r.observedBaseVersion)||r.state!==reply.status||
   (r.admittedAttempt===q.scope.attempt&&r.fenceToken!==q.scope.fenceToken))throw new ConflictError("原生文件回执身份不匹配");
  if(r.state==="prepared"){
   if(r.resultVersion!==null)throw new ConflictError("prepared回执不能含提交版本");
   return unknown;
  }
  if(r.resultVersion!==r.observedBaseVersion+1)throw new ConflictError("原生文件回执版本不匹配");
  const result=await db.transaction(async tx=>{
   check(control);
   const current=await snapshot(tx,ctx,taskId,operationId);
   check(control);
   if(current.replayed)return current.replayed;
   if(current.snapshotDigest!==before.snapshotDigest)throw new ConflictError("文件对账期间任务或调用已改变");
   const call=current.call!,bound=current.bound!,stamp=now();
   const evidence={kind:"native_receipt",schemaVersion:1,originalCallId:call.id,operationKey:call.operationKey,inputDigest:call.inputDigest,
    requestDigest:r.requestDigest,path:r.path,expectedVersion:r.expectedVersion,observedBaseVersion:r.observedBaseVersion,resultVersion:r.resultVersion,
    contentSha256:r.contentSha256,byteLength:r.byteLength,admittedAttempt:r.admittedAttempt,reconciledAt:stamp,
    originalSnapshot:{status:call.status,resultText:call.resultText,startedAttempt:call.startedAttempt,toolExecutionClaimId:call.toolExecutionClaimId,priorUpdatedAt:call.updatedAt}};
   const metadata={version:r.resultVersion,size:r.byteLength,hash:r.contentSha256.slice(7),recoveryKind:"native_receipt"};
   const output=agenticToolOutcomeSchema.parse({status:"ok",summary:`已按原生持久回执核对原文件操作；本次未重复写入。${JSON.stringify(metadata)}`,evidence:[],
    data:{recoveryEvidence:evidence,workbench:{operationId:call.id,status:"succeeded",artifactRefs:[],progressCursor:null,content:[{type:"text",text:JSON.stringify(metadata)}]}},error:null,continuation:null,sideEffect:"committed"});
   const receipt=workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId:bound.toolCallId,toolName:bound.toolName,output});
   await tx.update(executionCalls).set({status:"settled",resultText:JSON.stringify(receipt),totalTokens:0,usage:{totalTokens:0},updatedAt:stamp}).where(eq(executionCalls.id,call.id));
   check(control);
   return {taskId,operationId,status:"settled" as const,verificationKind:"native_receipt" as const,version:r.resultVersion,hash:r.contentSha256,size:r.byteLength};
  });
  return finish(result,taskId,control);
 }
 // The existing recovery-wake lane supplies single-flight, abort and awaited
 // shutdown. Rotate a bounded page so old absent receipts cannot starve newer calls.
 let cursor:string|undefined;
 async function scan(control:RecoveryControl,batchSize=20){
  check(control);let settled=0;
  const pending=await db.select({callId:executionCalls.id,taskId:executionTasks.id,userId:executionTasks.userId,accountId:executionTasks.accountId})
   .from(executionCalls).innerJoin(executionTasks,eq(executionTasks.id,executionCalls.executionTaskId))
   .where(and(eq(executionTasks.status,"unknown_result"),eq(executionTasks.kind,"ai_task"),eq(executionTasks.ownerType,"ai_task"),
    isNull(executionTasks.leaseOwner),isNull(executionTasks.leaseExpiresAt),eq(executionCalls.kind,"tool"),
    inArray(executionCalls.status,["started","unknown","settled"]),cursor?sql`${executionCalls.id} > ${cursor}`:undefined))
   .orderBy(asc(executionCalls.id)).limit(Math.max(1,Math.min(50,batchSize)));
  for(const row of pending){
   check(control);cursor=row.callId;
   if(!row.accountId)continue;
   try{
    // reconcile independently verifies the full frozen file binding before any
    // Native query; browser/command/other settled calls cannot pass that gate.
    const result=await reconcile({userId:row.userId,accountId:row.accountId,requestId:`file-recovery:${row.callId}`,source:"ai"},row.taskId,row.callId,control);
    if(result.status==="settled")settled++;
   }catch(error){check(control);if(!(error instanceof ConflictError))throw error;}
  }
  if(pending.length<Math.max(1,Math.min(50,batchSize)))cursor=undefined;
  return settled;
 }
 return {reconcile,scan};
}
