import {randomUUID} from 'node:crypto';
import {createReconstructedArtifactService,prepareReconstructionSettlement} from '../artifacts/reconstructed-artifact.service';
import {eq,aiTasks,aiTaskResults,executionTasks,executionCalls,type Db} from '@creatoros/backend';
import {workerPortInputSchemas,type ExecutionRef} from '@creatoros/contract/execution-worker';
import {ConflictError} from '../execution/execution.errors';
/** 原根/父→execution→business/call同一事务。只结算原已发生调用，不取得新调用授权。 */
export function createReconstructCompletionService(db:Db,deps:{now?:()=>string;nextId?:(prefix:string)=>string}={}){
 const now=deps.now??(()=>new Date().toISOString()),artifacts=createReconstructedArtifactService({now,nextId:deps.nextId??(prefix=>`${prefix}_${randomUUID()}`)});
 return{async commitResult(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
  const input=workerPortInputSchemas.commitResult.parse(raw);if(input.outcome!=='succeeded')throw new ConflictError('重建失败须经执行状态端口');
  return db.transaction(async tx=>{
   const facts=await prepareReconstructionSettlement(tx,ref,input,now,signal);
   if(facts.kind==='existing')return{resultId:facts.resultId,aiTaskId:facts.aiTaskId};
   const artifact=await artifacts.materialize(tx,facts.proof);facts.assertActive();const stamp=now();
   await tx.insert(aiTaskResults).values({id:facts.resultId,aiTaskId:facts.business.id,resultType:'reconstruction',executionCallId:facts.call.id,resultData:{artifactId:artifact.id,projectId:facts.target.projectId,origin:'reconstructed'}});
   await tx.update(executionCalls).set({resultRef:facts.resultId,updatedAt:stamp}).where(eq(executionCalls.id,facts.call.id));
   await tx.update(aiTasks).set({status:'succeeded',completedAt:stamp,errorMessage:null,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,facts.business.id));
   await tx.update(executionTasks).set({status:'succeeded',leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,retryAt:null,retryOfCallId:null,lastErrorCode:null,lastErrorMessage:null,updatedAt:stamp}).where(eq(executionTasks.id,facts.task.id));
   signal?.throwIfAborted();return{resultId:facts.resultId,aiTaskId:facts.business.id};
  });
 }};
}
