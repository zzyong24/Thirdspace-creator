import type {DailyReport,DailyReportAnalysis} from './report-metrics';
// SEMANTIC_BOUNDARY_ALLOW: 只翻译展示层的协议字段和精确资源ID，不改变数值、因果或运营判断。
const labels:Record<string,string>={profile_visits:'主页访问',follower_gain:'作品带来的关注',finish_5s_rate:'5秒留存率',finish_rate:'完播率',bounce_2s_rate:'2秒跳出率',avg_duration_sec:'平均观看秒数',bounce_2s:'2秒跳出率',Hook:'开头吸引力',hook:'开头吸引力',Position:'账号定位',positioning:'账号定位',CTR:'点击率',sourceGeneratedAt:'数据采集时间',publicationId:'作品',accountId:'账号'};
export function reportUserText(text:string,report:DailyReport):string{
 let result=text;
 const resources=[...report.works.flatMap(w=>[[w.publicationId,`《${w.title}》`],[w.projectId,`《${w.title}》`]]),...(report.accountId?[[report.accountId,report.accountName??'当前账号']]:[])];
 for(const [id,label] of resources)if(id)result=result.split(id).join(label);
 result=result.replace(/\b(profile_visits|follower_gain|finish_5s_rate|finish_rate|bounce_2s_rate|avg_duration_sec|bounce_2s|Hook|hook|Position|positioning|CTR|sourceGeneratedAt|publicationId|accountId)\b/g,word=>labels[word]!);
 // 未映射的系统资源标识不公开展示；不将任意英文产品名当作内部术语。
 result=result.replace(/\b(?:pub|project|acct|ai-msg|ai-conv)-[a-f0-9]+-[a-z0-9-]+\b/g,'');
 for(const w of report.works)result=result.split(`《${w.title}》《${w.title}》`).join(`《${w.title}》`);
 return result;
}
export function userFacingAnalysis(analysis:DailyReportAnalysis|null,report:DailyReport):DailyReportAnalysis|null{
 if(!analysis)return null;const t=(value:string)=>reportUserText(value,report);
 return {...analysis,headline:t(analysis.headline),summary:t(analysis.summary),directions:analysis.directions?.map(d=>({...d,title:t(d.title),evidence:t(d.evidence),recommendation:t(d.recommendation),nextStep:t(d.nextStep),signal:t(d.signal)})),positioning:{observation:t(analysis.positioning.observation),suggestion:t(analysis.positioning.suggestion)},works:analysis.works.map(w=>({...w,observation:t(w.observation),hypothesis:t(w.hypothesis),experiment:t(w.experiment)})),experiments:analysis.experiments.map(e=>({...e,title:t(e.title),action:t(e.action),variable:t(e.variable),metric:t(e.metric),prerequisite:t(e.prerequisite)}))};
}
