"use client";
import * as React from 'react';
import type {PublicationTrafficResource} from '@creatoros/contract';
import {client} from '@/lib/contract-client';
import {readCurrentAccountId,readCurrentGroupId} from '@/lib/http-transport';
import {describeUserError} from '@/lib/ai-error-humanize';
const statuses={pending:'后台补采中',succeeded:'已采集',failed:'读取失败，可重试',needs_reconnect:'需重新连接抖音',unavailable:'平台暂未提供来源数据'};
export function TrafficSourcesPanel({projectId,publicationIds}:{projectId:string;publicationIds?:readonly string[]}){
 const [items,setItems]=React.useState<PublicationTrafficResource[]>([]),[busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null),[message,setMessage]=React.useState<string|null>(null);
 const [accountId,setAccountId]=React.useState<string|null>(()=>readCurrentAccountId());
 const [groupId,setGroupId]=React.useState<string|null>(()=>readCurrentGroupId());
 const selection=publicationIds?JSON.stringify([...publicationIds].sort()):null;
 const operations=React.useRef<{load:()=>Promise<void>;refresh:()=>Promise<void>}|null>(null);
 React.useEffect(()=>{
  const onAccount=()=>{setAccountId(readCurrentAccountId());setGroupId(readCurrentGroupId());};
  window.addEventListener('creatoros:accounts-changed',onAccount);
  window.addEventListener('storage',onAccount);
  onAccount();
  return()=>{window.removeEventListener('creatoros:accounts-changed',onAccount);window.removeEventListener('storage',onAccount);};
 },[]);
 React.useEffect(()=>{
  // 每个项目/账号使用独立寿命，旧请求即使晚到也不能改写新页面或重新开启轮询。
  let active=true,requestSequence=0,refreshing=false,pending=false,reading=false,readAgain=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>active&&accountId===readCurrentAccountId()&&groupId===readCurrentGroupId();
  setItems([]);setError(null);setMessage(null);setBusy(false);
  const schedule=()=>{
   clearTimeout(timer);
   if(current()&&pending)timer=setTimeout(()=>void load(),5000);
  };
  const load=async()=>{
   if(!current())return;
   if(reading){readAgain=true;return;}
   reading=true;
   clearTimeout(timer);
   const sequence=++requestSequence;
   try{
    const result=await client.getProjectTrafficSources({params:{projectId},query:undefined,body:undefined});
    if(!current()||sequence!==requestSequence)return;
    const selected=selection?new Set<string>(JSON.parse(selection)):null;
    const visible=selected?result.items.filter(row=>selected.has(row.publicationId)):result.items;
    setItems(visible);setError(null);
    pending=visible.some(row=>row.status==='pending');
   }catch(e){
    if(!current()||sequence!==requestSequence)return;
    setError(describeUserError(e,'流量来源暂时无法读取，基础指标不受影响'));
   }finally{reading=false;if(current()&&sequence===requestSequence){if(readAgain){readAgain=false;void load();}else schedule();}}
  };
  const refresh=async()=>{
   if(!current()||refreshing)return;
   refreshing=true;setBusy(true);setError(null);
   // 后台补采启动后的 load 同样负责续约轮询，不依赖初始请求是否存在 pending。
   try{
    const result=await client.refreshProjectTrafficSources({params:{projectId},query:undefined,body:{}});
    if(!current())return;
    setMessage(result.jobRunId?'已交给后台补采，可在任务中心暂停或继续；结果会自动更新。':'本项目暂无可补采的已发布抖音作品。');
    pending=Boolean(result.jobRunId);
    await load();
   }catch(e){if(current()){await load();if(current()){setMessage(null);setError(describeUserError(e,'流量补采未启动，请重试'));}}}
   finally{refreshing=false;if(current())setBusy(false);}
  };
  operations.current={load,refresh};
  void load();
  return()=>{active=false;clearTimeout(timer);operations.current=null;};
 },[projectId,accountId,groupId,selection]);
 return <section aria-label="流量来源" className="rounded-card border border-border bg-surface p-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">观众从哪里来</h2><p className="mt-1 text-xs text-text-subtle">对照播放量与留存看来源构成，占比不等于曝光数。</p></div><div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>void operations.current?.refresh()} className="rounded-control border border-border px-3 py-1.5 text-xs disabled:opacity-50">{busy?'正在排队…':'补采 / 重试'}</button><button type="button" onClick={()=>void operations.current?.load()} className="rounded-control border border-border px-3 py-1.5 text-xs">刷新结果</button></div></div>
  {error?<p role="alert" className="mt-3 text-xs text-destructive">{error}</p>:null}
  {message?<p role="status" className="mt-3 text-xs text-text-subtle">{message}</p>:null}
  {items.length===0?<p className="mt-3 text-xs text-text-subtle">暂无流量来源数据。已发布抖音作品可补采，当前仍可查看基础指标和诊断内容。</p>:items.map(row=><div key={row.publicationId} className="mt-4 border-t border-border pt-3">
   <div className="flex flex-wrap justify-between gap-2 text-xs"><a href={`https://www.douyin.com/video/${row.externalId}`} target="_blank" rel="noreferrer" className="text-brand underline">查看对应作品</a><span>{statuses[row.status]}</span></div>
   {row.data?<><p className="my-2 text-[11px] text-text-subtle">{row.data.app} · 统计窗口：{row.data.windowLabel??'平台未说明'} · 采集于 {row.capturedAt?.replace('T',' ').slice(0,19)} UTC{row.data.complete?'':' · 来源未展开完整'}{row.status==='succeeded'?'':' · 以下保留上次成功数据'}</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{row.data.entries.map(entry=><div key={entry.label} className="flex justify-between gap-2 rounded-control bg-surface-subtle px-3 py-2 text-xs"><span>{entry.label}</span><strong>{entry.percentage===null?'暂无':`${entry.percentage}%`}</strong></div>)}</div></>:<p className="mt-2 text-xs text-text-subtle">尚未取得来源比例。</p>}
   {row.error?<p className={`mt-2 text-xs ${row.status==='unavailable'?'text-text-subtle':'text-destructive'}`}>{row.error}</p>:null}
  </div>)}
 </section>;
}
