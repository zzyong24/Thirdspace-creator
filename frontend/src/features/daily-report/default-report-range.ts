import {yesterdayBeijing} from "@creatoros/backend/application/queries/daily-report";
/**
 * 运营分析默认看「近 7 天」（截至昨天，北京时间）。只看昨天经常全是 0，
 * 第一眼像坏了（月明录屏 2026-11-10）。与快捷项「近 7 天」同一口径。
 */
export function defaultReportRange(nowIso:string):{startDate:string;endDate:string}{
 const endDate=yesterdayBeijing(nowIso).date,start=new Date(`${endDate}T00:00:00Z`);
 start.setUTCDate(start.getUTCDate()-6);
 return {startDate:start.toISOString().slice(0,10),endDate};
}
