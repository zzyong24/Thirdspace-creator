import {assertFrozenWorkspaceMembership} from "../platform-account/membership-lock.service";
import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {and,eq,aiTasks,aiTaskResults,executionTasks,executionCalls,requireAccountId,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {discardGeneratedAssetCandidate,activateGeneratedAssetCandidate} from "../assets";
import {bindAssetExecution} from "../execution/asset-execution-binding";
import type {StructuredTargetAdoptionPorts} from "./structured-target-adoption.service";
import {ConflictError,OwnershipError} from "./ai.errors";

/** 生成候选采纳只由用户发起；素材、项目链接、业务状态共用一个事务。 */
export function createGeneratedAssetAdoptionService(db:Db,ports:Pick<StructuredTargetAdoptionPorts,"link">,now=()=>new Date().toISOString()){
 return {
  async confirmTask(ctx:RequestContext,taskId:string){return change(ctx,taskId,"confirm");},
  async cancelTask(ctx:RequestContext,taskId:string,errorMessage?:string){return change(ctx,taskId,"cancel",errorMessage);},
 };
 async function change(ctx:RequestContext,taskId:string,action:"confirm"|"cancel",errorMessage?:string){
   await assertWritableWorkspace(db,ctx);requireWorkspace(ctx);const accountId=ctx.accountId??null;
   await db.transaction(async tx=>{
    const owned=and(eq(aiTasks.id,taskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx));
    const [snapshot]=await tx.select().from(aiTasks).where(owned);
    if(!snapshot)throw new OwnershipError("素材任务不存在");
    // 与候选提交保持 execution → ai task 的锁顺序；避免确认与迟到回执互锁。
    const [execution]=snapshot.executionTaskId?await tx.select().from(executionTasks).where(and(eq(executionTasks.id,snapshot.executionTaskId),eq(executionTasks.ownerId,taskId),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx))).for("update"):[];
    const [task]=await tx.select().from(aiTasks).where(owned).for("update");
    if(!task || task.taskType!=="asset.generate" || !execution || task.executionTaskId!==execution.id || execution.kind!=="ai_task" || execution.ownerType!=="ai_task" || execution.status!=="succeeded")throw new ConflictError("生成素材执行映射或状态不一致");
    // 已成功的采纳只回读；用户后续删除素材或链接不应被重试恢复。
    if(task.status===(action==="confirm"?"succeeded":"cancelled"))return;
    if(task.status!=="awaiting_confirmation")throw new ConflictError("素材候选当前不可采纳");
    await assertFrozenWorkspaceMembership(tx,{userId:task.userId,groupId:task.groupId,accountId:task.accountId,groupVersion:task.groupVersion,membershipVersion:task.membershipVersion});
    const results=await tx.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,task.id));
    if(results.length!==1 || results[0]!.resultType!=="generated_asset" || !results[0]!.executionCallId)throw new ConflictError("生成素材候选批次不唯一");
    const candidate=results[0]!;
    const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,candidate.executionCallId!),eq(executionCalls.executionTaskId,execution.id)));
    if(!call || call.status!=="settled" || call.resultRef!==candidate.id || !call.resultText)throw new ConflictError("素材候选缺少原调用回执");
    const binding=await bindAssetExecution({tx,task:execution,context:ctx},call.id);
    const raw=JSON.parse(call.resultText);
    const data=candidate.resultData as Record<string,unknown>;
    if(candidate.assetId!==raw.assetId || data.assetId!==raw.assetId || data.assetType!==raw.assetType || binding.input.mediaKind!==raw.assetType)throw new ConflictError("素材候选与原产物不符");
    if(action==="cancel"){
     await discardGeneratedAssetCandidate(tx as unknown as Db,ctx,call.id,raw,now());
     await tx.update(aiTasks).set({status:"cancelled",completedAt:now(),errorMessage:errorMessage??null}).where(owned);
     return;
    }
    const receipt=await activateGeneratedAssetCandidate(tx as unknown as Db,ctx,call.id,JSON.parse(call.resultText),now());
    if(task.projectId)await ports.link(ctx,{projectId:task.projectId,entityType:"asset",entityId:receipt.assetId,role:"broll",stage:"production",addedByType:"ai"},tx);
    await tx.update(aiTasks).set({status:"succeeded",completedAt:now(),errorMessage:null}).where(owned);
   });
  }
}
