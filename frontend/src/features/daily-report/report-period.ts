import type {DailyReport} from './report-metrics';
export function reportPeriod(report:DailyReport){const value=report as DailyReport & {startDate?:string;endDate?:string};return {startDate:value.startDate??report.date,endDate:value.endDate??report.date};}
export function reportPeriodLabel(report:DailyReport){const r=reportPeriod(report);return r.startDate===r.endDate?r.startDate:`${r.startDate} 至 ${r.endDate}`;}
export function reportFileDate(report:DailyReport){return reportPeriodLabel(report).replace(' 至 ','_');}
