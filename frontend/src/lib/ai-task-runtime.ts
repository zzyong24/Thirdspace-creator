export interface RuntimeTask {status:string;executionTaskId?:string|null;runtimeStatus?:string|null}
/** 业务投影可压成 failed/running；执行状态存在时以原执行状态为准。 */
export const taskRuntimeStatus=(task:RuntimeTask)=>{
 if(!task.executionTaskId)return task.status;
 if(task.status==='awaiting_confirmation'&&task.runtimeStatus==='succeeded')return task.status;
 return task.runtimeStatus??task.status;
};
