// 隔离测试夹具：源数据由路由测试身份/消息端口提供；提交、租约、调用账本、完成和SSE均走真实服务。
import {createDb,aiConversations,aiMessages,aiTasks,executionTasks,executionCalls,executionStreamEvents,eq,sql,type Db} from '@creatoros/backend';
import {createChatTurnSubmissionService,type ChatTurnAssembly,type ChatTurnSnapshot} from './chat-turn-submission.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {createExecutionGenerationPorts} from '../execution/execution-generation-ports.service';
import {createExecutionCheckpointService} from '../execution/execution-checkpoint.service';
import {createExecutionStreamService,subscribeExecutionStream} from '../execution/execution-stream.service';
import {createChatTurnCompletionService} from './chat-turn-completion.service';
import {z} from 'zod';
import {createExecutionWorkerOutcomeService} from '../execution/execution-worker-outcome.service';
import {chatToolProviderName} from '@creatoros/contract/execution-worker';
import {createExecutionAgenticToolPorts} from '../execution/execution-agentic-tool-ports.service';
import {createChatToolStreamProjection} from '../execution/chat-tool-stream-projection.service';
import type {RequestContext} from '@creatoros/contract';
export async function createRouteDurableFixture(){
 const connection=await createDb(),db:Db=connection.db;
 let receipt: {taskId:string;executionTaskId:string;sourceMessageId:string;replayed:boolean}|undefined;
 const tasks=createPersistentTaskService(db),events=createExecutionStreamService(db);
 const budget={maxCalls:20,maxTokens:20000,deadlineMs:120000};
 async function seed(ctx:RequestContext,input:{conversationId:string;sourceMessageId:string},conversation:Record<string,unknown>,history:Array<Record<string,unknown>>,source:Record<string,unknown>){
  if(source.id!==input.sourceMessageId || source.role!=='user' || typeof source.content!=='string')throw Error('隔离夹具源消息与保存回执不符');
  const stamp='2026-09-08T00:00:00.000Z';
  await db.insert(aiConversations).values({id:input.conversationId,userId:ctx.userId,accountId:ctx.accountId??null,title:String(conversation.title??'会话'),projectId:conversation.projectId as string??null,scope:String(conversation.scope??'global'),createdAt:stamp,updatedAt:stamp}).onConflictDoNothing();
  const rows=[...history.filter(row=>row.id!==input.sourceMessageId),source];
  for(const [index,row] of rows.entries())await db.insert(aiMessages).values({id:String(row.id),conversationId:input.conversationId,role:String(row.role),content:String(row.content??''),parts:(row.parts??[]) as unknown[],attachments:(row.attachments??[]) as string[],modelMetadata:{},createdAt:new Date(Date.parse(stamp)+index*1000).toISOString()}).onConflictDoNothing();
 }
 const runtime={
  submit:async(ctx:RequestContext,input:{conversationId:string;sourceMessageId:string},assemble:(ctx:RequestContext,snapshot:ChatTurnSnapshot)=>Promise<ChatTurnAssembly>)=>{receipt=await createChatTurnSubmissionService(db,{assemble,assertProject:async()=>{}}).submit(ctx,input);return receipt;},
  subscribe:(ctx:RequestContext,id:string,signal:AbortSignal)=>subscribeExecutionStream(events,ctx,id,{signal}),
  get:(ctx:RequestContext,id:string)=>tasks.get(ctx,id),
  command:(ctx:RequestContext,id:string,command:'cancel'|'resume'|'retry')=>tasks.command(ctx,{taskIds:[id],command,idempotencyKey:`fixture:${id}:${command}`}),
 };
 async function finish(text:string,options:{usage?:{inputTokens?:number;outputTokens?:number;cachedTokens?:number};reason?:string;deferCompletion?:boolean;tool?:{name:string;input:Record<string,unknown>;output:Record<string,unknown>}}={}){
  if(!receipt)throw Error('缺少真实提交回执');
  const claim=(await tasks.claimTask({taskId:receipt.executionTaskId,workerId:'route-fixture-worker'}))!;
  const ref={executionTaskId:receipt.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const ledger=createExecutionCallLedgerService(db,{budget}),generation=createExecutionGenerationPorts(db,{budget});
  const checkpoints:Array<{role:'assistant'|'tool';callId:string}>=[];
  let ledgerSequence=0;
  if(options.tool){
   const tool=options.tool;
   const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId));
   const frozen=(execution.payload as {modelInput:{tools:Array<{name:string;version:string;effect:'none'|'proposal'|'committed';parameters:Record<string,unknown>;execution?:'host'|'worker.structured-node'|'worker.research'}>}}).modelInput;
   const definition=frozen.tools.find(item=>item.name===tool.name);if(!definition)throw Error('合成工具不在真实冻结白名单');
   const parameters=z.fromJSONSchema(definition.parameters);parameters.parse(tool.input);
   const tools={[tool.name]:{version:definition.version,effect:definition.effect,execution:definition.execution,parameters}};
   const model=await generation.reserveGenerationCall(ref,{operationKey:`chat:${receipt.sourceMessageId}/model/1`,request:{maxOutputTokens:8192}});await ledger.start(ref,model.callId);
   await generation.settleGenerationCall(ref,{callId:model.callId,status:'settled',usage:{},providerResult:{content:[{type:'tool-call',toolCallId:'fixture-tool',toolName:chatToolProviderName(tool.name),input:JSON.stringify(tool.input)}],finishReason:{unified:'tool-calls'},usage:{inputTokens:{total:0,cacheRead:0},outputTokens:{total:0}},warnings:[]}});
   const ports=createExecutionAgenticToolPorts(db,{budget,tools});const reserved=await ports.reserve(ref,{modelCallId:model.callId,toolCallId:'fixture-tool'});await ports.start(ref,{callId:reserved.callId});
   await ports.settle(ref,{callId:reserved.callId,status:'settled',output:{status:'ok',summary:'隔离合成工具回执',evidence:[],data:tool.output,error:null,continuation:null,sideEffect:definition.effect}});
   await createChatToolStreamProjection(db,{tools})(ref,reserved.callId);
   checkpoints.push({role:'assistant',callId:model.callId},{role:'tool',callId:reserved.callId});ledgerSequence=2;
  }
  const call=await generation.reserveGenerationCall(ref,{operationKey:`chat:${receipt.sourceMessageId}/model/${options.tool?2:1}`,request:{maxOutputTokens:8192}});await ledger.start(ref,call.callId);
  if(text)await events.append(ref,{callId:call.callId,startIndex:0,chunks:[{type:'text-start',id:'reply'},{type:'text-delta',id:'reply',delta:text},{type:'text-end',id:'reply'}]});
  await generation.settleGenerationCall(ref,{callId:call.callId,status:'settled',usage:options.usage??{},providerResult:{content:[{type:'text',text}],finishReason:{unified:options.reason??'stop'},usage:{inputTokens:options.usage?.inputTokens===undefined?{}:{total:options.usage.inputTokens,...(options.usage.cachedTokens===undefined?{}:{cacheRead:options.usage.cachedTokens})},outputTokens:options.usage?.outputTokens===undefined?{}:{total:options.usage.outputTokens}},warnings:[]}});
  checkpoints.push({role:'assistant',callId:call.callId});
  await createExecutionCheckpointService(db).save(ref,{expectedRevision:0,expectedLedgerSequence:ledgerSequence+1,messages:checkpoints});
  const request={lastModelCallId:call.callId,toolCallIds:checkpoints.filter(item=>item.role==='tool').map(item=>item.callId)};
  const completion=createChatTurnCompletionService(db);
  if(options.deferCompletion)return {commit:()=>completion.commitResult(ref,request),acknowledgeCancel:()=>tasks.acknowledgeControl({taskId:ref.executionTaskId,workerId:'route-fixture-worker',attempt:ref.attempt})};
  const result=await completion.commitResult(ref,request);
  // 完成响应重放只回同一回执，不再生成或保存第二份回复。
  if(JSON.stringify(await completion.commitResult(ref,request))!==JSON.stringify(result))throw Error('完成回执不幂等');
  return result;
 }

 async function fail(errorMessage:string,errorCode='MODEL_CONFIGURATION_REQUIRED'){
  if(!receipt)throw Error('缺少真实提交回执');
  const claim=(await tasks.claimTask({taskId:receipt.executionTaskId,workerId:'route-fixture-worker'}))!;
  return tasks.finish({taskId:receipt.executionTaskId,workerId:'route-fixture-worker',attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,status:'failed',errorCode,errorMessage});
 }
 async function unknown(){
  if(!receipt)throw Error('缺少真实提交回执');
  const claim=(await tasks.claimTask({taskId:receipt.executionTaskId,workerId:'route-fixture-worker'}))!;
  const ref={executionTaskId:receipt.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const generation=createExecutionGenerationPorts(db,{budget}),ledger=createExecutionCallLedgerService(db,{budget});
  const call=await generation.reserveGenerationCall(ref,{operationKey:`chat:${receipt.sourceMessageId}/model/1`,request:{maxOutputTokens:8192}});await ledger.start(ref,call.callId);
  await generation.settleGenerationCall(ref,{callId:call.callId,status:'unknown'});
  return createExecutionWorkerOutcomeService(db).recordFailure(ref,{outcome:'unknown_result',errorCode:'MODEL_RESULT_UNKNOWN'});
 }
 return {db,seed,runtime,finish,fail,unknown,receipt:()=>receipt,
  messages:async()=>db.select().from(aiMessages).where(eq(aiMessages.conversationId,(await db.select().from(aiConversations))[0]!.id)),
  rows:async()=>({business:await db.select().from(aiTasks),execution:await db.select().from(executionTasks),calls:await db.select().from(executionCalls),events:await db.select().from(executionStreamEvents)}),
  reset:async()=>{receipt=undefined;await db.execute(sql.raw('TRUNCATE ai_conversations, ai_messages, ai_tasks, ai_task_results, execution_tasks CASCADE'));},
  close:()=>connection.client.close(),
 };
}
