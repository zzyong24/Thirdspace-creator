import {workspaceFilter} from "../../workspace-scope";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { and, asc, eq, aiTasks, executionCalls, type Db } from "@creatoros/backend";
import { browserObserveInputSchema, browserActInputSchema, checkpointToolCallSchema, browserObservationSchema, agenticToolOutcomeSchema, workerToolResultReceiptSchema, workerPortInputSchemas, type AgenticToolOutcome, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { executionEvidence } from "../../schema/intelligence";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createAgenticToolBinding, type AgenticBackendTool } from "./agentic-tool-binding";
import { ConflictError } from "./execution.errors";

type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Evidence = typeof executionEvidence.$inferSelect;
type Call = typeof executionCalls.$inferSelect;
const PAGE_BYTES = 2 * 1024 * 1024;
const TASK_BYTES = 8 * 1024 * 1024;
const WINDOW_CHARS = 12000;
const readInput = z.object({url:z.string().min(1),offset:z.number().int().nonnegative().default(0),snapshotId:z.string().optional(),evidenceRef:z.string().optional()});
type Observation = z.infer<typeof workerPortInputSchemas.settleResearchRead>["observation"];
// SEMANTIC_BOUNDARY_ALLOW: 内容摘要只固定网页快照身份，不选择或解释正文。
const contentHash = (sourceUrl:string,fullText:string) => createHash("sha256").update(JSON.stringify([sourceUrl,fullText])).digest("hex");
function readReceipt(call:Call):AgenticToolOutcome {
  const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText ?? ""));
  if(receipt.toolName!=="web.read")throw new ConflictError("证据来源不是网页阅读回执");
  return agenticToolOutcomeSchema.parse(receipt.output);
}
function page(row:Evidence,offset:number):AgenticToolOutcome {
  if(offset>=row.fullText.length)throw new ConflictError("阅读位置超过快照正文范围");
  const text=row.fullText.slice(offset,offset+WINDOW_CHARS);
  const nextOffset=offset+text.length<row.fullText.length?offset+text.length:null;
  return agenticToolOutcomeSchema.parse({status:nextOffset===null?"ok":"partial",summary:`读到《${row.title}》正文 ${text.length} 字${nextOffset===null?"":"（正文尚未读完，请继续分窗读取）"}`,
    evidence:[{entityId:row.id,version:row.contentHash,sourceUrl:row.sourceUrl,title:row.title,text}],
    data:{evidenceRef:row.id,snapshotId:row.contentHash,sourceUrl:row.sourceUrl,title:row.title,text,offset,nextOffset,totalLength:row.fullText.length,truncated:nextOffset!==null},
    error:null,continuation:nextOffset===null?null:{evidenceRef:row.id,nextOffset,totalChars:row.fullText.length},sideEffect:"none"});
}
export function browserObservationEvidence(output:AgenticToolOutcome,action?:{action?:string;targetRef?:string}){
 const data=z.object({observation:browserObservationSchema,extraction:z.unknown().optional()}).parse(output.data);
 if(action?.action==="extract" && data.extraction!==undefined){
  const extraction=z.object({targetRef:z.string(),text:z.string().max(12000),totalChars:z.number().int().nonnegative(),truncated:z.boolean(),sourceUrl:z.string()}).parse(data.extraction);
  if(extraction.targetRef!==action.targetRef || extraction.sourceUrl!==data.observation.url || extraction.totalChars<extraction.text.length)throw new ConflictError("提取窗口与已执行目标或来源不符");
  if(extraction.text.trim())return {...data.observation,text:extraction.text};
 }
 return data.observation;
}
function assertOrigin(row:Evidence,call:Call|undefined,beforeSequence:number,calls:Call[]=[]){
  if(!call || call.kind!=="tool" || call.status!=="settled" || call.executionTaskId!==row.executionTaskId || call.sequence>=beforeSequence ||
    !row.fullText.trim() || row.byteLength!==Buffer.byteLength(row.fullText,"utf8") || row.contentHash!==contentHash(row.sourceUrl,row.fullText)) {
    throw new ConflictError("阅读证据缺少当前任务已确认的先前来源");
  }
  const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText ?? ""));
  if(receipt.toolName==="browser.observe" || receipt.toolName==="browser.act"){
    const output=agenticToolOutcomeSchema.parse(receipt.output);
    const data=z.object({observation:browserObservationSchema,evidenceRef:z.string(),snapshotId:z.string()}).parse(output.data);
    const matching:Array<{sessionId:string;action?:string;targetRef?:string}>=[];
    for(const model of calls.filter(item=>item.kind==="model" && item.status==="settled" && item.sequence<call.sequence && item.providerResult)){
     const provider=model.providerResult as {content?:unknown[];finishReason?:{unified?:string}};
     if(provider.finishReason?.unified!=="tool-calls")continue;
     for(const part of provider.content ?? []){const tool=checkpointToolCallSchema.safeParse(part);if(!tool.success || tool.data.toolName!==receipt.toolName || tool.data.toolCallId!==receipt.toolCallId)continue;
      const key=`tool:${createHash("sha256").update(JSON.stringify([model.id,tool.data.toolCallId])).digest("hex")}`;
      if(key!==call.operationKey)continue;
      matching.push(receipt.toolName==="browser.act"?browserActInputSchema.parse(JSON.parse(tool.data.input)):browserObserveInputSchema.parse(JSON.parse(tool.data.input)));
     }
    }
    if(matching.length!==1 || matching[0]!.sessionId!==data.observation.sessionId)throw new ConflictError("浏览器观察证据缺少唯一真实模型调用或会话不符");
    const action=matching[0]!;
    const selected=browserObservationEvidence(output,action);
    if(!["ok","partial"].includes(output.status) || output.error!==null || (receipt.toolName==="browser.observe"?output.sideEffect!=="none":!["none","committed"].includes(output.sideEffect)) || data.evidenceRef!==row.id || data.snapshotId!==row.contentHash || selected.url!==row.sourceUrl || selected.title!==row.title || selected.text!==row.fullText || !output.evidence.some(item=>item.entityId===row.id && item.version===row.contentHash && item.sourceUrl===row.sourceUrl && item.title===row.title && item.text===row.fullText))throw new ConflictError("浏览器观察回执与持久证据不符");
    return;
  }
  const output=readReceipt(call), expected=page(row,0);
  // 不接受仅伪填引用ID的回执；首窗可见正文、来源、摘要和分页须与持久快照一致。
  if(JSON.stringify(output)!==JSON.stringify(expected))throw new ConflictError("阅读回执与持久快照窗口不符");
}

