"use client";
import * as React from "react";
import Link from "next/link";
import {createClient, ENDPOINTS, type AccountGroupResource, type CollectionRunResource, type NativeReportKind, type NativeReportResource, type Client} from "@creatoros/contract";
import {createHttpTransport, readCurrentGroupId, HttpTransportError} from "@/lib/http-transport";
import {Button} from "@/components/ui/button";
import {useAccountsChanged} from "@/lib/account-events";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {AccountBindingPanel} from "./account-binding-panel";
import {workspaceErrorCopy} from "./workspace-error-copy";

type NativeClient=Pick<Client<typeof ENDPOINTS>,"startCollection"|"getCollection"|"cancelCollection"|"listNativeReports">;
type Saved={clientRequestId?:string;attemptId?:string;rejected?:'SCOPE_MISSING'|'OTHER'};
const bindingRequiredCopy='请先扫码绑定这个账号，再同步数据。';
const reportNames:Record<NativeReportKind,string>={officialContent:"内容分析",officialFollowers:"关注者增长",channelsDaily:"全部视频每日数据",channelsFollowers:"关注者增长",channelsWorks:"单篇视频数据"};
const unitNames:Record<string,string>={people:"人",count:"次",signedCount:"人",ratio:"%",seconds:"秒",date:"日期",opaqueId:"平台ID",text:""};
const active=(run:CollectionRunResource|null)=>run?.status==='queued'||run?.status==='running';
const timedOut=(run:CollectionRunResource|null)=>run?.status==='partial'&&run.reasonCode==='TASK_TIMEOUT';
const statuses:Record<CollectionRunResource['status'],string>={queued:"等待同步",running:"正在同步数据",complete:"数据同步完成",partial:"数据同步未完成，可继续原任务",needsAuth:"登录已过期，请重新扫码",failed:"数据同步未完成，请重试",cancelled:"本次同步已取消"};
function time(value:string){return new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});}
function formatCell(cell:NativeReportResource['tables'][number]['rows'][number][number],unit:string){
 if(cell.value===null)return '—';
 if(typeof cell.value!=='number')return cell.value;
 if(unit==='ratio')return `${Number((cell.value*100).toFixed(4)).toLocaleString('zh-CN')}%`;
 return `${cell.value.toLocaleString('zh-CN')}${unit==='seconds'?' 秒':''}`;
}
function ReportTables({report}:{report:NativeReportResource}){
 return <div className="flex min-w-0 flex-col gap-4">{report.tables.map(table=><div key={table.key} className="min-w-0"><h3 className="mb-2 text-sm font-medium">{table.label}</h3><div className="max-w-full overflow-x-auto rounded-control border border-border" tabIndex={0} aria-label={`${table.label}表格，可横向滚动`}><table className="w-full text-left text-sm"><thead><tr>{table.columns.map(column=><th key={column.key} scope="col" className="whitespace-nowrap border-b border-border bg-surface-subtle px-3 py-3 font-medium">{column.label}{unitNames[column.unit]&&column.unit!=='date'&&column.unit!=='opaqueId'?`（${unitNames[column.unit]}）`:''}</th>)}</tr></thead><tbody>{table.rows.map((row,index)=><tr key={index}>{row.map((cell,columnIndex)=><td key={table.columns[columnIndex]!.key} className="max-w-[28rem] whitespace-pre-wrap break-words border-b border-border px-3 py-2 align-top tabular-nums" title={cell.raw}>{formatCell(cell,table.columns[columnIndex]!.unit)}</td>)}</tr>)}</tbody></table>{!table.rows.length?<p className="p-3 text-sm text-muted-foreground">这个范围内没有数据。</p>:null}</div></div>)}</div>;
}
function ReportCard({report}:{report:NativeReportResource}){
 const [expanded,setExpanded]=React.useState(false);const headingId=React.useId();
 const rows=report.tables.reduce((sum,table)=>sum+table.rows.length,0);
 return <article className="min-w-0 rounded-card border border-border bg-surface p-4" aria-labelledby={headingId}><h2 id={headingId} className="mb-3 text-base font-medium">{reportNames[report.kind]}</h2><p className="text-sm">{report.selection.startDate} 至 {report.selection.endDate} · {report.scope==='workSelection'?'按发布时间选择的作品':'每日统计'}</p>{report.accumulation==='sourceUnspecified'?<p className="mt-2 text-sm text-muted-foreground">作品范围内的原生数据；平台未说明每项指标的累计范围。</p>:null}<p className="mt-2 text-sm text-muted-foreground">{rows} 行 · 采集于 {time(report.observedAt)}</p><details className="mt-3" onToggle={event=>setExpanded(event.currentTarget.open)}><summary className="cursor-pointer text-sm text-brand">查看完整报表</summary>{expanded?<div className="mt-4"><ReportTables report={report}/><p className="mt-3 text-sm text-muted-foreground">来源文件：{report.filename} · 单元格停留可查看原始值。</p></div>:null}</details></article>;
}

