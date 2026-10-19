import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import { and,eq,inArray,executionTasks,type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import type { TaskRow } from "./ai.repository";
import { toTaskDto,type AITaskResource } from "./ai.schema";
import { ConflictError } from "./ai.errors";
/** 只投影公共读模型，不改变业务采纳状态或领取依据。 */
export async function projectExecutionTasks(db:Db,ctx:RequestContext,rows:TaskRow[]):Promise<AITaskResource[]>{
  const ids=rows.flatMap(row=>row.executionTaskId ? [row.executionTaskId] : []);
  if(!ids.length)return rows.map(toTaskDto);
  const executions=await db.select().from(executionTasks).where(and(inArray(executionTasks.id,ids),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx)));
  return rows.map(row=>{
    const dto=toTaskDto(row);if(!row.executionTaskId)return dto;
    const execution=executions.find(item=>item.id===row.executionTaskId && item.kind==="ai_task" && item.ownerType==="ai_task" && item.ownerId===row.id);
    if(!execution)throw new ConflictError("执行任务归属映射不一致");
    const status:AITaskResource["status"]=execution.status==="failed" ? "failed" : execution.status==="cancelled" ? "cancelled" : ["succeeded","partial"].includes(execution.status) ? dto.status : ["queued","retry_wait"].includes(execution.status) ? "queued" : "running";
    return {...dto,status,executionTaskId:execution.id,runtimeStatus:execution.status,
      errorMessage:execution.lastErrorMessage ?? dto.errorMessage,
      errorCode:execution.lastErrorCode,
    };
  });
}