/** 可在调用方已持有执行/AI行锁的事务中验证；引用只能来自生成该知识调用之前的真实阅读。 */
export async function verifyReadEvidence(tx:Transaction,taskId:string,refs:string[],beforeSequence:number):Promise<Evidence[]> {
  z.array(z.string().min(1)).min(1).max(100).parse(refs);z.number().int().positive().parse(beforeSequence);
  const rows=await tx.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,taskId));
  const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,taskId));
  return [...new Set(refs)].map(ref=>{
    const row=rows.find(item=>item.id===ref);if(!row)throw new ConflictError("阅读证据不存在或不属于当前任务");
    assertOrigin(row,calls.find(call=>call.id===row.originCallId),beforeSequence,calls);return row;
  });
}

/** 浏览器只回传观察；身份、请求URL、工具参数均由冻结模型回执恢复。全文与首窗结算共用事务。 */
export function createExecutionResearchEvidenceService(db:Db,deps:{tools:Record<string,AgenticBackendTool>;budget:Parameters<typeof createExecutionCallLedgerService>[1]["budget"];now?:()=>string}) {
  const leases=createExecutionLeaseService(db,deps), bindings=createAgenticToolBinding(deps.tools);
  const now=deps.now ?? (()=>new Date().toISOString());
  async function operate(ref:ExecutionRef,callId:string,observation?:Observation):Promise<AgenticToolOutcome> {
    return leases.withLease(ref,observation ? "settlement" : "admission",async({tx,task,context})=>{
      if(task.kind!=="ai_task" || task.ownerType!=="ai_task")throw new ConflictError("阅读任务缺少AI业务归属");
      const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context))).for("update");
      if(!business)throw new ConflictError("阅读任务的AI归属映射不符");
      const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
      const call=calls.find(row=>row.id===callId);if(!call)throw new ConflictError("阅读调用不存在");
      const bound=bindings.forCall(task,calls,call);
      if(bound.toolName!=="web.read" || bound.effect!=="none")throw new ConflictError("当前调用不是冻结的只读网页工具");
      if(call.toolExecutionClaimId)throw new ConflictError("网页工具已由Host执行者领取，不能另行结算");
      if(call.status!=="settled" && (call.status!=="started" || call.startedAttempt!==ref.attempt))throw new ConflictError("阅读调用未获当前启动许可或需独立对账");
      const rows=await tx.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,task.id));
      const existing=rows.find(row=>row.originCallId===call.id);
      if(call.status==="settled"){
        const output=readReceipt(call);
        const input=bound.validationOutcome?null:readInput.parse(bound.input);
        if(observation && input && (input.offset!==0 || input.snapshotId || input.evidenceRef))throw new ConflictError("指定快照只能回读原证据，不能重新提交网页观察");
        if(existing){
          assertOrigin(existing,call,Number.MAX_SAFE_INTEGER,calls);
          if(observation && (observation.needLogin || observation.sourceUrl!==existing.sourceUrl || observation.title!==existing.title || observation.fullText!==existing.fullText))throw new ConflictError("同源阅读调用不能改写正文");
        }
        if(output.evidence.length){
          const row=existing ?? rows.find(row=>row.id===(output.data as {evidenceRef?:string})?.evidenceRef);
          if(!row || !input || row.requestedUrl!==input.url || (!existing && row.contentHash!==input.snapshotId))throw new ConflictError("已结算阅读缺少真实快照");
          const before=existing?Number.MAX_SAFE_INTEGER:calls.find(row=>row.id===bound.modelCallId)!.sequence;
          assertOrigin(row,calls.find(candidate=>candidate.id===row.originCallId),before,calls);
          if(JSON.stringify(output)!==JSON.stringify(page(row,input.offset)))throw new ConflictError("已结算阅读窗口与快照不符");
        }
        return output;
      }
      let output:AgenticToolOutcome;
      if(bound.validationOutcome)output=bound.validationOutcome;
      else {
        const input=readInput.parse(bound.input);
        const requested=new URL(input.url);if(!["https:","http:"].includes(requested.protocol) || requested.username || requested.password)throw new ConflictError("网页请求URL不合法");
        if(observation){
          if(input.offset!==0 || input.snapshotId || input.evidenceRef)throw new ConflictError("指定快照只能回读原证据，不能重新提交网页观察");
          const bytes=Buffer.byteLength(observation.fullText,"utf8");
          if(observation.needLogin || !observation.fullText.trim() || bytes>PAGE_BYTES || rows.reduce((sum,row)=>sum+row.byteLength,0)+bytes>TASK_BYTES){
            const reason=observation.needLogin?"网页需要登录，未取得正文":!observation.fullText.trim()?"网页没有可读取正文":bytes>PAGE_BYTES?"网页正文超过2MB证据上限，未保存全文":"本任务网页证据超过8MB上限，未保存本页全文";
            output=agenticToolOutcomeSchema.parse({status:observation.needLogin?"blocked":"error",summary:reason,evidence:[],error:{code:observation.needLogin?"needs_login":"no_evidence",retryable:false,recovery:reason},continuation:null,sideEffect:"none"});
          } else {
            const source=new URL(observation.sourceUrl);if(!["https:","http:"].includes(source.protocol) || source.username || source.password)throw new ConflictError("网页最终来源URL不合法");
            const row:Evidence={metadata:{},id:`evidence_${randomUUID()}`,executionTaskId:task.id,originCallId:call.id,requestedUrl:input.url,sourceUrl:observation.sourceUrl,title:observation.title,fullText:observation.fullText,contentHash:contentHash(observation.sourceUrl,observation.fullText),byteLength:bytes,createdAt:now()};
            await tx.insert(executionEvidence).values(row);output=page(row,0);
          }
        } else {
          if(!input.snapshotId)throw new ConflictError("续读需要首窗快照和下一页位置");
          const matches=rows.filter(row=>row.contentHash===input.snapshotId && row.requestedUrl===input.url && (!input.evidenceRef || input.evidenceRef===row.id));
          if(matches.length!==1)throw new ConflictError("阅读快照缺失、来源或hash不符");
          const row=matches[0]!, model=calls.find(candidate=>candidate.id===bound.modelCallId)!;
          assertOrigin(row,calls.find(candidate=>candidate.id===row.originCallId),model.sequence,calls);
          const prior=calls.some(candidate=>{
            if(candidate.status!=="settled" || candidate.kind!=="tool" || candidate.sequence>=model.sequence)return false;
            try{const receipt=readReceipt(candidate);return receipt.continuation?.evidenceRef===row.id && receipt.continuation.nextOffset===input.offset && JSON.stringify(receipt)===JSON.stringify(page(row,(receipt.data as {offset:number}).offset));}catch{return false;}
          });
          if(input.offset!==0 && !prior)throw new ConflictError("续读位置没有先前已确认的阅读窗口来源");
          output=page(row,input.offset);
        }
      }
      // Drizzle事务通过savepoint嵌套；快照插入与原账本状态规则在同一外层事务提交或回滚。
      await createExecutionCallLedgerService(tx as unknown as Db,deps).settle(ref,call.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify(workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId:bound.toolCallId,toolName:bound.toolName,output}))},current=>{
        if(current.status!=="started" || current.startedAttempt!==ref.attempt || current.toolExecutionClaimId)throw new ConflictError("阅读调用状态在结算时改变");
      });
      return output;
    });
  }
  return {
    settleRead(ref:ExecutionRef,raw:unknown){const request=workerPortInputSchemas.settleResearchRead.parse(raw);return operate(ref,request.callId,request.observation);},
    readWindow(ref:ExecutionRef,raw:unknown){return operate(ref,workerPortInputSchemas.executeEvidenceRead.parse(raw).callId);},
  };
}
