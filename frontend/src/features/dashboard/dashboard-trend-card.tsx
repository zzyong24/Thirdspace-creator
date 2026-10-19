"use client";
import * as React from 'react';
import Link from 'next/link';
import {ENDPOINTS,type GroupDashboardTrend,type GroupWorkspaceQuery} from '@creatoros/contract';
import {SectionCard} from '@/components/project/section-card';
import {ViewsTrendChart} from '@/components/analytics/views-trend-chart';
import {HorizontalBarsChart} from '@/components/analytics/horizontal-bars-chart';
import {EmptyChartGrid} from '@/components/analytics/empty-chart-grid';
import {Button} from '@/components/ui/button';
import {fetchCreatorApi,readCurrentGroupId} from '@/lib/http-transport';
import {useAccountsChanged} from '@/lib/account-events';
import type {PublicationCompactRow} from '@/types/view-models';

export interface DashboardTrendSource {groupId:string;latestCapturedAt?:string|null;query:GroupWorkspaceQuery&{startDate:string;endDate:string}}
type Props={source?:DashboardTrendSource;publications:ReadonlyArray<PublicationCompactRow>;dateRange?:{startDate:string;endDate:string}};
type ReadState={key:string;phase:'loading'|'ready'|'error';result?:GroupDashboardTrend};
const messages:Record<string,string>={select_account:'选择一个平台账号后查看每日数据。',no_account:'当前筛选内暂无可用平台账号。',unavailable_account:'这个账号暂时无法读取每日数据。',unsupported_platform:'当前平台暂无每日播放数据。',no_total_channel:'暂无可比较的每日阅读人数。',no_report:'当前账号尚无所选日期的每日数据。',no_values:'所选日期暂无可用的每日数值。',read_failed:'每日数据暂时无法读取。'};

