import type { RadarItemDetail } from "./intelligence-workbench-types";
type Transform=RadarItemDetail["transforms"][number];
type Status=Transform["taskStatus"]|Transform["taskRuntimeStatus"];
export function topicTaskStatus(transform:Transform|null|undefined){return transform?.taskRuntimeStatus??transform?.taskStatus;}
export function isTopicTaskPolling(status:Status){return ["queued","running","retry_wait","pause_requested","cancel_requested"].includes(status??"");}
export function isTopicTaskPending(status:Status){return isTopicTaskPolling(status)||["paused","waiting_user","unknown_result"].includes(status??"");}
export function topicTaskAttention(status:Status):string|null{
 switch(status){
  case "unknown_result":return "执行结果尚未确认，请先核对原调用，不要重复生成。";
  case "waiting_user":return "任务等待授权或补充信息，处理后可继续原任务。";
  case "paused":return "任务已暂停，可以继续原任务。";
  case "blocked":return "生成任务已受阻，请按候选卡提示处理后重试。";
  case "cancelled":return "生成任务已取消，已有结果会保留。";
  case "failed":return "生成任务已失败，可查看候选卡中的原因并重新生成。";
  default:return null;
 }
}
export function canRetryTopicTask(status:Status){return ["failed","blocked","cancelled"].includes(status??"");}
