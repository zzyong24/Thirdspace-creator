"use client";
import * as React from 'react';
import Link from 'next/link';
import {ENDPOINTS} from '@creatoros/contract';
import {SectionCard} from '@/components/project/section-card';
import {Button} from '@/components/ui/button';
import {fetchCreatorApi,readCurrentGroupId} from '@/lib/http-transport';
import type {AccountChangeDetail} from '@/lib/account-events';
import {platformName,type GroupWorkspace} from './workspace-query';
import {normalizeWorkspacePlatform} from './platform-metrics';

type Account=GroupWorkspace['accounts'][number];
type ReportState={key:string;phase:'loading'|'slow'|'ready'|'error';total?:number};
const worksHref=(accountId:string)=>`/accounts/works?${new URLSearchParams({accountId})}`;
const isWechat=(platform:string)=>platform==='wechatVideo'||normalizeWorkspacePlatform(platform)==='wechatOfficial';

function SavedReports({workspace,account}:{workspace:GroupWorkspace;account:Account}){
 const key=JSON.stringify([workspace.groupId,account.id,account.platform,workspace.platform,workspace.accountId,workspace.startDate,workspace.endDate]);
 const scope=React.useMemo(()=>{
  const [groupId,accountId,platform]=JSON.parse(key) as string[];
  return {groupId:groupId!,accountId:accountId!,platform:platform!};
 },[key]);
 const [state,setState]=React.useState<ReportState>({key,phase:'loading'});
 const [revision,retry]=React.useReducer(value=>value+1,0);
 const generation=React.useRef(0),active=React.useRef<AbortController|null>(null),retryable=React.useRef(false);
 React.useEffect(()=>{
  const controller=new AbortController(),ticket=++generation.current;
  active.current=controller;retryable.current=false;
  const current=()=>!controller.signal.aborted&&ticket===generation.current&&(!readCurrentGroupId()||readCurrentGroupId()===scope.groupId);
  // 两秒只提供慢读反馈，不缩短平台读预算；同一账号已有报表数在重读时保留。
  const timer=window.setTimeout(()=>{if(current()){retryable.current=true;setState(previous=>({...previous,key,phase:'slow'}));}},2000);
  async function read(){
   try{
    if(!current())return;
    const response=await fetchCreatorApi('/api/v1/dispatch',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({id:ENDPOINTS.listNativeReports.id,input:{params:{accountId:scope.accountId},query:{pageSize:1,cursor:null}}}),signal:controller.signal},{groupId:scope.groupId,accountId:scope.accountId});
    if(!response.ok)throw Error('报表读取失败');
    const envelope=await response.json(),result=ENDPOINTS.listNativeReports.response.parse(envelope.data);
    if(result.items.some(report=>report.groupId!==scope.groupId||report.accountId!==scope.accountId||normalizeWorkspacePlatform(report.platform)!==normalizeWorkspacePlatform(scope.platform)))throw Error('报表范围不一致');
    if(current()){retryable.current=false;setState({key,phase:'ready',total:result.total});}
   }catch{if(current()){retryable.current=true;setState(previous=>({...previous,key,phase:'error'}));}}
   finally{window.clearTimeout(timer);}
  }
  void read();
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[key,revision,scope]);
 const phase=state.key===key?state.phase:'loading';
 function retryRead(){
  if(!retryable.current)return;
  retryable.current=false;generation.current++;active.current?.abort();
  setState(previous=>({...previous,key,phase:'loading'}));retry();
 }
 return <div className="mt-2 flex flex-col items-start gap-2">
  {state.total!==undefined?<p className="tabular-nums">{state.total===0?'尚未同步平台报表':`已有 ${state.total.toLocaleString('zh-CN')} 份报表`}</p>:null}
  {phase==='loading'?<p role="status" className="text-muted-foreground">正在读取已保存报表…</p>:phase==='slow'?<p role="status" className="text-muted-foreground">报表读取较慢，其他数据仍可使用。</p>:phase==='error'?<p className="text-muted-foreground">已保存报表暂时无法读取。</p>:null}
  {state.total!==undefined&&phase!=='ready'?<p className="text-xs text-muted-foreground">暂保留上次读到的报表数量。</p>:null}
  {phase==='slow'||phase==='error'?<Button variant="outline" size="sm" onClick={retryRead}>重试读取报表</Button>:null}
  <p className="text-xs text-muted-foreground">数量为全部已保存报表，不受当前日期筛选限制。</p>
  <p className="text-xs text-muted-foreground">日报不计入上方按作品汇总的累计指标。</p>
  <Link className="text-brand underline underline-offset-4" href={worksHref(account.id)}>查看原生报表</Link>
 </div>;
}

