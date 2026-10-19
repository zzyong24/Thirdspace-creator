import {SectionCard} from '@/components/project/section-card';
import {ReportNativeComparisons} from '@/features/daily-report/report-native-comparisons';
import {nativeMetric,metricValue,beijingTime,type DailyReport} from '@/features/daily-report/report-metrics';
import {platformName} from '@/features/group-workspace/workspace-query';
/** SEMANTIC_BOUNDARY_ALLOW: 按已鉴权项目的真实ID裁剪服务返回事实，不用标题推断内容关联。 */
export function projectEvidence(report:DailyReport,projectId:string):DailyReport{
 return {...report,works:report.works.filter(w=>w.projectId===projectId),recentWorks:report.recentWorks.filter(w=>w.projectId===projectId)};
}
const count=(value:number|null)=>value===null?'—':value.toLocaleString('zh-CN');
export function GroupProjectEvidence({report,accountNames={}}:{report:DailyReport;accountNames?:Readonly<Record<string,string>>}){
 return <div className="flex min-w-0 flex-col gap-card-gap" aria-label="本期内容多平台数据">
  <ReportNativeComparisons report={report} accountNames={accountNames} showReviewLinks={false} showContentTitle={false}/>
  <SectionCard title="各平台发布版本" description={`${report.startDate??report.date} — ${report.endDate??report.date} · 期间发布版本的累计表现`}>
   {report.warnings.map(w=><p key={w} role="status" className="mb-3 text-sm text-warning">{w}</p>)}
   {!report.works.length?<p className="py-6 text-sm text-muted-foreground">本期内容在所选平台、账号和日期内暂无发布记录。仍可在右侧手动记录复盘。</p>:<div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><caption className="sr-only">同一期内容的各真实账号表现；未知为—，播放与阅读分别统计</caption><thead className="border-b border-border text-muted-foreground"><tr>{['平台账号','发布 / 采集时间','视频播放（次）','文章阅读（次）','点赞','评论','分享'].map(label=><th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{report.works.map(w=><tr key={w.publicationId} className="border-b border-border/60 last:border-0"><td className="max-w-52 p-3"><p className="font-medium">{platformName(w.platform??'')}</p><p className="break-words text-muted-foreground">{accountNames[w.accountId??'']??w.accountId??'—'}</p></td><td className="whitespace-nowrap p-3 text-muted-foreground"><p>{beijingTime(w.publishedAt)}</p><p>{w.capturedAt?beijingTime(w.capturedAt):'尚未采集'}</p></td>{[nativeMetric(w,'views'),nativeMetric(w,'reads'),metricValue(w.metrics,['likes','digg']),metricValue(w.metrics,['comments']),metricValue(w.metrics,['shares'])].map((n,i)=><td key={i} className="p-3 tabular-nums">{count(n)}</td>)}</tr>)}</tbody></table></div>}
  </SectionCard>
 </div>;
}
