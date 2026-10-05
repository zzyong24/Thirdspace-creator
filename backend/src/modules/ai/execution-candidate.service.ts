import {committedGeneratedAssetProof} from "@creatoros/contract";
import type {AITaskResource,AITaskResultResource} from "./ai.schema";
import {readCoverImageBinding} from "../execution/cover-execution-binding";
import {verifyGeneratedAssetCandidate} from "../assets";
import {bindAssetExecution} from "../execution/asset-execution-binding";
import { and, eq, desc, aiTasks, aiTaskResults, aiTaskSteps, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import { workerStructuredResultSchema, workerPortInputSchemas,workerProviderReceiptSchema,structuredGenerationInputSchema, type WorkerStructuredResult, type ExecutionRef } from "@creatoros/contract/execution-worker";
import type { RequestContext } from "@creatoros/contract";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError } from "../execution/execution.errors";
import type { RecordCandidateInput } from "./ai.service";

/** 只由后端现有任务适配器提供格式投影；不可调用模型、写库或信任 Worker 自报实体归属。 */
export interface ExecutionCandidateDeps {
  now?:()=>string;
  commitProductionRoughCandidate?:(ctx:RequestContext,proof:unknown,tx:Db)=>Promise<void>;
  committedAssets?:{
    aiFor(tx:Db):{getAssetResultProof(ctx:RequestContext,input:{taskId:string;resultId:string}):Promise<{task:AITaskResource;result:AITaskResultResource;executionCallId:string|null}>};
    assetsFor(tx:Db):{readCommittedGeneratedAssetFile(ctx:RequestContext,callId:string,raw:unknown):Promise<{receipt:import("../assets/pending-generated-asset.service").PendingGeneratedAssetReceipt;assetStatus:"pending"|"active"}>};
  };
  projectCandidate(context:RequestContext, input:{taskType:string; inputData:unknown; text:string; structuredResult?:WorkerStructuredResult;frozenInput?:unknown}):RecordCandidateInput;
}
export function createExecutionCandidateService(db:Db,deps:ExecutionCandidateDeps){
  const now=deps.now ?? (()=>new Date().toISOString());
  const leases=createExecutionLeaseService(db,{now});
  return {
    /** 只读原候选/调用/提交链；历史缺证明不猜当前素材，也不补录历史事实。 */
    async getCommittedAssetResult(context:RequestContext,input:{taskId:string;resultId:string}){
      if(!deps.committedAssets)return {status:"unverifiable" as const,reason:"原生成素材证明读取端口未装配"};
      return db.transaction(async transaction=>{
        const tx=transaction as unknown as Db;
        try{
          const original=await deps.committedAssets!.aiFor(tx).getAssetResultProof(context,input);
          const business=original.task,result=original.result;
          if(business.taskType!=="asset.generate" || business.id!==input.taskId || result.id!==input.resultId || result.aiTaskId!==business.id || result.resultType!=="generated_asset" || !original.executionCallId || !business.executionTaskId || !["awaiting_confirmation","succeeded"].includes(business.status))throw new ConflictError("原素材候选证明不完整");
          const [task]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,business.executionTaskId),eq(executionTasks.userId,context.userId),eq(executionTasks.accountId,context.accountId??"")));
          if(!task || task.ownerId!==business.id || task.kind!=="ai_task" || task.ownerType!=="ai_task" || !["succeeded","partial"].includes(task.status))throw new ConflictError("原素材执行证明不完整");
          const binding=await bindAssetExecution({tx:transaction,task,context},original.executionCallId);
          const call=binding.call!;
          if(call.status!=="settled" || call.resultRef!==result.id || !call.resultText || !((call.startedAttempt!==null&&Number.isInteger(call.startedAttempt)&&call.startedAttempt>0&&call.startedAttempt<=task.attempt)||binding.legacyRecovery))throw new ConflictError("原素材调用缺少实际结算或启动事实");
          const committed=await deps.committedAssets!.assetsFor(tx).readCommittedGeneratedAssetFile(context,call.id,JSON.parse(call.resultText));
          if(committed.receipt.assetId!==result.assetId || committed.receipt.assetType!==binding.input.mediaKind || (business.status==="succeeded"&&committed.assetStatus!=="active"))throw new ConflictError("原任务确认或素材身份不符");
          const proof=committedGeneratedAssetProof.parse({taskId:business.id,resultId:result.id,executionTaskId:task.id,callId:call.id,...committed,taskStatus:business.status});
          return {status:"verified" as const,proof};
        }catch(error){
          if(error instanceof SyntaxError || (error instanceof Error&&["ConflictError","OwnershipError","NotFoundError","ZodError"].includes(error.name)))return {status:"unverifiable" as const,reason:"原生成结果缺少可验证的精确文件证明"};
          throw error;
        }
      });
    },
    async commitResult(ref:ExecutionRef,raw:unknown){
      const input=workerPortInputSchemas.commitResult.parse(raw);
      if(input.outcome!=="succeeded")throw new ConflictError("失败必须经执行状态端口");
      return leases.withLease(ref,"settlement",async({tx,task,context})=>{
        if(task.kind!=="ai_task" || task.ownerType!=="ai_task")throw new ConflictError("当前执行没有AI业务任务");
        const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!))).for("update");
        if(!business)throw new ConflictError("AI任务映射或归属不一致");
        if(business.taskType==="copilot.assist")throw new ConflictError("对话回复必须经消息完成端口");
        if(business.taskType==="scheduled.topic.daily")throw new ConflictError("每日选题必须经调度入池完成端口");
        const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.executionTaskId,task.id),eq(executionCalls.id,input.callId),eq(executionCalls.status,"settled")));
        if(!call || call.resultText!==input.text)throw new ConflictError("提交正文与持久调用证据不符");
        const assetBinding=(["asset.generate","cover.generate","graphic.card.generate"].includes(business.taskType)) ? await bindAssetExecution({tx,task,context},call.id) : null;
        const [existing]=await tx.select().from(aiTaskResults).where(eq(aiTaskResults.executionCallId,call.id));
        const rough=business.taskType==='production.rough-cut.propose';
        const commitRough=async(result:{id:string;resultType:string;resultData:unknown})=>{if(!rough)return;const [latestCall]=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(desc(executionCalls.sequence)).limit(1);if(latestCall?.id!==call.id)throw new ConflictError('粗剪结算必须对应整个执行账本最终原调用');if(!deps.commitProductionRoughCandidate)throw new ConflictError('粗剪生产结算端口未装配');const model=structuredGenerationInputSchema.parse((task.payload as {modelInput?:unknown}).modelInput);if(call.kind!=='model'||call.parentCallId!==null||!call.operationKey.startsWith('production.rough-cut/model/')||!/^[1-9][0-9]*$/.test(call.operationKey.slice('production.rough-cut/model/'.length))||!call.providerResult)throw new ConflictError('粗剪缺真实原模型调用证据');workerProviderReceiptSchema.parse(call.providerResult);const structured=workerStructuredResultSchema.parse(JSON.parse(call.resultText!));if(structured.validation?.status==='partial')return;await deps.commitProductionRoughCandidate(context,{taskId:business.id,taskType:business.taskType,attemptId:business.attemptId,projectId:business.projectId,inputData:business.inputData,executionTaskId:task.id,callId:call.id,modelInput:model,resultId:result.id,resultType:result.resultType,resultData:result.resultData},tx as unknown as Db);};
        if(existing){
          if(existing.aiTaskId!==business.id || call.resultRef!==existing.id || !["succeeded","partial"].includes(task.status))throw new ConflictError("候选提交回执不一致");
          await commitRough(existing);
          // 已采纳后重投也只返回同一回执，绝不把业务状态改回待采纳。
          return {resultId:existing.id,aiTaskId:business.id};
        }
        let stamp=now();
        if(task.status!=="running" || !task.leaseOwner || !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt)<=Date.parse(stamp) ||
          (task.deadlineAt && Date.parse(task.deadlineAt)<=Date.parse(stamp)) || !["queued","running"].includes(business.status)) {
          throw new ConflictError("当前任务不能提交新候选");
        }
        const structured=!(["cover.generate","graphic.card.generate"].includes(business.taskType)) && (task.payload as {modelInput?:{kind?:string}}).modelInput?.kind === "model.structured" ? workerStructuredResultSchema.parse(JSON.parse(call.resultText!)) : undefined;
        const partial=structured?.validation?.status === "partial";
        const projected=(["asset.generate","cover.generate","graphic.card.generate"].includes(business.taskType)) ? await (async():Promise<RecordCandidateInput>=>{
          const binding=assetBinding!;
          const receipt=await verifyGeneratedAssetCandidate(tx as unknown as Db,context,call.id,JSON.parse(call.resultText!));
          if(receipt.assetType!==binding.input.mediaKind)throw new ConflictError("素材类型与冻结调用不符");
          const frozen=binding.input;
          const cover=business.taskType==="cover.generate"||business.taskType==="graphic.card.generate"?await readCoverImageBinding({tx,task,context}):null;
          return {resultType:"generated_asset",assetId:receipt.assetId,resultData:{assetId:receipt.assetId,assetType:receipt.assetType,name:receipt.name,...(cover?cover.resultData:{}),prompt:frozen.prompt,...(frozen.aspectRatio?{aspectRatio:frozen.aspectRatio}:{}),...(frozen.mediaKind==="video"?{durationSec:frozen.durationSec,resolution:frozen.resolution}:{})}};
        })() : deps.projectCandidate(context,{taskType:business.taskType,inputData:business.inputData,text:structured ? JSON.stringify(structured.object) : call.resultText!,...(structured ? {structuredResult:structured} : {}),frozenInput:(task.payload as {modelInput?:unknown}).modelInput});
        // 素材验证可能等待领域行锁；进入写入前重新检查实际截止时间。
        stamp=now();
        if(Date.parse(task.leaseExpiresAt!)<=Date.parse(stamp) || (task.deadlineAt && Date.parse(task.deadlineAt)<=Date.parse(stamp)))throw new ConflictError("候选验证期间执行租约或截止时间已到");
        const resultId=`ai-result:${call.id}`;
        await tx.insert(aiTaskResults).values({id:resultId,executionCallId:call.id,aiTaskId:business.id,resultType:projected.resultType,
          artifactId:projected.artifactId ?? null,knowledgeItemId:projected.knowledgeItemId ?? null,assetId:projected.assetId ?? null,resultData:{...projected.resultData,...(structured ? {executionGeneration:structured.generation,executionValidation:structured.validation ?? null} : {})}});
        await commitRough({id:resultId,resultType:projected.resultType,resultData:{...projected.resultData,...(structured?{executionGeneration:structured.generation,executionValidation:structured.validation??null}:{})}});
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