/** SSR与水合首帧统一占位；确认前不挂载账号链接或报表读取器。 */
function createGroupConfirmationStore(groupId:string){
  let eventGroup:string|null|undefined;
  return {
   snapshot:()=>{
    const group=eventGroup===undefined?readCurrentGroupId():eventGroup;
    if(group===null)return eventGroup===null?'invalid':'ready';
    return group===groupId?'ready':'invalid';
   },
   subscribe:(changed:()=>void)=>{
    const handle=(event:CustomEvent<AccountChangeDetail>)=>{
     const detail=event.detail;
     const group=detail?.groupId===undefined?readCurrentGroupId():detail.groupId;
     // 显式null是清组；storage的null仅表示未知，不借它猜测切组。
     if(detail?.groupId!==undefined||group!==null){eventGroup=group;changed();}
    };
    window.addEventListener('creatoros:accounts-changed',handle);
    return()=>window.removeEventListener('creatoros:accounts-changed',handle);
   },
  };
}
function useGroupConfirmation(groupId:string){
 const store=React.useMemo(()=>createGroupConfirmationStore(groupId),[groupId]);
 return React.useSyncExternalStore(store.subscribe,store.snapshot,()=> 'checking');
}

export function GroupPlatformData({workspace:w}:{workspace:GroupWorkspace}){
 const confirmation=useGroupConfirmation(w.groupId);
 const selected=w.accounts.filter(account=>(!w.platform||normalizeWorkspacePlatform(account.platform)===normalizeWorkspacePlatform(w.platform))&&(!w.accountId||account.id===w.accountId));
 return <SectionCard title="平台采集数据" description="查看各平台账号的已采集作品与原生报表">
  {confirmation==='checking'?<p role="status" className="text-muted-foreground">正在确认当前账号组…</p>:confirmation==='invalid'?<p className="text-muted-foreground">账号组已切换，请等待当前账号组的数据。</p>:<div className="flex min-w-0 flex-col gap-4">
   <div className="flex flex-col gap-2">
    <p className="text-xs text-muted-foreground tabular-nums">{w.startDate} — {w.endDate}</p>
    {w.collected?.state==='ready'?<><p className="tabular-nums">所选日期内已纳入汇总 {w.collected.catalogWorkCount?.toLocaleString('zh-CN')} 条平台作品</p><p className="text-xs text-muted-foreground">与通过系统创建的发布记录分别统计；此数量不代表平台完整目录。</p>{w.collected.catalogWorkCount===0&&selected.some(account=>!isWechat(account.platform))?<p className="text-muted-foreground">当前日期内没有可汇总的作品，可调整日期或查看已采集作品。</p>:null}</>:<p className="text-muted-foreground">{w.collected?.state==='unavailable'?'平台作品汇总暂时无法读取，可查看各账号已采集数据。':'当前汇总未提供平台作品数量，可查看各账号已采集数据。'}</p>}
   </div>
   {!selected.length?<p className="text-muted-foreground">当前筛选内没有可查看的平台账号。</p>:<ul className="grid min-w-0 gap-3 sm:grid-cols-2">{selected.map(account=><li key={account.id} className="min-w-0 rounded-control border border-border p-3">
    <p className="break-words font-medium">{platformName(account.platform)} · {account.name}</p>
    {account.historical||account.archived?<p className="mt-2 text-sm text-muted-foreground">{account.archived?'账号已归档':'账号已转出当前组'}，请在账号管理中查看。</p>:isWechat(account.platform)?<SavedReports key={JSON.stringify([w.groupId,account.id,account.platform])} workspace={w} account={account}/>:<Link className="mt-2 inline-block text-brand underline underline-offset-4" href={worksHref(account.id)}>查看已采集作品</Link>}
   </li>)}</ul>}
  </div>}
 </SectionCard>;
}
