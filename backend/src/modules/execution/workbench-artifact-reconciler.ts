import {randomUUID} from "node:crypto";
import {and,asc,eq,inArray,executionTasks,workbenchArtifactLineages,OwnershipError,type Db} from "@creatoros/backend";
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
 async function claim(lineageId:string){
  const claimId=randomUUID(),stamp=now(),expiresAt=new Date(stamp.getTime()+claimLeaseMs).toISOString();
  return db.transaction(async tx=>{
   const [lineage]=await tx.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.id,lineageId)).for("update");
   if(!lineage||!["pending_blob","reconciling","unknown"].includes(lineage.state)||!lineage.pendingTaskId||!lineage.pendingOperationId)return null;
   if(lineage.state==="reconciling"&&lineage.reconciliationLeaseExpiresAt&&Date.parse(lineage.reconciliationLeaseExpiresAt)>stamp.getTime())return null;
   const [task]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,lineage.pendingTaskId),eq(executionTasks.userId,lineage.userId),eq(executionTasks.accountId,lineage.accountId))).for("update");
   if(!task?.fenceToken)return null;
   await tx.update(workbenchArtifactLineages).set({state:"reconciling",reconciliationClaimId:claimId,reconciliationLeaseExpiresAt:expiresAt,updatedAt:stamp.toISOString()}).where(eq(workbenchArtifactLineages.id,lineage.id));
   return {claimId,operationId:lineage.pendingOperationId,ref:{executionTaskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken}};
  });
 }
 async function handle(lineageId:string){
  const owned=await claim(lineageId);if(!owned)return false;
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
   for(const lineage of pending){if(stopped)break;if(await handle(lineage.id))handled++;}
   return handled;
  }finally{running=false;}
 };
 async function reconcile(ctx:RequestContext,conversationId:string,operationId:string){
  if(!ctx.accountId)throw new OwnershipError("会话不存在");
  const [lineage]=await db.select().from(workbenchArtifactLineages).where(and(eq(workbenchArtifactLineages.userId,ctx.userId),eq(workbenchArtifactLineages.accountId,ctx.accountId),eq(workbenchArtifactLineages.conversationId,conversationId),eq(workbenchArtifactLineages.pendingOperationId,operationId)));
  if(!lineage)throw new OwnershipError("待核对产物不存在");
  await handle(lineage.id);
  const [current]=await db.select().from(workbenchArtifactLineages).where(eq(workbenchArtifactLineages.id,lineage.id));
  return {artifactId:current!.artifactId,status:current!.state,lastErrorCode:current!.lastErrorCode};
 }
 if(options.startImmediately!==false)void scan();const timer=setInterval(()=>void scan(),intervalMs);timer.unref?.();
 return {scan,reconcile,stop(){stopped=true;clearInterval(timer);}};
}
