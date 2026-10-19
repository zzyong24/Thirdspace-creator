import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {and,asc,eq,sql,aiTasks,aiTaskResults,executionTasks,executionCalls,projects,artifacts,type Db} from "@creatoros/backend";
import {predictionLockSource,type PredictionLockSource,type PredictionLockState,type RequestContext} from "@creatoros/contract";
import {chatWorkerInputSchema,externalTaskToolCallSchema,externalChatStartSchema,externalChatReceiptSchema,externalToolInputProofSchema,agenticToolOutcomeSchema,workerToolResultReceiptSchema} from "@creatoros/contract/execution-worker";
import {workspaceFilter,requireWorkspace,assertWritableWorkspace} from "../../workspace-scope";
import {lockWorkspaceMembership,assertFrozenWorkspaceMembership} from "../platform-account/membership-lock.service";
import {createAgenticToolBinding} from "../execution/agentic-tool-binding";
import {buildChatTools} from "../ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../ai-runtime/chat-tool-definitions";
import {readChatTurnSnapshot,chatInputDigest,chatHistoryDigest} from "./chat-turn-submission.service";
import {readChatHostContextPair} from "./chat-host-context";
import {requireExternalChatCallTree} from "./external-chat-call-tree";
import {canonicalJson} from "./canonical-json";
import {ConflictError,OwnershipError} from "./ai.errors";
import {projectExecutionTasks} from "./execution-task-projection";
type Tx=Parameters<Parameters<Db["transaction"]>[0]>[0];
type Task=typeof aiTasks.$inferSelect;
type Script={projectId:string;artifactId:string;versionId:string;fullText:string;sha256:string};
type Rubric=Pick<import("@creatoros/contract").RubricVersionResource,"id"|"dimensions">;
type Baseline={artifactId:string;versionId:string;sha256:string}|null;
export interface PredictionLockBinding {
 policyVersion:1;source:PredictionLockSource;sourceDigest:string;subjectId:string;projectId:string;
 baseline:Baseline;baselineDigest:string;fullText:string;title:string;rubric:Rubric;
 childTaskId:string;attemptId:string;intentDigest:string;resultId?:string;predictionId?:string;
}
export interface PredictionLockPorts {
 getOutput(ctx:RequestContext,id:string,store:Db):Promise<{projectId:string;title:string}>;
 readConfirmedScript(ctx:RequestContext,projectId:string,store:Db):Promise<Script|null>;
 ensureRubric(ctx:RequestContext,store:Db):Promise<Rubric>;
 getRubric(ctx:RequestContext,id:string,store:Db):Promise<Rubric>;
 getPrediction(ctx:RequestContext,id:string,store:Db):Promise<{status:string;subjectId:string;rubricVersionId:string}>;
 prepareRuntime(ctx:RequestContext):Promise<Record<string,unknown>>;
 createChild(ctx:RequestContext,input:Record<string,unknown>,attemptId:string,runtime:Record<string,unknown>,store:Db):Promise<{id:string}>;
}
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
// SEMANTIC_BOUNDARY_ALLOW: 摘要仅绑定原来源与版本字节，不评价/选择创作内容。
const digest=(v:unknown)=>`sha256:${createHash("sha256").update(canonicalJson(v)).digest("hex")}`;
function bindingFor(root:Task,key:string):PredictionLockBinding|null {
 const rawLocks=record(root.runtimeData).predictionLocks;
 if(rawLocks!==undefined&&(!rawLocks||typeof rawLocks!=="object"||Array.isArray(rawLocks)))throw new ConflictError("原卡锁定集合损坏");
 const locks=record(rawLocks);
 const raw=Object.hasOwn(locks,key)?locks[key]:undefined;
 if(raw===undefined)return null;
 const value=record(raw);
 if(value.policyVersion!==1||typeof value.childTaskId!=="string"||!value.childTaskId||typeof value.intentDigest!=="string")throw new ConflictError("原卡锁定绑定损坏");
 const binding=value as unknown as PredictionLockBinding;
 if((value.predictionId!==undefined||value.resultId!==undefined)&&(typeof value.predictionId!=="string"||!value.predictionId||typeof value.resultId!=="string"||!value.resultId))throw new ConflictError("原卡具体锁定回执字段损坏");
 const {childTaskId:_child,resultId:_result,predictionId:_prediction,intentDigest:_intent,...intentBody}=binding;
 if(binding.intentDigest!==digest(intentBody))throw new ConflictError("原卡锁定意图摘要不符");
 return binding;
}
export function createPredictionLockService(db:Db,ports:PredictionLockPorts,now=()=>new Date().toISOString()) {
 async function source(ctx:RequestContext,requested:PredictionLockSource,store:Db){
  requireWorkspace(ctx);predictionLockSource.parse(requested);
  const snapshot=await readChatTurnSnapshot(store,ctx,requested);
  const rootId=record(snapshot.sourceMessage.modelMetadata).chatTaskId;
  const [root]=typeof rootId==="string"?await store.select().from(aiTasks).where(and(eq(aiTasks.id,rootId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx))):[];
  if(!root||root.taskType!=="copilot.assist"||!root.executionTaskId||root.projectId!==snapshot.conversation.projectId||(root.accountId??null)!==(ctx.accountId??null)||(root.groupId??null)!==(ctx.groupId??null))throw new OwnershipError("原卡任务来源不存在");
  const [execution]=await store.select().from(executionTasks).where(and(eq(executionTasks.id,root.executionTaskId),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx)));
  const input=record(root.inputData),payload=record(execution?.payload),frozen=chatWorkerInputSchema.parse(payload.modelInput);
  if(!execution||execution.kind!=="ai_task"||execution.ownerType!=="ai_task"||execution.ownerId!==root.id||payload.aiTaskId!==root.id||input.kind!=="chat.run"||input.modelInputDigest!==chatInputDigest(frozen)||input.historyDigest!==chatHistoryDigest(snapshot)||!isDeepStrictEqual(input.historyMessageIds,snapshot.messages.map(m=>m.id))||input.sourceMessageId!==requested.sourceMessageId||input.conversationId!==requested.conversationId||frozen.sourceMessageId!==requested.sourceMessageId||frozen.conversationId!==requested.conversationId||frozen.userId!==ctx.userId||frozen.accountId!==(root.accountId??null)||(frozen.groupId??null)!==(root.groupId??null))throw new ConflictError("原卡冻结执行来源不符");
  const host=readChatHostContextPair(payload.hostContext,input.hostContextDigest,{userId:root.userId,accountId:root.accountId,groupId:root.groupId,projectId:root.projectId});
  if(!host)throw new ConflictError("原卡没有冻结宿主上下文");
  const selection=host.chatContext.selection;
  if(!root.projectId||selection?.kind!=="content_output"||selection.ids.length!==1)throw new ConflictError("原卡不是单一作品诊断来源");
  const subjectId=selection.ids[0]!,output=await ports.getOutput(ctx,subjectId,store);
  if(output.projectId!==root.projectId)throw new ConflictError("原作品不属于当前项目");
  const definitions=frozen.tools.filter(t=>t.name==="calibration.diagnose");
  if(definitions.length!==1)throw new ConflictError("原卡诊断工具定义不唯一");
  const workerStructuredNodes=definitions[0]!.execution==="worker.structured-node";
  const prepared=await prepareChatToolDefinitions(buildChatTools(["calibration.diagnose"],{humanizeError:()=>null} as never),{workerStructuredNodes});
  if(!isDeepStrictEqual(definitions[0],prepared.definitions[0]))throw new ConflictError("原诊断工具完整定义已经变化");
  const tool=definitions[0]!,parameters=prepared.parameters[tool.name]!.parameters;
  const binding=createAgenticToolBinding({[tool.name]:{version:tool.version,effect:tool.effect,execution:tool.execution??"host",parameters}});
  const calls=await store.select().from(executionCalls).where(eq(executionCalls.executionTaskId,execution.id)).orderBy(asc(executionCalls.sequence));
  const selected=calls.filter(call=>{
   if(call.kind==="external_tool"){const p=externalTaskToolCallSchema.safeParse(call.providerResult);return p.success&&p.data.toolName===tool.name&&p.data.toolCallId===requested.toolCallId;}
   if(call.kind==="tool"){try{const r=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText??"null"));if(r.toolCallId!==requested.toolCallId)return false;return binding.forCall(execution,calls,call).executionToolName===tool.name;}catch{return false;}}
   return false;
  });
  if(selected.length!==1)throw new ConflictError("原卡工具回执不存在或不唯一");
  const call=selected[0]!;
  if(call.status!=="settled"||!call.resultText)throw new ConflictError("原诊断尚未结算");
  const receipt=call.kind==="tool"?workerToolResultReceiptSchema.parse(JSON.parse(call.resultText)):null;
  const outcome=agenticToolOutcomeSchema.parse(receipt?receipt.output:JSON.parse(call.resultText));
  if(outcome.status!=="ok"||outcome.error!==null||outcome.sideEffect!=="proposal"||record(outcome.data).kind!=="calibration.diagnosis")throw new ConflictError("原工具没有成功诊断候选");
  if(call.kind==="tool"){
   const bound=binding.forCall(execution,calls,call);
   if((bound.execution==="host"?!call.toolExecutionClaimId:bound.execution!=="worker.structured-node"||call.toolExecutionClaimId!==null||!calls.some(child=>child.parentCallId===call.id&&child.kind==="model"&&child.status==="settled"))||bound.validationOutcome||bound.toolCallId!==requested.toolCallId||bound.executionToolName!==tool.name||bound.effect!=="proposal"||!parameters.safeParse(bound.input).success||receipt?.toolName!==bound.toolName)throw new ConflictError("原诊断宿主执行绑定不符");
  }else{
   const identity=externalTaskToolCallSchema.parse(call.providerResult),parent=calls.find(c=>c.id===identity.turnCallId);
   const start=externalChatStartSchema.safeParse(parent?.providerResult),settled=externalChatReceiptSchema.safeParse(parent?.providerResult),provider=start.success?start.data:settled.success?settled.data:null;
   const protocol=frozen.externalAgentBinding?.protocolKind??(frozen.executionEngine==="codex"?"codex-app-server":"acp");
   const proof=externalToolInputProofSchema.parse(record(payload.externalToolInputs)[call.id]);
   if(!parent||parent.kind!=="external_agent"||parent.parentCallId!==null||!["started","settled"].includes(parent.status)||parent.inputDigest!==chatInputDigest(frozen)||call.parentCallId!==parent.id||!provider||provider.engine!==frozen.executionEngine||provider.turnId!==parent.id||(provider.protocolKind??"acp")!==protocol||identity.toolVersion!==tool.version||proof.callId!==call.id||proof.turnCallId!==parent.id||proof.toolCallId!==identity.toolCallId||proof.toolName!==tool.name||proof.toolVersion!==tool.version||proof.inputDigest!==call.inputDigest||!parameters.safeParse(proof.input).success)throw new ConflictError("原诊断外部参数与回合证明不符");
   requireExternalChatCallTree(execution,calls,parent.id);
   if(protocol==="codex-app-server"){const native=record(record(payload.codexCalls)[parent.id]);if(native.threadId!==provider.sessionId||!native.turnId||native.turnId!==provider.providerTurnId)throw new ConflictError("原诊断Codex线程回合绑定不符");}
   const operationKey=`external-tool:${createHash("sha256").update(JSON.stringify([identity.turnCallId,identity.toolCallId])).digest("hex")}`;
   if(call.operationKey!==operationKey||call.inputDigest!==`sha256:${chatInputDigest({turnCallId:identity.turnCallId,toolCallId:identity.toolCallId,toolName:tool.name,version:tool.version,input:proof.input})}`)throw new ConflictError("原诊断外部参数摘要不符");
  }
  return {root,host,requested,subjectId,output,sourceDigest:digest({source:requested,rootId:root.id,executionId:execution.id,callId:call.id,inputDigest:call.inputDigest,definition:tool,hostContextDigest:input.hostContextDigest})};
 }
 async function baseline(ctx:RequestContext,s:Awaited<ReturnType<typeof source>>,store:Db,lock=false){
  if(lock)await store.select({id:artifacts.id}).from(artifacts).where(and(eq(artifacts.projectId,s.root.projectId!),eq(artifacts.userId,ctx.userId),workspaceFilter(artifacts,ctx))).orderBy(asc(artifacts.id)).for("update");
  const script=await ports.readConfirmedScript(ctx,s.root.projectId!,store);
  const ref=script?{artifactId:script.artifactId,versionId:script.versionId,sha256:script.sha256}:null;
  return {baseline:ref,fullText:script?.fullText??"",baselineDigest:digest({policyVersion:1,sourceDigest:s.sourceDigest,subjectId:s.subjectId,projectId:s.root.projectId,baseline:ref})};
 }
 async function writeBinding(store:Db,rootId:string,key:string,value:PredictionLockBinding){
  // 路径参数化；只改这张原卡，不覆盖checkpoint或另一张卡。
  await store.update(aiTasks).set({runtimeData:sql`jsonb_set(jsonb_set(coalesce(${aiTasks.runtimeData},'{}'::jsonb), '{predictionLocks}', coalesce(${aiTasks.runtimeData}->'predictionLocks','{}'::jsonb), true), array['predictionLocks',${key}]::text[], ${JSON.stringify(value)}::jsonb, true)`}).where(eq(aiTasks.id,rootId));
 }
 async function readBound(ctx:RequestContext,s:Awaited<ReturnType<typeof source>>,b:PredictionLockBinding,store:Db):Promise<PredictionLockState>{
  if(b.sourceDigest!==s.sourceDigest||!isDeepStrictEqual(b.source,s.requested)||b.subjectId!==s.subjectId||b.projectId!==s.root.projectId)throw new ConflictError("原卡绑定与来源不符");
  const [child]=await store.select().from(aiTasks).where(and(eq(aiTasks.id,b.childTaskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));
  let task:PredictionLockState['task']=null,status:PredictionLockState['status']='missing',resultId=b.resultId??null;
  if(child){
   const marker=record(record(child.inputData).predictionLockSource);
   if(child.taskType!=="calibration.diagnose"||marker.policyVersion!==1||marker.rootTaskId!==s.root.id||marker.toolCallId!==b.source.toolCallId||marker.intentDigest!==b.intentDigest||child.projectId!==b.projectId||record(child.inputData).subjectId!==b.subjectId)throw new ConflictError("原卡子任务绑定不符");
   task=(await projectExecutionTasks(store,ctx,[child]))[0]!;
   if(b.predictionId){
    const [result]=await store.select().from(aiTaskResults).where(and(eq(aiTaskResults.id,b.resultId!),eq(aiTaskResults.aiTaskId,child.id)));
    if(!result){
      // 只识别原具体回执是否已删除；存在但指向其它任务仍拒绝，不把foreign伪成missing。
      const [foreign]=await store.select({id:aiTaskResults.id}).from(aiTaskResults).where(eq(aiTaskResults.id,b.resultId!));
      if(foreign)throw new ConflictError('原卡结果回执不属于具体诊断任务');
      return {policyVersion:1,source:b.source,status:'missing',subjectId:b.subjectId,projectId:b.projectId,baselineDigest:b.baselineDigest,baseline:b.baseline,diagnoseTaskId:b.childTaskId,resultId:b.resultId??null,predictionId:b.predictionId,task};
    }
    const prediction=await ports.getPrediction(ctx,b.predictionId,store);
    if(prediction.status!=='locked'||prediction.subjectId!==b.subjectId||prediction.rubricVersionId!==b.rubric.id||child.status!=='succeeded')throw new ConflictError('原卡具体预测回执与实际状态不符');
    const receipt=record(record(result.resultData).predictionLockReceipt);
    const expected={policyVersion:1,source:b.source,sourceDigest:b.sourceDigest,baselineDigest:b.baselineDigest,diagnoseTaskId:child.id,resultId:b.resultId,predictionId:b.predictionId};
    if(!isDeepStrictEqual(receipt,expected))throw new ConflictError('原卡候选锁定回执缺失或与来源不符');
   }
   status=b.predictionId?'locked':['unknown_result','partial'].includes(task.runtimeStatus??'')||task.status==='partial'?'unknown':task.status==='awaiting_confirmation'?'awaiting_confirmation':['failed','cancelled','succeeded'].includes(task.status)?'failed':'running';
   if(status==='awaiting_confirmation'){
    const candidates=await store.select({id:aiTaskResults.id}).from(aiTaskResults).where(and(eq(aiTaskResults.aiTaskId,child.id),eq(aiTaskResults.resultType,'calibration_diagnosis')));
    if(candidates.length>1)throw new ConflictError('原卡诊断候选结果不唯一');
    if(candidates.length===0)status='missing';else resultId=candidates[0]!.id;
   }
  }
  return {policyVersion:1,source:b.source,status,subjectId:b.subjectId,projectId:b.projectId,baselineDigest:b.baselineDigest,baseline:b.baseline,diagnoseTaskId:b.childTaskId,resultId,predictionId:b.predictionId??null,task};
 }

 async function lockSource(ctx:RequestContext,requested:PredictionLockSource,pre:Awaited<ReturnType<typeof source>>,tx:Tx){
  await lockWorkspaceMembership(tx,ctx);
  const store=tx as unknown as Db;
  const [project]=await tx.select().from(projects).where(and(eq(projects.id,pre.root.projectId!),eq(projects.userId,ctx.userId),workspaceFilter(projects,ctx))).for("update");
  if(!project)throw new OwnershipError("原项目不可访问");
  const [root]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,pre.root.id),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx))).for("update");
  if(!root)throw new OwnershipError("原卡任务不可访问");
  await assertFrozenWorkspaceMembership(tx,{userId:root.userId,groupId:root.groupId,accountId:root.accountId,groupVersion:root.groupVersion,membershipVersion:root.membershipVersion});
  const verified=await source(ctx,requested,store);
  if(verified.sourceDigest!==pre.sourceDigest)throw new ConflictError("原卡来源已变化");
  return {store,s:verified};
 }
 const api={
  async read(ctx:RequestContext,requested:PredictionLockSource):Promise<PredictionLockState>{
   const s=await source(ctx,requested,db),b=bindingFor(s.root,requested.toolCallId);
   if(b)return readBound(ctx,s,b,db);
   if(s.host.predictionLockPolicyVersion!==1)return {policyVersion:1,source:requested,status:'legacy_unknown',subjectId:s.subjectId,projectId:s.root.projectId,baseline:null,baselineDigest:null,diagnoseTaskId:null,resultId:null,predictionId:null,task:null};
   const current=await baseline(ctx,s,db);
   return {policyVersion:1,source:requested,status:'available',subjectId:s.subjectId,projectId:s.root.projectId,baseline:current.baseline,baselineDigest:current.baselineDigest,diagnoseTaskId:null,resultId:null,predictionId:null,task:null};
  },
  async start(ctx:RequestContext,requested:PredictionLockSource,expectedBaselineDigest:string):Promise<PredictionLockState>{
   await assertWritableWorkspace(db,ctx);
   const pre=await source(ctx,requested,db);
   if(pre.host.predictionLockPolicyVersion!==1)throw new ConflictError("历史锁定来源缺失，无法确认");
   const prior=bindingFor(pre.root,requested.toolCallId);
   // 重试从不重新解析当前模型配置；已有任务沿原冻结路由。
   const runtime=prior?null:await ports.prepareRuntime(ctx);
   return db.transaction(async tx=>{
    const {store,s}=await lockSource(ctx,requested,pre,tx);
    const b=bindingFor(s.root,requested.toolCallId);
    if(b?.predictionId)return readBound(ctx,s,b,store);
    const current=await baseline(ctx,s,store,true);
    if(b){if(current.baselineDigest!==b.baselineDigest||expectedBaselineDigest!==b.baselineDigest)throw new ConflictError("原稿已变化，保留原诊断候选");return readBound(ctx,s,b,store);}
    if(current.baselineDigest!==expectedBaselineDigest)throw new ConflictError("原稿已变化，请重新读取");
    const rubric=await ports.ensureRubric(ctx,store);
    const attemptId=`prediction-lock-${createHash('sha256').update(canonicalJson({source:requested,rootId:s.root.id})).digest('hex')}`;
    const draft={policyVersion:1 as const,source:requested,sourceDigest:s.sourceDigest,subjectId:s.subjectId,projectId:s.root.projectId!,...current,title:s.output.title,rubric,childTaskId:'',attemptId,intentDigest:''};
    // child ID不进入意图；由同事务唯一attempt返回后加入完整绑定摘要。
    const {childTaskId:_child,intentDigest:_intent,...intentBody}=draft;
    const intent=digest(intentBody);
    const marker={policyVersion:1,rootTaskId:s.root.id,toolCallId:requested.toolCallId,intentDigest:intent};
    const child=await ports.createChild(ctx,{projectId:draft.projectId,contentOutputId:s.subjectId,subjectType:'content_output',subjectId:s.subjectId,predictionLockSource:marker},attemptId,runtime!,store);
    const bindingValue={...draft,childTaskId:child.id,intentDigest:intent};
    // 持久意图摘要与child输入一致；绑定本体另由所有字段对照验证。
    await writeBinding(store,s.root.id,requested.toolCallId,bindingValue);
    return readBound(ctx,s,bindingValue,store);
   });
  },
  async readFrozen(ctx:RequestContext,child:Pick<Task,'id'|'inputData'>){
   const marker=record(record(child.inputData).predictionLockSource);
   if(marker.policyVersion!==1||typeof marker.rootTaskId!=='string'||typeof marker.toolCallId!=='string')throw new ConflictError("正式诊断来源缺失");
   const [root]=await db.select().from(aiTasks).where(and(eq(aiTasks.id,marker.rootTaskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));
   if(!root)throw new OwnershipError("原卡来源不可访问");
   const b=bindingFor(root,marker.toolCallId);
   if(!b||b.childTaskId!==child.id||b.intentDigest!==marker.intentDigest)throw new ConflictError("伪造或缺失的原卡子任务绑定");
   const s=await source(ctx,b.source,db);await readBound(ctx,s,b,db);
   const rubric=await ports.getRubric(ctx,b.rubric.id,db);
   if(!isDeepStrictEqual(rubric,b.rubric))throw new ConflictError("冻结正式评分规则已变化");
   return {subject:{title:b.title,scriptText:b.fullText},rubric:{rubricVersionId:b.rubric.id,dimensions:b.rubric.dimensions}};
  },
  async confirmBound(ctx:RequestContext,id:string,apply:(tx:Tx)=>Promise<{resultId:string;predictionId:string}|undefined>):Promise<boolean>{
   const [hint]=await db.select().from(aiTasks).where(and(eq(aiTasks.id,id),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));
   if(!record(record(hint?.inputData).predictionLockSource).policyVersion)return false;
   const marker=record(record(hint!.inputData).predictionLockSource);
   const [root]=typeof marker.rootTaskId==='string'?await db.select().from(aiTasks).where(and(eq(aiTasks.id,marker.rootTaskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx))):[];
   if(!root||typeof marker.toolCallId!=='string')throw new ConflictError("原卡确认绑定不存在");
   const b=bindingFor(root,marker.toolCallId);
   if(!b||b.childTaskId!==id||b.intentDigest!==marker.intentDigest)throw new ConflictError("原卡确认子任务不符");
   const pre=await source(ctx,b.source,db);
   await assertWritableWorkspace(db,ctx);
   await db.transaction(async tx=>{
    const {store,s}=await lockSource(ctx,b.source,pre,tx),currentBinding=bindingFor(s.root,b.source.toolCallId);
    if(!currentBinding||currentBinding.childTaskId!==id)throw new ConflictError("原卡确认绑定已变化");
    await readBound(ctx,s,currentBinding,store);
    if(currentBinding.predictionId)return;
    const current=await baseline(ctx,s,store,true);
    if(current.baselineDigest!==currentBinding.baselineDigest)throw new ConflictError("原稿已变化，不能锁定旧候选");
    const rubric=await ports.getRubric(ctx,currentBinding.rubric.id,store);
    if(!isDeepStrictEqual(rubric,currentBinding.rubric))throw new ConflictError("冻结评分规则已变化");
    const receipt=await apply(tx);
    if(!receipt?.predictionId)throw new ConflictError("正式诊断没有具体锁定回执");
    const [result]=await tx.select().from(aiTaskResults).where(and(eq(aiTaskResults.id,receipt.resultId),eq(aiTaskResults.aiTaskId,id))).for('update');
    if(!result)throw new ConflictError("正式候选结果不存在");
    const saved={...currentBinding,...receipt};
    await tx.update(aiTaskResults).set({resultData:{...record(result.resultData),predictionLockReceipt:{policyVersion:1,source:b.source,sourceDigest:b.sourceDigest,baselineDigest:b.baselineDigest,diagnoseTaskId:id,...receipt}}}).where(eq(aiTaskResults.id,result.id));
    await writeBinding(store,s.root.id,b.source.toolCallId,saved);
   });
   return true;
  },
 };
 return api;
}
