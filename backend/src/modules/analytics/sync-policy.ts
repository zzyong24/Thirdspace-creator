/** SEMANTIC_BOUNDARY_ALLOW: 用户明确指定的时间/成功水位调度，不做内容选择。 */
const HOUR=3_600_000;
export type SyncCapability='metrics'|'comments'|'content'|'cover';
export function syncIntervalMs(publishedAt:string|null|undefined,now:string):number{
 const age=Date.parse(now)-Date.parse(publishedAt??'');
 return !Number.isFinite(age)||age<7*24*HOUR?2*HOUR:age<30*24*HOUR?6*HOUR:24*HOUR;
}
export function isSyncDue(row:{publishedAt?:string|null;lastSucceededAt?:string|null;retryAt?:string|null},now:string):boolean{
 const at=Date.parse(now);
 if(row.retryAt&&Number.isFinite(Date.parse(row.retryAt)))return Date.parse(row.retryAt)<=at;
 return !row.lastSucceededAt||!Number.isFinite(Date.parse(row.lastSucceededAt))||Date.parse(row.lastSucceededAt)>at||at-Date.parse(row.lastSucceededAt)>=syncIntervalMs(row.publishedAt,now);
}
