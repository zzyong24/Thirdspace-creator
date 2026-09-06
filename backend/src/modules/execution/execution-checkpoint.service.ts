import {executionEvidence} from "../../schema/intelligence";
import {recoverableChatNodeParents} from "./chat-generation-recovery";
import { partitionExecutionCalls } from "./execution-call-tree";
import { createHash } from "node:crypto";
import { asc, eq, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import {
  chatProviderNonTextSchema, executionCheckpointSchema, saveExecutionCheckpointSchema, checkpointToolCallSchema,
  workerToolResultReceiptSchema, type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";
import { isAcknowledgableResearchBlock } from "./execution-research-blocked";

type Call = typeof executionCalls.$inferSelect;
type MessageRef = {role:"assistant"|"tool";callId:string};
const hasReceipt = (call:Call) => call.status === "settled" && (call.resultText !== null || call.providerResult !== null);
function parseCheckpoint(raw:unknown) {
  if (raw === null) return null;
  const parsed = executionCheckpointSchema.safeParse(raw);
  if (!parsed.success) throw new ConflictError("历史检查点格式不兼容，须先对账");
  return parsed.data;
}
function modelToolCalls(call:Call) {
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
  if ((provider.finishReason?.unified==="tool-calls") !== (tools.length>0)) throw new ConflictError("模型结束原因与工具调用回执不一致");
  return tools;
}
function reconstruct(refs:MessageRef[], calls:Call[]) {
  const {roots} = partitionExecutionCalls(calls);
  const confirmed = roots.filter(hasReceipt);
  const pendingTools = new Map<string,string>();
  const seenTools = new Set<string>();
  const messages = refs.map((ref,index) => {
    const call = confirmed[index];
    // 只保存按调用次序排列的已确认前缀，不能跳过、重排或重复事实。
    if (!call || call.id !== ref.callId || (ref.role === "assistant" ? call.kind !== "model" : call.kind !== "tool")) {
      throw new ConflictError("检查点消息不匹配当前任务的已确认调用顺序");
    }
    if (roots.some(previous=>previous.sequence<call.sequence && previous.status!=="rejected" && !hasReceipt(previous))) {
      throw new ConflictError("不能越过较早的未确定调用保存消息");
    }
    if (ref.role === "assistant") {
      if (pendingTools.size) throw new ConflictError("前一模型回合尚有工具未完成");
      for (const tool of modelToolCalls(call)) {
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
        reconstruct(input.messages,calls);
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
        const {roots,children}=partitionExecutionCalls(calls);
        const reconstructed=reconstruct(checkpoint?.messages ?? [],calls);
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
          if(call.kind==="model")try {modelToolCalls(call);}catch {return true;}
          return false;
        });
        const knownSpentTokens=calls.reduce((sum,call)=>sum+(call.totalTokens ?? 0),0);
        // 仅宿主已记录的子模型拒绝可进入专用恢复门；不能据 Worker 自报忽略在途调用。
        const recoverable=recoverableChatNodeParents(task,calls,await tx.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,task.id)));
        const resumableToolCallIds=recoverable.resumableHooks,completableToolCallIds=recoverable.completedHooks,replayableGenerationToolCallIds=recoverable.structured,replayableWebReadToolCallIds=recoverable.webReads;
        const recovery=unknownUsage || incompleteReceipt || pendingCalls.some(call=>call.status!=="reserved" && !resumableToolCallIds.includes(call.callId) && !completableToolCallIds.includes(call.callId) && !replayableGenerationToolCallIds.includes(call.callId) && !replayableWebReadToolCallIds.includes(call.callId)) ? "requires_reconciliation"
          : uncheckpointedReceipts.length ? "requires_replay"
          : pendingCalls.length || reconstructed.unresolvedToolCalls.length ? "pending" : "ready";
        return {schemaVersion:1 as const,revision:checkpoint?.revision ?? 0,ledgerSequence:calls.at(-1)?.sequence ?? 0,
          ...reconstructed,replayableWebReadToolCallIds,replayableGenerationToolCallIds,completableToolCallIds,resumableToolCallIds,pendingCalls,uncheckpointedReceipts,childCalls,recovery,acknowledgedBlockedCallIds,budget:task.executionBudget,deadlineAt:task.deadlineAt,
          knownSpentTokens,spentTokens:unknownUsage?null:knownSpentTokens,
          reservedTokens:calls.reduce((sum,call)=>sum+(call.status==="rejected" || call.totalTokens!==null?0:call.reservedTokens),0)};
      });
    },
  };
}
