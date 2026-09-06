import { and, eq, aiTasks, aiTaskResults, aiTaskSteps, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import { workerStructuredResultSchema, workerPortInputSchemas, type WorkerStructuredResult, type ExecutionRef } from "@creatoros/contract/execution-worker";
import type { RequestContext } from "@creatoros/contract";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError } from "../execution/execution.errors";
import type { RecordCandidateInput } from "./ai.service";

/** 只由后端现有任务适配器提供格式投影；不可调用模型、写库或信任 Worker 自报实体归属。 */
export interface ExecutionCandidateDeps {
  now?:()=>string;
  projectCandidate(context:RequestContext, input:{taskType:string; inputData:unknown; text:string; structuredResult?:WorkerStructuredResult;frozenInput?:unknown}):RecordCandidateInput;
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
        if(business.taskType==="scheduled.topic.daily")throw new ConflictError("每日选题必须经调度入池完成端口");
        const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.executionTaskId,task.id),eq(executionCalls.id,input.callId),eq(executionCalls.status,"settled")));
        if(!call || call.resultText!==input.text)throw new ConflictError("提交正文与持久调用证据不符");
        const [existing]=await tx.select().from(aiTaskResults).where(eq(aiTaskResults.executionCallId,call.id));
        if(existing){
          if(existing.aiTaskId!==business.id || call.resultRef!==existing.id || !["succeeded","partial"].includes(task.status))throw new ConflictError("候选提交回执不一致");
          // 已采纳后重投也只返回同一回执，绝不把业务状态改回待采纳。
          return {resultId:existing.id,aiTaskId:business.id};
        }
        const stamp=now();
        if(task.status!=="running" || !task.leaseOwner || !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt)<=Date.parse(stamp) ||
          (task.deadlineAt && Date.parse(task.deadlineAt)<=Date.parse(stamp)) || !["queued","running"].includes(business.status)) {
          throw new ConflictError("当前任务不能提交新候选");
        }
        const structured=(task.payload as {modelInput?:{kind?:string}}).modelInput?.kind === "model.structured" ? workerStructuredResultSchema.parse(JSON.parse(call.resultText!)) : undefined;
        const partial=structured?.validation?.status === "partial";
        const projected=deps.projectCandidate(context,{taskType:business.taskType,inputData:business.inputData,text:structured ? JSON.stringify(structured.object) : call.resultText!,...(structured ? {structuredResult:structured} : {}),frozenInput:(task.payload as {modelInput?:unknown}).modelInput});
        const resultId=`ai-result:${call.id}`;
        await tx.insert(aiTaskResults).values({id:resultId,executionCallId:call.id,aiTaskId:business.id,resultType:projected.resultType,
          artifactId:projected.artifactId ?? null,knowledgeItemId:projected.knowledgeItemId ?? null,assetId:projected.assetId ?? null,resultData:{...projected.resultData,...(structured ? {executionGeneration:structured.generation,executionValidation:structured.validation ?? null} : {})}});
        if(business.taskType==="calibration.diagnose" && projected.resultType==="calibration_diagnosis") {
          const diagnosis=(projected.resultData as {diagnosis?:{dimensions?:unknown}}).diagnosis;
          if(!Array.isArray(diagnosis?.dimensions))throw new ConflictError("诊断维度格式无效");
          await tx.insert(aiTaskSteps).values({id:`ai-diagnosis-step:${call.id}`,aiTaskId:business.id,stepNo:1,kind:"step",text:`已生成编导诊断（${diagnosis.dimensions.length} 维度评分）`,toolCalls:[],createdAt:stamp});
        }
        if(business.taskType==="topic.generate" && projected.resultType==="candidate_list"){
          const items=(projected.resultData as {items?:unknown}).items;
          if(!Array.isArray(items))throw new ConflictError("选题候选格式无效");
          await tx.insert(aiTaskSteps).values({id:`ai-topic-step:${call.id}`,aiTaskId:business.id,stepNo:1,kind:"step",text:`已生成 ${items.length} 条选题`,toolCalls:[],createdAt:stamp});
        }
        await tx.update(aiTasks).set({status:"awaiting_confirmation",completedAt:null,errorMessage:null,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,business.id));
        await tx.update(executionCalls).set({resultRef:resultId,updatedAt:stamp}).where(eq(executionCalls.id,call.id));
        await tx.update(executionTasks).set({status:partial ? "partial" : "succeeded",leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,retryAt:null,retryOfCallId:null,lastErrorCode:null,lastErrorMessage:null,updatedAt:stamp}).where(eq(executionTasks.id,task.id));
        return {resultId,aiTaskId:business.id};
      });
    },
  };
}
