import type {RequestContext} from "@creatoros/contract";
import {requireAccountId,type Db} from "@creatoros/backend";
import {createAiService,type ServiceDeps} from "./ai.service";
import {prepareAiTaskCommit,type AiTaskCommitBinding} from "./ai-task-commit";
import {buildScriptDraftTaskInputData,type ScriptDraftTaskInput} from "./script-draft-task-input";
import {canonicalJson} from "./canonical-json";
import {AttemptIdInvalidError,AttemptPayloadMismatchError,ConflictError} from "./ai.errors";
import {createArtifactsService} from "../artifacts/artifacts.service";

export type ScriptDraftSubmissionInput=Omit<ScriptDraftTaskInput,"artifactId">&{attemptId:string};
type Transaction=Parameters<Parameters<Db["transaction"]>[0]>[0];
/** 冻结真实来源与配置；稿件挂点、完整任务输入和父回执由调用方在一个事务中提交。 */
export async function prepareScriptDraftTaskSubmission(deps:ServiceDeps,ctx:RequestContext,input:ScriptDraftSubmissionInput){
 const context=structuredClone(ctx),request=structuredClone(input),targets=deps.scriptDraftTargets;
 requireAccountId(context.accountId,"ai.prepareScriptDraft");
 if(!request.projectId?.trim())throw new Error("整稿必须属于具体项目");
 if(typeof request.attemptId!=="string" || request.attemptId.length<16 || request.attemptId.length>128)throw new AttemptIdInvalidError();
 if(!targets)throw new Error("整稿事务目标端口未装配");
 const {artifactId:_artifactId,...intent}=buildScriptDraftTaskInputData({...request,artifactId:""});
 const service=createAiService(deps),prior=await service.findTaskByAttempt(context,"script.draft",request.attemptId);
 function check(task:NonNullable<typeof prior>){
  const {artifactId,baseVersionId,...stable}=task.inputData;
  // SEMANTIC_BOUNDARY_ALLOW: 同键完整意图精确校验，不判断稿件含义或创作取舍。
  if(typeof artifactId!=="string" || !artifactId || task.retryOfTaskId || canonicalJson(stable)!==canonicalJson(intent))throw new AttemptPayloadMismatchError(task.id);
 }
 if(prior)check(prior);
 // 当前生产 resolver 仅按任务类型冻结 Skill 与模型 authority，目标 artifact 在事务中确定。
 const runtimeData=prior?null:structuredClone(await deps.resolveTaskRuntimeData?.(structuredClone(context),"script.draft",Object.freeze(structuredClone(intent)))??{});
 return {async commit(tx:Transaction,binding?:AiTaskCommitBinding){
  const txDb=tx as unknown as Db,txDeps={...deps,db:txDb,resolveTaskRuntimeData:async()=>structuredClone(runtimeData??{})};
  const txService=createAiService(txDeps),existing=await txService.findTaskByAttempt(context,"script.draft",request.attemptId);
  if(existing)check(existing);
  if(prior && !existing)throw new ConflictError("原整稿任务已不存在，不能重建历史提交");
  const artifactId=existing?existing.inputData.artifactId as string:await targets.ensure(txDb,structuredClone(context),request.projectId,request.outputId);
  const baseVersionId=existing?existing.inputData.baseVersionId:
   (await createArtifactsService({db:txDb,now:deps.now,nextId:deps.nextId}).getArtifact(context,artifactId)).currentVersionId;
  const body={taskType:"script.draft",attemptId:request.attemptId,inputData:{...intent,artifactId,...(request.outputId?{baseVersionId}:{})}};
  if(binding)return (await prepareAiTaskCommit(txDeps,context,body)).commit(tx,binding);
  return txService.createTask(context,body);
 }};
}
