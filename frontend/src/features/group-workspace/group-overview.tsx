import Link from "next/link";
import {SectionCard} from "@/components/project/section-card";
import {HorizontalBarsChart} from "@/components/analytics/horizontal-bars-chart";
import {platformName,WORKSPACE_PLATFORMS,type GroupWorkspace} from "./workspace-query";
const number=(n:number|null|undefined)=>n==null?"—":n.toLocaleString("zh-CN");
const captured=(s:string|null)=>s?new Date(s).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"采集时间未知";
/** SEMANTIC_BOUNDARY_ALLOW: 只按真实同口径数值排序、分开指标坐标，不判断内容质量。 */
export function GroupOverview({workspace:w}:{workspace:GroupWorkspace}){
 const chart=(metric:"views"|"reads")=>w.platforms.filter(p=>p[metric]!==null).map(p=>({label:platformName(p.platform),value:p[metric]!})).sort((a,b)=>b.value-a.value);
 const coverage=(platform:string,legacySamples:number)=>{
  if(!w.accounts.some(account=>account.platform===platform))return "未绑定账号";
  const metrics=w.collected?.state==='ready'?w.collected.metrics.filter(metric=>metric.platform===platform):[];
  if(legacySamples>0||metrics.some(metric=>metric.knownCount>0))return "已有采集指标";
  if(w.collected?.state==='unavailable')return "采集摘要暂不可读";
  if(metrics.some(metric=>metric.eligibleCount>0))return "部分指标暂缺";
  return "当前筛选内暂无指标";
 };
 return <div className="flex min-w-0 flex-col gap-section-gap" data-page="group-overview">
  <header className="flex min-w-0 flex-wrap items-start justify-between gap-4"><h1 className="text-2xl font-semibold">创作者总览</h1><div className="flex flex-wrap gap-2"><Link href="/accounts/works" className="rounded-control border border-border bg-surface px-3 py-2 text-sm hover:bg-muted">已采集作品</Link><Link href="/accounts" className="rounded-control border border-border bg-surface px-3 py-2 text-sm hover:bg-muted">管理账号组</Link></div></header>
  <section aria-label="账号组指标" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[{label:"一期内容（期）",value:w.contentCount},{label:"平台发布记录（条）",value:w.publicationCount},{label:"视频累计播放（次）",value:w.videoViews},{label:"文章累计阅读（次）",value:w.articleReads},{label:"累计浏览（次）",value:w.browseViews}].map(m=><div key={m.label} className="rounded-card border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">{m.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{number(m.value)}</p></div>)}<div className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-5">账号粉丝合计（人，未去重）：<span className="tabular-nums">{number(w.followers)}</span></div></section>
  {w.collected?.state==='unavailable'&&<p role="status" className="text-sm text-muted-foreground">平台采集摘要暂不可读，保留已知发布指标。</p>}
  {!w.accounts.length&&<p className="rounded-card border border-dashed border-border p-4 text-sm text-muted-foreground">尚未绑定平台账号，可继续创建内容。 <Link className="text-brand" href="/projects/new">创建项目 →</Link></p>}
  <div className="grid min-w-0 gap-4 lg:grid-cols-2"><SectionCard title="视频播放 · 平台比较" description="累计播放（次） · 同一筛选期间的真实样本"><HorizontalBarsChart slot="group-video" shape="platform-views" data={chart("views")} unit="次" emptyMessage={!w.totalAccounts?"当前筛选内尚未绑定平台账号":"当前筛选内暂无视频播放指标"} summary="各平台已采集作品的累计播放，未知平台不绘制条形。"/></SectionCard><SectionCard title="文章阅读 · 平台比较" description="累计阅读（次） · 同一筛选期间的真实样本"><HorizontalBarsChart slot="group-article" shape="platform-reads" data={chart("reads")} unit="次" emptyMessage={!w.totalAccounts?"当前筛选内尚未绑定平台账号":"当前筛选内暂无文章阅读指标"} summary="各平台已采集作品的累计阅读，未知平台不绘制条形。"/></SectionCard></div>
  <p className="text-xs text-muted-foreground">最近采集：{w.latestCapturedAt?captured(w.latestCapturedAt):w.collectedAccounts?"采集时间未知":"当前筛选内暂无采集时间"} · 各账号时间见下表</p>
  <SectionCard title="多平台分发与数据覆盖" description="已发布记录与待处理任务分开；未知指标显示 —"><p className="mb-4 text-sm text-muted-foreground">{w.publicationCount} 条发布记录 · {w.pendingCount} 项待处理任务 · {w.collectedAccounts} / {w.totalAccounts} 个账号有指标</p><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="text-muted-foreground"><tr>{["平台","发布记录（条）","发布指标样本（条）","播放（次）","浏览（次）","阅读（次）","点赞（次）","分享（次）","更新时间"].map(label=><th className="border-b border-border px-3 py-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{WORKSPACE_PLATFORMS.filter(p=>!w.platform||p.id===w.platform).map(p=>{const row=w.platforms.find(r=>r.platform===p.id);return <tr key={p.id}><th scope="row" className="border-b border-border px-3 py-3 font-medium">{p.label}<span className="mt-1 block text-xs font-normal text-muted-foreground">{coverage(p.id,row?.sampleCount??0)}</span></th>{[row?.publicationCount??0,row?.sampleCount??0,row?.views??null,row?.browses??null,row?.reads??null,row?.likes??null,row?.shares??null].map((value,i)=><td key={i} className="border-b border-border px-3 py-3 tabular-nums">{number(value)}</td>)}<td className="border-b border-border px-3 py-3 text-muted-foreground">{row?.capturedAt?captured(row.capturedAt):"—"}</td></tr>;})}</tbody></table></div></SectionCard>
 </div>;
}