export function DashboardTrendCard({source,publications,dateRange}:Props){
 const key=source?JSON.stringify([source.groupId,source.query.platform??null,source.query.accountId??null,source.query.startDate,source.query.endDate]):'legacy';
 const requestScope=React.useMemo(()=>{
  if(key==='legacy')return null;
  const [groupId,platform,accountId,startDate,endDate]=JSON.parse(key) as [string,string|null,string|null,string,string];
  return {groupId,query:{...(platform?{platform}:{}),...(accountId?{accountId}:{}),startDate,endDate}};
 },[key]);
 const [state,setState]=React.useState<ReadState>({key,phase:source?'loading':'ready'}),[revision,retry]=React.useReducer(n=>n+1,0),[invalidScope,setInvalidScope]=React.useState(false);
 const generation=React.useRef(0),active=React.useRef<AbortController|null>(null),inFlight=React.useRef(false);
 useAccountsChanged(React.useCallback(()=>{if(source&&readCurrentGroupId()!==source.groupId){generation.current++;active.current?.abort();inFlight.current=false;setInvalidScope(true);}},[source]));
 React.useEffect(()=>{
  if(!requestScope)return;
  const scope=requestScope;
  const controller=new AbortController(),ticket=++generation.current;active.current=controller;inFlight.current=true;
  const current=()=>!controller.signal.aborted&&ticket===generation.current&&(!readCurrentGroupId()||readCurrentGroupId()===scope.groupId);
  async function read(){
   try{
    const response=await fetchCreatorApi('/api/v1/dispatch',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({id:ENDPOINTS.getGroupTrend.id,input:{params:{groupId:scope.groupId},query:scope.query,body:undefined}}),signal:controller.signal},{groupId:scope.groupId,accountId:scope.query.accountId??null});
    if(!response.ok)throw Error('每日数据读取失败');
    const envelope=await response.json(),result=ENDPOINTS.getGroupTrend.response.parse(envelope.data);
    if(result.groupId!==scope.groupId||result.platform!==(scope.query.platform??null)||result.accountId!==(scope.query.accountId??null)||result.startDate!==scope.query.startDate||result.endDate!==scope.query.endDate)throw Error('每日数据与筛选不一致');
    if(current())setState({key,phase:'ready',result});
   }catch{if(current())setState({key,phase:'error'});}
   finally{if(ticket===generation.current)inFlight.current=false;}
  }
  void read();
  return()=>{controller.abort();inFlight.current=false;};
 // 请求scope按完整key冻结；父对象重建不重复读取。
 },[key,revision,requestScope]);
 const currentState=state.key===key?state:undefined;
 const result=invalidScope?undefined:currentState?.result,meta=result?.performanceTrend;
 const loading=Boolean(source&&!invalidScope&&(!currentState||currentState.phase==='loading'));
 const failed=currentState?.phase==='error'||meta?.reason==='read_failed';
 const daily=meta?.mode==='daily';
 const article=meta?.unit==='人'||source?.query.platform==='wechatOfficial'||publications.length>0&&publications.every(row=>row.platform==='wechatOfficial');
 const dates=dateRange??(source?{startDate:source.query.startDate,endDate:source.query.endDate}:undefined);
 const known=result?.trend.filter(point=>point.value!==null)??[];
 const rows=invalidScope?[]:publications.slice(0,5),platforms=new Set(rows.map(row=>row.platform));
 const comparable=!article&&platforms.size===1;
 const browse=source?.query.platform==='xiaohongshu'||platforms.size===1&&platforms.has('xiaohongshu');
 const cumulativeLabel=browse?'浏览':'播放';
 // SEMANTIC_BOUNDARY_ALLOW: 仅排序同平台已知累计数值，不判断作品质量或推断增长。
 const bars=rows.filter(row=>row.platform!=='wechatOfficial').map(row=>({label:row.title,value:row.views??Number.NaN})).sort((a,b)=>(Number.isFinite(b.value)?b.value:-1)-(Number.isFinite(a.value)?a.value:-1));
 const reviewQuery=new URLSearchParams();if(dates){reviewQuery.set('startDate',dates.startDate);reviewQuery.set('endDate',dates.endDate);}if(source?.query.platform)reviewQuery.set('platform',source.query.platform);if(source?.query.accountId)reviewQuery.set('accountId',source.query.accountId);
 const reviewHref=`/daily-report${reviewQuery.size?'?'+reviewQuery:''}`;
 const accountId=meta?.accountId??source?.query.accountId;
 const reason=invalidScope?'账号组已切换，请等待当前账号组的数据。':failed?messages.read_failed:meta?.reason?browse&&meta.reason==='unsupported_platform'?'当前平台暂无每日浏览数据。':messages[meta.reason]??'当前筛选暂无每日数据。':article?messages.no_total_channel:undefined;
 return <div data-slot="data-overview-card"><SectionCard title={daily?'每日播放':'数据概览'} description={daily?'平台按日统计的播放次数':undefined}>
  <div className="flex min-w-0 flex-col gap-3" data-slot={!daily&&!loading?'data-overview-empty':undefined}>
   {dates?<p className="text-xs text-muted-foreground tabular-nums">{dates.startDate} — {dates.endDate}</p>:null}
   {loading?<EmptyChartGrid message="正在读取每日数据…" dateLabels={dates?[dates.startDate,dates.endDate]:[]}/>:daily&&result?<>
    <p className="text-sm text-muted-foreground tabular-nums">已显示 {known.length} 天数据 · 最高 {Math.max(...known.map(point=>point.value!)).toLocaleString('zh-CN')} 次</p>
    <ViewsTrendChart data={result.trend} mode={known.length===1?'single':'daily'} summary={known.map(point=>`${point.label}：${point.value}次`).join('；')} unit={meta!.unit} valueLabel={meta!.valueLabel} testId="dashboard-data-trend" singleNote="所选日期内仅有一天每日数据，暂不能判断走势。" dateRange={dates}/>
    <p className="text-xs text-muted-foreground">来源：视频号每日统计{meta!.observedAt?` · 更新于 ${new Date(meta!.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}`:''}</p>
   </>:<>
    <p className="text-sm text-muted-foreground">{article?'暂无可比较的每日阅读人数':'暂无每日数据，先看近期作品表现'}</p>
    {reason&&reason!==messages.no_total_channel?<p className="text-xs text-muted-foreground">{reason}</p>:null}
    {failed?<Button variant="outline" size="sm" className="self-start" onClick={()=>{if(inFlight.current)return;setState({key,phase:'loading'});retry();}}>重试读取每日数据</Button>:null}
    {comparable&&bars.length?<><h3 className="text-sm font-medium">近期作品累计{cumulativeLabel}</h3><p className="text-xs text-muted-foreground">最近发布的最多5条作品 · 截至各自最近更新的累计{cumulativeLabel}</p><HorizontalBarsChart slot="dashboard-recent-plays" ariaLabel={browse?'近期作品累计浏览':undefined} shape="bars" data={bars} summary={`最近发布作品的累计${cumulativeLabel}比较；未知不补零，不代表所选日期内新增。`}/></>:!article?<figure role="figure" aria-label={`每日${cumulativeLabel}暂无数据`}><EmptyChartGrid message={rows.length?'选择一个平台后查看近期作品表现。':'当前筛选内暂无可比较作品。'}/></figure>:null}
    {comparable&&source?.latestCapturedAt?<p className="text-xs text-muted-foreground">最近更新：{new Date(source.latestCapturedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})} · 各作品更新时间可能不同</p>:null}
    {article&&accountId?<Link className="text-sm text-brand" href={`/accounts/works?accountId=${encodeURIComponent(accountId)}`}>查看原生报表 →</Link>:<Link className="text-sm text-brand" href={reviewHref}>查看作品复盘 →</Link>}
    <Link className="text-sm text-brand" href="/accounts">查看账号与采集状态 →</Link>
   </>}
   <span data-slot="chart-frame-summary" className="sr-only">{daily?'平台自然日播放趋势':'暂无可比较的每日趋势；仅显示已知累计表现。'}</span>
  </div>
 </SectionCard></div>;
}
