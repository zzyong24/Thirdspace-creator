import {and,asc,eq,gte,inArray,sql,executionCalls,executionTasks,type Db} from "@creatoros/backend";
import {workbenchCapabilitySchema} from "@creatoros/contract/agent-workbench";
import {z} from "zod";
import type {RequestContext} from "@creatoros/contract";
import {agenticToolOperationKey} from "./agentic-tool-binding";
import {createPersistentTaskService} from "./persistent-task.service";
import {createWorkbenchPlanService} from "./workbench-plan.service";

/** 只投影当前账号的计划与调用回执，不输出模型输入、供应商配置或租约凭据。 */
export function createWorkbenchPublicService(db:Db){
  const tasks=createPersistentTaskService(db),plans=createWorkbenchPlanService(db);
  return {async inspect(ctx:RequestContext,taskId:string,input:{afterSequence:number;limit:number}){
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
