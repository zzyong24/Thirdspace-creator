import type {ENDPOINTS} from "@creatoros/contract";
export type DailyReport=typeof ENDPOINTS.getDailyReport.response["_output"];
// SEMANTIC_BOUNDARY_ALLOW: 同义指标字段归一，不作内容归因或创作选择。
export const METRICS=[{key:"views",label:"播放",aliases:["views","plays"]},{key:"likes",label:"点赞",aliases:["likes","digg"]},{key:"comments",label:"评论",aliases:["comments"]},{key:"shares",label:"分享",aliases:["shares"]},{key:"favorites",label:"收藏",aliases:["favorites","collect"]}] as const;
export function metricValue(raw:Record<string,number>,aliases:readonly string[]){return aliases.map(k=>raw[k]).find(v=>typeof v==="number"&&Number.isFinite(v))??null;}
export function totals(report:DailyReport){return METRICS.map(m=>{const values=report.works.map(w=>metricValue(w.metrics,m.aliases)).filter((v):v is number=>v!==null);return {...m,value:values.length?values.reduce((a,b)=>a+b,0):null,coverage:values.length};});}
export function displayNumber(value:number|null){return value===null?"暂无":value.toLocaleString("zh-CN");}
export function beijingTime(value:string){return new Date(value).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});}

export type {DailyReportAnalysis} from "@creatoros/contract";
export type ReportWork = DailyReport["works"][number];
export type RecentWork = Pick<ReportWork,"publicationId"|"projectId"|"title"|"publishedAt"|"capturedAt"|"metrics">;
export function recentWorks(report:DailyReport):RecentWork[]{return (report as DailyReport & {recentWorks?:RecentWork[]}).recentWorks??[];}
// SEMANTIC_BOUNDARY_ALLOW: 已归一化的百分数及其补数，只作图表展示，不作内容优劣判断。
export function percentage(raw:Record<string,number>,key:string){const n=metricValue(raw,[key]);return n!==null&&n>=0&&n<=100?n:null;}
export function displayRate(n:number|null){return n===null?"暂无":`${n.toLocaleString("zh-CN",{maximumFractionDigits:2})}%`;}
export function retention(work:ReportWork|undefined){const raw=work?.metrics??{},bounce=percentage(raw,"bounce_2s_rate");return [{label:"2 秒留存",value:bounce===null?null:100-bounce},{label:"5 秒留存",value:percentage(raw,"finish_5s_rate")},{label:"完整观看",value:percentage(raw,"finish_rate")}];}
export function sumMetric(report:DailyReport,aliases:readonly string[]){const values=report.works.map(w=>metricValue(w.metrics,aliases)).filter((v):v is number=>v!==null);return {value:values.length?values.reduce((a,b)=>a+b,0):null,coverage:values.length};}
export function overviewMetrics(report:DailyReport,work:ReportWork|undefined){const views=sumMetric(report,["views","plays"]),likes=sumMetric(report,["likes","digg"]),comments=sumMetric(report,["comments"]),profile=sumMetric(report,["profile_visits"]);return [
 {label:"当前累计播放",value:displayNumber(views.value),note:`${views.coverage}/${report.works.length} 条有播放数据`},
 {label:"点赞 / 评论",value:`${displayNumber(likes.value)} / ${displayNumber(comments.value)}`,note:`点赞 ${likes.coverage}/${report.works.length} · 评论 ${comments.coverage}/${report.works.length} 条有数据`},
 {label:"5 秒留存率",value:displayRate(percentage(work?.metrics??{},"finish_5s_rate")),note:work?`所选作品 · ${work.title}`:"暂无可观察作品"},
 {label:"主页访问",value:displayNumber(profile.value),note:`${profile.coverage}/${report.works.length} 条有数据`},
 ];}
