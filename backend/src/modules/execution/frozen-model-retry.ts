import {createHash} from "node:crypto";
import type {RequestContext} from "@creatoros/contract";
import {OwnershipError} from "@creatoros/backend";
import {ConflictError,ExecutionValidationError} from "./execution.errors";
import type {PersistentTaskService} from "./persistent-task.service";

/** 原业务 task owner 的窄恢复端口；只恢复已绑定执行，不复制模型输入或预算。 */
export function createFrozenModelRetryPort(deps:{
 readTask(ctx:RequestContext,id:string):Promise<{id:string;taskType:string;executionTaskId?:string|null}>;
 execution:Pick<PersistentTaskService,"get"|"command">;
 wake():void|Promise<void>;
}){
 return async(ctx:RequestContext,input:{taskId:string;taskType:string;clientRequestId:string})=>{
  if(input.clientRequestId.length<8||input.clientRequestId.length>128)throw new ExecutionValidationError("重试请求号无效");
  const task=await deps.readTask(ctx,input.taskId);
  if(task.id!==input.taskId||task.taskType!==input.taskType||!task.executionTaskId)throw new ConflictError("原模型任务类型或持久执行不一致");
  const execution=await deps.execution.get(ctx,task.executionTaskId);
  if(execution.kind!=="ai_task"||execution.ownerType!=="ai_task"||execution.ownerId!==task.id)throw new OwnershipError("原模型执行归属不一致");
  // SEMANTIC_BOUNDARY_ALLOW: 命令身份只绑定真实 task 及用户原请求，不做创作选择。
  const idempotencyKey=`model-retry:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
  await deps.execution.command(ctx,{taskIds:[execution.id],command:"retry",idempotencyKey});
  await deps.wake();
  return {id:task.id};
 };
}
