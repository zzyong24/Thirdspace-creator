import {isDeepStrictEqual} from 'node:util';
import {frozenChatModelRouteForCall,frozenNonChatModelBindingForCall,assertFrozenAgenticModelOwner} from './execution-model-identity.service';
import {eq,executionTasks,executionCalls,type Db} from '@creatoros/backend';
import {executionBudgetSchema,frozenExecutionEngine,externalChatStartSchema,workerPortInputSchemas,type ExecutionRef} from '@creatoros/contract/execution-worker';
import {createExecutionLeaseService} from './execution-lease.service';
import {ConflictError} from './execution.errors';
import {bindAssetExecution} from './asset-execution-binding';
/** 官方ID只附到已预约的原call；不创建任务或重发回合。 */
export function createExecutionCodexCallService(db:Db,deps:{now?:()=>string}={}){
 const leases=createExecutionLeaseService(db,deps);
 return {async invoke(ref:ExecutionRef,port:'readCodexCall'|'bindCodexCall'|'recordCodexToolCall',raw:unknown){
  const input=workerPortInputSchemas[port].parse(raw);
  return leases.withLease(ref,port==='readCodexCall'||port==='bindCodexCall'&&Boolean(('turnId' in input&&input.turnId)||('nativeResult' in input&&input.nativeResult)||('modelFacts' in input&&input.modelFacts)||('observedUsage' in input&&input.observedUsage))?'settlement':'admission',async scope=>{
   const {tx,task,context}=scope;
   const [call]=await tx.select().from(executionCalls).where(eq(executionCalls.id,input.callId));
   if(!call||call.executionTaskId!==task.id||!['started','unknown','settled'].includes(call.status))throw new ConflictError('Codex原调用尚未启动或归属不符');
   const payload=task.payload as Record<string,unknown>;
   const originalChat=payload.modelInput as {kind?:string;executionEngine?:string}|undefined;
   const chatV2=originalChat?.kind==='chat.run'&&(payload.executionRoute as {schemaVersion?:unknown}|undefined)?.schemaVersion===2;
   const v2=(payload.executionRoute as {schemaVersion?:unknown}|undefined)?.schemaVersion===2;
   if(v2){
    const own=chatV2?frozenChatModelRouteForCall(payload,call):frozenNonChatModelBindingForCall(task,call)?.route;
    if(own?.source!=='codex')throw new ConflictError('原call未冻结Codex执行权');
    if(originalChat?.kind==='agentic.run')await assertFrozenAgenticModelOwner(scope);
    if(!chatV2&&['image','video'].includes(own.mode))await bindAssetExecution({tx,task,context},call.id);
   }
   else if(frozenExecutionEngine(payload)!=='codex'&&!(originalChat?.kind==='chat.run'&&originalChat.executionEngine==='codex'))throw new ConflictError('原任务未冻结Codex执行权');
   const bindings=(payload.codexCalls??{}) as Record<string,Record<string,unknown>>;
   const previous=bindings[call.id];
   const chatStart=externalChatStartSchema.safeParse(call.providerResult);
   const authenticAcp=call.kind==='external_agent'&&chatStart.success&&chatStart.data.engine==='codex'&&chatStart.data.protocolKind==='acp'&&chatStart.data.status==='started';
   const hasOriginalTurn=Boolean(previous?.turnId)||authenticAcp&&previous?.threadId===chatStart.data.sessionId;
   if(port==='readCodexCall')return previous??null;
   if(port==='recordCodexToolCall'){
    const incoming=workerPortInputSchemas.recordCodexToolCall.parse(raw);
    if(!previous?.threadId||!hasOriginalTurn)throw new ConflictError('Codex工具缺原线程回合');
    const tools=(previous.tools??{}) as Record<string,unknown>;
    if(tools[incoming.toolCallId]&&!isDeepStrictEqual(tools[incoming.toolCallId],incoming)||Object.keys(tools).length>=10000&&!tools[incoming.toolCallId])throw new ConflictError('Codex工具身份不能改变');
    const value={...previous,tools:{...tools,[incoming.toolCallId]:incoming}};
    await tx.update(executionTasks).set({payload:{...payload,codexCalls:{...bindings,[call.id]:value}}}).where(eq(executionTasks.id,task.id));return value;
   }
   const patch=workerPortInputSchemas.bindCodexCall.parse(input);
   if(patch.observedUsage){
    if(!hasOriginalTurn)throw new ConflictError('用量缺少原回合来源');
    const old=call.usage as Record<string,unknown>|null;
    for(const key of ['inputTokens','outputTokens','totalTokens'] as const){
      const value=patch.observedUsage[key];if(value===undefined)continue;
      const before=old?.[key];
      if(typeof before==='number'&&(value<before||call.status==='settled'&&value!==before))throw new ConflictError('原回合用量不能倒退或改变结算');
    }
    const usage={...(old??{}),...patch.observedUsage};
    await tx.update(executionCalls).set({usage,totalTokens:patch.observedUsage.totalTokens??call.totalTokens}).where(eq(executionCalls.id,call.id));
   }
   const value:Record<string,unknown>={...(previous??{}),...(patch.threadId?{threadId:patch.threadId}:{}),...(patch.turnId?{turnId:patch.turnId}:{}),...(patch.nativeResult?{nativeResult:patch.nativeResult}:{}),...(patch.modelFacts?{modelFacts:patch.modelFacts}:{}),...(patch.observedUsage?{observedUsage:{...previous?.observedUsage as object,...patch.observedUsage}}:{})};
   if(patch.modelFacts&&!value.turnId)throw new ConflictError('实际模型缺少原回合来源');
   if(authenticAcp&&value.threadId!==chatStart.data.sessionId)throw new ConflictError('ACP线程不属于原调用');
   if(patch.nativeResult&&!value.turnId||!value.threadId||Object.keys(bindings).length>=10000&&!previous||previous&&Object.keys(previous).filter(key=>key!=="observedUsage").some(key=>!isDeepStrictEqual(previous[key],value[key])))throw new ConflictError('Codex原回合身份不能改变');
   await tx.update(executionTasks).set({payload:{...payload,codexCalls:{...bindings,[call.id]:value}}}).where(eq(executionTasks.id,task.id));
   const budget=task.executionBudget===null?null:executionBudgetSchema.parse(task.executionBudget);
   const calls=await tx.select({totalTokens:executionCalls.totalTokens}).from(executionCalls).where(eq(executionCalls.executionTaskId,task.id));
   const knownSpent=calls.reduce((sum,row)=>sum+(row.totalTokens??0),0);
   // 保留实际费用后返回原任务预算判定；Worker只能打断同一回合，不能续期或另发。
   return {...value,budgetExceeded:budget?.maxTokens!==null&&budget?.maxTokens!==undefined&&knownSpent>budget.maxTokens};
  });
 }};
}
