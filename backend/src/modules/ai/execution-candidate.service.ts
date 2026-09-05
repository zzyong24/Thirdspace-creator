import { and, eq, aiTasks, aiTaskResults, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import { workerPortInputSchemas, type ExecutionRef } from "@creatoros/contract/execution-worker";
import type { RequestContext } from "@creatoros/contract";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError } from "../execution/execution.errors";
import type { RecordCandidateInput } from "./ai.service";

/** 只由后端现有任务适配器提供格式投影；不可调用模型、写库或信任 Worker 自报实体归属。 */
export interface ExecutionCandidateDeps {
  now?:()=>string;
  projectCandidate(context:RequestContext, input:{taskType:string; inputData:unknown; text:string}):RecordCandidateInput;
}
export function createExecutionCandidateService(db:Db,deps:ExecutionCandidateDeps){
  const now=deps.now ?? (()=>new Date().toISOString());
  const leases=createExecutionLeaseService(db,{now});
  return {
    async commitResult(ref:ExecutionRef,raw:unknown){
      const input=workerPortInputSchemas.commitResult.parse(raw);
      if(input.outcome!=="succeeded")throw new ConflictError("失败必须经执行状态端口");
      return leases.withLease(ref,"settlement",async({tx,task,context})=>{
        if(task.kind!=="ai_task" || task.ownerType!=="ai_task")throw new ConflictError("当前执行没有AI业务任务");
        const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!))).for("update");
        if(!business)throw new ConflictError("AI任务映射或归属不一致");
        const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.executionTaskId,task.id),eq(executionCalls.id,input.callId),eq(executionCalls.status,"settled")));
        if(!call || call.resultText!==input.text)throw new ConflictError("提交正文与持久调用证据不符");
        const [existing]=await tx.select().from(aiTaskResults).where(eq(aiTaskResults.executionCallId,call.id));
        if(existing){
          if(existing.aiTaskId!==business.id || call.resultRef!==existing.id || task.status!=="succeeded")throw new ConflictError("候选提交回执不一致");
          // 已采纳后重投也只返回同一回执，绝不把业务状态改回待采纳。
          return {resultId:existing.id,aiTaskId:business.id};
        }
        const stamp=now();
        if(task.status!=="running" || !task.leaseOwner || !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt)<=Date.parse(stamp) ||
          (task.deadlineAt && Date.parse(task.deadlineAt)<=Date.parse(stamp)) || !["queued","running"].includes(business.status)) {
          throw new ConflictError("当前任务不能提交新候选");
        }
        const projected=deps.projectCandidate(context,{taskType:business.taskType,inputData:business.inputData,text:call.resultText!});
        const resultId=`ai-result:${call.id}`;
        await tx.insert(aiTaskResults).values({id:resultId,executionCallId:call.id,aiTaskId:business.id,resultType:projected.resultType,
          artifactId:projected.artifactId ?? null,knowledgeItemId:projected.knowledgeItemId ?? null,assetId:projected.assetId ?? null,resultData:projected.resultData});
        await tx.update(aiTasks).set({status:"awaiting_confirmation",completedAt:null,errorMessage:null,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,business.id));
        await tx.update(executionCalls).set({resultRef:resultId,updatedAt:stamp}).where(eq(executionCalls.id,call.id));
        await tx.update(executionTasks).set({status:"succeeded",leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,retryAt:null,retryOfCallId:null,lastErrorCode:null,lastErrorMessage:null,updatedAt:stamp}).where(eq(executionTasks.id,task.id));
        return {resultId,aiTaskId:business.id};
      });
    },
  };
}
