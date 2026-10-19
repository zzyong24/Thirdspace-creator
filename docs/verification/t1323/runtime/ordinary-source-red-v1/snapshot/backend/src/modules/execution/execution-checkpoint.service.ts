import {executionEvidence} from "../../schema/intelligence";
import {recoverableChatNodeParents,recoverableCodexStructuredParents,recoverableCodexTextParents} from "./chat-generation-recovery";
import { partitionExecutionCalls } from "./execution-call-tree";
import { createHash } from "node:crypto";
import {isAssistantEngineToolAllowed} from "@creatoros/contract";
import { asc, eq, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import {
  chatProviderNonTextSchema, executionCheckpointSchema, saveExecutionCheckpointSchema, checkpointToolCallSchema,
  workerToolResultReceiptSchema, type ExecutionRef,
  chatWorkerInputSchema, chatModelReplayFingerprintsSchema,
  externalChatStartSchema,externalChatReceiptSchema,externalTaskToolCallSchema,
  externalToolInputProofSchema,agenticToolOutcomeSchema,
} from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";
import { isAcknowledgableResearchBlock } from "./execution-research-blocked";
import {requireExternalChatCallTree} from "../ai/external-chat-call-tree";
import {chatInputDigest} from "../ai/chat-turn-submission.service";
import {agenticToolOperationKey} from "./agentic-tool-binding";
import {originalCodexReadBinding} from "./codex-read-recovery";

type Call = typeof executionCalls.$inferSelect;
type MessageRef = {role:"assistant"|"tool";callId:string};
type Task = typeof executionTasks.$inferSelect;
const object=(raw:unknown):Record<string,unknown>=>raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
const hasReceipt = (call:Call) => call.status === "settled" && (call.resultText !== null || call.providerResult !== null);
/** SEMANTIC_BOUNDARY_ALLOW: 仅核原native身份/参数证明/账本关系；验证全树后分配检查点角色，不执行或投影工具。 */
function checkpointCalls(task:Task,calls:Call[]) {
  const payload=object(task.payload),chat=chatWorkerInputSchema.safeParse(payload.modelInput);
  if(!calls.length||!chat.success||chat.data.executionEngine!=="codex"||chat.data.externalAgentBinding) {
    return {...partitionExecutionCalls(calls),native:false};
  }
  const frozen=chat.data;
  if(task.ownerType!=="ai_task"||payload.aiTaskId!==task.ownerId||frozen.userId!==task.userId||
      frozen.accountId!==task.accountId||(frozen.groupId??null)!==(task.groupId??null))throw new ConflictError("原生检查点冻结任务归属不符");
  const roots=calls.filter(call=>call.kind==="external_agent");
  if(roots.length!==1)throw new ConflictError("原生检查点缺少唯一外部根");
  const root=requireExternalChatCallTree(task,calls,roots[0]!.id);
  const native=object(object(payload.codexCalls)[root.id]);
  const source=(root.status==="settled"?externalChatReceiptSchema:externalChatStartSchema).safeParse(root.providerResult);
  if(root.sequence!==1||root.operationKey!==`${frozen.operationKey}/external-turn/1`||root.inputDigest!==chatInputDigest(frozen)||
      !source.success||source.data.engine!=="codex"||source.data.turnId!==root.id||source.data.protocolKind!=="codex-app-server"||
      source.data.protocolVersion!==1||!source.data.providerTurnId||source.data.sessionId!==native.threadId||source.data.providerTurnId!==native.turnId||
      (!["started","unknown","settled"].includes(root.status))||
      (root.status!=="settled"&&!originalCodexReadBinding(task,root)))throw new ConflictError("原生检查点缺少原线程只读恢复证明");
  const toolIds=new Set<string>();
  for(const call of calls) {
    if(call.executionTaskId!==task.id)throw new ConflictError("原生检查点调用跨任务");
    if(call===root)continue;
    if(call.kind==="external_tool") {
      const identity=externalTaskToolCallSchema.safeParse(call.providerResult);
      const proof=externalToolInputProofSchema.safeParse(object(payload.externalToolInputs)[call.id]);
      if(!identity.success||!proof.success)throw new ConflictError("原生检查点Host参数证明缺失");
      const id=identity.data,p=proof.data,definitions=frozen.tools.filter(def=>def.name===id.toolName),definition=definitions[0];
      if(definitions.length!==1||!definition||!["none","proposal"].includes(definition.effect)||(definition.execution??"host")!=="host"||
          definition.version!==id.toolVersion||p.toolVersion!==definition.version||p.callId!==call.id||p.turnCallId!==root.id||
          p.toolCallId!==id.toolCallId||p.toolName!==id.toolName||p.inputDigest!==call.inputDigest||id.turnCallId!==root.id||
          !isAssistantEngineToolAllowed("codex",definition,frozen.workbenchCapabilities?.find(item=>item.name===definition.name))||
          definition.name==="plan.update"||frozen.workbenchCapabilities?.some(item=>item.name===definition.name))throw new ConflictError("原生检查点Host冻结定义或参数证明不符");
      const digest=`sha256:${chatInputDigest({turnCallId:root.id,toolCallId:id.toolCallId,toolName:id.toolName,version:definition.version,input:p.input})}`;
      const key=`external-tool:${createHash("sha256").update(JSON.stringify([root.id,id.toolCallId])).digest("hex")}`;
      if(call.parentCallId!==root.id||call.sequence<=root.sequence||call.inputDigest!==digest||call.operationKey!==key||
          call.accountingBasis!=="requests"||!["started","unknown","settled"].includes(call.status))throw new ConflictError("原生检查点Host摘要或调用键不符");
      if(call.status==="settled") {
        let receipt:unknown;try{receipt=JSON.parse(call.resultText??"");}catch{throw new ConflictError("原生检查点Host回执不完整");}
        const outcome=agenticToolOutcomeSchema.safeParse(receipt);
        if(!outcome.success||!["none","proposal"].includes(outcome.data.sideEffect)||
            (definition.effect==="none"&&outcome.data.sideEffect!=="none"))throw new ConflictError("原生检查点Host回执效果不符");
      }
      if(toolIds.has(id.toolCallId))throw new ConflictError("原生检查点工具调用ID重复");
      toolIds.add(id.toolCallId);
    }else if(call.kind==="tool") {
      const parts=Object.values(object(native.tools)).map(raw=>checkpointToolCallSchema.safeParse({type:"tool-call",...object(raw)}))
        .filter(part=>part.success&&agenticToolOperationKey(root.id,part.data.toolCallId)===call.operationKey);
      if(parts.length!==1||!parts[0]!.success)throw new ConflictError("原生检查点普通工具来源不唯一");
      const part=parts[0]!.data;
      if(toolIds.has(part.toolCallId))throw new ConflictError("原生检查点工具调用ID重复");
      toolIds.add(part.toolCallId);
      if(call.status==="settled") {
        let receipt:unknown;try{receipt=JSON.parse(call.resultText??"");}catch{throw new ConflictError("原生检查点普通工具回执不完整");}
        const parsed=workerToolResultReceiptSchema.safeParse(receipt);
        if(!parsed.success||parsed.data.toolCallId!==part.toolCallId||parsed.data.toolName!==part.toolName)throw new ConflictError("原生检查点普通工具回执来源不符");
      }
    }
  }
  // Host 已逐行严格验证；原通用规则仍完整校验普通tool/model子树，未把未知kind藏在过滤器后。
  const partition=partitionExecutionCalls(calls.filter(call=>call.kind!=="external_tool"));
  return {roots:partition.roots,children:calls.filter(call=>call.parentCallId!==null),native:true};
}
function parseCheckpoint(raw:unknown) {
  if (raw === null) return null;
  const parsed = executionCheckpointSchema.safeParse(raw);
  if (!parsed.success) throw new ConflictError("历史检查点格式不兼容，须先对账");
  return parsed.data;
}
function modelToolCalls(call:Call,piChat=false) {
  if (!call.providerResult) return [];
  const provider=call.providerResult as {content?:unknown[];finishReason?:{unified?:string}};
  if (!Array.isArray(provider.content)) throw new ConflictError("模型回执缺少规范内容");
  const tools=[];
  for (const part of provider.content) {
    if (!part || typeof part!=="object" || !("type" in part)) throw new ConflictError("模型回执内容格式不完整");
    if (part.type==="tool-call") {
      const parsed=checkpointToolCallSchema.safeParse(part);
      if (!parsed.success) throw new ConflictError("模型工具调用回执不完整");
      tools.push(parsed.data);
    } else if (!chatProviderNonTextSchema.safeParse(part).success && ((part.type!=="text" && part.type!=="reasoning") || !("text" in part) || typeof part.text!=="string")) {
      throw new ConflictError("模型回执存在尚不能恢复的内容类型");
    }
  }
  // Pi 聊天截断提案仍是真实已结算事实；宿主工具绑定只允许结算无副作用错误。
  const truncated=piChat && !call.parentCallId && provider.finishReason?.unified==="length";
  if ((provider.finishReason?.unified==="tool-calls") !== (tools.length>0) && !(truncated && tools.length>0)) throw new ConflictError("模型结束原因与工具调用回执不一致");
  return tools;
}
export function reconstructCheckpointMessages(refs:MessageRef[], calls:Call[],piChat=false,task?:Task) {
  const {roots,native}=task?checkpointCalls(task,calls):{...partitionExecutionCalls(calls),native:false};
  if(native&&refs.length)throw new ConflictError("原生聊天检查点不能合成消息引用");
  const confirmed = roots.filter(hasReceipt);
  const pendingTools = new Map<string,string>();
  const seenTools = new Set<string>();
  const messages = refs.map((ref,index) => {
    const call = confirmed[index];
    // 只保存按调用次序排列的已确认前缀，不能跳过、重排或重复事实。
    if (!call || call.id !== ref.callId || (ref.role === "assistant" ? call.kind !== "model" : call.kind !== "tool")) {
      throw new ConflictError("检查点消息不匹配当前任务的已确认调用顺序");
    }
    if (roots.some(previous=>previous.sequence<call.sequence && !["rejected","superseded"].includes(previous.status) && !hasReceipt(previous))) {
      throw new ConflictError("不能越过较早的未确定调用保存消息");
    }
    if (ref.role === "assistant") {
      if (pendingTools.size) throw new ConflictError("前一模型回合尚有工具未完成");
      for (const tool of modelToolCalls(call,piChat)) {
        if (seenTools.has(tool.toolCallId)) throw new ConflictError("模型工具调用回执重复");
        seenTools.add(tool.toolCallId);
        pendingTools.set(tool.toolCallId,tool.toolName);
      }
    } else {
      let raw:unknown;
      try {raw=JSON.parse(call.resultText ?? "");} catch {throw new ConflictError("工具回执缺少规范调用关联");}
      const parsed=workerToolResultReceiptSchema.safeParse(raw);
      if (!parsed.success || pendingTools.get(parsed.data.toolCallId) !== parsed.data.toolName) {
        throw new ConflictError("工具回执没有对应的模型调用");
      }
      pendingTools.delete(parsed.data.toolCallId);
    }
    return {...ref,resultText:call.resultText,providerResult:call.providerResult};
  });
  return {messages,unresolvedToolCalls:[...pendingTools].map(([toolCallId,toolName])=>({toolCallId,toolName}))};
}

/** 检查点仅保存有序回执引用。预算、在途调用与结果始终从后端账本重新读取。 */
export function createExecutionCheckpointService(db:Db,deps:{now?:()=>string}={}) {
  const now=deps.now ?? (()=>new Date().toISOString());
  const leases=createExecutionLeaseService(db,{now});
  return {
    async save(ref:ExecutionRef,raw:unknown) {
      const input=saveExecutionCheckpointSchema.parse(raw);
      const digest=createHash("sha256").update(JSON.stringify(input)).digest("hex");
      return leases.withLease(ref,"admission",async({tx,task})=>{
        if(task.kind!=="ai_task")throw new ConflictError("当前任务不支持 Agent 检查点");
        const previous=parseCheckpoint(task.checkpoint);
        // 仅最新检查点的同请求可返回原保存回执，永不回滚后续 revision。
        if(previous?.expectedRevision===input.expectedRevision && previous.requestDigest===digest)return {revision:previous.revision};
        if((previous?.revision ?? 0)!==input.expectedRevision)throw new ConflictError("检查点版本已改变");
        const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
        const sequence=calls.at(-1)?.sequence ?? 0;
        if(input.expectedLedgerSequence!==sequence)throw new ConflictError("调用账本已改变，须重新读取");
        if(previous && (input.messages.length<previous.messages.length || previous.messages.some((message,index)=>message.callId!==input.messages[index]?.callId || message.role!==input.messages[index]?.role))) {
          throw new ConflictError("已保存消息不能删除或改写");
        }
        const chat=chatWorkerInputSchema.safeParse((task.payload as {modelInput?:unknown})?.modelInput);
        reconstructCheckpointMessages(input.messages,calls,chat.success && chat.data.executionEngine==="pi",task);
        const checkpoint=executionCheckpointSchema.parse({schemaVersion:1,revision:input.expectedRevision+1,expectedRevision:input.expectedRevision,requestDigest:digest,ledgerSequence:sequence,messages:input.messages});
        await tx.update(executionTasks).set({checkpoint,updatedAt:now()}).where(eq(executionTasks.id,task.id));
        return {revision:checkpoint.revision};
      });
    },
    async read(ref:ExecutionRef) {
      return leases.withLease(ref,"admission",async({tx,task})=>{
        if(task.kind!=="ai_task")throw new ConflictError("当前任务不支持 Agent 检查点");
        const checkpoint=parseCheckpoint(task.checkpoint);
        const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
        const {roots,children}=checkpointCalls(task,calls);
        const chat=chatWorkerInputSchema.safeParse((task.payload as {modelInput?:unknown})?.modelInput);
        const piChat=chat.success && chat.data.executionEngine==="pi";
        const reconstructed=reconstructCheckpointMessages(checkpoint?.messages ?? [],calls,piChat,task);
        // 每个操作键只暴露最新根模型调用；该查询已受当前任务账号及租约约束。
        const latestModels=new Map(roots.filter(call=>call.kind==="model").map(call=>[call.operationKey,call]));
        const modelReplayFingerprints=chatModelReplayFingerprintsSchema.parse(piChat?[...latestModels.values()]
          .filter(call=>call.status==="settled" || call.status==="reserved")
          .map(call=>({callId:call.id,operationKey:call.operationKey,inputDigest:call.inputDigest,status:call.status})):[]);
        const acknowledged=(task.payload as {researchBlockedAcknowledgedCallIds?:unknown} | null)?.researchBlockedAcknowledgedCallIds;
        const acknowledgedIds=new Set(Array.isArray(acknowledged)?acknowledged.filter((id):id is string=>typeof id==="string"):[]);
        const acknowledgedBlockedCallIds=calls.filter(call=>acknowledgedIds.has(call.id) && isAcknowledgableResearchBlock(call)).map(call=>call.id);
        const confirmedIds=new Set(reconstructed.messages.map(message=>message.callId));
        const pendingCalls=calls.filter(call=>["reserved","started","unknown"].includes(call.status)).map(call=>({callId:call.id,operationKey:call.operationKey,status:call.status,startedAttempt:call.startedAttempt,kind:call.kind}));
        const uncheckpointedReceipts=roots.filter(call=>hasReceipt(call) && !confirmedIds.has(call.id)).map(call=>({callId:call.id,kind:call.kind,sequence:call.sequence,resultText:call.resultText,providerResult:call.providerResult}));
        const childCalls=children.map(call=>({callId:call.id,parentCallId:call.parentCallId!,operationKey:call.operationKey,sequence:call.sequence,status:call.status,startedAttempt:call.startedAttempt,providerResult:call.providerResult,rejectionCode:call.rejectionCode}));
        const unknownUsage=calls.some(call=>call.status==="unknown" || (call.status==="settled" && call.totalTokens===null));
        const incompleteReceipt=calls.some(call=>{
          if(call.status!=="settled")return false;
          if(!hasReceipt(call))return true;
          if(call.kind==="model")try {modelToolCalls(call,piChat);}catch {return true;}
          return false;
        });
        const knownSpentTokens=calls.reduce((sum,call)=>sum+(call.totalTokens ?? 0),0);
        // 仅宿主已记录的子模型拒绝可进入专用恢复门；不能据 Worker 自报忽略在途调用。
        const recoverable=recoverableChatNodeParents(task,calls,await tx.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,task.id)));
        const replayableScriptDraftToolCallIds=[...new Set([...recoverable.scriptDrafts,...recoverableCodexTextParents(task,calls,'script-draft')])];
        const resumableToolCallIds=[...new Set([...recoverable.resumableHooks,...recoverableCodexTextParents(task,calls,'hooks')])],completableToolCallIds=recoverable.completedHooks,replayableGenerationToolCallIds=[...new Set([...recoverable.structured,...recoverableCodexStructuredParents(task,calls)])],replayableWebReadToolCallIds=recoverable.webReads;
        const recovery=unknownUsage || incompleteReceipt || pendingCalls.some(call=>call.status!=="reserved" && !resumableToolCallIds.includes(call.callId) && !completableToolCallIds.includes(call.callId) && !replayableGenerationToolCallIds.includes(call.callId) && !replayableWebReadToolCallIds.includes(call.callId) && !replayableScriptDraftToolCallIds.includes(call.callId)) ? "requires_reconciliation"
          : uncheckpointedReceipts.length ? "requires_replay"
          : pendingCalls.length || reconstructed.unresolvedToolCalls.length ? "pending" : "ready";
        return {schemaVersion:1 as const,revision:checkpoint?.revision ?? 0,ledgerSequence:calls.at(-1)?.sequence ?? 0,
          ...reconstructed,modelReplayFingerprints,replayableScriptDraftToolCallIds,replayableWebReadToolCallIds,replayableGenerationToolCallIds,completableToolCallIds,resumableToolCallIds,pendingCalls,uncheckpointedReceipts,childCalls,recovery,acknowledgedBlockedCallIds,budget:task.executionBudget,deadlineAt:task.deadlineAt,
          knownSpentTokens,spentTokens:unknownUsage?null:knownSpentTokens,
          reservedTokens:calls.reduce((sum,call)=>sum+(call.status==="rejected" || call.totalTokens!==null?0:call.reservedTokens),0)};
      });
    },
  };
}
