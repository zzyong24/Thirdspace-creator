import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {z} from "zod";
import {and,eq,aiTasks,executionCalls,executionTasks,executionStreamEvents,type Db} from "@creatoros/backend";
import {chatWorkerInputSchema,workerProviderReceiptSchema,checkpointToolCallSchema} from "@creatoros/contract/execution-worker";
import {workbenchFileRequestSchema,type WorkbenchCapability} from "@creatoros/contract/agent-workbench";
import {createAgenticToolBinding,agenticToolOperationKey,type AgenticBackendTool} from "./agentic-tool-binding";
import {canonicalJson} from "../ai/canonical-json";
import {chatInputDigest} from "../ai/chat-turn-submission.service";
import {ConflictError} from "./execution.errors";

type Call=typeof executionCalls.$inferSelect;
type Task=typeof executionTasks.$inferSelect;
type Tx=Parameters<Parameters<Db["transaction"]>[0]>[0];
const digest=(value:unknown)=>`sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
const hash=z.string().regex(/^sha256:[a-f0-9]{64}$/),id=z.string().min(1);
const protocol="files-edit-claim-first-v1" as const;
// SEMANTIC_BOUNDARY_ALLOW: 仅识别已审计的冻结协议，不据文件内容推测是否写入。
// claim 75552326 早于 Native files a0396b5f；至 87607e90 所有正式入口均先提交claim。
// 只支持该精确协议的 macOS files.edit。新增定义须重新审计，不能自动扩大历史证明。
const auditedVersion="workbench-v1:69ccc70b44aa540ab7f05ac58e2fda12371a585193df0ac6eb88cfc987066d2a";
const originalCallSchema=z.object({id,executionTaskId:id,sequence:z.number().int().positive(),operationKey:id,inputDigest:hash,
 kind:z.literal("tool"),status:z.literal("unknown"),startedAttempt:z.number().int().positive(),toolExecutionClaimId:z.null(),
 parentCallId:z.null(),retryOfCallId:z.null(),providerJob:z.null(),providerResult:z.null(),resultRef:z.null(),resultText:z.null(),
 rejectionCode:z.null(),usage:z.null(),totalTokens:z.null(),reservedTokens:z.literal(0),accountingBasis:z.literal("tokens"),createdAt:id,updatedAt:id}).strict();
const proofSchema=z.object({schemaVersion:z.literal(1),protocol:z.literal(protocol),historicalCommit:z.literal("unproven"),
 userId:id,accountId:id,taskId:id,taskAttempt:z.number().int().positive(),modelCallId:id,providerCallId:id,
 frozenDigest:hash,expectedVersion:z.number().int().nonnegative(),contentHash:hash,originalCall:originalCallSchema,reconciledAt:id}).strict();
const auditSchema=proofSchema.extend({auditDigest:hash}).strict();
const auditsSchema=z.record(id,auditSchema);
const fail=():never=>{throw new ConflictError("文件重新准入证据不完整或存在冲突 [PREDISPATCH_EVIDENCE_REJECTED]");};
const immutableCall=(call:Call)=>{const {status,startedAttempt,toolExecutionClaimId,usage,totalTokens,resultText,providerResult,updatedAt,...rest}=call;return rest;};

/** 调用方已持有owned task锁。原unknown另存后端保留子键；不读Native、不结算、不唤醒。 */
export async function readmitUnclaimedFile(input:{tx:Tx;task:Task;calls:Call[];call:Call;tools:Record<string,AgenticBackendTool>;
 definition:unknown;capability:WorkbenchCapability|undefined;stamp:string;check():void}){
 const {tx,task,calls,call,tools}=input,payload=task.payload as Record<string,unknown>;
 const parsed=chatWorkerInputSchema.safeParse(payload.modelInput);
 const audits=auditsSchema.safeParse(Object.hasOwn(payload,"filePredispatchRecoveries")?payload.filePredispatchRecoveries:{});
 if(!parsed.success||!audits.success)return fail();
 const frozen=parsed.data,binding=createAgenticToolBinding(tools),bound=binding.forCall(task,calls,call);
 if(task.kind!=="ai_task"||task.ownerType!=="ai_task"||frozen.executionEngine!=="pi"||frozen.workbenchPlatform!=="macos"||
  frozen.userId!==task.userId||frozen.accountId!==task.accountId||payload.aiTaskId!==task.ownerId||
  bound.executionToolName!=="files.edit"||bound.execution!=="host"||bound.effect!=="committed"||bound.validationOutcome||
  frozen.tools.filter(def=>def.name==="files.edit").length!==1||!isDeepStrictEqual(frozen.tools.find(def=>def.name==="files.edit"),input.definition)||
  (input.definition as {version?:string})?.version!==auditedVersion||!input.capability||
  frozen.workbenchCapabilities?.filter(cap=>cap.name==="files.edit").length!==1||!isDeepStrictEqual(frozen.workbenchCapabilities.find(cap=>cap.name==="files.edit"),input.capability))return fail();
 const request=workbenchFileRequestSchema.safeParse({...bound.input as object,operation:"edit"});
 if(!request.success||request.data.operation!=="edit")return fail();
 const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,task.userId),eq(aiTasks.accountId,task.accountId!))).for("update");
 if(!business||business.taskType!=="copilot.assist"||(business.inputData as {modelInputDigest?:unknown})?.modelInputDigest!==chatInputDigest(frozen))return fail();
 const identity={userId:task.userId,accountId:task.accountId!,taskId:task.id,modelCallId:bound.modelCallId,providerCallId:bound.toolCallId,
  frozenDigest:digest(frozen),expectedVersion:request.data.expectedVersion,contentHash:`sha256:${createHash("sha256").update(request.data.content,"utf8").digest("hex")}`};
 for(const [key,audit] of Object.entries(audits.data)){
  const {auditDigest,...proof}=audit;
  if(key!==audit.originalCall.id||audit.taskId!==task.id||audit.userId!==task.userId||audit.accountId!==task.accountId||auditDigest!==digest(proof))return fail();
 }
 const response=(auditDigest:string)=>({taskId:task.id,operationId:call.id,status:"readmitted" as const,
  verificationKind:"predispatch_readmission" as const,auditDigest,version:null,hash:null,size:null});
 const prior=audits.data[call.id];
 if(prior){
  if(Object.entries(identity).some(([key,value])=>prior[key as keyof typeof prior]!==value)||
   !isDeepStrictEqual(immutableCall(prior.originalCall),immutableCall(call)))return fail();
  return response(prior.auditDigest); // 历史准入事实，不声称当前reserved或已经写入。
 }
 const original=originalCallSchema.safeParse(call),model=calls.find(row=>row.id===bound.modelCallId);
 if(!original.success||task.status!=="paused"||task.leaseOwner!==null||task.leaseExpiresAt!==null||!task.fenceToken||
  !["queued","running"].includes(business.status)||call.startedAttempt!>task.attempt||call.sequence!==calls.at(-1)?.sequence||
  !model||model.totalTokens===null||!workerProviderReceiptSchema.safeParse(model.providerResult).success||
  calls.filter(row=>row.kind==="model"&&!row.parentCallId).at(-1)?.id!==model.id||
  calls.some(row=>row.id!==call.id&&(["reserved","started","unknown"].includes(row.status)||row.parentCallId===call.id))||
  calls.filter(row=>row.operationKey===call.operationKey).length!==1)return fail();
 if((await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.callId,call.id)).limit(1)).length)return fail();
 // 与真实host的taskwide候选扫描一致；保守拒绝所有同参非rejected前序，避免复用旧operation代替CAS。
 for(const previous of calls.filter(row=>row.kind==="tool"&&row.id!==call.id&&row.status!=="rejected")){
  const proposals=calls.filter(row=>row.kind==="model"&&!row.parentCallId&&row.status==="settled").flatMap(row=>{
   const receipt=workerProviderReceiptSchema.safeParse(row.providerResult);if(!receipt.success)return [];
   return receipt.data.content.flatMap(part=>{const parsed=checkpointToolCallSchema.safeParse(part);return parsed.success&&agenticToolOperationKey(row.id,parsed.data.toolCallId)===previous.operationKey?[parsed.data]:[];});
  });
  if(proposals.length!==1)return fail();
  if(proposals[0]!.toolName!==bound.toolName)continue;
  let candidate;try{candidate=binding.forCall(task,calls,previous);}catch{return fail();}
  if(candidate.executionToolName===bound.executionToolName&&isDeepStrictEqual(candidate.input,bound.input))return fail();
 }
 const proof=proofSchema.parse({schemaVersion:1,protocol,historicalCommit:"unproven",...identity,taskAttempt:task.attempt,originalCall:original.data,reconciledAt:input.stamp});
 const audit={...proof,auditDigest:digest(proof)};
 input.check();
 const changed=await tx.update(executionCalls).set({status:"reserved",startedAttempt:null,updatedAt:input.stamp}).where(and(eq(executionCalls.id,call.id),eq(executionCalls.status,"unknown"))).returning({id:executionCalls.id});
 if(changed.length!==1)return fail();
 await tx.update(executionTasks).set({payload:{...payload,filePredispatchRecoveries:{...audits.data,[call.id]:audit}},updatedAt:input.stamp}).where(eq(executionTasks.id,task.id));
 input.check();
 return response(audit.auditDigest);
}
