import Link from "next/link";
import {normalizeWorkspacePlatform,selectedWorkspacePlatform,workspaceMetricKinds,workspaceMetricDefinitions,workspacePrimaryMetrics} from "./platform-metrics";
import {GroupPlatformData} from "./group-platform-data";
import {SectionCard} from "@/components/project/section-card";
import {HorizontalBarsChart} from "@/components/analytics/horizontal-bars-chart";
import {platformName,WORKSPACE_PLATFORMS,type GroupWorkspace} from "./workspace-query";
const number=(n:number|null|undefined)=>n==null?"—":n.toLocaleString("zh-CN");
const captured=(s:string|null)=>s?new Date(s).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"采集时间未知";
/** SEMANTIC_BOUNDARY_ALLOW: 只按真实同口径数值排序、分开指标坐标，不判断内容质量。 */
export function GroupOverview({workspace:w,filters,showPageHeading=true}:{workspace:GroupWorkspace;filters?:React.ReactNode;showPageHeading?:boolean}){
 const selectedPlatform=selectedWorkspacePlatform(w),kinds=workspaceMetricKinds(w);
 const visibleRows=w.platforms.filter(row=>!selectedPlatform||normalizeWorkspacePlatform(row.platform)===selectedPlatform);
 const chart=(metric:typeof kinds[number])=>visibleRows.filter(p=>p[metric]!=null).map(p=>({label:platformName(p.platform),value:p[metric]!})).sort((a,b)=>b.value-a.value);
 const platformRows=WORKSPACE_PLATFORMS.filter(p=>!selectedPlatform||p.id===selectedPlatform).flatMap<{platform:string;label:string;row:GroupWorkspace['platforms'][number]|undefined}>(p=>{
  const matches=visibleRows.filter(row=>normalizeWorkspacePlatform(row.platform)===p.id);
  // 两个历史平台键同时存在时逐行保留来源，不能在前端合并或丢掉事实。
  return matches.length?matches.map(row=>({platform:row.platform,label:p.label,row})): [{platform:p.id,label:p.label,row:undefined}];
 });
 const coverage=(platform:string,legacySamples:number)=>{
  if(!w.accounts.some(account=>normalizeWorkspacePlatform(account.platform)===normalizeWorkspacePlatform(platform)))return "未绑定账号";
  const metrics=w.collected?.state==='ready'?w.collected.metrics.filter(metric=>normalizeWorkspacePlatform(metric.platform)===normalizeWorkspacePlatform(platform)):[];
  if(!legacySamples&&metrics.some(metric=>metric.scope==='account'&&metric.knownCount>0)&&!metrics.some(metric=>metric.scope==='work'&&metric.knownCount>0))return "已有账号指标；当前日期内暂无作品指标";
  if(legacySamples>0||metrics.some(metric=>metric.knownCount>0))return "已有采集指标";
  if(w.collected?.state==='unavailable')return "采集摘要暂不可读";
  if(metrics.some(metric=>metric.eligibleCount>0))return "部分指标暂缺";
  return "当前筛选内暂无指标";
 };
 const articleReason=()=>{
  if(!w.accounts.some(account=>(account.platform==="wechatOfficial"||account.platform==="wechatOfficialAccount")&&(!w.accountId||account.id===w.accountId)))return w.platform?"当前筛选尚未绑定公众号":"当前账号组尚未绑定公众号";
  if(w.collected?.state==='unavailable')return "采集摘要暂不可读，文章阅读指标未知";
  if(w.collected?.metrics.some(metric=>(metric.platform==='wechatOfficial'||metric.platform==='wechatOfficialAccount')&&metric.metricKey==='read_count'&&metric.eligibleCount>0))return "所选日期内的文章阅读指标暂缺";
  return "所选日期内暂无文章阅读样本";
 };
 return <div className="flex min-w-0 flex-col gap-section-gap" data-page="group-overview">
  <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">{showPageHeading&&<h1 className="text-2xl font-semibold">创作者总览</h1>}<div className="flex flex-wrap gap-2"><Link href="/accounts/works" className="rounded-control border border-border bg-surface px-3 py-2 text-sm hover:bg-muted">已采集作品</Link><Link href="/accounts" className="rounded-control border border-border bg-surface px-3 py-2 text-sm hover:bg-muted">管理账号组</Link></div></header>
  <div data-slot="studio-scope">{filters}</div>
  <section data-slot="studio-overview-metrics" aria-label="账号组指标" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))"}} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{workspacePrimaryMetrics(w).map(m=><div key={m.id} className="rounded-card border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">{m.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{number(m.value)}</p>{m.id==='g-collected'?<span className="mt-2 block text-xs text-muted-foreground">{m.value==null?'平台作品数量暂不可读':'所选日期内已纳入汇总，不代表平台完整目录'}</span>:m.value==null?<span className="mt-2 block text-xs text-muted-foreground">{m.id==='g-read'?articleReason():m.id==='g-video'?workspaceMetricDefinitions.views.empty:workspaceMetricDefinitions.browses.empty}</span>:null}</div>)}<div className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-4">账号粉丝合计（人，未去重）：<span className="tabular-nums">{number(w.followers)}</span></div></section>
  <p data-slot="studio-publishing-summary" className="text-sm text-muted-foreground">CreatorOS 已发布内容：{number(w.contentCount)} 期 · CreatorOS 发布记录：{number(w.publicationCount)} 条 · 待处理任务：{number(w.pendingCount)} 项。仅统计通过 CreatorOS 管理的发布，与平台采集作品分别统计。</p>
  <GroupPlatformData workspace={w}/>
  {w.collected?.state==='unavailable'&&<p role="status" className="text-sm text-muted-foreground">平台采集摘要暂不可读，保留已知发布指标。</p>}
  {!w.accounts.length&&<p className="rounded-card border border-dashed border-border p-4 text-sm text-muted-foreground">尚未绑定平台账号，可继续创建内容。 <Link className="text-brand" href="/projects/new">创建项目 →</Link></p>}
  <div data-slot="studio-overview-charts" style={kinds.length===1?{gridTemplateColumns:"minmax(0,1fr)"}:undefined} className="grid min-w-0 gap-4 lg:grid-cols-2">{kinds.map(kind=>{const definition=workspaceMetricDefinitions[kind];return <SectionCard key={kind} title={definition.chart} description="累计值（次） · 同一筛选期间的真实样本"><HorizontalBarsChart slot={definition.slot} shape={definition.shape} data={chart(kind)} unit="次" emptyMessage={!w.totalAccounts?"当前筛选内尚未绑定平台账号":definition.empty} summary="各平台同口径累计指标；未知数值不绘制条形。"/></SectionCard>;})}</div>
  <p className="text-xs text-muted-foreground">最近采集：{w.latestCapturedAt?captured(w.latestCapturedAt):w.collectedAccounts?"采集时间未知":"当前筛选内暂无采集时间"} · 各账号时间见下表</p>
  <SectionCard title="多平台分发与数据覆盖" description="发布记录来自 CreatorOS；播放、浏览、阅读按平台分别展示，未知指标显示 —"><p className="mb-4 text-sm text-muted-foreground">{w.collectedAccounts} / {w.totalAccounts} 个账号有作品指标；发布指标样本仅统计 CreatorOS 发布记录中的样本，不代表已采集作品数量。</p><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="text-muted-foreground"><tr>{["平台","CreatorOS 发布记录（条）","发布指标样本（条）",...kinds.map(kind=>workspaceMetricDefinitions[kind].column),"点赞（次）","分享（次）","更新时间"].map(label=><th className="border-b border-border px-3 py-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{platformRows.map(({platform,label,row})=><tr key={platform}><th scope="row" className="border-b border-border px-3 py-3 font-medium">{label}<span className="mt-1 block text-xs font-normal text-muted-foreground">{coverage(platform,row?.sampleCount??0)}</span></th>{[row?.publicationCount??0,row?.sampleCount??0,...kinds.map(kind=>row?.[kind]??null),row?.likes??null,row?.shares??null].map((value,i)=><td key={i} className="border-b border-border px-3 py-3 tabular-nums">{number(value)}</td>)}<td className="border-b border-border px-3 py-3 text-muted-foreground">{row?.capturedAt?captured(row.capturedAt):"—"}</td></tr>)}</tbody></table></div></SectionCard>
 </div>;
}
