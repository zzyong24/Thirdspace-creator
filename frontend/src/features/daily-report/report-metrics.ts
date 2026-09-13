import type {ENDPOINTS} from "@creatoros/contract";
export type DailyReport=typeof ENDPOINTS.getDailyReport.response["_output"];
// SEMANTIC_BOUNDARY_ALLOW: 同义指标字段归一，不作内容归因或创作选择。
export const METRICS=[{key:"views",label:"播放",aliases:["views","plays"]},{key:"likes",label:"点赞",aliases:["likes","digg"]},{key:"comments",label:"评论",aliases:["comments"]},{key:"shares",label:"分享",aliases:["shares"]},{key:"favorites",label:"收藏",aliases:["favorites","collect"]}] as const;
export function metricValue(raw:Record<string,number>,aliases:readonly string[]){return aliases.map(k=>raw[k]).find(v=>typeof v==="number"&&Number.isFinite(v))??null;}
export function totals(report:DailyReport){return METRICS.map(m=>{const values=report.works.map(w=>metricValue(w.metrics,m.aliases)).filter((v):v is number=>v!==null);return {...m,value:values.length?values.reduce((a,b)=>a+b,0):null,coverage:values.length};});}
export function displayNumber(value:number|null){return value===null?"暂无":value.toLocaleString("zh-CN");}
export function beijingTime(value:string){return new Date(value).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});}
