import {and,asc,eq,gte,inArray,isNull,sql,aiTasks,executionCalls,executionTasks,type Db} from "@creatoros/backend";
import {workbenchCapabilitySchema} from "@creatoros/contract/agent-workbench";
import {z} from "zod";
import type {RequestContext} from "@creatoros/contract";
import {agenticToolOperationKey} from "./agentic-tool-binding";
import {createPersistentTaskService} from "./persistent-task.service";
import {createWorkbenchPlanService} from "./workbench-plan.service";
import {chatWorkerInputSchema} from "@creatoros/contract/execution-worker";
import {workspaceFilter} from "../../workspace-scope";
import {chatInputDigest,chatHistoryDigest,readChatTurnSnapshot} from "../ai/chat-turn-submission.service";
import {ConflictError} from "./execution.errors";
import {summarizeModelReceipt} from "./model-call-summary";
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};

/** 只投影当前账号的计划与调用回执，不输出模型输入、供应商配置或租约凭据。 */
export function createWorkbenchPublicService(db:Db){
  const tasks=createPersistentTaskService(db),plans=createWorkbenchPlanService(db);
  return {
   async modelCallSummary(ctx:RequestContext,taskId:string,input:{afterSequence:number;limit:number}){
    await tasks.get(ctx,taskId);
    const [task]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,taskId),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx)));
    const [business]=task?await db.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx))):[];
    const payload=object(task?.payload),frozen=chatWorkerInputSchema.safeParse(payload.modelInput),source=object(business?.inputData);
    if(!task||task.kind!=="ai_task"||task.ownerType!=="ai_task"||!business||business.taskType!=="copilot.assist"||payload.aiTaskId!==business.id||source.kind!=="chat.run"||!frozen.success||frozen.data.userId!==task.userId||frozen.data.accountId!==task.accountId||(frozen.data.groupId??null)!==task.groupId||business.accountId!==task.accountId||business.groupId!==task.groupId||source.conversationId!==frozen.data.conversationId||source.sourceMessageId!==frozen.data.sourceMessageId||source.modelInputDigest!==chatInputDigest(frozen.data))throw new ConflictError("模型摘要来源映射无效");
    const frozenCtx={...ctx,userId:task.userId,accountId:task.accountId,groupId:task.groupId};
    const snapshot=await readChatTurnSnapshot(db,frozenCtx,{conversationId:frozen.data.conversationId,sourceMessageId:frozen.data.sourceMessageId});
    if(business.projectId!==snapshot.conversation.projectId||object(snapshot.sourceMessage.modelMetadata).chatTaskId!==business.id||source.historyDigest!==chatHistoryDigest(snapshot)||JSON.stringify(source.historyMessageIds)!==JSON.stringify(snapshot.messages.map(message=>message.id)))throw new ConflictError("模型摘要历史映射已变化");
    const rows=await db.select({id:executionCalls.id,sequence:executionCalls.sequence,providerResult:executionCalls.providerResult}).from(executionCalls).where(and(eq(executionCalls.executionTaskId,task.id),eq(executionCalls.kind,"model"),isNull(executionCalls.parentCallId),eq(executionCalls.status,"settled"),gte(executionCalls.sequence,input.afterSequence+1))).orderBy(asc(executionCalls.sequence)).limit(input.limit+1);
    const calls=rows.slice(0,input.limit).map(row=>({callId:row.id,sequence:row.sequence,...summarizeModelReceipt(row.providerResult)}));
    return {taskId:task.id,aiTaskId:business.id,conversationId:snapshot.conversation.id,sourceMessageId:snapshot.sourceMessage.id,calls,nextSequence:calls.at(-1)?.sequence??input.afterSequence,hasMore:rows.length>input.limit};
   },
   async inspect(ctx:RequestContext,taskId:string,input:{afterSequence:number;limit:number}){
    const task=await tasks.get(ctx,taskId);
    const plan=await plans.read(ctx,taskId);
    const [frozen]=await db.select({conversationId:sql<string|null>`${executionTasks.payload}->'modelInput'->>'conversationId'`,sourceMessageId:sql<string|null>`${executionTasks.payload}->'modelInput'->>'sourceMessageId'`,capabilities:sql<unknown>`${executionTasks.payload}->'modelInput'->'workbenchCapabilities'`,tools:sql<unknown>`${executionTasks.payload}->'modelInput'->'tools'`}).from(executionTasks).where(and(eq(executionTasks.id,task.id),eq(executionTasks.userId,ctx.userId),eq(executionTasks.accountId,ctx.accountId!)));
    const frozenCapabilities=z.array(workbenchCapabilitySchema).parse(frozen?.capabilities??[]);
    const frozenTools=z.array(z.object({name:z.string(),version:z.string(),effect:z.string().optional(),execution:z.string().optional()})).parse(frozen?.tools??[]).map(t=>({...t,effect:t.effect??null,execution:t.execution??null}));
    const c=executionCalls;
    const rows=await db.select({id:c.id,sequence:c.sequence,kind:c.kind,finishReason:sql<string|null>`${c.providerResult}->'finishReason'->>'unified'`,operationKey:c.operationKey,parentCallId:c.parentCallId,retryOfCallId:c.retryOfCallId,
      status:c.status,startedAttempt:c.startedAttempt,totalTokens:c.totalTokens,rejectionCode:c.rejectionCode,resultRef:c.resultRef,
      resultText:sql<string|null>`case when ${c.kind} = 'tool' then left(${c.resultText}, 16000) else null end`,
      resultTruncated:sql<boolean>`coalesce(${c.kind} = 'tool' and length(${c.resultText}) > 16000, false)`,
      createdAt:c.createdAt,updatedAt:c.updatedAt,
    }).from(c).where(and(eq(c.executionTaskId,task.id),gte(c.sequence,input.afterSequence+1))).orderBy(asc(c.sequence)).limit(input.limit+1);
    // 先取轻量来源身份；完整有界参数只读取当前页模型和当前页工具的来源模型。
    // operationKey 为历史兼容摘要，因此不能从 key 反推 model ID。
    const identities=await db.select({id:c.id,toolIds:sql<Array<unknown>>`(select coalesce(jsonb_agg(part->'toolCallId'), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(${c.providerResult}->'content')='array' then ${c.providerResult}->'content' else '[]'::jsonb end) part where part->>'type'='tool-call')`}).from(c).where(and(eq(c.executionTaskId,task.id),eq(c.kind,"model")));
    const page=rows.slice(0,input.limit),keys=new Set(page.filter(row=>row.kind==="tool").map(row=>row.operationKey));
    const modelIds=new Set(page.filter(row=>row.kind==="model").map(row=>row.id));
    for(const model of identities)if(model.toolIds.some(id=>typeof id==="string"&&keys.has(agenticToolOperationKey(model.id,id))))modelIds.add(model.id);
    type Proposal={toolCallId:string|null;toolName:string|null;inputText:string|null;inputTruncated:boolean;invalid:boolean};
    const proposed=modelIds.size?await db.select({id:c.id,tools:sql<Proposal[]>`(select coalesce(jsonb_agg(jsonb_build_object(
      'toolCallId',case when jsonb_typeof(part->'toolCallId')='string' then part->>'toolCallId' else null end,
      'toolName',case when jsonb_typeof(part->'toolName')='string' then part->>'toolName' else null end,
      'inputText',left(part->>'input',16000), 'inputTruncated',coalesce(length(part->>'input')>16000,false),
      'invalid',not coalesce(jsonb_typeof(part->'toolCallId')='string' and length(part->>'toolCallId')>0 and jsonb_typeof(part->'toolName')='string' and length(part->>'toolName')>0 and jsonb_typeof(part->'input')='string',false))), '[]'::jsonb)
      from jsonb_array_elements(case when jsonb_typeof(${c.providerResult}->'content')='array' then ${c.providerResult}->'content' else '[]'::jsonb end) part where part->>'type'='tool-call')`}).from(c).where(and(eq(c.executionTaskId,task.id),inArray(c.id,[...modelIds]))):[];
    const bindings=new Map(proposed.flatMap(model=>model.tools.filter(t=>typeof t.toolCallId==="string"&&typeof t.toolName==="string").map(t=>[agenticToolOperationKey(model.id,t.toolCallId!),t] as const)));
    const calls=page.map(row=>{const bound=bindings.get(row.operationKey);return {...row,proposedTools:proposed.find(model=>model.id===row.id)?.tools??[],toolName:bound?.toolName??null,inputText:bound?.inputText??null,inputTruncated:bound?.inputTruncated??false};});
    return {task,conversationId:frozen?.conversationId??null,sourceMessageId:frozen?.sourceMessageId??null,frozenCapabilities,frozenTools,plan,calls,nextSequence:calls.at(-1)?.sequence??input.afterSequence,hasMore:rows.length>input.limit};
  }};
}
