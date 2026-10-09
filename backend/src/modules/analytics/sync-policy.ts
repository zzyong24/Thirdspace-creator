/** SEMANTIC_BOUNDARY_ALLOW: 用户明确指定的时间/成功水位调度，不做内容选择。 */
const HOUR=3_600_000;
export type SyncCapability='metrics'|'comments'|'content'|'cover';
export function syncIntervalMs(publishedAt:string|null|undefined,now:string):number{
 const age=Date.parse(now)-Date.parse(publishedAt??'');
 return !Number.isFinite(age)||age<7*24*HOUR?2*HOUR:age<30*24*HOUR?6*HOUR:24*HOUR;
}
export function isSyncDue(row:{publishedAt?:string|null;lastSucceededAt?:string|null;retryAt?:string|null},now:string,capability?:SyncCapability):boolean{
 const at=Date.parse(now);
 if(row.retryAt&&Number.isFinite(Date.parse(row.retryAt)))return Date.parse(row.retryAt)<=at;
 const succeededAt=Date.parse(row.lastSucceededAt??'');
 if(!row.lastSucceededAt||!Number.isFinite(succeededAt)||succeededAt>at)return true;
 const interval=syncIntervalMs(row.publishedAt,now);
 // 每日指标按北京时间已成功的日期到期，避免完成耗时把次日固定启动延到隔天。
 // 失败退避仍在上方优先；短周期、其他能力及未指定能力的既有调用保留经过时间规则。
 if(capability==='metrics'&&interval===24*HOUR&&Number.isFinite(at))
  return Math.floor((at+8*HOUR)/(24*HOUR))!==Math.floor((succeededAt+8*HOUR)/(24*HOUR));
 return at-succeededAt>=interval;
}
