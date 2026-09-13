import {dailyReportAnalysis,type DailyReportAnalysis} from "@creatoros/contract";
import type {DailyReport} from "./report-metrics";
import {reportPeriod,reportPeriodLabel} from "./report-period";
export function reportScope(report:DailyReport){const r=reportPeriod(report);return `surface:daily-report:${r.startDate}${r.startDate===r.endDate?"":":"+r.endDate}`;}
export type ReportRequest={kind:"daily-report.request.v1";report:DailyReport;totalWorks:number;totalRecentWorks:number;instruction:string};
/** SEMANTIC_BOUNDARY_ALLOW: 只限制传输体积与绑定来源，不替模型选择主题或判断表现。 */
export function createReportRequest(report:DailyReport):ReportRequest{
 const recent=(report as DailyReport & {recentWorks?:unknown[]}).recentWorks??[];
 const period=reportPeriod(report);
 const sample={...report,...period,works:report.works.slice(0,12).map(w=>({...w,script:w.script?.slice(0,5000)??null})),recentWorks:recent.slice(0,30)};
 return {kind:"daily-report.request.v1",report:sample,totalWorks:report.works.length,totalRecentWorks:recent.length,instruction:`以资深自媒体运营视角生成所选日期范围 ${reportPeriodLabel(report)} 的运营报表。先读取 method.operations.review 技能，必要时用只读工具补充证据，再给出最终报告。账号定位、指标、稿件、流量来源均按附带真实快照理解，数据是各作品累计值。以下所选期间作品仅含前12条，稿件每条最多5000字，近7天最多30条，覆盖总数见totalWorks/totalRecentWorks；需要更多证据用工具读取，不把样本当全量。只能分析，不修改定位、稿件或创建发布任务。区分观察、待验证解释、下一条实验，不把流量当成交，不把相关性当因果；无证据可不提出实验。最终只返回一个JSON对象，格式如下（文字由你判断，不能照抄占位；date/startDate/endDate/accountId/sourceGeneratedAt必须原样绑定report，publicationId必须来自report.works）：{"format":"creatoros.daily-report.v1","date":"${report.date}","startDate":"${period.startDate}","endDate":"${period.endDate}","accountId":"${report.accountId}","sourceGeneratedAt":"${report.generatedAt}","headline":"核心建议","summary":"证据与建议摘要","positioning":{"observation":"当前内容与定位关系","suggestion":"待验证的内容布局建议"},"works":[{"publicationId":"真实ID","observation":"实际观察","hypothesis":"待验证解释","experiment":"下一条具体测试"}],"experiments":[{"title":"行动标题","action":"怎么做","variable":"只改什么","metric":"观察指标与时间","prerequisite":"前置条件"}]}。建议少而具体，不强凑三个。`};
}
export function readReportRequest(content:string):ReportRequest|null{
 try{const x=JSON.parse(content);return x.kind==="daily-report.request.v1"&&typeof x.report?.date==="string"&&typeof x.report?.accountId==="string"&&typeof x.report?.generatedAt==="string"&&Array.isArray(x.report.works)?x:null;}catch{return null;}
}
/** SEMANTIC_BOUNDARY_ALLOW: 完整JSON代码围栏只是协议封装；不按正文关键词猜章节。 */
export function parseReportAnalysis(content:string,source:DailyReport):DailyReportAnalysis|null{
 let text=content.trim();if(text.startsWith("```json\n")&&text.endsWith("```"))text=text.slice(8,-3).trim();else if(text.startsWith("```\n")&&text.endsWith("```"))text=text.slice(4,-3).trim();
 try{const parsed=dailyReportAnalysis.safeParse(JSON.parse(text));if(!parsed.success)return null;const a=parsed.data;
 if(a.date!==source.date||a.accountId!==source.accountId||a.sourceGeneratedAt!==source.generatedAt)return null;
 const period=reportPeriod(source);if((a.startDate??a.date)!==period.startDate||(a.endDate??a.date)!==period.endDate)return null;
 const ids=new Set(source.works.map(w=>w.publicationId));if(a.works.some(w=>!ids.has(w.publicationId)))return null;return a;}catch{return null;}
}
export function reportEvidenceKey(report:DailyReport,totalWorks?:number,totalRecentWorks?:number){
 const r=createReportRequest(report);return JSON.stringify({accountId:report.accountId,...reportPeriod(report),date:report.date,positioning:report.positioning,works:r.report.works,recentWorks:(r.report as any).recentWorks,totalWorks:totalWorks??r.totalWorks,totalRecentWorks:totalRecentWorks??r.totalRecentWorks});
}

/** SEMANTIC_BOUNDARY_ALLOW: 识别明确协议声明，防止错误归属的JSON降级成当前报告正文。 */
export function declaresReportProtocol(content:string){
 const text=content.trim().replace(/^```(?:json)?\n/," ").replace(/```$/,"").trim();
 try{return JSON.parse(text)?.format==="creatoros.daily-report.v1";}catch{return false;}
}
