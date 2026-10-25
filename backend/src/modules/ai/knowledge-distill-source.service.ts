import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {and,asc,eq,aiTasks,executionTasks,executionCalls,type Db} from '@creatoros/backend';
import {knowledgeDistillSource,type RequestContext} from '@creatoros/contract';
import {chatWorkerInputSchema,workerToolResultReceiptSchema,agenticToolOutcomeSchema,externalTaskToolCallSchema,externalChatStartSchema,externalChatReceiptSchema,externalToolInputProofSchema} from '@creatoros/contract/execution-worker';
import {requireWorkspace,workspaceFilter} from '../../workspace-scope';
import {createAgenticToolBinding} from '../execution/agentic-tool-binding';
import {ConflictError} from '../execution/execution.errors';
import {readChatTurnSnapshot,chatInputDigest,chatHistoryDigest} from './chat-turn-submission.service';
import {requireExternalChatCallTree} from './external-chat-call-tree';
import {canonicalJson} from './canonical-json';
import {buildChatTools,clampDistillContent} from '../ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../ai-runtime/chat-tool-definitions';

const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const candidateSchema=z.object({kind:z.literal('knowledge.distill'),atoms:z.array(z.object({type:z.enum(['claim','evidence','quote','qa']),title:z.string(),note:z.string(),sourceNote:z.string()})).min(1).max(200),suggestedTags:z.array(z.string()),originalText:z.string().min(1),error:z.null(),suggestSwitchModel:z.boolean()});
/** Read settled tool ledger, including old persisted chat cards. Never trust the rendered card or submitted archive text. */
export function createKnowledgeDistillSourceService(db:Db){
 return {async read(ctx:RequestContext,raw:unknown,store:Db=db){
  requireWorkspace(ctx);const source=knowledgeDistillSource.parse(raw);
  const snapshot=await readChatTurnSnapshot(store,ctx,source);
  const taskId=object(snapshot.sourceMessage.modelMetadata).chatTaskId;
  if(typeof taskId!=='string')throw new ConflictError('蒸馏消息没有真实任务来源，请重新蒸馏');
  const [business]=await store.select().from(aiTasks).where(and(eq(aiTasks.id,taskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));
  if(!business||business.taskType!=='copilot.assist'||!business.executionTaskId||(business.accountId??null)!==(ctx.accountId??null)||(business.groupId??null)!==(ctx.groupId??null))throw new ConflictError('蒸馏任务不属于当前账号组');
  const [task]=await store.select().from(executionTasks).where(eq(executionTasks.id,business.executionTaskId));
  if(!task||task.kind!=='ai_task'||task.ownerType!=='ai_task'||task.ownerId!==business.id||task.userId!==ctx.userId||(task.accountId??null)!==(ctx.accountId??null)||(task.groupId??null)!==(ctx.groupId??null))throw new ConflictError('蒸馏执行映射无效');
  const payload=object(task.payload),frozen=chatWorkerInputSchema.parse(payload.modelInput),inputData=object(business.inputData);
  if(payload.aiTaskId!==business.id||inputData.kind!=='chat.run'||inputData.modelInputDigest!==chatInputDigest(frozen)||frozen.userId!==ctx.userId||frozen.accountId!==(ctx.accountId??null)||(frozen.groupId??null)!==(ctx.groupId??null)||frozen.conversationId!==source.conversationId||frozen.sourceMessageId!==source.sourceMessageId||inputData.conversationId!==source.conversationId||inputData.sourceMessageId!==source.sourceMessageId||business.projectId!==snapshot.conversation.projectId||inputData.historyDigest!==chatHistoryDigest(snapshot)||!isDeepStrictEqual(inputData.historyMessageIds,snapshot.messages.map(m=>m.id)))throw new ConflictError('蒸馏冻结输入或原会话已变化');
  const declarations=frozen.tools.filter(tool=>tool.name==='knowledge.distill');
  if(declarations.length!==1)throw new ConflictError('蒸馏工具冻结定义不唯一');
  const prepared=await prepareChatToolDefinitions(buildChatTools(['knowledge.distill'],{humanizeError:()=>null} as never),{workerStructuredNodes:declarations[0]!.execution==='worker.structured-node'});
  const definition=prepared.definitions[0]!,parameter=prepared.parameters['knowledge.distill']!;
  if(declarations.length!==1||canonicalJson(declarations[0])!==canonicalJson(definition))throw new ConflictError('蒸馏工具冻结定义不匹配');
  const binding=createAgenticToolBinding({'knowledge.distill':{version:definition.version,effect:'proposal',execution:definition.execution,parameters:parameter.parameters}});
  const calls=await store.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  function decode(call:typeof executionCalls.$inferSelect){
   if(call.status!=='settled'||!call.resultText)throw new ConflictError('蒸馏调用尚未成功结算');
   let rawResult:unknown;try{rawResult=JSON.parse(call.resultText);}catch{throw new ConflictError('蒸馏调用回执损坏');}
   const receipt=call.kind==='tool'?workerToolResultReceiptSchema.parse(rawResult):null;
   const outcome=agenticToolOutcomeSchema.parse(receipt?receipt.output:rawResult);
   if(outcome.status!=='ok'||outcome.sideEffect!=='proposal'||outcome.error!==null)throw new ConflictError('蒸馏调用没有可采纳的成功候选');
   const candidate=candidateSchema.parse(outcome.data);
   let input:unknown,toolCallId:string;
   if(call.kind==='tool'){
    const bound=binding.forCall(task!,calls,call);
    const validExecution=bound.execution==='host'?!!call.toolExecutionClaimId&&(frozen.executionEngine===undefined||frozen.executionEngine==='pi'):bound.execution==='worker.structured-node'&&call.toolExecutionClaimId===null&&calls.some(child=>child.parentCallId===call.id&&child.kind==='model'&&child.status==='settled');
    if(!validExecution||call.parentCallId!==null||bound.validationOutcome||bound.executionToolName!=='knowledge.distill'||bound.effect!=='proposal'||receipt!.toolName!==bound.toolName||receipt!.toolCallId!==bound.toolCallId)throw new ConflictError('蒸馏与原模型工具调用不符');
    input=bound.input;toolCallId=bound.toolCallId;
   }else if(call.kind==='external_tool'){
    const identity=externalTaskToolCallSchema.parse(call.providerResult),parent=calls.find(row=>row.id===identity.turnCallId);
    const started=externalChatStartSchema.safeParse(parent?.providerResult),settled=externalChatReceiptSchema.safeParse(parent?.providerResult),provider=started.success?started.data:settled.success?settled.data:null;
    const protocol=frozen.externalAgentBinding?.protocolKind??(frozen.executionEngine==='codex'?'codex-app-server':'acp');
    if(!['codex','codebuddy'].includes(frozen.executionEngine??'')||identity.toolName!=='knowledge.distill'||identity.toolVersion!==definition.version||!parent||parent.kind!=='external_agent'||parent.parentCallId!==null||!['started','settled'].includes(parent.status)||call.parentCallId!==parent.id||parent.inputDigest!==chatInputDigest(frozen)||!provider||provider.engine!==frozen.executionEngine||provider.turnId!==parent.id||provider.protocolVersion!==1||(provider.protocolKind??'acp')!==protocol||(protocol==='codex-app-server'&&!provider.providerTurnId))throw new ConflictError('蒸馏外部回合身份无效');
    requireExternalChatCallTree(task!,calls,parent.id);
    if(protocol==='codex-app-server'){const native=object(object(payload.codexCalls)[parent.id]);if(native.threadId!==provider.sessionId||native.turnId!==provider.providerTurnId)throw new ConflictError('蒸馏缺少原生线程绑定');}
    const proof=externalToolInputProofSchema.parse(object(payload.externalToolInputs)[call.id]);
    if(proof.callId!==call.id||proof.turnCallId!==parent.id||proof.toolCallId!==identity.toolCallId||proof.toolName!=='knowledge.distill'||proof.toolVersion!==definition.version||proof.inputDigest!==call.inputDigest)throw new ConflictError('蒸馏原参数证明不符');
    input=proof.input;toolCallId=identity.toolCallId;
    if(call.operationKey!==`external-tool:${createHash('sha256').update(JSON.stringify([parent.id,toolCallId])).digest('hex')}`||call.inputDigest!==`sha256:${chatInputDigest({turnCallId:parent.id,toolCallId,toolName:'knowledge.distill',version:definition.version,input})}`)throw new ConflictError('蒸馏外部参数摘要不符');
   }else throw new ConflictError('该调用不是蒸馏工具来源');
   const parsed=parameter.parameters.safeParse(input);
   if(!parsed.success||candidate.originalText!==clampDistillContent(object(input).content))throw new ConflictError('蒸馏存档原文与真实工具输入不符');
   return {call,receipt,outcome,candidate,input,toolCallId};
  }
  const matches=calls.filter(call=>{try{if(call.kind==='external_tool'){const identity=externalTaskToolCallSchema.parse(call.providerResult);return identity.toolName==='knowledge.distill'&&identity.toolCallId===source.toolCallId;}if(call.kind==='tool'){const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText??'null'));return receipt.toolCallId===source.toolCallId&&binding.forCall(task,calls,call).executionToolName==='knowledge.distill';}}catch{return false;}return false;});
  if(matches.length!==1)throw new ConflictError('蒸馏工具来源不唯一或不存在');
  let current=decode(matches[0]!);const seen=new Set<string>();
  while(current.receipt?.reusedCallId){
   if(seen.has(current.call.id))throw new ConflictError('蒸馏重放来源循环');seen.add(current.call.id);
   const original=calls.find(call=>call.id===current.receipt!.reusedCallId);
   if(!original||original.sequence>=current.call.sequence)throw new ConflictError('蒸馏重放来源无效');
   const previous=decode(original);
   if(!isDeepStrictEqual(current.input,previous.input)||!isDeepStrictEqual(current.outcome,previous.outcome))throw new ConflictError('蒸馏重放内容不符');current=previous;
  }
  // SEMANTIC_BOUNDARY_ALLOW: the digest proves immutable source bytes, never chooses meaning or an action.
  const sourceDigest=createHash('sha256').update(canonicalJson({taskId:business.id,callId:current.call.id,candidate:current.candidate})).digest('hex');
  return {source,taskId:business.id,callId:current.call.id,sourceDigest,candidate:current.candidate};
 }};
}
