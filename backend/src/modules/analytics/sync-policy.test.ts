import {expect,it} from 'vitest';
import {syncIntervalMs,isSyncDue,type SyncCapability} from './sync-policy';
const now='2026-09-13T00:00:00.000Z',hour=3600000;
it('按真实经过时间划分7/30天边界，缺日期与未来日期按最新档',()=>{
 for(const [days,hours] of [[0,2],[6.999,2],[7,6],[29.999,6],[30,24],[100,24]])expect(syncIntervalMs(new Date(Date.parse(now)-days!*24*hour).toISOString(),now)).toBe(hours!*hour);
 expect(syncIntervalMs(null,now)).toBe(2*hour);expect(syncIntervalMs('bad',now)).toBe(2*hour);expect(syncIntervalMs('2027-01-01',now)).toBe(2*hour);
});
it('失败不替代成功时间，重试退避独立，边界到期',()=>{
 expect(isSyncDue({publishedAt:now,lastSucceededAt:'2026-09-12T22:00:00Z'},now)).toBe(true);
 expect(isSyncDue({publishedAt:now,lastSucceededAt:'2026-09-12T23:00:00Z'},now)).toBe(false);
 expect(isSyncDue({publishedAt:now,lastSucceededAt:null,retryAt:'2026-09-13T00:05:00Z'},now)).toBe(false);
 expect(isSyncDue({publishedAt:now,lastSucceededAt:'2026-09-12T23:59:00Z',retryAt:now},now)).toBe(true);
});

const oldPublishedAt='2026-01-01T00:00:00Z';
it('T1106 老作品指标次日固定时刻到期，完成耗时不使每日采集隔天',()=>{
 const row={publishedAt:oldPublishedAt,lastSucceededAt:'2026-09-12T01:01:00Z'};
 const nextStart='2026-09-13T01:00:00Z';
 expect(isSyncDue(row,nextStart,'metrics')).toBe(true);
 expect(isSyncDue(row,nextStart)).toBe(false);
 for(const capability of ['comments','content','cover'] as SyncCapability[])
  expect(isSyncDue(row,nextStart,capability)).toBe(false);
});

it('T1106 仅指标24小时档按北京时间午夜切日，同日成功不重复',()=>{
 const beforeMidnight={publishedAt:oldPublishedAt,lastSucceededAt:'2026-09-12T15:59:59Z'};
 expect(isSyncDue(beforeMidnight,'2026-09-12T15:59:59Z','metrics')).toBe(false);
 expect(isSyncDue(beforeMidnight,'2026-09-12T16:00:00Z','metrics')).toBe(true);
 const midnight={publishedAt:oldPublishedAt,lastSucceededAt:'2026-09-12T16:00:00Z'};
 expect(isSyncDue(midnight,'2026-09-13T15:59:59Z','metrics')).toBe(false);
 expect(isSyncDue(midnight,'2026-09-13T16:00:00Z','metrics')).toBe(true);
});

it('T1106 metrics短周期及30天分档边界仍按真实经过时间',()=>{
 const lastSucceededAt='2026-09-12T15:59:00Z';
 const nextDay='2026-09-12T16:00:00Z';
 for(const [age,interval] of [[0,2],[7,6],[29.5,6]] as const){
  const publishedAt=new Date(Date.parse(nextDay)-age*24*hour).toISOString();
  expect(isSyncDue({publishedAt,lastSucceededAt},nextDay,'metrics')).toBe(false);
  const exact=new Date(Date.parse(lastSucceededAt)+interval*hour).toISOString();
  expect(isSyncDue({publishedAt,lastSucceededAt},exact,'metrics')).toBe(true);
 }
 for(const [age,due] of [[29.999,false],[30,true]] as const){
  const publishedAt=new Date(Date.parse(nextDay)-age*24*hour).toISOString();
  expect(isSyncDue({publishedAt,lastSucceededAt},nextDay,'metrics')).toBe(due);
 }
});

it('T1106 失败退避优先于跨日资格，缺失非法和未来水位保留恢复规则',()=>{
 const now='2026-09-12T16:00:00Z';
 const row={publishedAt:oldPublishedAt,lastSucceededAt:'2026-09-12T15:59:00Z'};
 expect(isSyncDue({...row,retryAt:'2026-09-12T16:15:00Z'},now,'metrics')).toBe(false);
 expect(isSyncDue({...row,retryAt:now},now,'metrics')).toBe(true);
 expect(isSyncDue({...row,retryAt:'bad'},now,'metrics')).toBe(true);
 const sameDay={publishedAt:oldPublishedAt,lastSucceededAt:now,retryAt:'2026-09-12T16:15:00Z'};
 expect(isSyncDue(sameDay,sameDay.retryAt,'metrics')).toBe(true);
 for(const lastSucceededAt of [undefined,null,'bad','2026-09-12T16:01:00Z'])
  expect(isSyncDue({publishedAt:oldPublishedAt,lastSucceededAt},now,'metrics')).toBe(true);
 expect(isSyncDue(row,'bad','metrics')).toBe(false);
 expect(isSyncDue({publishedAt:'bad',lastSucceededAt:row.lastSucceededAt},now,'metrics')).toBe(false);
});
