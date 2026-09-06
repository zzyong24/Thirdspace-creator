import {ZodError} from "zod";
import type {executionCalls} from "@creatoros/backend";
import {hasPendingGeneratedAssetCommit} from "../assets";
import {bindAssetExecution} from "./asset-execution-binding";
import {ConflictError} from "./execution.errors";

/** 原任务行锁内核验；只允许同键对账，不重置调用、预算或已启动事实。 */
export async function recoverableAssetCalls(scope:Parameters<typeof bindAssetExecution>[0],calls:(typeof executionCalls.$inferSelect)[],stamp:string){
 const {task}=scope;
 if((task.payload as {modelInput?:{kind?:string}})?.modelInput?.kind!=="asset.generate" || task.attempt>=task.maxAttempts || (task.deadlineAt!==null && Date.parse(task.deadlineAt)<=Date.parse(stamp)))return [];
 const recoverable:string[]=[];
 for(const call of calls){
  if(!["started","unknown"].includes(call.status))continue;
  try{
   const bound=await bindAssetExecution(scope,call.id);
   if(!bound.call?.startedAttempt)continue;
   if(bound.saved || await hasPendingGeneratedAssetCommit(scope.tx,scope.context,`execution-asset:${call.id}`))recoverable.push(call.id);
  }catch(error){
   // 绑定损坏保持未知；真实数据库故障必须冒泡，不能伪装成正常恢复结果。
   if(!(error instanceof ConflictError) && !(error instanceof ZodError))throw error;
  }
 }
 return recoverable;
}
