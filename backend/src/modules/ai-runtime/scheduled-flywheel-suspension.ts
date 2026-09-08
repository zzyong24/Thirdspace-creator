/** 已交还原持久任务恢复；采集及可选增强的catch不得覆盖其状态。 */
export class ScheduledFlywheelSuspended extends Error {
 constructor(readonly executionTaskId:string,readonly runtimeStatus:string){super('SCHEDULED_FLYWHEEL_SUSPENDED');}
}
