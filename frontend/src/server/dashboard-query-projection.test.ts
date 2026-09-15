import { expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { withDashboardAnalyticsCache } from "./dashboard-query-projection";
const ctx={userId:'t988-user',accountId:'a',source:'user'} as RequestContext;
it("同号相同范围并发复用，账号/范围/数据版本变化独立；失败不会被缓存",async()=>{
 let revision='1';const getDashboardRollup=vi.fn(async()=>({plays:100}));const getDailyPlayTrend=vi.fn(async()=>[{day:'2026-09-14',plays:10}]);
 const cache=withDashboardAnalyticsCache({getDashboardRollup,getDailyPlayTrend} as unknown as Parameters<typeof withDashboardAnalyticsCache>[0],async()=>revision);
 await Promise.all([cache.getDashboardRollup(ctx),cache.getDashboardRollup(ctx)]);expect(getDashboardRollup).toHaveBeenCalledTimes(1);
 await cache.getDashboardRollup({...ctx,accountId:'b'});await cache.getDashboardRollup(ctx,{publicationIds:[]});expect(getDashboardRollup).toHaveBeenCalledTimes(3);
 revision='2';await cache.getDashboardRollup(ctx);expect(getDashboardRollup).toHaveBeenCalledTimes(4);
 await cache.getDailyPlayTrend(ctx,{days:7});await cache.getDailyPlayTrend(ctx,{days:7});expect(getDailyPlayTrend).toHaveBeenCalledTimes(1);
 getDailyPlayTrend.mockRejectedValueOnce(new Error('offline'));revision='3';await expect(cache.getDailyPlayTrend(ctx,{days:7})).rejects.toThrow('offline');await cache.getDailyPlayTrend(ctx,{days:7});expect(getDailyPlayTrend).toHaveBeenCalledTimes(3);
});
