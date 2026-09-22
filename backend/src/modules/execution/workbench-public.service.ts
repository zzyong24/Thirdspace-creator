import {and,asc,eq,gte,sql,executionCalls,executionTasks,type Db} from "@creatoros/backend";
import {workbenchCapabilitySchema} from "@creatoros/contract/agent-workbench";
import {z} from "zod";
import type {RequestContext} from "@creatoros/contract";
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
    const rows=await db.select({id:c.id,sequence:c.sequence,kind:c.kind,operationKey:c.operationKey,parentCallId:c.parentCallId,retryOfCallId:c.retryOfCallId,
      status:c.status,startedAttempt:c.startedAttempt,totalTokens:c.totalTokens,rejectionCode:c.rejectionCode,resultRef:c.resultRef,
      resultText:sql<string|null>`case when ${c.kind} = 'tool' then left(${c.resultText}, 16000) else null end`,
      resultTruncated:sql<boolean>`coalesce(${c.kind} = 'tool' and length(${c.resultText}) > 16000, false)`,
      createdAt:c.createdAt,updatedAt:c.updatedAt,
    }).from(c).where(and(eq(c.executionTaskId,task.id),gte(c.sequence,input.afterSequence+1))).orderBy(asc(c.sequence)).limit(input.limit+1);
    const calls=rows.slice(0,input.limit);
    return {task,conversationId:frozen?.conversationId??null,sourceMessageId:frozen?.sourceMessageId??null,frozenCapabilities,frozenTools,plan,calls,nextSequence:calls.at(-1)?.sequence??input.afterSequence,hasMore:rows.length>input.limit};
  }};
}