export function NativeReportPanel({userId,group,accountId,accountName,platform,initialReports=[],initialNextCursor=null,initialReadError=false,canCollect=false,api}:{
 userId:string;group:AccountGroupResource;accountId:string;accountName:string;platform:'wechatOfficial'|'wechatVideo';
 initialReports?:NativeReportResource[];initialNextCursor?:string|null;initialReadError?:boolean;canCollect?:boolean;api?:NativeClient;
}){
 const scopedClient=React.useMemo(()=>api??createClient(ENDPOINTS,createHttpTransport('/api/v1',{groupId:group.id,accountId})),[api,group.id,accountId]);
 const key=`creatoros:native-reports:${userId}:${group.id}:${accountId}`;
 const [reports,setReports]=React.useState(initialReports),[nextCursor,setNextCursor]=React.useState(initialNextCursor),[readError,setReadError]=React.useState(initialReadError);
 const [run,setRun]=React.useState<CollectionRunResource|null>(null),[pending,setPending]=React.useState(false),[busy,setBusy]=React.useState(false),[loading,setLoading]=React.useState(false),[error,setError]=React.useState<string|null>(null),[binding,setBinding]=React.useState(false),[bindingBusy,setBindingBusy]=React.useState(false),[scopeChanged,setScopeChanged]=React.useState(false),[checkingOriginal,setCheckingOriginal]=React.useState(false),[bindingRequired,setBindingRequired]=React.useState(false);
 const alive=React.useRef(false),epoch=React.useRef(0),reading=React.useRef(false),mutating=React.useRef(false),reportReading=React.useRef(false),reportRefreshWanted=React.useRef(false),saved=React.useRef<Saved>({}),runRef=React.useRef<CollectionRunResource|null>(null),timer=React.useRef<ReturnType<typeof setTimeout>|null>(null),returnFocus=React.useRef<HTMLElement|null>(null);
 const current=React.useCallback((ticket:number)=>alive.current&&ticket===epoch.current&&readCurrentGroupId()===group.id,[group.id]);
 function persist(){try{localStorage.setItem(key,JSON.stringify(saved.current));}catch{/* 索引不可写时仍由真实服务幂等/在途守卫保护。 */}}
 const loadReports=React.useCallback(async(ticket:number,cursor:string|null=null):Promise<void>=>{
  if(!current(ticket))return;if(reportReading.current){if(cursor===null)reportRefreshWanted.current=true;return;}reportReading.current=true;setLoading(true);
  try{
   const result=await scopedClient.listNativeReports({params:{accountId},query:{pageSize:20,cursor},body:undefined});
   if(!current(ticket))return;
   if(result.items.some(report=>report.userId!==userId||report.groupId!==group.id||report.accountId!==accountId||report.platform!==platform))throw Error('报表与当前账号不一致');
   setReports(previous=>cursor?[...previous,...result.items.filter(item=>!previous.some(existing=>existing.id===item.id))]:result.items);setNextCursor(result.nextCursor);setReadError(false);
  }catch{if(current(ticket))setReadError(true);}finally{reportReading.current=false;if(current(ticket)){setLoading(false);if(reportRefreshWanted.current){reportRefreshWanted.current=false;void loadReports(ticket);}}}
 },[accountId,current,group.id,platform,scopedClient,userId]);
 function accept(value:CollectionRunResource,ticket:number){
  if(!current(ticket))return;
  if(value.accountId!==accountId||value.capability!=='nativeReports')throw Error('同步记录与当前账号不一致');
  saved.current.attemptId=value.attemptId;delete saved.current.rejected;runRef.current=value;setRun(value);setPending(false);setCheckingOriginal(false);setBindingRequired(false);
  if(['complete','failed','cancelled'].includes(value.status))delete saved.current.clientRequestId;
  persist();if(value.status==='complete')void loadReports(ticket);
 }
 const refreshRef=React.useRef<()=>Promise<void>>(async()=>{});
 function schedulePoll(){
  if(timer.current)clearTimeout(timer.current);
  if(alive.current&&active(runRef.current))timer.current=setTimeout(()=>void refreshRef.current(),2000);
 }
 async function refresh(){
  if(reading.current||mutating.current||!saved.current.attemptId)return;
  const ticket=epoch.current;if(!current(ticket))return;reading.current=true;setBusy(true);
  try{accept(await scopedClient.getCollection({params:{accountId,attemptId:saved.current.attemptId},query:undefined,body:undefined}),ticket);if(current(ticket))setError(null);}
  catch{if(current(ticket))setError('同步状态暂时无法读取，可核对原任务状态。');}
  finally{reading.current=false;if(current(ticket)){setBusy(false);schedulePoll();}}
 }
 React.useEffect(()=>{refreshRef.current=refresh;});
 React.useEffect(()=>{
  alive.current=true;epoch.current++;saved.current={};runRef.current=null;
  try{const value=JSON.parse(localStorage.getItem(key)??'{}');if(typeof value.clientRequestId==='string')saved.current.clientRequestId=value.clientRequestId;if(typeof value.attemptId==='string')saved.current.attemptId=value.attemptId;if(value.rejected==='SCOPE_MISSING'||value.rejected==='OTHER')saved.current.rejected=value.rejected;}catch{/* 索引只帮助定位真实任务，不证明其状态。 */}
  void Promise.resolve().then(()=>{if(!alive.current)return;setPending(Boolean(saved.current.clientRequestId&&!saved.current.attemptId&&!saved.current.rejected));setBindingRequired(saved.current.rejected==='SCOPE_MISSING');if(saved.current.rejected==='SCOPE_MISSING')setError(bindingRequiredCopy);setCheckingOriginal(Boolean(saved.current.attemptId));if(saved.current.attemptId)void refreshRef.current();});
  return()=>{alive.current=false;epoch.current++;if(timer.current)clearTimeout(timer.current);};
 },[key]);
 useAccountsChanged(React.useCallback(()=>{if(readCurrentGroupId()!==group.id){epoch.current++;if(timer.current)clearTimeout(timer.current);setReports([]);setRun(null);runRef.current=null;setBinding(false);setScopeChanged(true);}},[group.id]));
 async function start(restartExpired=false){
  if(restartExpired&&!timedOut(runRef.current))return;
  if(!restartExpired&&saved.current.attemptId&&!runRef.current){await refresh();return;}
  if(!canCollect||mutating.current||reading.current||active(runRef.current))return;
  const ticket=epoch.current;if(!current(ticket))return;mutating.current=true;setBusy(true);setError(null);
  // 只有用户主动重新同步才创建新请求；原任务和已取得报表仍保留在服务端。
  if(restartExpired){saved.current={};runRef.current=null;setRun(null);setPending(false);setCheckingOriginal(false);}
  if(!saved.current.clientRequestId)saved.current={clientRequestId:crypto.randomUUID()};delete saved.current.rejected;setBindingRequired(false);persist();
  try{accept(await scopedClient.startCollection({params:{accountId},query:undefined,body:{capability:'nativeReports',clientRequestId:saved.current.clientRequestId!}}),ticket);}
  catch(caught){if(current(ticket)){
   if(caught instanceof HttpTransportError&&caught.status>=400&&caught.status<500){
    // 明确拒绝不等于请求结果未知；标记只记录请求结果，不证明账号已授权。
    const needsBinding=caught.code==='SCOPE_MISSING';saved.current.rejected=needsBinding?'SCOPE_MISSING':'OTHER';persist();setPending(false);setBindingRequired(needsBinding);
    setError(needsBinding?bindingRequiredCopy:workspaceErrorCopy(caught,'同步请求未被接受，请检查当前账号后重试。'));
   }else{setPending(true);setError('同步请求结果尚未确认，请核对上次请求。');}
  }}
  finally{mutating.current=false;if(current(ticket)){setBusy(false);schedulePoll();}}
 }
 async function cancel(){
  if(mutating.current||reading.current||!saved.current.attemptId)return;
  const ticket=epoch.current;if(!current(ticket))return;mutating.current=true;setBusy(true);setError(null);
  try{accept(await scopedClient.cancelCollection({params:{accountId,attemptId:saved.current.attemptId},query:undefined,body:undefined}),ticket);}
  catch{if(current(ticket))setError('取消结果尚未确认，请核对原任务状态。');}
  finally{mutating.current=false;if(current(ticket)){setBusy(false);schedulePoll();}}
 }
 if(scopeChanged)return <p className="text-sm text-muted-foreground">账号组已切换，请在当前账号组重新选择账号。</p>;
 const latest=reports.map(report=>report.observedAt).sort().at(-1);
 return <main className="flex min-w-0 flex-col gap-section-gap" data-testid="native-report-panel" data-account-id={accountId}>
  <Link href="/accounts" className="self-start text-sm text-brand hover:underline">返回账号</Link>
  <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{accountName}的作品与数据</h1><p className="mt-2 text-sm text-muted-foreground">{platform==='wechatOfficial'?'公众号':'视频号'} · 后台原生报表</p><p className="mt-2 text-sm text-muted-foreground">最近采集：{latest?time(latest):'尚未采集'}</p></div><Button disabled={!canCollect||busy||bindingBusy||active(run)||run?.status==='needsAuth'||bindingRequired} onClick={()=>void start(timedOut(run)&&!pending)}>{busy?'正在核对…':checkingOriginal?'核对原同步任务':active(run)?'正在同步…':pending?'核对上次同步请求':timedOut(run)?'重新同步':run?.status==='partial'?'继续同步':'同步数据'}</Button></header>
  {!canCollect?<p className="text-sm text-muted-foreground">当前平台的数据同步暂不可用，已有报表仍可查看。</p>:null}
  {run?<div className="rounded-card border border-border bg-surface p-4"><p role="status" className="text-sm font-medium">{timedOut(run)?'本次同步等待结束，已取得数据保留':statuses[run.status]}</p><div className="mt-3 flex flex-wrap gap-2">{active(run)?<Button variant="outline" disabled={busy} onClick={()=>void cancel()}>取消本次同步</Button>:null}<Button variant="outline" disabled={busy} onClick={()=>void refresh()}>核对同步状态</Button>{run.status==='needsAuth'?<Button variant="outline" disabled={!canCollect||bindingBusy} onClick={event=>{returnFocus.current=event.currentTarget;setBinding(true);}}>重新扫码登录</Button>:null}</div></div>:null}
  {error?<div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{error}</p>{bindingRequired&&run?.status!=='needsAuth'?<Button variant="outline" disabled={!canCollect||busy||bindingBusy} onClick={event=>{returnFocus.current=event.currentTarget;setBinding(true);}}>扫码绑定账号</Button>:null}</div>:null}
  {readError?<div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>报表暂时无法读取，已显示的数据仍保留。</p><Button variant="outline" disabled={loading} onClick={()=>void loadReports(epoch.current)}>重试读取</Button></div>:null}
  {!reports.length&&!readError?<p className="rounded-card border border-dashed border-border p-4 text-sm text-muted-foreground">尚无后台报表，可点击“同步数据”读取当前账号数据。</p>:null}
  <section aria-label="后台原生报表" className="flex min-w-0 flex-col gap-section-gap">{reports.map(report=><ReportCard key={report.id} report={report}/>)}</section>
  {nextCursor?<Button variant="outline" className="self-start" disabled={loading} onClick={()=>void loadReports(epoch.current,nextCursor)}>{loading?'正在读取…':'查看更多报表'}</Button>:null}
  <Dialog open={binding} onOpenChange={setBinding}><DialogContent onCloseAutoFocus={event=>{const trigger=returnFocus.current;if(trigger?.isConnected){event.preventDefault();trigger.focus();}}}><DialogHeader><DialogTitle>{bindingRequired?'扫码绑定':'重新登录'}{platform==='wechatOfficial'?'公众号':'视频号'}账号</DialogTitle><DialogDescription>{bindingRequired?'完成扫码后核对真实账号，再同步当前账号数据。':'完成扫码后核对真实账号，再继续原同步任务。'}</DialogDescription></DialogHeader><AccountBindingPanel key={`${group.id}:${platform}`} group={group} platform={platform} canStart={canCollect} disabled={!canCollect} onBusyChange={setBindingBusy} onChanged={async()=>{const ticket=epoch.current;if(!current(ticket))return;setBinding(false);await start();}}/></DialogContent></Dialog>
 </main>;
}
