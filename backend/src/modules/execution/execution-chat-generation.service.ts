import {normalizeDistillation,mergeDistillations} from "../ai-runtime/knowledge-distill-runner";
import {normalizeLearnings} from "../ai-runtime/review-context";
import {normalizeTopics,topicArraySchema,reviewInsightsSchema,knowledgeDistillSchema} from "@creatoros/ai-worker";
import {chatDiagnosisKeys,projectChatDiagnosis} from "../ai-runtime/chat-diagnosis-node";
import {normalizeDiagnosis} from "../ai-runtime/calibration-diagnose-runner";
import {executionEvidence} from "../../schema/intelligence";
import {recoverableChatNodeParents} from "./chat-generation-recovery";
import {createExecutionWorkerOutcomeService} from "./execution-worker-outcome.service";
import {isDeepStrictEqual} from "node:util";
import {z} from "zod";
import {asc,eq,executionCalls,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {workerPortInputSchemas,workerSkillSnapshotSchema,chatStructuredNodeSchema,workerToolResultReceiptSchema,agenticToolOutcomeSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {replayGenerationNode,runChatStructuredSequence,chatGenerationSkillId,generationRequestDigest,type GenerationReplayReceipt} from "@creatoros/ai-worker/chat";
import {providerIdentityFor,structuredModeForIdentity} from "@creatoros/ai-worker/model-identity";
import {runWithEffectiveSkillSnapshot,type TopicCardOutput,type PositioningSuggestionOutput,type DiagnosisOutput} from "@creatoros/ai-worker";
import {normalizeCard} from "../ai-runtime/topic-enrich-runner";
import {normalizeSuggestion} from "../ai-runtime/positioning-runner";
import {createChatHostContextReader} from "../ai/chat-host-context.service";
import {createExecutionLeaseService} from "./execution-lease.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionNodePreparationService} from "./execution-node-preparation.service";
import {createExecutionChatModelIdentityService} from "./execution-chat-model-identity.service";
import {createAgenticToolBinding} from "./agentic-tool-binding";
import type {ChatBackendTool} from "./execution-chat-tool-ports.service";
import {ConflictError} from "./execution.errors";
const preparationSchema=z.object({node:chatStructuredNodeSchema,discovery:z.object({sessionId:z.string().min(1),candidateId:z.string().min(1),candidateRevision:z.number().int()}).strict().nullable(),maxOutputTokens:z.number().int().positive().max(65536),skillSnapshot:workerSkillSnapshotSchema}).strict();
type Call=typeof executionCalls.$inferSelect;
const recoverableModelFailure=(call:Call)=>call.status==="superseded" || (call.status==="rejected" && call.rejectionCode!=="STRUCTURED_PROTOCOL_UNSUPPORTED");
const parentRequest=workerPortInputSchemas.prepareChatGeneration;
/** 有限共享生成协议：真实父工具确定输入，原节点回放确定每次模型请求和最终候选。 */
export function createExecutionChatGenerationService(db:Db,deps:Parameters<typeof createExecutionCallLedgerService>[1]&{
 tools:Record<string,ChatBackendTool>;
 check(ref:ExecutionRef,input:{modelCallId:string;toolCallId:string},signal?:AbortSignal):Promise<{status:string}>;
 resolveCredential(context:RequestContext,capability:string,ref:ExecutionRef,signal?:AbortSignal):Promise<unknown>;
}){
 const leases=createExecutionLeaseService(db,deps),ledger=createExecutionCallLedgerService(db,deps),binding=createAgenticToolBinding(deps.tools);
 const reader=createChatHostContextReader(db,deps),preparations=createExecutionNodePreparationService(db,deps),identities=createExecutionChatModelIdentityService(db,deps);
 function find(task:Parameters<typeof binding.forCall>[0],calls:Call[],callId:string){
  const parent=calls.find(call=>call.id===callId);
  if(!parent || parent.kind!=="tool" || parent.parentCallId || parent.toolExecutionClaimId)throw new ConflictError("生成缺少真实 Worker 父工具");
  const bound=binding.forCall(task,calls,parent);
  if(bound.execution!=="worker.structured-node" || !["topic.enrich","positioning.generate","calibration.diagnose","topic.generate","review.analyze","knowledge.distill"].includes(bound.executionToolName) || bound.effect!=="proposal" || bound.validationOutcome)throw new ConflictError("当前父工具不是有效结构化生成");
  return {parent,bound};
 }
 function current(calls:Call[],found:ReturnType<typeof find>){
  if(!["started","settled"].includes(found.parent.status) || (found.parent.status!=="settled" && calls.filter(call=>call.kind==="model" && !call.parentCallId).at(-1)?.id!==found.bound.modelCallId))throw new ConflictError("生成父工具不属于当前可执行回合");
 }
 async function base(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
  const {callId}=parentRequest.parse(raw);signal?.throwIfAborted();
  const frozen=await reader.read(ref);
  const state=await leases.withLease(ref,"admission",async({tx,task})=>{
   const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
   const found=find(task,calls,callId);current(calls,found);const retry=calls.find(call=>call.id===task.retryOfCallId && call.parentCallId===callId && recoverableModelFailure(call));return {...found,...(retry?{retryOfCallId:retry.id,retryOperationKey:retry.operationKey}:{})};
  });
  const approval=await deps.check(ref,{modelCallId:state.bound.modelCallId,toolCallId:state.bound.toolCallId},signal);
  if(approval.status!=="not-applicable")throw new ConflictError("生成未取得真实宿主授权");
  const prepared=await preparations.readOrPrepare(ref,{parentCallId:callId,inputDigest:state.bound.inputDigest,nodeVersion:"chat.structured.v1"},preparationSchema,async()=>{
   const tool=deps.tools[state.bound.executionToolName];
   if(!tool?.prepareGeneration)throw new ConflictError("结构化生成准备端口未装配");
   const value=await tool.prepareGeneration(structuredClone(frozen.context),structuredClone(state.bound.input),{execution:{...ref},callId,attemptId:`${ref.attempt}`,signal});
   if(value.node.capability!==state.bound.executionToolName || !frozen.hostContext.skillSnapshot.skills.some(skill=>skill.skillId===chatGenerationSkillId(value.node.capability)))throw new ConflictError("节点或 Skill 与父工具不符");
   // JSON 序列化仅移除旧 facets 的可选 undefined；不修改内容或推断语义。
   return JSON.parse(JSON.stringify({...value,skillSnapshot:frozen.hostContext.skillSnapshot}));
  },signal);
  signal?.throwIfAborted();
  return {...prepared,...state,context:frozen.context};
 }
 async function prepared(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
  const value=await base(ref,raw,signal),identity=await identities.read(ref,value.parent.id);
  const operationKey=`structured:${value.parent.id}:${generationRequestDigest({inputDigest:value.bound.inputDigest,node:value.node,discovery:value.discovery,maxOutputTokens:value.maxOutputTokens,skillSnapshot:value.skillSnapshot,identity}).slice(7)}`;
  return {...value,identity,operationKey};
 }
 /** 逻辑调用与其明确拒绝重试分开；不把普通拒绝当成一次结构修复。 */
 function groups(calls:Call[],parentId:string,key:string){
  const children=calls.filter(call=>call.parentCallId===parentId).sort((a,b)=>a.sequence-b.sequence),result:Call[][]=[];
  for(const child of children){
   const suffix=child.operationKey.startsWith(`${key}/model/`)?child.operationKey.slice(`${key}/model/`.length):"";
   if(child.kind!=="model" || !/^[1-9][0-9]*$/.test(suffix))throw new ConflictError("子模型不属于原生成序列");
   const index=Number(suffix);
   if(index===result.length+1){if(child.retryOfCallId)throw new ConflictError("新逻辑调用不能冒用重试来源");result.push([child]);}
   else if(index===result.length && result.length){
    const previous=result[index-1]!.at(-1)!;
    if(!recoverableModelFailure(previous) || child.retryOfCallId!==previous.id || child.inputDigest!==previous.inputDigest)throw new ConflictError("子模型重试链不连续");
    result[index-1]!.push(child);
   }else throw new ConflictError("生成逻辑调用序号不连续");
  }
  return {children,result};
 }
 function receipts(selected:Call[][]):GenerationReplayReceipt[]{
  return selected.map(group=>{
   const call=group.at(-1)!;
   if(call.status!=="settled" && !(call.status==="rejected" && call.rejectionCode==="STRUCTURED_PROTOCOL_UNSUPPORTED"))throw new ConflictError("生成前缀仍须对账或恢复");
   if(call.status==="settled" && (call.totalTokens===null || !call.providerResult))throw new ConflictError("生成缺少完整回执");
   return {inputDigest:call.inputDigest,status:call.status,providerResult:call.providerResult,rejectionCode:call.rejectionCode};
  });
 }
 async function replay(value:Awaited<ReturnType<typeof prepared>>,recorded:GenerationReplayReceipt[],signal?:AbortSignal,captureNodeFailure=false){
  return runWithEffectiveSkillSnapshot(value.skillSnapshot,()=>replayGenerationNode({...providerIdentityFor(value.identity),structuredOutputMode:structuredModeForIdentity(value.identity),receipts:recorded,signal,captureNodeFailure},model=>runChatStructuredSequence(value.node,model,value.maxOutputTokens,signal)));
 }
 function recoverableTail(calls:Call[],callId:string,key:string){
  const tree=groups(calls,callId,key),last=tree.result.at(-1)?.at(-1);
  receipts(tree.result.slice(0,-1));
  if(!last || !recoverableModelFailure(last))throw new ConflictError("缺少可恢复的模型失败");
  return last;
 }
 return {
  async fail(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const {callId,...failure}=workerPortInputSchemas.failChatGeneration.parse(raw);
   const existing=await leases.withLease(ref,"settlement",async({tx,task})=>{
    if(!["waiting_user","retry_wait","failed"].includes(task.status))return null;
    const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
    const found=find(task,calls,callId),last=calls.at(-1);
    if(found.parent.status!=="started" || last?.parentCallId!==callId || !recoverableModelFailure(last) || last.startedAttempt!==ref.attempt)throw new ConflictError("挂起回执不匹配原生成");
    const exhausted=task.status==="failed" && failure.outcome==="retry_wait" && task.lastErrorCode==="RETRY_BUDGET_EXHAUSTED";
    if(!exhausted && (task.status!==failure.outcome || task.lastErrorCode!==failure.errorCode || (task.status!=="failed" && task.retryOfCallId!==last.id)))throw new ConflictError("挂起事实不符");
    return {status:task.status,retryAt:task.retryAt};
   });
   if(existing)return existing;
   const value=await prepared(ref,{callId},signal);
   return createExecutionWorkerOutcomeService(db,deps).recordFailure(ref,failure,(calls,task)=>{
    const found=find(task,calls,callId);current(calls,found);
    const last=recoverableTail(calls,callId,value.operationKey);
    if(found.parent.startedAttempt!==ref.attempt || last.startedAttempt!==ref.attempt || last.id!==[...calls].sort((a,b)=>a.sequence-b.sequence).at(-1)?.id)throw new ConflictError("失败不属于当前生成尝试");
    return [callId];
   });
  },
  async restore(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const {callId}=workerPortInputSchemas.restoreChatGeneration.parse(raw),value=await prepared(ref,{callId},signal);
   return leases.withLease(ref,"admission",async({tx,task})=>{
    const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
    const found=find(task,calls,callId);current(calls,found);
    const recoverable=recoverableChatNodeParents(task,calls,await tx.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,task.id)));
    if(found.parent.status!=="started" || !recoverable.structured.includes(callId))throw new ConflictError("原任务没有可回放的生成记录");
    groups(calls,callId,value.operationKey);
    signal?.throwIfAborted();await tx.update(executionCalls).set({startedAttempt:ref.attempt,updatedAt:(deps.now??(()=>new Date().toISOString()))()}).where(eq(executionCalls.id,callId));
    return {callId,status:"started" as const};
   });
  },
  async resolveCredential(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const value=await base(ref,raw,signal);signal?.throwIfAborted();
   const credential=await deps.resolveCredential(structuredClone(value.context),chatGenerationSkillId(value.node.capability),ref,signal);
   signal?.throwIfAborted();return identities.pin(ref,value.parent.id,credential);
  },
  async prepare(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const value=await prepared(ref,raw,signal);
   return {node:value.node,skillSnapshot:value.skillSnapshot,maxOutputTokens:value.maxOutputTokens,operationKey:value.operationKey,...(value.retryOfCallId?{retryOfCallId:value.retryOfCallId,retryOperationKey:value.retryOperationKey}:{})};
  },
  async reserve(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const input=workerPortInputSchemas.reserveChatGenerationModel.parse(raw),value=await prepared(ref,{callId:input.callId},signal);
   const state=await ledger.inspect(ref),tree=groups(state.calls,input.callId,value.operationKey);
   const index=Number(input.operationKey.slice(`${value.operationKey}/model/`.length));
   if(!Number.isSafeInteger(index) || index<1 || index>tree.result.length+1 || input.operationKey!==`${value.operationKey}/model/${index}`)throw new ConflictError("生成请求跳过原调用序列");
   const expected=await replay(value,receipts(tree.result.slice(0,index-1)),signal);
   if(expected.status!=="next-request" || expected.consumed!==index-1 || !isDeepStrictEqual(input.request,expected.request))throw new ConflictError("生成模型请求不符合原节点与回执");
   const call=await ledger.reserve(ref,{kind:"model",operationKey:input.operationKey,parentCallId:input.callId,inputDigest:generationRequestDigest(input.request),reservedTokens:Buffer.byteLength(JSON.stringify(input.request))+1024+value.maxOutputTokens,...(input.retryOfCallId?{retryOfCallId:input.retryOfCallId}:{})},(calls,task)=>{
    const found=find(task,calls,input.callId);current(calls,found);
    if(found.bound.inputDigest!==value.bound.inputDigest || !isDeepStrictEqual(groups(calls,input.callId,value.operationKey).result.slice(0,index-1),tree.result.slice(0,index-1)))throw new ConflictError("预留前生成调用事实改变");
    if(input.retryOfCallId){const previous=tree.result[index-1]?.at(-1);if(task.retryOfCallId!==input.retryOfCallId || previous?.id!==input.retryOfCallId || !recoverableModelFailure(previous) || previous.startedAttempt===ref.attempt || found.parent.startedAttempt!==ref.attempt)throw new ConflictError("子模型重试尚未获得原任务恢复许可");}
   });
   return {callId:call.id,status:call.status,...(call.providerResult?{providerResult:call.providerResult}:{}),...(call.rejectionCode?{rejectionCode:call.rejectionCode}:{})};
  },
  async start(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const {callId}=workerPortInputSchemas.startChatGenerationModel.parse(raw),state=await ledger.inspect(ref),child=state.calls.find(call=>call.id===callId);
   if(!child?.parentCallId)throw new ConflictError("不是生成子模型");
   const value=await prepared(ref,{callId:child.parentCallId},signal);
   const started=await ledger.start(ref,callId,(call,calls,task)=>{
    current(calls,find(task,calls,call.parentCallId!));
    const tree=groups(calls,call.parentCallId!,value.operationKey);
    if(tree.children.at(-1)?.id!==callId)throw new ConflictError("不能启动旧生成请求");
    receipts(tree.result.slice(0,-1));signal?.throwIfAborted();
   });return {callId:started.id,status:started.status};
  },
  async settle(ref:ExecutionRef,raw:unknown){
   const {callId,...input}=workerPortInputSchemas.settleChatGenerationModel.parse(raw);
   const call=await ledger.settle(ref,callId,input,child=>{
    if(child.kind!=="model" || !child.parentCallId || (child.status==="unknown" && input.status!=="unknown") || (child.status==="started" && child.startedAttempt!==ref.attempt))throw new ConflictError("生成回执不属于可结算的当前调用");
   },(calls,task)=>{const child=calls.find(call=>call.id===callId)!;find(task,calls,child.parentCallId!);});
   return {callId:call.id,status:call.status};
  },
  async complete(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const {callId}=workerPortInputSchemas.completeChatGeneration.parse(raw),value=await prepared(ref,{callId},signal),state=await ledger.inspect(ref),tree=groups(state.calls,callId,value.operationKey);
   if(!tree.result.length)throw new ConflictError("生成尚无模型回执");
   const result=await replay(value,receipts(tree.result),signal,true);
   if(result.status==="next-request" || result.consumed!==tree.result.length)throw new ConflictError("原节点仍需生成，不能伪造完成");
   let data:unknown=null;
   if(result.status!=="failed"){
    switch(value.node.capability){
     case "topic.generate": {const items=normalizeTopics(topicArraySchema.parse(result.value.object).topics);if(items.length)data={kind:"topic.candidates",items,...(value.node.trendNote?{trendNote:value.node.trendNote}:{})};break;}
     case "review.analyze": {const {learnings,...report}=reviewInsightsSchema.parse(result.value.object);const items=normalizeLearnings(learnings);data={kind:"review.learnings",items,...report,projectId:value.node.facets.__reviewProjectId??null,error:null};break;}
     case "knowledge.distill": {
      const parts=z.object({parts:z.array(knowledgeDistillSchema)}).parse(result.value.object).parts.map(normalizeDistillation);
      if(parts.some(part=>part===null))break;
      const merged=mergeDistillations(parts.filter(part=>part!==null));
      if(merged.atoms.length)data={kind:"knowledge.distill",...merged,originalText:value.node.originalText,coverage:value.node.coverage,error:null,suggestSwitchModel:false};
      break;
     }
     case "topic.enrich": data={kind:"topic.card",card:normalizeCard(result.value.object as TopicCardOutput),candidateId:value.node.candidateId};break;
     case "positioning.generate": data={kind:"positioning.suggestion",suggestion:normalizeSuggestion(result.value.object as PositioningSuggestionOutput),discovery:value.discovery};break;
     case "calibration.diagnose": {
      const diagnosis=projectChatDiagnosis(normalizeDiagnosis(result.value.object as DiagnosisOutput,chatDiagnosisKeys()));
      if(diagnosis)data={kind:"calibration.diagnosis",diagnosis};
      break;
     }
    }
   }
   const failureMessage="模型未返回符合要求的候选，Agent 正在调整生成策略";
   const failureData=value.node.capability==="knowledge.distill"?{kind:"knowledge.distill",atoms:[],suggestedTags:[],originalText:value.node.originalText,coverage:value.node.coverage,error:failureMessage,suggestSwitchModel:false}:value.node.capability==="review.analyze"?{kind:"review.learnings",items:[],error:failureMessage}:value.node.capability==="topic.generate"?{kind:"topic.candidates",items:[],trendNote:failureMessage}:undefined;
   const output=agenticToolOutcomeSchema.parse(result.status==="failed" || data===null?{status:"error",summary:"模型未返回符合要求的候选，继续当前任务",evidence:[],...(failureData?{data:failureData}:{}),error:{code:"transient",retryable:true,recovery:"在当前 Agent loop 中调整生成策略并继续原任务"},continuation:null,sideEffect:"none"}:{status:"ok",summary:"生成候选已完成，等待用户采纳",evidence:[],data:JSON.parse(JSON.stringify(data)),error:null,continuation:null,sideEffect:"proposal"});
   const resultText=JSON.stringify(workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId:value.bound.toolCallId,toolName:value.bound.toolName,output}));
   await ledger.settle(ref,callId,{status:"settled",usage:{totalTokens:0},resultText},undefined,(calls,task)=>{
    const found=find(task,calls,callId);current(calls,found);
    if(found.bound.inputDigest!==value.bound.inputDigest || !isDeepStrictEqual(groups(calls,callId,value.operationKey).children,tree.children))throw new ConflictError("完成前生成调用事实改变");
   });return output;
  },
 };
}
