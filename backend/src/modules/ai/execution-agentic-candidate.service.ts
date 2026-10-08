import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {createHash} from "node:crypto";
import {and,asc,eq,aiTasks,aiTaskResults,executionTasks,executionCalls,type Db} from "@creatoros/backend";
import {agenticProposal,type AgenticProposal} from "@creatoros/contract";
import {agenticCommitReceiptSchema,agenticWorkerInputSchema,agenticToolOutcomeSchema,workerProviderReceiptSchema,workerToolResultReceiptSchema,checkpointToolCallSchema,executionCheckpointSchema,workerPortInputSchemas,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {createExecutionLeaseService} from "../execution/execution-lease.service";
import {ConflictError} from "../execution/execution.errors";
import {verifyExecutionKnowledgeSource} from "./agentic-proposal-staging.service";

const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value && typeof value==="object"?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const object=(value:unknown):Record<string,unknown>=>value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:{};

/** 候选内容只取后端保存的提案，Worker仅提供待核验的账本引用。 */
export function createExecutionAgenticCandidateService(db:Db,deps:{now?:()=>string}={}){
  const now=deps.now ?? (()=>new Date().toISOString());const leases=createExecutionLeaseService(db,{now});
  return {
    async commitAgenticResult(ref:ExecutionRef,raw:unknown){
      const request=workerPortInputSchemas.commitAgenticResult.parse(raw);
      const requestDigest=digest({lastModelCallId:request.lastModelCallId,toolCallIds:[...request.toolCallIds].sort(),stopReason:request.stopReason});
      return leases.withLease(ref,"settlement",async({tx,task,context})=>{
        if(task.kind!=="ai_task" || task.ownerType!=="ai_task")throw new ConflictError("当前执行不是AI业务任务");
        const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context))).for("update");
        if(!business)throw new ConflictError("AI任务映射或归属不一致");
        const frozen=agenticWorkerInputSchema.parse(object(task.payload).modelInput);
        if(`exec.${frozen.taskType}`!==business.taskType)throw new ConflictError("冻结任务类型不一致");
        const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
        const lastModel=calls.filter(call=>call.kind==="model").at(-1);
        if(!lastModel || lastModel.id!==request.lastModelCallId || lastModel.status!=="settled" || !lastModel.providerResult)throw new ConflictError("最后模型调用不是当前已确认回执");
        const [existing]=await tx.select().from(aiTaskResults).where(eq(aiTaskResults.executionCallId,lastModel.id));
        if(existing){
          if(existing.aiTaskId!==business.id || lastModel.resultRef!==existing.id || object(existing.resultData).executionCommitDigest!==requestDigest)throw new ConflictError("候选提交回执不一致");
          if(existing.resultType==="execution_diagnostic"){
            if(task.status!=="failed" || business.status!=="failed" || task.lastErrorCode!=="AGENT_NO_PROPOSALS")throw new ConflictError("失败提交回执与终态不一致");
            return agenticCommitReceiptSchema.parse({outcome:"failed",resultId:existing.id,aiTaskId:business.id,errorCode:"AGENT_NO_PROPOSALS"});
          }
          if(frozen.taskType==="agentic.collect" && existing.resultType==="execution_manifest" && business.status==="failed"){
            if(task.status!=="partial" || task.lastErrorCode!=="COLLECTION_INCOMPLETE")throw new ConflictError("采集部分结果与终态不一致");
            return agenticCommitReceiptSchema.parse({outcome:"failed",resultId:existing.id,aiTaskId:business.id,errorCode:"COLLECTION_INCOMPLETE"});
          }
          if(!["succeeded","partial"].includes(task.status))throw new ConflictError("候选提交回执不一致");
          return {resultId:existing.id,aiTaskId:business.id};
        }
        const stamp=now();
        if(task.status!=="running" || !task.leaseOwner || !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt)<=Date.parse(stamp) || (task.deadlineAt && Date.parse(task.deadlineAt)<=Date.parse(stamp)) || !["queued","running"].includes(business.status))throw new ConflictError("当前任务不能提交新候选");
        if(!["completed","max_steps","budget_exhausted"].includes(request.stopReason))throw new ConflictError("失败或取消不能提交候选");
        if(calls.some(call=>!["settled","rejected"].includes(call.status) || !["model","tool"].includes(call.kind)))throw new ConflictError("仍有调用待确认");
        const settled=calls.filter(call=>call.status==="settled");const tools=settled.filter(call=>call.kind==="tool");
        if(request.toolCallIds.length!==tools.length || new Set(request.toolCallIds).size!==tools.length || request.toolCallIds.some(id=>!tools.some(tool=>tool.id===id)))throw new ConflictError("工具调用清单不完整或顺序不符");
        const checkpoint=executionCheckpointSchema.parse(task.checkpoint);
        if(checkpoint.ledgerSequence!==calls.at(-1)?.sequence || checkpoint.messages.length!==settled.length || checkpoint.messages.some((message,index)=>message.callId!==settled[index]?.id || message.role!==(settled[index]?.kind==="model"?"assistant":"tool")))throw new ConflictError("检查点尚未确认完整调用记录");
        const pending=new Map<string,string>();const seenTools=new Set<string>();
        const confirmedProposals=new Map<string,AgenticProposal>();const plans:unknown[]=[];
        const collectionResults=new Map<string,Record<string,unknown>>();
        for(const call of settled){
          if(call.kind==="model"){
            if(pending.size)throw new ConflictError("模型越过未确认工具调用");
            const receipt=workerProviderReceiptSchema.parse(call.providerResult);
            for(const part of receipt.content){
              if(object(part).type!=="tool-call")continue;
              const tool=checkpointToolCallSchema.parse(part);
              if(seenTools.has(tool.toolCallId) || !frozen.tools.some(t=>t.name===tool.toolName))throw new ConflictError("模型工具调用重复或不在冻结范围");
              seenTools.add(tool.toolCallId);pending.set(tool.toolCallId,tool.toolName);
            }
          }else{
            const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText ?? "null"));
            if(pending.get(receipt.toolCallId)!==receipt.toolName)throw new ConflictError("工具回执缺少模型调用来源");
            pending.delete(receipt.toolCallId);
            const output=agenticToolOutcomeSchema.parse(receipt.output);
            if(output.sideEffect==="unknown" || output.error?.code==="unknown_commit")throw new ConflictError("工具提交仍待对账");
            if(frozen.taskType==="agentic.collect" && !frozen.dryRun && ["collect.run","collect.status"].includes(receipt.toolName) && output.status==="ok" && !output.error){
              const data=object(output.data);
              if(typeof data.targetId!=="string" || typeof data.ok!=="boolean")throw new ConflictError("采集回执缺少真实目标或结果");
              collectionResults.set(data.targetId,{...collectionResults.get(data.targetId),...data});
            }
            if(frozen.dryRun){
              if(output.sideEffect!=="none")throw new ConflictError("预演含有真实副作用");
              if(object(output.data).plan)plans.push(object(output.data).plan);
            }else if(output.sideEffect==="proposal"){
              const proposal=agenticProposal.parse(object(output.data).proposal);
              if(proposal.source.taskId!==business.id || proposal.source.toolCallId!==receipt.toolCallId || confirmedProposals.has(proposal.proposalId))throw new ConflictError("提案来源或编号不一致");
              confirmedProposals.set(proposal.proposalId,proposal);
            }
          }
        }
        if(request.stopReason==="completed" && pending.size)throw new ConflictError("尚有模型工具调用未完成");
        const staged=await tx.select().from(aiTaskResults).where(and(eq(aiTaskResults.aiTaskId,business.id),eq(aiTaskResults.resultType,"agentic_proposal_staged")));
        const proposals:AgenticProposal[]=[];
        for(const row of staged){
          const proposal=agenticProposal.parse(object(row.resultData).proposal);const confirmed=confirmedProposals.get(proposal.proposalId);
          if(row.id!==proposal.proposalId || !confirmed || digest(confirmed)!==digest(proposal))throw new ConflictError("已保存提案与真实工具回执不符");
          if(proposal.kind==="knowledge.create")await verifyExecutionKnowledgeSource(tx,task.id,{kind:"knowledge.create",toolCallId:proposal.source.toolCallId,evidenceRefs:proposal.source.evidenceRefs,...proposal.content});
          proposals.push(proposal);confirmedProposals.delete(proposal.proposalId);
        }
        if(confirmedProposals.size || proposals.length>100 || (frozen.dryRun && proposals.length))throw new ConflictError("缺少唯一可采纳的已保存业务提案");
        const lastReceipt=workerProviderReceiptSchema.parse(lastModel.providerResult);
        const summary=lastReceipt.content.filter(part=>object(part).type==="text").map(part=>object(part).text).filter((text):text is string=>typeof text==="string").join("\n").slice(0,10000);
        const partial=request.stopReason!=="completed";const resultId=`ai-agentic-result:${lastModel.id}`;
        const meta={engine:"pi",actualEngine:"pi",completeness:partial?"partial":"completed",stopReason:request.stopReason,
          checkpointRef:`execution-checkpoint:${task.id}:${checkpoint.revision}`,usageRef:`execution-calls:${task.id}`,
          tokensUsed:settled.some(call=>call.totalTokens===null)?null:settled.reduce((sum,call)=>sum+(call.totalTokens ?? 0),0)};
        if(frozen.taskType==="agentic.collect" && !frozen.dryRun){
          const collections=[...collectionResults.values()];
          const incomplete=partial || !collections.length || collections.some(result=>result.ok!==true);
          const errorMessage=incomplete?"采集观察尚未全部完成，请查看原采集任务或处理登录；未将提交视为完成。":null;
          await tx.insert(aiTaskResults).values({id:resultId,executionCallId:lastModel.id,aiTaskId:business.id,resultType:"execution_manifest",
            resultData:{taskType:frozen.taskType,summary:errorMessage??`已确认 ${collections.length} 个目标采集完成`,executionCommitDigest:requestDigest,collections,meta:{...meta,completeness:incomplete?"partial":"completed"}}});
          await tx.update(aiTasks).set({status:incomplete?"failed":"succeeded",completedAt:stamp,errorMessage,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,business.id));
          await tx.update(executionCalls).set({resultRef:resultId,updatedAt:stamp}).where(eq(executionCalls.id,lastModel.id));
          await tx.update(executionTasks).set({status:incomplete?"partial":"succeeded",leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,retryAt:null,retryOfCallId:null,lastErrorCode:incomplete?"COLLECTION_INCOMPLETE":null,lastErrorMessage:errorMessage,updatedAt:stamp}).where(eq(executionTasks.id,task.id));
          return agenticCommitReceiptSchema.parse({outcome:incomplete?"failed":"succeeded",resultId,aiTaskId:business.id,...(incomplete?{errorCode:"COLLECTION_INCOMPLETE"}:{})});
        }
        if(!frozen.dryRun && !proposals.length){
          const errorCode="AGENT_NO_PROPOSALS";const errorMessage="本次自主任务未产生可采纳的业务建议，请调整任务后重试。";
          // 完整账本已证明没有业务候选：失败回执与双任务终态同事务提交，不能伪装未知重跑。
          await tx.insert(aiTaskResults).values({id:resultId,executionCallId:lastModel.id,aiTaskId:business.id,resultType:"execution_diagnostic",
            resultData:{taskType:frozen.taskType,executionCommitDigest:requestDigest,errorCode,errorMessage,meta:{...meta,completeness:"failed"}}});
          await tx.update(aiTasks).set({status:"failed",completedAt:stamp,errorMessage,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,business.id));
          await tx.update(executionCalls).set({resultRef:resultId,updatedAt:stamp}).where(eq(executionCalls.id,lastModel.id));
          await tx.update(executionTasks).set({status:"failed",leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,retryAt:null,retryOfCallId:null,lastErrorCode:errorCode,lastErrorMessage:errorMessage,updatedAt:stamp}).where(eq(executionTasks.id,task.id));
          return agenticCommitReceiptSchema.parse({outcome:"failed",resultId,aiTaskId:business.id,errorCode});
        }
        const resultData={taskType:frozen.taskType,summary,executionCommitDigest:requestDigest,stopReason:request.stopReason,meta,...(frozen.dryRun?{engine:"pi",output:{plans},dryRun:true}:{proposals})};
        await tx.insert(aiTaskResults).values({id:resultId,executionCallId:lastModel.id,aiTaskId:business.id,resultType:frozen.dryRun?"execution_plan":"agentic_proposals",resultData});
        await tx.update(aiTasks).set({status:frozen.dryRun?"succeeded":"awaiting_confirmation",completedAt:frozen.dryRun?stamp:null,errorMessage:null,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,business.id));
        await tx.update(executionCalls).set({resultRef:resultId,updatedAt:stamp}).where(eq(executionCalls.id,lastModel.id));
        await tx.update(executionTasks).set({status:partial?"partial":"succeeded",leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,retryAt:null,retryOfCallId:null,lastErrorCode:null,lastErrorMessage:null,updatedAt:stamp}).where(eq(executionTasks.id,task.id));
        return {resultId,aiTaskId:business.id};
      });
    },
  };
}
