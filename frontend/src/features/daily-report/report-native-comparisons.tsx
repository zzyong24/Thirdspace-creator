import Link from "next/link";
import {HorizontalBarsChart} from "@/components/analytics/horizontal-bars-chart";
import {nativeMetric,type DailyReport} from "./report-metrics";
import {platformName} from "@/features/group-workspace/workspace-query";
import styles from "./daily-report.module.css";
/** SEMANTIC_BOUNDARY_ALLOW: 各原生指标只按已采集的数值排序，共用零起点，不选择内容。 */
export function ReportNativeComparisons({report,accountNames={},showReviewLinks=true,showContentTitle=true}:{report:DailyReport;accountNames?:Readonly<Record<string,string>>;showReviewLinks?:boolean;showContentTitle?:boolean}){
 const label=(w:DailyReport["works"][number])=>[w.platform?platformName(w.platform):null,w.accountId?accountNames[w.accountId]:null,showContentTitle&&new Set(report.works.map(work=>work.projectId)).size>1?w.title:null].filter(Boolean).join(" · ");
 const reviewQuery=new URLSearchParams({startDate:report.startDate??report.date,endDate:report.endDate??report.date});
 if(report.platform)reviewQuery.set("platform",report.platform);
 if(report.selectedAccountId)reviewQuery.set("accountId",report.selectedAccountId);
 const projects=[...new Map(report.works.map(w=>[w.projectId,w])).values()];
 const data=(metric:"views"|"reads")=>report.works.map(w=>({label:label(w),value:nativeMetric(w,metric)})).filter((row):row is {label:string;value:number}=>row.value!==null).sort((a,b)=>b.value-a.value);
 const missing=report.works.filter(w=>nativeMetric(w,"views")===null&&nativeMetric(w,"reads")===null);
 return <section aria-label="平台原生指标比较"><div className={styles.sectionHead}><h2>作品表现比较</h2><span className={styles.muted}>所选期间发布作品的累计表现 · 次</span></div><div className={styles.grid}>{([{key:"views",title:"视频播放比较",slot:"report-views"},{key:"reads",title:"文章阅读比较",slot:"report-reads"}] as const).map(m=><section className={styles.panel} key={m.key}><h3 className="mb-4 text-sm font-semibold">{m.title}</h3><HorizontalBarsChart slot={m.slot} shape={m.key} unit="次" data={data(m.key)} emptyMessage={!report.works.length?"所选期间暂无发布记录":report.works.some(w=>m.key==="reads"?w.platform==="wechatOfficial":w.platform!=="wechatOfficial")?`尚未采集${m.key==="reads"?"文章阅读":"视频播放"}指标`:`当前筛选作品不含${m.key==="reads"?"文章阅读":"视频播放"}指标`} summary={`${m.title}，使用真实累计值，不同指标分开坐标。`}/></section>)}</div><p className="mt-3 text-xs text-muted-foreground">指标截至各作品采集时刻，各账号时间见下方发布记录。</p>{showReviewLinks&&<div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{projects.map(w=><Link key={w.projectId} href={`/projects/${w.projectId}/review?${reviewQuery}`} className="text-sm text-brand underline-offset-4 hover:underline">{w.title} · 复盘 →</Link>)}</div>}{missing.length>0&&<p className="mt-3 text-xs text-muted-foreground">暂无指标快照：{missing.map(label).join("、")}</p>}</section>;
}
