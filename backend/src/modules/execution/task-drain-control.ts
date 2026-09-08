/** 队列消费者的宿主停止边界；不改变任务状态或租约权威。 */
export interface TaskDrainControl {signal?:AbortSignal;shouldStop?:()=>boolean}
export function isTaskDrainStopping(control:TaskDrainControl){return control.signal?.aborted===true||control.shouldStop?.()===true;}
