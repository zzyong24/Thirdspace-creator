import {expect,it} from 'vitest';
import {syncIntervalMs,isSyncDue} from './sync-policy';
const now='2026-09-13T00:00:00.000Z',hour=3600000;
it('按真实经过时间划分7/30天边界，缺日期与未来日期按最新档',()=>{
 for(const [days,hours] of [[0,2],[6.999,2],[7,6],[29.999,6],[30,24],[100,24]])expect(syncIntervalMs(new Date(Date.parse(now)-days!*24*hour).toISOString(),now)).toBe(hours!*hour);
 expect(syncIntervalMs(null,now)).toBe(2*hour);expect(syncIntervalMs('bad',now)).toBe(2*hour);expect(syncIntervalMs('2027-01-01',now)).toBe(2*hour);
});
it('失败不替代成功时间，重试退避独立，边界到期',()=>{
 expect(isSyncDue({publishedAt:now,lastSucceededAt:'2026-09-12T22:00:00Z'},now)).toBe(true);
 expect(isSyncDue({publishedAt:now,lastSucceededAt:'2026-09-12T23:00:00Z'},now)).toBe(false);
 expect(isSyncDue({publishedAt:now,lastSucceededAt:null,retryAt:'2026-09-13T00:05:00Z'},now)).toBe(false);
});
