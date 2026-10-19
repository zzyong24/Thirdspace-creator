"use client";
import {workspaceErrorCopy} from "./workspace-error-copy";
import * as React from "react";
import type {AccountGroupResource, ENDPOINTS} from "@creatoros/contract";
import {client} from "@/lib/contract-client";
import {readCurrentGroupId, HttpTransportError} from "@/lib/http-transport";
import {beginForegroundActivity} from "@/lib/foreground-activity";
import {Button} from "@/components/ui/button";
type Run=typeof ENDPOINTS.getAccountBinding.response["_output"];
type Intent=typeof ENDPOINTS.startAccountBinding.body["_output"];
const finished=(run:Run)=>["succeeded","failed","cancelled"].includes(run.status);
const labels:Record<Run["status"],string>={queued:"等待打开扫码窗口",waiting_verification:"等待扫码验证",verifying:"正在核对平台身份",finalizing:"正在保存绑定结果",cancel_requested:"正在停止本次扫码",cancelled:"本次绑定已取消",succeeded:"绑定已完成",failed:"本次绑定未完成"};
type Saved={intent?:Intent;runId?:string};
export type BindingCompletion={runId:string;groupId:string;platform:Run["platform"];accountId:string;accountHandle:string};
export function AccountBindingPanel({group,canStart,platform="douyin",disabled=false,startIntent,observeIntent,onCompleted,requiredAccountId,onChanged,onBusyChange}:{group:AccountGroupResource;canStart:boolean;platform?:"douyin"|"xiaohongshu"|"kuaishou"|"wechatOfficial"|"wechatVideo";disabled?:boolean;startIntent?:string;observeIntent?:string;onCompleted?:(result:BindingCompletion)=>void|Promise<void>;requiredAccountId?:string;onChanged:(result:BindingCompletion)=>void|Promise<void>;onBusyChange?:(busy:boolean)=>void}){
 const platformLabel={douyin:"抖音",xiaohongshu:"小红书",kuaishou:"快手",wechatOfficial:"公众号",wechatVideo:"视频号"}[platform];
 const [verifiedRunId,setVerifiedRunId]=React.useState<string|null>(null);
 const [run,setRun]=React.useState<Run|null>(null),[pending,setPending]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null);
 const alive=React.useRef(false),reading=React.useRef(false),mutating=React.useRef(false),saved=React.useRef<Saved>({}),completed=React.useRef<string|null>(null),timer=React.useRef<ReturnType<typeof setTimeout>|null>(null),epoch=React.useRef(0);
 const consumedIntent=React.useRef<string|null>(null),completionRun=React.useRef<string|null>(null);
 const foregroundEnd=React.useRef<(()=>void)|null>(null);
 const callbacks=React.useRef({onChanged,onCompleted,onBusyChange});
 React.useEffect(()=>{callbacks.current={onChanged,onCompleted,onBusyChange};},[onChanged,onCompleted,onBusyChange]);
 const key=`creatoros:account-binding:${group.userId}:${group.id}${platform==="douyin"?"":`:${platform}`}`;
 const current=React.useCallback((ticket:number)=>alive.current&&ticket===epoch.current&&readCurrentGroupId()===group.id,[group.id]);
 const persist=React.useCallback(()=>{sessionStorage.setItem(key,JSON.stringify(saved.current));},[key]);
 const accept=React.useCallback(async(value:Run,ticket:number,verify=true)=>{
  if(!current(ticket))return;
  if(value.groupId!==group.id||value.platform!==platform)throw Error("绑定记录的账号组或平台不一致，请重新核对。");
  saved.current.runId=value.runId;if(finished(value))delete saved.current.intent;persist();setPending(false);setRun(value);
  if(verify&&value.status==="succeeded"&&completed.current!==value.runId){
   if(!value.accountId)throw Error("绑定结果缺少账号，请重新核对原任务。");
   if(requiredAccountId&&value.accountId!==requiredAccountId)throw Error("本次扫码不是当前账号，请核对原账号后继续同步。");
   const account=await client.getAccount({params:{accountId:value.accountId},query:undefined,body:undefined});
   if(!current(ticket))return;if(account.id!==value.accountId||account.platform!==value.platform||account.userId!==group.userId)throw Error("绑定账号详情与回执不一致，请重新核对。");
   const target=await client.getAccountGroup({params:{groupId:group.id},query:undefined,body:undefined});
   if(!current(ticket))return;
   if(target.id!==group.id||target.userId!==group.userId||target.status!=="active"||!target.members.some(member=>member.accountId===value.accountId&&member.platform===platform&&member.status==="active"&&member.leftAt===null))throw Error("绑定账号尚未出现在当前账号组，请重新读取原结果。");
   const result:BindingCompletion={runId:value.runId,groupId:group.id,platform:value.platform,accountId:account.id,accountHandle:account.accountHandle};
   await callbacks.current.onChanged(result);if(!current(ticket))return;completed.current=value.runId;setVerifiedRunId(value.runId);
   if(completionRun.current===value.runId)await callbacks.current.onCompleted?.(result);
  }
 },[current,group.id,group.userId,persist,platform,requiredAccountId]);
 const refresh=React.useCallback(async(restore=false)=>{
  if(reading.current||mutating.current||!saved.current.runId)return;
  const ticket=epoch.current;if(!current(ticket))return;reading.current=true;setError(null);
  try{const value=await client.getAccountBinding({params:{runId:saved.current.runId},query:undefined,body:undefined});await accept(value,ticket,!restore);if(restore&&current(ticket)){if(!finished(value)&&observeIntent)completionRun.current=value.runId;if(value.status==="succeeded"){setRun(null);setVerifiedRunId(null);}}}catch(e){if(current(ticket))setError(workspaceErrorCopy(e,"绑定状态尚未读取，请重试。"));}
  finally{reading.current=false;}
 },[accept,current,observeIntent]);
 React.useEffect(()=>{
  alive.current=true;epoch.current++;saved.current={};completed.current=null;completionRun.current=null;
  try{const value=JSON.parse(sessionStorage.getItem(key)??"{}");if(value.intent?.groupId===group.id&&value.intent?.platform===platform)saved.current.intent=value.intent;if(typeof value.runId==="string")saved.current.runId=value.runId;}catch{/* 损坏的本地索引不代表真实绑定记录。 */}
  void Promise.resolve().then(()=>{if(!alive.current)return;setRun(null);setVerifiedRunId(null);setPending(Boolean(saved.current.intent&&!saved.current.runId));if(saved.current.runId&&!startIntent)void refresh(true);});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 请求代数在卸载时递增，防止异步结果回写
  return()=>{alive.current=false;epoch.current++;if(timer.current)clearTimeout(timer.current);foregroundEnd.current?.();foregroundEnd.current=null;callbacks.current.onBusyChange?.(false);};
 },[group.id,key,refresh,platform,startIntent]);
 React.useEffect(()=>{if(!run||finished(run))return;timer.current=setTimeout(()=>void refresh(),1000);return()=>{if(timer.current)clearTimeout(timer.current);};},[run,refresh]);
 async function start(){
  if(disabled||mutating.current||reading.current||(!canStart&&!saved.current.intent))return;const ticket=epoch.current;if(!current(ticket))return;
  mutating.current=true;setBusy(true);callbacks.current.onBusyChange?.(true);setError(null);const end=beginForegroundActivity("账号扫码绑定");foregroundEnd.current=end;
  try{
   if(!saved.current.intent){
    const latest=await client.getAccountGroup({params:{groupId:group.id},query:undefined,body:undefined});
    if(!current(ticket))return;
    if(latest.id!==group.id||latest.userId!==group.userId||latest.status!=="active")throw Error("账号组状态已变化，请重新选择后绑定。");
    saved.current={intent:{groupId:group.id,platform,expectedGroupVersion:latest.version,idempotencyKey:crypto.randomUUID()}};
   }
   persist();setVerifiedRunId(null);
   const value=await client.startAccountBinding({params:undefined,query:undefined,body:saved.current.intent!});if(!current(ticket))return;completionRun.current=value.runId;await accept(value,ticket);if(current(ticket)){mutating.current=false;void refresh();}
  }catch(e){if(current(ticket)){if(e instanceof HttpTransportError&&e.status>=400&&e.status<500){delete saved.current.intent;persist();setPending(false);}else setPending(Boolean(saved.current.intent));setError(workspaceErrorCopy(e,"绑定请求结果尚未确认，请核对上次请求。"));}}
  finally{mutating.current=false;end();foregroundEnd.current=null;if(current(ticket)){setBusy(false);callbacks.current.onBusyChange?.(false);}}
 }
 async function cancel(){
  if(disabled||mutating.current||reading.current||!saved.current.runId)return;const ticket=epoch.current;if(!current(ticket))return;mutating.current=true;setBusy(true);callbacks.current.onBusyChange?.(true);setError(null);const end=beginForegroundActivity("取消账号扫码绑定");foregroundEnd.current=end;
  try{await accept(await client.cancelAccountBinding({params:{runId:saved.current.runId},query:undefined,body:undefined}),ticket);}catch(e){if(current(ticket))setError(workspaceErrorCopy(e,"取消结果尚未确认，请刷新状态。"));}finally{mutating.current=false;end();foregroundEnd.current=null;if(current(ticket)){setBusy(false);callbacks.current.onBusyChange?.(false);}}
 }
 // Only an explicit platform click supplies an intent. StrictMode's discarded effect
 // is cancelled before consuming it; restoring an unknown request never submits it.
 React.useEffect(()=>{
  if(!startIntent)return;let cancelled=false;
  void Promise.resolve().then(async()=>{
   const ticket=epoch.current;
   if(cancelled||!current(ticket)||consumedIntent.current===startIntent)return;
   consumedIntent.current=startIntent;
   if(saved.current.intent&&!saved.current.runId)return;
   if(saved.current.runId){
    if(reading.current||mutating.current)return;
    reading.current=true;
    try{
     const previous=await client.getAccountBinding({params:{runId:saved.current.runId},query:undefined,body:undefined});
     await accept(previous,ticket,false);
     if(cancelled||!current(ticket))return;
     if(!finished(previous)){completionRun.current=previous.runId;return;}
     saved.current={};persist();setRun(null);
    }catch(e){if(current(ticket))setError(workspaceErrorCopy(e,"上次绑定状态尚未确认，请刷新原记录。"));return;}
    finally{reading.current=false;}
   }
   if(!cancelled&&current(ticket))void start();
  });
  return()=>{cancelled=true;};
  // The intent captures this explicit click, not subsequent state renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[startIntent]);
 const active=run&&!finished(run);
 return <div className="flex flex-col gap-3"><div><p className="text-sm text-muted-foreground">绑定到「{group.name}」。</p></div>{run&&<div className="rounded-control border border-border bg-surface p-3"><p role="status" className="text-sm font-medium">{run.status==="succeeded"&&verifiedRunId!==run.runId?"绑定结果已返回，正在核对账号":labels[run.status]}</p>{run.status==="cancel_requested"&&<p className="mt-2 text-xs text-muted-foreground">正在关闭本次扫码窗口与清理临时身份，确认停止后才会完成取消。</p>}{run.error&&<p className="mt-2 text-sm text-destructive">{run.error}</p>}</div>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap gap-2">{!active&&run?.status!=="succeeded"&&(canStart||pending)&&<Button disabled={disabled||busy||(!canStart&&!pending)} onClick={()=>void start()}>{pending?"核对上次绑定请求":`扫码绑定${platformLabel}账号`}</Button>}{active&&run.status!=="cancel_requested"&&<Button variant="outline" disabled={disabled||busy} onClick={()=>void cancel()}>取消本次绑定</Button>}{run&&verifiedRunId!==run.runId&&<Button variant="outline" disabled={disabled||busy} onClick={()=>void refresh()}>刷新绑定状态</Button>}</div></div>;
}
