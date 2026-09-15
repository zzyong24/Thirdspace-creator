import "server-only";
import type { AnalyticsService } from "@creatoros/backend/modules/analytics";
import { readCachedPageValue } from "@/lib/page-read-cache.server";

/** 只复用指标重读；账号基线、任务、排期不进入此缓存。复用既有容量/在途/版本失效。 */
export function withDashboardAnalyticsCache(
  analytics: Pick<AnalyticsService,"getDashboardRollup"|"getDailyPlayTrend">,
  readRevision: ()=>Promise<string>,
): Pick<AnalyticsService,"getDashboardRollup"|"getDailyPlayTrend"> {
  return {
    getDashboardRollup:(ctx,opts)=>readCachedPageValue({
      ctx,key:["dashboard","rollup",opts??null],readRevision,
      read:()=>analytics.getDashboardRollup(ctx,opts),isCacheable:()=>true,
    }),
    getDailyPlayTrend:(ctx,opts)=>readCachedPageValue({
      // 趋势沿用最近采样日口径，业务数据版本变化时失效。
      ctx,key:["dashboard","trend",opts??null],readRevision,
      read:()=>analytics.getDailyPlayTrend(ctx,opts),isCacheable:()=>true,
    }),
  };
}
