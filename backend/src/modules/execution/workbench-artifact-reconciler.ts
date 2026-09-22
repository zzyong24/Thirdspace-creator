import {randomUUID} from "node:crypto";
import {and,asc,eq,inArray,aiConversations,executionCalls,executionTasks,workbenchArtifactLineages,workbenchArtifactLineageVersions,OwnershipError,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import type {createWorkbenchArtifactService} from "./workbench-artifact.service";

type ArtifactService=Pick<ReturnType<typeof createWorkbenchArtifactService>,"reconcileArtifactOperation">;

/**
 * 持久扫描未终结占位。对账领取的是谱系自己的短租约，因此 execution fence 已换、原执行租约
 * 已过期或进程重启后仍能按原 operationId 接管；它不会新建调用，也不会重传未知 Blob。
 */
export function startWorkbenchArtifactReconciler(db:Db,service:ArtifactService,options:{now?:()=>Date;intervalMs?:number;batchSize?:number;claimLeaseMs?:number;startImmediately?:boolean;afterReconciled?:(taskId:string)=>Promise<void>;onError?:(error:unknown)=>void}={}){
 const now=options.now??(()=>new Date()),intervalMs=options.intervalMs??5000,batchSize=options.batchSize??20,claimLeaseMs=options.claimLeaseMs??30_000;
 let stopped=false,running=false;
 async function claim(lineageId:string,operationId:string|null){
  const claimId=randomUUID(),stamp=now(),expiresAt=new Date(stamp.getTime()+claimLeaseMs).toISOString();
  return db.transaction(async tx=>{
   const [snapshot]=await tx.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.id,lineageId));
   if(!snapshot?.pendingTaskId||!operationId||snapshot.pendingOperationId!==operationId)return null;
   // 与产物提交保持 task → lineage 顺序；拿锁后重新校验，不能领取后续修订的占位。
   const [task]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,snapshot.pendingTaskId),eq(executionTasks.userId,snapshot.userId),eq(executionTasks.accountId,snapshot.accountId))).for("update");
   if(!task?.fenceToken)return null;
   const [lineage]=await tx.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.id,lineageId)).for("update");
   if(!lineage||!["pending_blob","reconciling","unknown"].includes(lineage.state)||lineage.pendingTaskId!==task.id||lineage.pendingOperationId!==operationId||
    lineage.userId!==task.userId||lineage.accountId!==task.accountId||lineage.conversationId!==snapshot.conversationId)return null;
   if(lineage.state==="reconciling"&&lineage.reconciliationLeaseExpiresAt&&Date.parse(lineage.reconciliationLeaseExpiresAt)>stamp.getTime())return null;
   await tx.update(workbenchArtifactLineages).set({state:"reconciling",reconciliationClaimId:claimId,reconciliationLeaseExpiresAt:expiresAt,updatedAt:stamp.toISOString()}).where(eq(workbenchArtifactLineages.id,lineage.id));
   return {claimId,operationId:lineage.pendingOperationId,ref:{executionTaskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken}};
  });
 }
 async function handle(lineageId:string,operationId:string|null){
  const owned=await claim(lineageId,operationId);if(!owned)return false;
  try{
   await service.reconcileArtifactOperation(owned.ref,owned.operationId,owned.claimId);
   await options.afterReconciled?.(owned.ref.executionTaskId);
   return true;
  }
  catch(error){options.onError?.(error);return false;}
 }
 const scan=async()=>{
  if(stopped||running)return 0;running=true;let handled=0;
  try{
   const pending=await db.select().from(workbenchArtifactLineages).where(inArray(workbenchArtifactLineages.state,["pending_blob","reconciling","unknown"]))
    .orderBy(asc(workbenchArtifactLineages.updatedAt)).limit(batchSize);
   for(const lineage of pending){if(stopped)break;if(await handle(lineage.id,lineage.pendingOperationId))handled++;}
   return handled;
  }finally{running=false;}
 };
 async function reconcile(ctx:RequestContext,conversationId:string,operationId:string){
  if(!ctx.accountId)throw new OwnershipError("会话不存在");
  const [conversation]=await db.select({id:aiConversations.id}).from(aiConversations).where(and(eq(aiConversations.id,conversationId),eq(aiConversations.userId,ctx.userId),eq(aiConversations.accountId,ctx.accountId)));
  if(!conversation)throw new OwnershipError("会话不存在");
  const completed=async()=>{
   // 历史版本与原调用在同一事务提交；后续版本更新 lastOperationId 不影响原回执。
   const [version]=await db.select({artifactId:workbenchArtifactLineageVersions.artifactId}).from(workbenchArtifactLineageVersions)
    .innerJoin(workbenchArtifactLineages,eq(workbenchArtifactLineages.id,workbenchArtifactLineageVersions.lineageId))
    .innerJoin(executionTasks,and(eq(executionTasks.id,workbenchArtifactLineageVersions.taskId),eq(executionTasks.userId,ctx.userId),eq(executionTasks.accountId,ctx.accountId!)))
    .innerJoin(executionCalls,and(eq(executionCalls.id,workbenchArtifactLineageVersions.operationId),eq(executionCalls.executionTaskId,executionTasks.id),eq(executionCalls.kind,"tool"),eq(executionCalls.status,"settled")))
    .where(and(eq(workbenchArtifactLineages.userId,ctx.userId),eq(workbenchArtifactLineages.accountId,ctx.accountId!),eq(workbenchArtifactLineages.conversationId,conversationId),eq(workbenchArtifactLineageVersions.operationId,operationId)));
   return version?{artifactId:version.artifactId,status:"committed" as const,lastErrorCode:null}:null;
  };
  const prior=await completed();if(prior)return prior;
  const [lineage]=await db.select().from(workbenchArtifactLineages).where(and(eq(workbenchArtifactLineages.userId,ctx.userId),eq(workbenchArtifactLineages.accountId,ctx.accountId),eq(workbenchArtifactLineages.conversationId,conversationId),eq(workbenchArtifactLineages.pendingOperationId,operationId)));
  if(!lineage){const settled=await completed();if(settled)return settled;throw new OwnershipError("待核对产物不存在");}
  await handle(lineage.id,operationId);
  const settled=await completed();if(settled)return settled;
  const [current]=await db.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.id,lineage.id));
  return {artifactId:current!.artifactId,status:current!.state,lastErrorCode:current!.lastErrorCode};
 }
 if(options.startImmediately!==false)void scan();const timer=setInterval(()=>void scan(),intervalMs);timer.unref?.();
 return {scan,reconcile,stop(){stopped=true;clearInterval(timer);}};
}
