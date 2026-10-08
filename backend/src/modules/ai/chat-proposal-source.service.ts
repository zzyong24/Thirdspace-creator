import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {z} from "zod";
import {and,asc,eq,aiTasks,executionTasks,executionCalls,type Db} from "@creatoros/backend";
import {assistantProposalSourceSchema,type AssistantProposalSource,type RequestContext} from "@creatoros/contract";
import {agenticToolOutcomeSchema,chatWorkerInputSchema,externalTaskToolCallSchema,externalChatStartSchema,externalChatReceiptSchema,workerToolResultReceiptSchema} from "@creatoros/contract/execution-worker";
import {workspaceFilter,requireWorkspace} from "../../workspace-scope";
import {createAgenticToolBinding,type AgenticBackendTool} from "../execution/agentic-tool-binding";
import {ConflictError} from "../execution/execution.errors";
import {readChatTurnSnapshot,chatInputDigest,chatHistoryDigest} from "./chat-turn-submission.service";
import {readChatHostContextPair} from "./chat-host-context";
import {canonicalJson} from "./canonical-json";

type Tool=AgenticBackendTool & {parameterSchema:Record<string,unknown>};
type Candidate={schemaVersion:1;kind:string;request:z.infer<ReturnType<typeof z.json>>};
type SourceIdentity=Pick<AssistantProposalSource,"taskId"|"callId"|"toolCallId">;
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const proposalTools=new Set(["system.action.propose","canvas.create.propose","canvas.generate.propose"]);
// SEMANTIC_BOUNDARY_ALLOW:仅核对来源与候选字节的身份，不选择内容或动作。
const proposalDigest=(source:SourceIdentity,candidate:unknown)=>`sha256:${createHash("sha256").update(canonicalJson({source,candidate})).digest("hex")}`;
/** 由真实 execution scope 调用；模型参数没有来源字段。 */
export function sealChatProposal<T extends Candidate>(identity:SourceIdentity,candidate:T):T & {source:AssistantProposalSource}{
 const checked=z.json().parse(candidate);
 if(Object.hasOwn(object(checked),"source"))throw new ConflictError("候选来源只能由宿主提供");
 const source=assistantProposalSourceSchema.parse({...identity,candidateDigest:proposalDigest(identity,checked)});
 return {...candidate,source};
}

/** 人的采纳读取已结算账本，不伪造活跃租约，不从聊天文字恢复证明。 */
export function createChatProposalSourceService(db:Db,deps:{tools:Record<string,Tool>;parseCandidate:(toolName:string,value:unknown)=>Candidate}){
 const binding=createAgenticToolBinding(deps.tools);
 return {async read(ctx:RequestContext,raw:unknown,store:Db=db){
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
  const calls=await store.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  function decode(call:typeof executionCalls.$inferSelect){
   if(call.status!=="settled"||!call.resultText)throw new ConflictError("候选调用尚未确认，不能采纳或重新提交");
   let value:unknown;try{value=JSON.parse(call.resultText);}catch{throw new ConflictError("候选调用回执损坏");}
   const receipt=call.kind==="tool"?workerToolResultReceiptSchema.parse(value):null;
   const outcome=agenticToolOutcomeSchema.parse(receipt?receipt.output:value);
   if(outcome.status!=="ok"||outcome.sideEffect!=="proposal"||outcome.error!==null)throw new ConflictError("本次调用没有可采纳的成功候选");
   const data=object(outcome.data),source=assistantProposalSourceSchema.parse(data.source),{source:_,...unsigned}=data;
   const piBinding=receipt?binding.forCall(verifiedTask,calls,call):null;
   const toolName=piBinding?.executionToolName??externalTaskToolCallSchema.parse(call.providerResult).toolName;
   const definition=frozen.tools.filter(t=>t.name===toolName),tool=deps.tools[toolName];
   if(!proposalTools.has(toolName)||definition.length!==1||!tool||tool.version!==definition[0]!.version||tool.effect!=="proposal"||definition[0]!.effect!=="proposal"||(tool.execution??"host")!=="host"||(definition[0]!.execution??"host")!=="host"||!isDeepStrictEqual(tool.parameterSchema,definition[0]!.parameters))throw new ConflictError("候选工具或冻结参数定义已变化");
   const candidate=deps.parseCandidate(toolName,unsigned),parsed=tool.parameters.safeParse(candidate.request);
   if(!parsed.success)throw new ConflictError("候选原参数不符合冻结定义");
   const input=z.json().parse(parsed.data);
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
    const operationKey=`external-tool:${createHash("sha256").update(JSON.stringify([identity.turnCallId,identity.toolCallId])).digest("hex")}`;
    if(call.operationKey!==operationKey||call.inputDigest!==`sha256:${chatInputDigest({turnCallId:identity.turnCallId,toolCallId:identity.toolCallId,toolName,version:tool.version,input})}`)throw new ConflictError("候选外部参数映射无效");
    toolCallId=identity.toolCallId;
   }else throw new ConflictError("该调用不是可采纳工具来源");
   return {call,receipt,outcome,source,candidate,input,toolName,toolCallId};
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
  if(current.source.taskId!==identity.taskId||current.source.callId!==identity.callId||current.source.toolCallId!==identity.toolCallId||current.source.candidateDigest!==proposalDigest(identity,current.candidate)||requested.candidateDigest!==current.source.candidateDigest)throw new ConflictError("候选来源或内容摘要不符");
  return {source:current.source,toolName:current.toolName,input:current.input,candidate:current.candidate,hostContext,aiTask:business,executionTask:task,call:current.call};
 }};
}
