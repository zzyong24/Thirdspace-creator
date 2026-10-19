import {resolveWorkEditorProtocol} from '../ai-runtime/chat-work-editor-protocol';
import {resolveWorkCreationProtocol} from '../ai-runtime/chat-work-creation-protocol';
import {workEditorContentDigest} from '../ai-runtime/work-editor-candidate';
import {buildChatTools} from '../ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../ai-runtime/chat-tool-definitions';
import {requireExternalChatCallTree} from './external-chat-call-tree';
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {z} from "zod";
import {and,asc,eq,aiMessages,aiTasks,executionTasks,executionCalls,type Db} from "@creatoros/backend";
import {workAssistantSource as assistantProposalSourceSchema,workEditorCandidate,workCreationProposalResult,workEditorProposeInput,workCreationProposalInput,type WorkAssistantSource as AssistantProposalSource,type RequestContext} from "@creatoros/contract";
import {externalToolInputProofSchema,agenticToolOutcomeSchema,chatWorkerInputSchema,externalTaskToolCallSchema,externalChatStartSchema,externalChatReceiptSchema,workerToolResultReceiptSchema} from "@creatoros/contract/execution-worker";
import {workspaceFilter,requireWorkspace} from "../../workspace-scope";
import {createAgenticToolBinding,type AgenticBackendTool} from "../execution/agentic-tool-binding";
import {ConflictError} from "../execution/execution.errors";
import {readChatTurnSnapshot,chatInputDigest,chatHistoryDigest} from "./chat-turn-submission.service";
import {readChatHostContextPair} from "./chat-host-context";
import {canonicalJson} from "./canonical-json";

