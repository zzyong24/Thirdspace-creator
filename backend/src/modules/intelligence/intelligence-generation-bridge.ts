import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {z} from "zod";
import {eq,executionTasks,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {structuredGenerationInputSchema,workerModelSpecSchema,workerSkillSnapshotSchema,workerPortInputSchemas,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {IntelligenceGenerationSuspended} from "./topic-preview-runner";
import {createExecutionWorkerOutcomeService} from "../execution/execution-worker-outcome.service";
import {createExecutionLeaseService} from "../execution/execution-lease.service";
import {createExecutionCallLedgerService} from "../execution/execution-call-ledger.service";
import {createExecutionWorkerCallPorts} from "../execution/execution-worker-call-ports.service";
import {prepareExecutionModelIdentity} from "../execution/execution-model-identity.service";
import {createClaimedWorkerSupervision} from "../execution/claimed-worker-supervision";
import type {PersistentTaskClaim,PersistentTaskService} from "../execution/persistent-task.service";
import type {TopicPreviewGeneratorPort,TopicPreviewCheckpoint} from "./topic-preview-runner";
import type {ProjectScriptCandidateGeneratorPort} from "./project-script-candidate.runner";
import {intelligenceTopicDecomposeSchema,intelligenceTopicFromDecompositionSchema} from "@creatoros/ai-worker";

const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json=(value:unknown)=>z.json().parse(JSON.parse(JSON.stringify(value)));
const savedSchema=z.object({sourceDigest:z.string(),input:structuredGenerationInputSchema,identity:z.json()});
const topicResult=intelligenceTopicDecomposeSchema.and(intelligenceTopicFromDecompositionSchema).and(z.object({adaptedDraft:z.string().min(1)}));
export interface IntelligenceGenerationBridgeDeps {
 entryPath:string|(()=>string);
 tasks:Pick<PersistentTaskService,"heartbeat">;
 resolveModelSpec(ctx:RequestContext,capability:string):Promise<unknown>;
 resolveSkillSnapshot(ctx:RequestContext,skillIds:readonly string[]):Promise<unknown>;
 now?:()=>string;
}
/** 原 topic_preview/script_candidate claim 是唯一执行权；此桥只监督模型进程，不入队新任务。 */
export function createIntelligenceGenerationBridge(db:Db,deps:IntelligenceGenerationBridgeDeps){
 const supervision=createClaimedWorkerSupervision(deps);
 const budget={maxCalls:16,maxTokens:1000000,deadlineMs:600000};
 const leases=createExecutionLeaseService(db,deps),ledger=createExecutionCallLedgerService(db,{...deps,budget}),calls=createExecutionWorkerCallPorts(db,{...deps,budget});
 const outcomes=createExecutionWorkerOutcomeService(db,{...deps,allowedKinds:["topic_preview","script_candidate"]});
 async function execute(ctx:RequestContext,mode:"topic_preview"|"script_candidate",target:unknown,claim:PersistentTaskClaim|undefined,onCheckpoint?:(value:TopicPreviewCheckpoint)=>Promise<void>){
  if(supervision.isStopping())throw new Error("INTELLIGENCE_WORKER_STOPPING");
  if(!claim)throw new Error("INTELLIGENCE_GENERATION_CLAIM_REQUIRED");
  const ref:ExecutionRef={executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const verify=()=>leases.withLease(ref,"admission",async({task,context})=>{if(task.kind!==mode || context.userId!==ctx.userId || context.accountId!==ctx.accountId)throw new Error("INTELLIGENCE_GENERATION_OWNER_MISMATCH");return task;});
  const task=await verify();
  // 只绑定实际提示使用的源内容；列表展示状态/updatedAt 变化不使已结算模型失去回放资格。
  const item=z.object({title:z.string().nullable().optional(),authorName:z.string().nullable().optional(),platform:z.string().optional(),canonicalUrl:z.string()});
  const stable=mode==="topic_preview"?z.object({transformId:z.string(),item,positioning:z.object({id:z.string(),oneLiner:z.string(),keywords:z.array(z.string())}),transcript:z.object({hash:z.string(),text:z.string()})}).parse(target):z.object({strategy:z.string(),sources:z.array(z.object({item,transform:z.object({outputSnapshot:z.json()}),transcript:z.object({text:z.string()})}))}).parse(target);
  const sourceDigest=hash(stable),capability=mode==="topic_preview"?"topic.generate":"script.draft";
  const spec=workerModelSpecSchema.parse(await deps.resolveModelSpec(ctx,capability));
  const {identity}=prepareExecutionModelIdentity(capability,spec);
  let frozen=task.payload && typeof task.payload==="object"?(task.payload as Record<string,unknown>).intelligenceGeneration:undefined;
  if(!frozen){
   const skillIds=mode==="topic_preview"?["intelligence.topic-decompose","intelligence.topic-from-decomposition","intelligence.topic-adapted-draft"]:["script.draft"];
   const snapshot=workerSkillSnapshotSchema.parse(await deps.resolveSkillSnapshot(ctx,skillIds));
   if(snapshot.userId!==ctx.userId || snapshot.accountId!==ctx.accountId)throw new Error("INTELLIGENCE_SKILL_OWNER_MISMATCH");
   const input=structuredGenerationInputSchema.parse({kind:"model.structured",operationKey:`intelligence:${task.id}`,capability,skillId:skillIds[0],skillSnapshot:snapshot,maxOutputTokens:8192,timeoutMs:600000,facets:{mode,target:JSON.stringify(target)}});
   frozen=await leases.withLease(ref,"admission",async({tx,task})=>{
    const payload=task.payload as Record<string,unknown>;
    if(payload.intelligenceGeneration)return payload.intelligenceGeneration;
    const value=json({sourceDigest,input,identity});
    await tx.update(executionTasks).set({payload:{...payload,intelligenceGeneration:value},...(task.deadlineAt===null && task.executionBudget===null?{deadlineAt:new Date(Date.now()+budget.deadlineMs).toISOString()}: {})}).where(eq(executionTasks.id,task.id));return value;
   });
  }
  const saved=savedSchema.parse(frozen);
  if(saved.sourceDigest!==sourceDigest || !isDeepStrictEqual(saved.identity,json(identity)))throw new Error("INTELLIGENCE_GENERATION_AUTHORITY_CHANGED");
  await ledger.initializeBudget(ref);
  const state=await ledger.inspect(ref);
  // 已保存最终模型结果可按原调用回放，不能换模型重新烧费。
  const prior=state.calls.at(-1);
  if(prior?.status==="settled" && prior.resultText){const value=z.object({kind:z.literal("result"),value:z.json()}).parse(JSON.parse(prior.resultText));return mode==="topic_preview"?topicResult.parse(value.value):z.object({text:z.string().min(1)}).parse(value.value);}
  let completed:unknown, persistedStatus:string|undefined,requestSequence=0,closedPorts=false;
  const ports:Parameters<typeof supervision.run>[0]["ports"]={
   async validate(current,kind){if(closedPorts)throw new Error("INTELLIGENCE_PORTS_CLOSED");if(!isDeepStrictEqual(current,ref))throw new Error("INTELLIGENCE_CLAIM_MISMATCH");await leases.withLease(ref,kind,async()=>{});},
   async invoke(current,port,raw){
    if(port==="readTaskContext"){await verify();return saved.input;}
    if(port==="resolveModelCredential"){await verify();if(workerPortInputSchemas.resolveModelCredential.parse(raw).capability!==capability)throw new Error("INTELLIGENCE_CAPABILITY_MISMATCH");return spec;}
    if(port==="heartbeat"){await verify();return deps.tasks.heartbeat({taskId:ref.executionTaskId,workerId:claim.lease.workerId,attempt:ref.attempt,leaseSeconds:300});}
    if(port==="reserveGenerationCall"){
     await verify();const request=workerPortInputSchemas.reserveGenerationCall.parse(raw),prefix=`${saved.input.operationKey}/model/`;
     if(!request.operationKey.startsWith(prefix)|| request.operationKey.slice(prefix.length)!==String(requestSequence+1))throw new Error("INTELLIGENCE_OPERATION_MISMATCH");
     const requested=request.request.maxOutputTokens;
     if(typeof requested!=="number" || requested<1 || requested>saved.input.maxOutputTokens || "headers" in request.request || "abortSignal" in request.request)throw new Error("INTELLIGENCE_MODEL_BUDGET_INVALID");
     const encoded=JSON.stringify(request.request);if(encoded.length>4000000)throw new Error("INTELLIGENCE_MODEL_INPUT_TOO_LARGE");
     const currentTask=await verify(),recorded=(await ledger.inspect(ref)).calls;
     const retry=recorded.find(row=>row.id===currentTask.retryOfCallId && row.operationKey===request.operationKey);
     const row=await ledger.reserve(ref,{operationKey:request.operationKey,kind:"model",inputDigest:`sha256:${hash(request.request)}`,reservedTokens:Buffer.byteLength(encoded)+1024+requested,...(retry?{retryOfCallId:retry.id}:{})},(_rows,task)=>{
      if(retry && task.retryOfCallId!==retry.id)throw new Error("INTELLIGENCE_RETRY_AUTHORITY_CHANGED");
     });
     requestSequence++;
     return {callId:row.id,status:row.status,...(row.providerResult?{providerResult:row.providerResult}:{}),...(row.rejectionCode?{rejectionCode:row.rejectionCode}:{})};
    }
    if(port==="startCall")return calls.startCall(ref,raw);
    if(port==="settleGenerationCall"){const {callId,...settlement}=workerPortInputSchemas.settleGenerationCall.parse(raw);const row=await ledger.settle(ref,callId,settlement,call=>{if(call.kind!=="model"||call.parentCallId)throw new Error("INTELLIGENCE_MODEL_CALL_INVALID");});return {callId:row.id,status:row.status};}
    if(port==="saveGenerationResult"){
     await verify();const request=workerPortInputSchemas.saveGenerationResult.parse(raw),value=z.object({kind:z.enum(["checkpoint","result"]),stage:z.enum(["decomposition","topic","draft"]).optional(),value:z.json()}).parse(JSON.parse(request.text));
     const last=(await ledger.inspect(ref)).calls.at(-1);if(last?.id!==request.callId || last.status!=="settled" || !last.providerResult)throw new Error("INTELLIGENCE_RESULT_RECEIPT_INVALID");
     if(value.kind==="checkpoint"){
      if(mode!=="topic_preview" || !onCheckpoint)throw new Error("INTELLIGENCE_CHECKPOINT_INVALID");
      const checkpoint=value.stage==="decomposition"?{stage:"decomposition" as const,value:intelligenceTopicDecomposeSchema.parse(value.value)}:value.stage==="topic"?{stage:"topic" as const,value:intelligenceTopicFromDecompositionSchema.parse(value.value)}:value.stage==="draft"?{stage:"draft" as const,value:z.object({contentText:z.string().min(1)}).parse(value.value)}:null;
      if(!checkpoint)throw new Error("INTELLIGENCE_CHECKPOINT_STAGE_INVALID");await onCheckpoint(checkpoint);await verify();
     }else{
      if(mode==="topic_preview")topicResult.parse(value.value);else z.object({text:z.string().min(1)}).parse(value.value);
      await ledger.settle(ref,last.id,{status:"settled",usage:{},resultText:request.text});
     }
     return {callId:last.id};
    }
    if(port==="commitResult"){
     const request=workerPortInputSchemas.commitResult.parse(raw);
     if(request.outcome!=="succeeded"){
      const result=await outcomes.recordFailure(ref,request);
      persistedStatus=result.status;closedPorts=true;return result;
     }
     await verify();const last=(await ledger.inspect(ref)).calls.at(-1);if(last?.id!==request.callId||last.resultText!==request.text||last.status!=="settled")throw new Error("INTELLIGENCE_COMMIT_MISMATCH");
     completed=z.object({kind:z.literal("result"),value:z.json()}).parse(JSON.parse(request.text)).value;closedPorts=true;return {};
    }
    throw new Error("INTELLIGENCE_PORT_UNAVAILABLE");
   },
  };
  try{const outcome=await supervision.run({ref,deadlineAt:state.deadlineAt === null ? null : Date.parse(state.deadlineAt),ports,verify,isClosed:()=>closedPorts,close:()=>{closedPorts=true;},hasDurableOutcome:()=>completed!==undefined||persistedStatus!==undefined});if(persistedStatus)throw new IntelligenceGenerationSuspended(ref.executionTaskId,ref.attempt,ref.fenceToken,persistedStatus);if(outcome!=="completed"||completed===undefined)throw new Error("INTELLIGENCE_WORKER_INCOMPLETE");return completed;}
  catch(error){
   if(!persistedStatus){
    const last=(await ledger.inspect(ref)).calls.at(-1);
    if(last?.status==="settled"&&last.resultText){
     const value=z.object({kind:z.literal("result"),value:z.json()}).parse(JSON.parse(last.resultText));
     completed=mode==="topic_preview"?topicResult.parse(value.value):z.object({text:z.string().min(1)}).parse(value.value);
     return completed;
    }
   }
   throw error;
  }
 }
 async function generate(ctx:RequestContext,mode:"topic_preview"|"script_candidate",target:unknown,claim:PersistentTaskClaim|undefined,onCheckpoint?:(value:TopicPreviewCheckpoint)=>Promise<void>){
  if(!claim)throw new Error("INTELLIGENCE_GENERATION_CLAIM_REQUIRED");
  const ref:ExecutionRef={executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  try{return await execute(ctx,mode,target,claim,onCheckpoint);}
  catch(error){
   if(error instanceof IntelligenceGenerationSuspended)throw error;
   let status="recovery_pending",unstartedFailure=false;
   try{
    const task=await leases.withLease(ref,"settlement",async({task})=>task);
    status=task.status;
    if(task.kind!==mode || task.userId!==ctx.userId || task.accountId!==ctx.accountId)throw new Error("INTELLIGENCE_GENERATION_OWNER_MISMATCH");
    if(task.status==="running"&&!supervision.isStopping()){
     const state=await ledger.inspect(ref);
     // IPC/结算回执丢失不推测为未调用；只留给原账本恢复，不给runner覆盖失败的机会。
     if(!state.calls.length){unstartedFailure=true;}else{
     const unknown=state.calls.some(row=>row.status==="started"||row.status==="unknown");
     const rejected=state.calls.at(-1)?.status==="rejected";
     const result=await outcomes.recordFailure(ref,{outcome:unknown?"unknown_result":rejected?"waiting_user":"failed",errorCode:unknown?"INTELLIGENCE_CALL_REQUIRES_RECONCILIATION":rejected?"INTELLIGENCE_REJECTED_OUTCOME_MISSING":"INTELLIGENCE_WORKER_INTERRUPTED"});
     status=result.status;
     }
    }
   }catch{/* 失去fence/数据库不可用时保留原状态，由原claimNext/过期恢复接管。 */}
   if(unstartedFailure)throw error;
   throw new IntelligenceGenerationSuspended(ref.executionTaskId,ref.attempt,ref.fenceToken,status);
  }
 }
 const topicPreviewGenerator:TopicPreviewGeneratorPort={async generate(ctx,target,onCheckpoint,claim){return topicResult.parse(await generate(ctx,"topic_preview",target,claim,onCheckpoint));}};
 const projectScriptGenerator:ProjectScriptCandidateGeneratorPort={async generate(ctx,target,claim){return z.object({text:z.string().min(1)}).parse(await generate(ctx,"script_candidate",target,claim));}};
 return {topicPreviewGenerator,projectScriptGenerator,stop:supervision.stop};
}
