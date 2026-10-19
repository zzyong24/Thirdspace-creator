import {dailyReportAnalysis,type DailyReportAnalysis} from "@creatoros/contract";
import type {DailyReport} from "./report-metrics";
import {reportPeriod,reportPeriodLabel} from "./report-period";
export function reportSelectedAccount(report:DailyReport){return report.selectedAccountId===undefined?report.accountId:report.selectedAccountId;}
export function hasReportScope(report:DailyReport){return Boolean(report.groupId||report.accountId);}
/** SEMANTIC_BOUNDARY_ALLOW: 将用户明确选择的真实组、平台、账号和日期编码为独立会话桶，不决定创作内容。 */
export function reportScope(report:DailyReport){const r=reportPeriod(report);const dates=`${r.startDate}${r.startDate===r.endDate?"":":"+r.endDate}`;return report.groupId?`surface:daily-report:group:${encodeURIComponent(report.groupId)}:platform:${encodeURIComponent(report.platform??"all")}:account:${encodeURIComponent(reportSelectedAccount(report)??"all")}:${dates}`:`surface:daily-report:${dates}`;}
export type ReportRequest={kind:"daily-report.request.v1";report:DailyReport;totalWorks:number;totalRecentWorks:number;instruction:string};
/** SEMANTIC_BOUNDARY_ALLOW: 只限制传输体积与绑定来源，不替模型选择主题或判断表现。 */
export function createReportRequest(report:DailyReport):ReportRequest{
 const recent:DailyReport["recentWorks"]=[];
 const period=reportPeriod(report);
 const groupBinding=report.groupId?`"groupId":${JSON.stringify(report.groupId)},"platform":${JSON.stringify(report.platform??null)},"selectedAccountId":${JSON.stringify(reportSelectedAccount(report))},`:"";
 const sample={...report,...period,works:report.works.slice(0,12).map(w=>({...w,script:w.script?.slice(0,5000)??null})),recentWorks:recent.slice(0,30)};
 return {kind:"daily-report.request.v1",report:sample,totalWorks:report.works.length,totalRecentWorks:recent.length,instruction:`面向内容创作者，用普通人看得懂的简体中文生成所选日期范围 ${reportPeriodLabel(report)} 的运营报表。先读取 method.operations.review 技能，必要时用只读工具补充证据，再给出最终报告。账号定位、指标、稿件、流量来源均按附带真实快照理解，数据是各作品累计值。以下所选期间作品仅含前12条，稿件每条最多5000字，覆盖总数见totalWorks；只分析所选周期内作品，不自动混入固定近7天参照；需要更多证据用工具读取，不把样本当全量。只能分析，不修改定位、稿件或创建发布任务。区分观察、待验证解释、下一条实验，不把流量当成交，不把相关性当因果；无证据可不提出实验。最终只返回一个JSON对象，格式如下（文字由你判断，不能照抄占位；date/startDate/endDate/accountId/groupId/platform/selectedAccountId/sourceGeneratedAt必须原样绑定report，publicationId必须来自report.works）：{"format":"creatoros.daily-report.v1","date":"${report.date}","startDate":"${period.startDate}","endDate":"${period.endDate}","accountId":${JSON.stringify(report.accountId)},${groupBinding}"sourceGeneratedAt":"${report.generatedAt}","headline":"核心建议","summary":"证据与建议摘要","directions":[{"title":"阶段内容方向","evidence":"观察到的真实作品表现及数据口径","recommendation":"这一阶段继续、调整或暂缓什么内容","nextStep":"下一周或下一批具体怎么安排","signal":"用什么指标、在什么时间复盘"}],"positioning":{"observation":"当前内容与定位关系","suggestion":"待验证的内容布局建议"},"works":[{"publicationId":"真实ID","observation":"实际观察","hypothesis":"待验证解释","experiment":"下一条具体测试"}],"experiments":[{"title":"行动标题","action":"怎么做","variable":"只改什么","metric":"观察指标与时间","prerequisite":"前置条件"}]}。表达要求：headline最多40字，只写一个清楚结论；summary最多140字，不堆全部指标；每段建议只写一个动作。正文不得出现内部ID、原始字段名（如profile_visits）、Position/Hook/CTR、A线B线、证据链、承接位、资源链接四件套等软件或编导黑话，用“主页访问、开头、账号定位、下一步怎么做”等具体大白话表达，资源ID只出现在绑定字段。仅有推荐页占比不能证明冷启动、人群标签；单一跳出或完播数据不能确定封面/中段/目标人群失败，解释必须标明待验证，不能写成因果定论。标题与摘要只负责总判断，不代替完整的周期策略。单日可返回空directions；周/月有多条可比较作品和足够指标时，给出2到4条不重复的阶段方向，分别覆盖真实有证据的内容取舍、账号定位与关注承接等经营决策，而不是把一条作品的改稿建议拆成多条。每条方向用evidence交代所选周期内哪些作品或数据支持、指标是累计值且发布时间可能不同；recommendation说明继续、调整或暂缓什么；nextStep给出下一周或下一批内容安排；signal给出观察指标与复盘时间。证据只够一个方向时就写一个；样本不足、来源缺失或只有播放量时不得硬凑，也不能把涨粉、咨询或成交编造出来。战略方向与experiments分工：前者决定一段时间的内容组合，后者只验证下一条作品的一个变量；不能重复改写同一句话。把读者当作每天忙着拍视频的创作者：先说这段时间哪类作品更值得继续做，再说下条具体拍什么、改哪里、看什么指标。headline用一句日常表达，不罗列多个问题；summary只写2到3个短句，挑1到2个最相关数字支撑，不复述标题。定位建议用具体内容方向描述，不沿用定位档案中的A/B线、操盘手、切片、容器等代号。每条observation、hypothesis、experiment分别最多80字；观察只讲已有事实，解释明确是待验证的猜测，实验只写一个可执行动作。缺少目标人群证据时不得断言观众与定位错配；缺少原片证据时不得断言画面、封面或演示缺失。不要陈述自己读取技能、工具或推理的过程。`};
}
export function readReportRequest(content:string):ReportRequest|null{
 try{const x=JSON.parse(content);return x.kind==="daily-report.request.v1"&&typeof x.report?.date==="string"&&(typeof x.report?.accountId==="string"||typeof x.report?.groupId==="string")&&typeof x.report?.generatedAt==="string"&&Array.isArray(x.report.works)?x:null;}catch{return null;}
}
/** SEMANTIC_BOUNDARY_ALLOW: 只识别JSON对象边界和显式协议标记，不解释前言或按关键词猜业务章节。 */
function reportObjects(content:string):unknown[]{
 const isReport=(x:unknown)=>Boolean(x&&typeof x==='object'&&(x as {format?:unknown}).format==='creatoros.daily-report.v1');
 try{const whole:unknown=JSON.parse(content);return isReport(whole)?[whole]:[];}catch{/* 兼容真实模型的前言、尾注和Markdown围栏。 */}
 const results:unknown[]=[];
 for(let start=0;start<content.length;start++){
  if(content[start]!=='{')continue;
  let depth=0,quoted=false,escaped=false;
  for(let end=start;end<content.length;end++){
   const c=content[end];
   if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
   if(c==='"'){quoted=true;continue;}if(c==='{')depth++;else if(c==='}')depth--;
   if(depth===0){try{const object:unknown=JSON.parse(content.slice(start,end+1));if(isReport(object))results.push(object);start=end;}catch{/* 非JSON的普通花括号不参与协议。 */}break;}
  }
 }
 return results;
}
export function parseReportAnalysis(content:string,source:DailyReport):DailyReportAnalysis|null{
 const candidates=reportObjects(content);if(candidates.length!==1)return null;
 const parsed=dailyReportAnalysis.safeParse(candidates[0]);if(!parsed.success)return null;const a=parsed.data;
 if(a.date!==source.date||a.accountId!==source.accountId||a.sourceGeneratedAt!==source.generatedAt)return null;
 if((a.groupId??null)!==(source.groupId??null))return null;
 if(source.groupId&&((a.platform??null)!==(source.platform??null)||(a.selectedAccountId??a.accountId)!==reportSelectedAccount(source)))return null;
 const period=reportPeriod(source);if((a.startDate??a.date)!==period.startDate||(a.endDate??a.date)!==period.endDate)return null;
 const ids=new Set(source.works.map(w=>w.publicationId));if(a.works.some(w=>!ids.has(w.publicationId)))return null;return a;
}
export function reportEvidenceKey(report:DailyReport,totalWorks?:number,totalRecentWorks?:number){
 const r=createReportRequest(report);return JSON.stringify({groupId:report.groupId??null,platform:report.platform??null,selectedAccountId:reportSelectedAccount(report),accountId:report.accountId,...reportPeriod(report),date:report.date,positioning:report.positioning,works:r.report.works,recentWorks:r.report.recentWorks,totalWorks:totalWorks??r.totalWorks,totalRecentWorks:totalRecentWorks??r.totalRecentWorks});
}

/** SEMANTIC_BOUNDARY_ALLOW: 识别明确协议声明，防止错误归属的JSON降级成当前报告正文。 */
export function declaresReportProtocol(content:string){return reportObjects(content).length>0;}