type Tool=AgenticBackendTool & {parameterSchema:Record<string,unknown>};
type Candidate=z.infer<typeof workEditorCandidate>|z.infer<typeof workCreationProposalResult>;
type SourceIdentity=Pick<AssistantProposalSource,"taskId"|"callId"|"toolCallId">;
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const proposalTools=new Set(["work.editor.propose","work.creation.propose"]);
// SEMANTIC_BOUNDARY_ALLOW:仅核对来源与候选字节的身份，不选择内容或动作。
const proposalDigest=(source:SourceIdentity,candidate:unknown)=>`sha256:${createHash("sha256").update(canonicalJson({source,candidate})).digest("hex")}`;
/** 人的采纳读取已结算账本，不伪造活跃租约，不从聊天文字恢复证明。 */
export function createWorkCandidateSourceService(db:Db){
 async function readSource(ctx:RequestContext,raw:unknown,store:Db=db){
  requireWorkspace(ctx);
  const requested=assistantProposalSourceSchema.parse(raw);
  const [business]=await store.select().from(aiTasks).where(and(eq(aiTasks.id,requested.taskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));
  if(!business||business.taskType!=="copilot.assist"||!business.executionTaskId||(business.accountId??null)!==(ctx.accountId??null)||(business.groupId??null)!==(ctx.groupId??null))throw new ConflictError("候选不属于当前账号组与账号范围");
  const [task]=await store.select().from(executionTasks).where(eq(executionTasks.id,business.executionTaskId));
  if(!task||task.kind!=="ai_task"||task.ownerType!=="ai_task"||task.ownerId!==business.id||task.userId!==ctx.userId||(task.accountId??null)!==(ctx.accountId??null)||(task.groupId??null)!==(ctx.groupId??null))throw new ConflictError("候选执行映射无效");
  const verifiedTask=task;
  const payload=object(task.payload),frozen=chatWorkerInputSchema.parse(payload.modelInput),businessInput=object(business.inputData);
  if(payload.aiTaskId!==business.id||businessInput.kind!=="chat.run"||businessInput.modelInputDigest!==chatInputDigest(frozen)||frozen.userId!==ctx.userId||frozen.accountId!==(ctx.accountId??null)||(frozen.groupId??null)!==(ctx.groupId??null)||businessInput.conversationId!==frozen.conversationId||businessInput.sourceMessageId!==frozen.sourceMessageId)throw new ConflictError("候选冻结输入映射无效");
  const snapshot=await readChatTurnSnapshot(store,ctx,{conversationId:frozen.conversationId,sourceMessageId:frozen.sourceMessageId});
  if(business.projectId!==snapshot.conversation.projectId||object(snapshot.sourceMessage.modelMetadata).chatTaskId!==business.id||businessInput.historyDigest!==chatHistoryDigest(snapshot)||!isDeepStrictEqual(businessInput.historyMessageIds,snapshot.messages.map(m=>m.id)))throw new ConflictError("候选原始会话或指令已变化");
  const hostContext=readChatHostContextPair(payload.hostContext,businessInput.hostContextDigest,{userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId,projectId:snapshot.conversation.projectId});
  if(!hostContext)throw new ConflictError("候选缺少原宿主上下文");
  const verifiedHost=hostContext;
  const editorOptions=resolveWorkEditorProtocol(frozen.tools,hostContext.chatContext.editorTarget);
  const creationOptions=resolveWorkCreationProtocol(frozen.tools,hostContext.chatContext.creationTarget,hostContext.chatContext.creationTarget?hostContext.resolvedWritingContext:undefined);
  // 两个工具族独立重建；creation 的写作版本不得覆盖 editor 原冻结协议。
  const families=await Promise.all((['work.editor.propose','work.creation.propose'] as const).filter(name=>frozen.tools.some(tool=>tool.name===name)).map(async name=>{
   const definitionOptions=name==='work.editor.propose'?editorOptions:creationOptions;
   return prepareChatToolDefinitions(buildChatTools([name],{humanizeError:()=>null,...definitionOptions} as never),definitionOptions);
  }));
  const prepared={definitions:families.flatMap(family=>family.definitions),parameters:Object.assign({},...families.map(family=>family.parameters)) as (typeof families)[number]['parameters']};
  const tools:Record<string,Tool>={};
  for(const definition of prepared.definitions){tools[definition.name]={version:definition.version,effect:'proposal',execution:'host',parameters:prepared.parameters[definition.name]!.parameters,parameterSchema:definition.parameters};}
  const binding=createAgenticToolBinding(tools);
  const calls=await store.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  function decode(call:typeof executionCalls.$inferSelect){
   if(call.status!=="settled"||!call.resultText)throw new ConflictError("候选调用尚未确认，不能采纳或重新提交");
   let value:unknown;try{value=JSON.parse(call.resultText);}catch{throw new ConflictError("候选调用回执损坏");}
   const receipt=call.kind==="tool"?workerToolResultReceiptSchema.parse(value):null;
   const outcome=agenticToolOutcomeSchema.parse(receipt?receipt.output:value);
   if(outcome.status!=="ok"||outcome.sideEffect!=="proposal"||outcome.error!==null)throw new ConflictError("本次调用没有可采纳的成功候选");
   const data=object(outcome.data);
   const piBinding=receipt?binding.forCall(verifiedTask,calls,call):null;
   const toolName=piBinding?.executionToolName??externalTaskToolCallSchema.parse(call.providerResult).toolName;
   const definition=frozen.tools.filter(t=>t.name===toolName),tool=tools[toolName];
   if(!proposalTools.has(toolName)||definition.length!==1||!tool||tool.version!==definition[0]!.version||tool.effect!=="proposal"||definition[0]!.effect!=="proposal"||(tool.execution??"host")!=="host"||(definition[0]!.execution??"host")!=="host"||!isDeepStrictEqual(tool.parameterSchema,definition[0]!.parameters)||canonicalJson(definition[0])!==canonicalJson(prepared.definitions.find(item=>item.name===toolName)))throw new ConflictError("候选工具或冻结参数定义已变化");
   const candidate:Candidate=toolName==='work.editor.propose'?workEditorCandidate.parse(data):workCreationProposalResult.parse(data);
   if(candidate.kind==='work.editor.candidate'&&(candidate.target.owner!=='wechat_article'||candidate.error!==null||!candidate.candidate||!candidate.apply||candidate.candidateDigest===null))throw new ConflictError('此编辑候选不是可采用的成功文章来源');
   if(candidate.kind==='work.creation.propose'&&candidate.error!==null)throw new ConflictError('此联合候选没有成功回执');
   const rawProof=object(payload.externalToolInputs)[call.id];
   const legacyJoint=call.kind==='external_tool'&&rawProof===undefined&&candidate.kind==='work.creation.propose'&&tool.version.startsWith('chat-tools-work-director-v1:');
   const input=call.kind==='tool'?z.json().parse(piBinding!.input):legacyJoint?workCreationProposalInput.parse({targetDigest:(candidate as z.infer<typeof workCreationProposalResult>).targetDigest,article:(candidate as z.infer<typeof workCreationProposalResult>).article,graphic:(candidate as z.infer<typeof workCreationProposalResult>).graphic}):externalToolInputProofSchema.parse(rawProof).input;
   if(!tool.parameters.safeParse(input).success)throw new ConflictError('候选原参数不符合冻结定义');
   if(candidate.kind==='work.editor.candidate'){
    const original=workEditorProposeInput.parse(input);
    if(candidate.target.savedBase.kind!=='artifact'||candidate.candidate?.kind!=='article'||candidate.candidateDigest!==workEditorContentDigest(candidate.candidate.document)||candidate.apply?.operation!=='createArticleVersion'||candidate.apply.outputId!==candidate.target.outputId||candidate.apply.body.expectedCurrentVersionId!==candidate.target.savedBase.versionId||!isDeepStrictEqual(candidate.apply.body.document,candidate.candidate.document))throw new ConflictError('文章候选正文与原采用摘要不符');
    if(!isDeepStrictEqual(candidate.target,verifiedHost.chatContext.editorTarget)||!isDeepStrictEqual(candidate.base,original.base)||candidate.baseDigest!==original.baseDigest||candidate.summary!==original.summary)throw new ConflictError('文章候选与原参数或目标不符');
   }else{
    const original=workCreationProposalInput.parse(input);
    if(candidate.articleDigest!==workEditorContentDigest(candidate.article).slice(7)||candidate.graphicDigest!==workEditorContentDigest(candidate.graphic).slice(7)||!isDeepStrictEqual(candidate.scriptSourceRef,candidate.target.scriptSourceRef))throw new ConflictError('联合候选正文摘要或原脚本不符');
    if(!isDeepStrictEqual(candidate.target,verifiedHost.chatContext.creationTarget)||candidate.targetDigest!==original.targetDigest||!isDeepStrictEqual(candidate.article,original.article)||!isDeepStrictEqual(candidate.graphic,original.graphic))throw new ConflictError('联合候选与原参数或目标不符');
   }
   let toolCallId:string;
   if(call.kind==="tool"){
    if(!call.toolExecutionClaimId)throw new ConflictError("候选缺少真实宿主执行领取事实");
    if(frozen.executionEngine!==undefined&&frozen.executionEngine!=="pi")throw new ConflictError("候选执行引擎不符");
    const bound=piBinding!;
    if(bound.validationOutcome||bound.executionToolName!==toolName||bound.effect!=="proposal"||bound.execution!=="host"||receipt!.toolName!==bound.toolName||receipt!.toolCallId!==bound.toolCallId||call.parentCallId!==null||!isDeepStrictEqual(bound.input,input))throw new ConflictError("候选与原模型参数不符");
    toolCallId=bound.toolCallId;
   }else if(call.kind==="external_tool"){
    const identity=externalTaskToolCallSchema.parse(call.providerResult),parent=calls.find(c=>c.id===identity.turnCallId);
    const start=externalChatStartSchema.safeParse(parent?.providerResult),settled=externalChatReceiptSchema.safeParse(parent?.providerResult),provider=start.success?start.data:settled.success?settled.data:null;
    const protocol=frozen.externalAgentBinding;
    const expectedProtocol=protocol?.protocolKind??(frozen.executionEngine==="codex"?"codex-app-server":"acp");
    if(!["codex","codebuddy"].includes(frozen.executionEngine??"")||!parent||parent.kind!=="external_agent"||parent.parentCallId!==null||!["started","settled"].includes(parent.status)||parent.inputDigest!==chatInputDigest(frozen)||call.parentCallId!==parent.id||identity.toolVersion!==tool.version||!provider||provider.engine!==frozen.executionEngine||provider.turnId!==parent.id||provider.protocolVersion!==1||(provider.protocolKind??"acp")!==expectedProtocol||(expectedProtocol==="codex-app-server"&&!provider.providerTurnId))throw new ConflictError("候选外部回合身份无效");
    requireExternalChatCallTree(verifiedTask,calls,identity.turnCallId);
    if(expectedProtocol==='codex-app-server'){const native=object(object(payload.codexCalls)[parent.id]);if(native.threadId!==provider.sessionId||!native.turnId||native.turnId!==provider.providerTurnId)throw new ConflictError('候选缺少真实Codex线程回合绑定');}
    const proof=legacyJoint?null:externalToolInputProofSchema.parse(rawProof);
    if(proof&&(proof.callId!==call.id||proof.turnCallId!==parent.id||proof.toolCallId!==identity.toolCallId||proof.toolName!==toolName||proof.toolVersion!==tool.version||proof.inputDigest!==call.inputDigest))throw new ConflictError('候选外部原参数证明不符');
    const operationKey=`external-tool:${createHash("sha256").update(JSON.stringify([identity.turnCallId,identity.toolCallId])).digest("hex")}`;
    if(call.operationKey!==operationKey||call.inputDigest!==`sha256:${chatInputDigest({turnCallId:identity.turnCallId,toolCallId:identity.toolCallId,toolName,version:tool.version,input})}`)throw new ConflictError("候选外部参数映射无效");
    toolCallId=identity.toolCallId;
   }else throw new ConflictError("该调用不是可采纳工具来源");
   return {call,receipt,outcome,candidate,input,toolName,toolCallId};
  }
  const requestedCall=calls.find(c=>c.id===requested.callId);
  if(!requestedCall)throw new ConflictError("本任务没有该候选调用");
  let current=decode(requestedCall);
  if(current.toolCallId!==requested.toolCallId)throw new ConflictError("候选工具调用ID不符");
  const seen=new Set<string>();
  while(current.receipt?.reusedCallId){
   if(seen.has(current.call.id))throw new ConflictError("候选重用来源循环");seen.add(current.call.id);
   const original=calls.find(c=>c.id===current.receipt!.reusedCallId);
   if(!original||original.sequence>=current.call.sequence)throw new ConflictError("候选重用来源无效");
   const prior=decode(original);
   if(prior.toolName!==current.toolName||!isDeepStrictEqual(prior.input,current.input)||!isDeepStrictEqual(prior.outcome,current.outcome))throw new ConflictError("候选重用结果与原调用不符");
   current=prior;
  }
  const identity={taskId:business.id,callId:current.call.id,toolCallId:current.toolCallId};
  const source=assistantProposalSourceSchema.parse({...identity,candidateDigest:proposalDigest(identity,current.candidate)});
  if(requested.candidateDigest!==source.candidateDigest)throw new ConflictError('候选来源或内容摘要不符');
  return {source,toolName:current.toolName,input:current.input,candidate:current.candidate,hostContext,aiTask:business,executionTask:task,call:current.call};
 }
 return {readSource,async read(ctx:RequestContext,input:{conversationId:string;sourceMessageId:string;toolCallId:string},store:Db=db){
  requireWorkspace(ctx);
  const [message]=await store.select().from(aiMessages).where(and(eq(aiMessages.id,input.sourceMessageId),eq(aiMessages.conversationId,input.conversationId)));
  const taskId=object(message?.modelMetadata).chatTaskId;
  if(!message||typeof taskId!=='string')throw new ConflictError('原消息没有真实任务来源');
  const [business]=await store.select().from(aiTasks).where(and(eq(aiTasks.id,taskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));
  if(!business?.executionTaskId)throw new ConflictError('原消息任务不属于当前范围');
  const [task]=await store.select().from(executionTasks).where(eq(executionTasks.id,business.executionTaskId));
  if(!task)throw new ConflictError('原执行任务不存在');
  const calls=await store.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  const frozen=chatWorkerInputSchema.parse(object(task.payload).modelInput);
  const tools=Object.fromEntries(frozen.tools.filter(t=>proposalTools.has(t.name)).map(t=>[t.name,{version:t.version,effect:'proposal' as const,parameters:t.name==='work.editor.propose'?workEditorProposeInput:workCreationProposalInput}]));
  const binding=createAgenticToolBinding(tools);
  const selected=calls.filter(call=>{
   if(call.kind==='external_tool'){const proof=externalTaskToolCallSchema.safeParse(call.providerResult);return proof.success&&proof.data.toolCallId===input.toolCallId&&proposalTools.has(proof.data.toolName);}
   if(call.kind==='tool'){let raw:unknown;try{raw=JSON.parse(call.resultText??'null');}catch{return false;}const receipt=workerToolResultReceiptSchema.safeParse(raw);if(!receipt.success||receipt.data.toolCallId!==input.toolCallId)return false;const bound=binding.forCall(task,calls,call);return bound.toolCallId===input.toolCallId&&proposalTools.has(bound.executionToolName);}
   return false;
  });
  if(selected.length!==1)throw new ConflictError('原工具调用来源不唯一或不存在');
  let call=selected[0]!;const seen=new Set<string>();
  while(call.kind==='tool'&&call.resultText){const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText));if(!receipt.reusedCallId)break;if(seen.has(call.id))throw new ConflictError('原候选回放循环');seen.add(call.id);const prior=calls.find(c=>c.id===receipt.reusedCallId);if(!prior||prior.sequence>=call.sequence)throw new ConflictError('原候选回放来源无效');call=prior;}
  const raw=call.resultText?JSON.parse(call.resultText):null;
  const receipt=call.kind==='tool'?workerToolResultReceiptSchema.parse(raw):null;
  const outcome=agenticToolOutcomeSchema.parse(receipt?receipt.output:raw);
  const toolCallId=call.kind==='tool'?binding.forCall(task,calls,call).toolCallId:externalTaskToolCallSchema.parse(call.providerResult).toolCallId;
  const source={taskId,callId:call.id,toolCallId,candidateDigest:proposalDigest({taskId,callId:call.id,toolCallId},outcome.data)};
  const requestedCall=selected[0]!,requestedToolCallId=requestedCall.kind==='tool'?binding.forCall(task,calls,requestedCall).toolCallId:externalTaskToolCallSchema.parse(requestedCall.providerResult).toolCallId;
  const verified=await readSource(ctx,{...source,callId:requestedCall.id,toolCallId:requestedToolCallId},store);
  return {assistantSource:verified.source,toolName:verified.toolName,candidate:verified.candidate};
 }};
}
