"use client";
import {workspaceErrorCopy} from "./workspace-error-copy";
import {ResourceGrantsPanel} from "./resource-grants-panel";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccountGroupResource, GroupMemberResource, GroupTransferPreview, ENDPOINTS } from "@creatoros/contract";
import type { PlatformAccountResource } from "@creatoros/backend/modules/platform-account";
import { client } from "@/lib/contract-client";
import { readCurrentGroupId, writeCurrentGroupId } from "@/lib/http-transport";
import { notifyAccountsChanged, useAccountsChanged } from "@/lib/account-events";
import { beginForegroundActivity, hasForegroundActivity } from "@/lib/foreground-activity";
import { SectionCard } from "@/components/project/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GroupMigrationPanel } from "./group-migration-panel";
import { AccountBindingPanel } from "./account-binding-panel";
import { AccountRow } from "./account-manager-interactive-region";
const platforms=[{id:"douyin",name:"抖音"},{id:"kuaishou",name:"快手"},{id:"wechatVideo",name:"视频号"},{id:"wechatOfficial",name:"公众号"},{id:"xiaohongshu",name:"小红书"}] as const;
const platformName=(id:string)=>platforms.find(platform=>platform.id===id)?.name??id;
type ManualPlatform=typeof platforms[number]["id"];
type PlatformCapabilities=typeof ENDPOINTS.getPlatformAccountCapabilities.response["_output"];
const capabilityKinds=[{id:"bind",name:"扫码绑定"},{id:"collect",name:"自动采集"},{id:"publish",name:"自动发布"},{id:"draft",name:"平台草稿"},{id:"manual",name:"手动登记"}] as const;
const controlClass="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm";
export function AccountGroupManager({initialGroups=[],initialAccounts=[]}:{initialGroups?:AccountGroupResource[];initialAccounts?:PlatformAccountResource[]}) {
 const router=useRouter();
 const [capabilities,setCapabilities]=React.useState<PlatformCapabilities[]>([]),[capLoading,setCapLoading]=React.useState(true),[capError,setCapError]=React.useState<string|null>(null);
 const capAlive=React.useRef(false),capReading=React.useRef(false),capEpoch=React.useRef(0);
 const loadCapabilities=React.useCallback(async()=>{
  if(capReading.current)return;capReading.current=true;const ticket=++capEpoch.current;setCapLoading(true);setCapError(null);
  try{const result=await client.getPlatformAccountCapabilities({params:undefined,query:undefined,body:undefined});if(!capAlive.current||ticket!==capEpoch.current)return;if(!Array.isArray(result))throw Error("平台能力未返回有效结果，请重新读取。");setCapabilities(result as unknown as PlatformCapabilities[]);}
  catch(e){if(capAlive.current&&ticket===capEpoch.current)setCapError(workspaceErrorCopy(e,"平台能力尚未读取，请重试。"));}
  finally{capReading.current=false;if(capAlive.current&&ticket===capEpoch.current)setCapLoading(false);}
 },[]);
 React.useEffect(()=>{capAlive.current=true;void Promise.resolve().then(()=>{if(capAlive.current)void loadCapabilities();});const expire=()=>{capEpoch.current++;};return()=>{capAlive.current=false;expire();};},[loadCapabilities]);
 const capabilityFor=(platform:string)=>capabilities.find(row=>row.platform===platform);

 const initialSelected=initialGroups.find(group=>group.status==="active")??initialGroups[0];
 const [groups,setGroups]=React.useState(initialGroups),[accounts,setAccounts]=React.useState(initialAccounts),[selectedId,setSelectedId]=React.useState(initialSelected?.id??null);
 const [newName,setNewName]=React.useState(""),[name,setName]=React.useState(initialSelected?.name??""),[savingBusy,setBusy]=React.useState(false),[loading,setLoading]=React.useState(!initialGroups.length),[error,setError]=React.useState<string|null>(null),[message,setMessage]=React.useState<string|null>(null);
 const [currentId,setCurrentId]=React.useState<string|null>(null),[showArchived,setShowArchived]=React.useState(false),[manualPlatform,setManualPlatform]=React.useState<ManualPlatform>("xiaohongshu"),[handle,setHandle]=React.useState(""),[ack,setAck]=React.useState(false);
 const [transferMember,setTransferMember]=React.useState<GroupMemberResource|null>(null),[targetId,setTargetId]=React.useState(""),[preview,setPreview]=React.useState<GroupTransferPreview|null>(null);
 const [migrationOpen,setMigrationOpen]=React.useState(false),[migrationBusy,setMigrationBusy]=React.useState(false);
 const [bindingPlatform,setBindingPlatform]=React.useState<ManualPlatform|null>(null);
 const bindingReturnFocus=React.useRef<HTMLButtonElement|null>(null);
 const [bindingBusy,setBindingBusy]=React.useState(false);
 const busy=savingBusy||migrationBusy||bindingBusy;
 const manualCapability=capabilityFor(manualPlatform);
 const createIntent=React.useRef<{name:string;key:string}|null>(null), transferIntent=React.useRef<{digest:string;key:string}|null>(null);
 const previewEpoch=React.useRef(0), explicitlySelected=React.useRef(false);
 const alive=React.useRef(false),readEpoch=React.useRef(0),inFlight=React.useRef(false),reloadWanted=React.useRef(false),saving=React.useRef(false),selection=React.useRef(selectedId);
 // eslint-disable-next-line react-hooks/refs -- 仅供异步响应检查当前选择，不参与渲染
 selection.current=selectedId;
 const reload=React.useCallback(async()=>{
   readEpoch.current++;
   if(inFlight.current){reloadWanted.current=true;return;}
   inFlight.current=true;
   do {
     reloadWanted.current=false;const epoch=readEpoch.current;
     try {
       const [readGroups,readAccounts]=await Promise.all([client.listAccountGroups({params:undefined,query:{page:1,pageSize:100,includeArchived:true},body:undefined}),client.listAccounts({params:undefined,query:{page:1,pageSize:100},body:undefined})]);
       if(!alive.current||epoch!==readEpoch.current)continue;
       if(!Array.isArray(readGroups)||!Array.isArray(readAccounts))throw new Error("账号组与平台账号未返回有效列表，请重新读取。");
       const all=readGroups as unknown as AccountGroupResource[];
       setGroups(all);setAccounts(readAccounts as unknown as PlatformAccountResource[]);setCurrentId(readCurrentGroupId());setLoading(false);
       const preferred=explicitlySelected.current?selection.current:readCurrentGroupId()??selection.current;
       const next=all.find(group=>group.id===preferred)??all.find(group=>group.status==="active")??all[0];
       if(next&&next.id!==selection.current){selection.current=next.id;setSelectedId(next.id);setName(next.name);}
     }catch(err){if(alive.current&&epoch===readEpoch.current){setLoading(false);setError(workspaceErrorCopy(err,"账号组暂时读取失败，请重试。"));}}
   }while(alive.current&&reloadWanted.current);
   inFlight.current=false;
 },[]);
 React.useEffect(()=>{
   alive.current=true;
   void Promise.resolve().then(()=>{if(alive.current){void reload();if(new URLSearchParams(window.location.search).get("migrationId"))setMigrationOpen(true);}});
   return()=>{alive.current=false;
     // eslint-disable-next-line react-hooks/exhaustive-deps -- 请求世代不是DOM节点；卸载必须推进以拒绝旧响应
     readEpoch.current++;
   };
 },[reload]);
 useAccountsChanged(()=>{void reload();});
 const selected=groups.find(group=>group.id===selectedId),members=selected?.members.filter(member=>member.leftAt===null)??[];
 const editable=selected?.status==="active";
 function choose(group:AccountGroupResource){if(saving.current||migrationBusy)return;setMigrationOpen(false);explicitlySelected.current=true;setSelectedId(group.id);selection.current=group.id;setName(group.name);setPreview(null);setError(null);setMessage(null);}
 function enter(id:string){if(hasForegroundActivity()){setError("有进行中的操作，请先完成操作，再切换到这个账号组。");return;}writeCurrentGroupId(id);setCurrentId(id);notifyAccountsChanged({source:"account-management",routeRefreshScheduled:true});router.refresh();}
 async function mutate(action:()=>Promise<unknown>,success:string,after?:(result:unknown)=>void,acceptReloadSelection=false){
   if(saving.current)return;saving.current=true;setBusy(true);setError(null);setMessage(null);const originalSelection=selection.current,originalGroup=readCurrentGroupId();const end=beginForegroundActivity("账号组管理正在保存");
   try {const result=await action();if(!alive.current||readCurrentGroupId()!==originalGroup)return;await reload();if(!alive.current||readCurrentGroupId()!==originalGroup)return;if(selection.current===originalSelection||acceptReloadSelection){after?.(result);setMessage(success);}notifyAccountsChanged({source:"account-management",routeRefreshScheduled:true});router.refresh();}
   catch(err){if(alive.current&&selection.current===originalSelection)setError(workspaceErrorCopy(err,"操作没有完成，请重试。输入已保留。"));}
   finally{end();saving.current=false;if(alive.current)setBusy(false);}
 }
 async function create(){const value=newName.trim();if(!value)return;if(createIntent.current?.name!==value)createIntent.current={name:value,key:crypto.randomUUID()};const key=createIntent.current.key;await mutate(async()=>{const created=await client.createAccountGroup({params:undefined,query:undefined,body:{name:value,idempotencyKey:key}});return client.getAccountGroup({params:{groupId:created.id},query:undefined,body:undefined});},"账号组已保存，可以进入工作区继续创作。",result=>{const group=result as AccountGroupResource;setGroups(previous=>[...previous.filter(item=>item.id!==group.id),group]);explicitlySelected.current=true;setSelectedId(group.id);selection.current=group.id;setName(group.name);setNewName("");createIntent.current=null;},true);}
 async function rename(){if(!selected||!name.trim())return;await mutate(async()=>{await client.updateAccountGroup({params:{groupId:selected.id},query:undefined,body:{name:name.trim(),expectedVersion:selected.version}});return client.getAccountGroup({params:{groupId:selected.id},query:undefined,body:undefined});},"名称已保存。",result=>{const group=result as AccountGroupResource;setGroups(previous=>previous.map(item=>item.id===group.id?group:item));setName(group.name);});}
 async function toggleArchive(){if(!selected)return;await mutate(async()=>{const operation=selected.status==="active"?client.archiveAccountGroup:client.restoreAccountGroup;await operation({params:{groupId:selected.id},query:undefined,body:{expectedVersion:selected.version}});return client.getAccountGroup({params:{groupId:selected.id},query:undefined,body:undefined});},selected.status==="active"?"账号组已归档，历史资料仍可查看。":"账号组已恢复。",result=>{const group=result as AccountGroupResource;setGroups(previous=>previous.map(item=>item.id===group.id?group:item));explicitlySelected.current=true;if(group.status==="archived"&&readCurrentGroupId()===group.id){writeCurrentGroupId(null);setCurrentId(null);}setShowArchived(true);});}
 const registerIntent=React.useRef<{intent:string;key:string}|null>(null);
 async function register(){if(!selected||!ack||!handle.trim()||selected.id!==readCurrentGroupId()){setError("请先进入当前账号组，再登记账号。");return;}const intent=[selected.id,manualPlatform,handle.trim()].join(":");if(registerIntent.current?.intent!==intent)registerIntent.current={intent,key:crypto.randomUUID()};const key=registerIntent.current.key;await mutate(async()=>{const created=await client.createAccount({params:undefined,query:undefined,body:{platform:manualPlatform,accountHandle:handle.trim(),idempotencyKey:key}});return client.getAccount({params:{accountId:created.id},query:undefined,body:undefined});},"账号已登记，登录身份仍需验证。",()=>{setHandle("");setAck(false);registerIntent.current=null;});}
 async function readPreview(){
   if(!transferMember||!targetId||saving.current)return;
   saving.current=true;setBusy(true);setError(null);const epoch=++previewEpoch.current,selectedGroup=selection.current;
   try{const result=await client.previewAccountGroupTransfer({params:undefined,query:undefined,body:{accountId:transferMember.accountId,toGroupId:targetId}});if(alive.current&&epoch===previewEpoch.current&&selectedGroup===selection.current)setPreview(result);}
   catch(err){if(alive.current)setError(workspaceErrorCopy(err,"转组影响暂时读取失败。"));}
   finally{saving.current=false;if(alive.current)setBusy(false);}
 }
 async function transfer(){if(!preview||preview.activeTaskCount>0)return;if(transferIntent.current?.digest!==preview.digest)transferIntent.current={digest:preview.digest,key:crypto.randomUUID()};const key=transferIntent.current.key;await mutate(()=>client.transferAccountGroupMember({params:undefined,query:undefined,body:{...preview,idempotencyKey:key}}),"账号已转组，历史资料留在原组。",()=>{setTransferMember(null);setPreview(null);transferIntent.current=null;});}
 return <main data-testid="account-manager" data-slot="account-manager" className="flex min-w-0 flex-col gap-section-gap">
  <header><h1 className="text-2xl font-semibold">账号组与绑定账号</h1><p className="mt-1 text-sm text-muted-foreground">同一创作者的内容在一个工作区管理，平台账号分别绑定与分发。</p></header>
  {error&&!transferMember&&<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive"><span>{error}</span><Button variant="outline" size="sm" disabled={busy} onClick={()=>{setError(null);void reload();}}>重新读取</Button></div>}{message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}
  <div className="grid min-w-0 gap-section-gap lg:grid-cols-[16rem_minmax(0,1fr)]">
   <aside className="flex min-w-0 flex-col gap-4"><SectionCard title="账号组"><div className="flex flex-col gap-3">
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={event=>setShowArchived(event.target.checked)}/>显示已归档组</label>
    {loading&&<p role="status" className="text-sm text-muted-foreground">正在读取账号组…</p>}
    <ul className="flex flex-col gap-2">{groups.filter(group=>showArchived||group.status==="active").map(group=><li key={group.id}><button type="button" disabled={busy} aria-pressed={group.id===selectedId} onClick={()=>choose(group)} className={`w-full rounded-control border px-3 py-2 text-left ${group.id===selectedId?"border-brand bg-brand-soft text-brand":"border-border bg-surface"}`}><span className="block break-words text-sm font-medium">{group.name}</span><span className="text-xs text-muted-foreground">{group.status==="archived"?"已归档":`${group.members.filter(member=>member.leftAt===null).length} 个平台账号`}{currentId===group.id?" · 当前工作区":""}</span></button></li>)}</ul>
    {!loading&&!groups.length&&<p className="text-sm text-muted-foreground">先创建账号组，账号可以稍后绑定。</p>}
    <label htmlFor="new-group-name" className="text-sm">新账号组名称</label><Input id="new-group-name" value={newName} onChange={event=>setNewName(event.target.value)} disabled={busy} maxLength={120}/><Button disabled={busy||!newName.trim()} onClick={()=>void create()}>创建账号组</Button>
   </div></SectionCard></aside>
   <div className="flex min-w-0 flex-col gap-4">
    {selected?<><SectionCard title={selected.name}><div className="flex min-w-0 flex-col gap-3"><div className="flex flex-wrap items-center gap-2"><label htmlFor="group-name" className="text-sm">账号组名称</label><Input id="group-name" className="min-w-0 flex-1" value={name} disabled={busy||!editable} onChange={event=>setName(event.target.value)} maxLength={120}/><Button variant="outline" disabled={busy||!editable||!name.trim()||name.trim()===selected.name} onClick={()=>void rename()}>保存名称</Button></div>
      <div className="flex flex-wrap items-center gap-3">{editable&&currentId!==selected.id&&<Button variant="outline" disabled={busy} onClick={()=>enter(selected.id)}>进入此账号组</Button>}<details><summary className="cursor-pointer text-sm text-muted-foreground">管理账号组</summary><div className="mt-2 flex flex-col gap-2"><p className="text-xs text-muted-foreground">归档只隐藏工作区入口，保留历史资料与后台任务。</p><Button variant="outline" disabled={busy} onClick={()=>void toggleArchive()}>{editable?"归档账号组":"恢复账号组"}</Button></div></details><Link href="/projects" className="text-sm text-brand">继续创作 →</Link></div>
     </div></SectionCard>
     <SectionCard title="组内平台账号" description="同平台可以登记多个账号，发布时选择具体目标。"><ul className="flex flex-col gap-3" data-testid="account-list">
      {!members.length&&<li data-testid="account-empty-state" className="text-sm text-muted-foreground">这个账号组还没有平台账号，可以先创建内容。</li>}
      {members.map(member=><li key={member.id} className="rounded-control border border-border p-3"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{member.accountHandle}</p><p className="mt-1 text-xs text-muted-foreground">{platformName(member.platform)} · {member.status==="archived"?"已隐藏":accounts.find(account=>account.id===member.accountId)?.externalAccountId?"平台身份已读取，登录与采集以任务记录为准":"身份未验证 · 未自动采集"}</p></div><div className="flex shrink-0 flex-col items-end gap-2">{selected.id===currentId&&member.status==='active'&&(member.platform==='wechatOfficial'||member.platform==='wechatVideo')?<Link className="text-sm text-brand hover:underline" href={`/accounts/works?accountId=${encodeURIComponent(member.accountId)}`} aria-label={`查看${member.accountHandle}的数据`}>查看数据 →</Link>:null}{member.platform==='wechatOfficial'||member.platform==='wechatVideo'?null:<Button variant="outline" size="sm" disabled={busy||!editable} onClick={()=>{setTransferMember(member);setTargetId(groups.find(group=>group.status==="active"&&group.id!==selected.id)?.id??"");setPreview(null);}}>转组</Button>}</div></div>
       <details className="mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">账号管理与能力</summary><p className="mt-2 text-xs text-muted-foreground">扫码、采集和发布能力见下方平台能力；登记账号不会验证登录身份。</p>{member.platform==='wechatOfficial'||member.platform==='wechatVideo'?<Button variant="outline" size="sm" disabled={busy||!editable} onClick={()=>{setTransferMember(member);setTargetId(groups.find(group=>group.status==="active"&&group.id!==selected.id)?.id??"");setPreview(null);}}>转组</Button>:null}{accounts.find(account=>account.id===member.accountId)&&<ul className="mt-2"><AccountRow account={accounts.find(account=>account.id===member.accountId)!} isOnlyAccount={accounts.filter(account=>account.status==="active").length===1}/></ul>}{member.status==="archived"&&<Button variant="outline" size="sm" disabled={busy||!editable} onClick={()=>void mutate(()=>client.updateAccount({params:{accountId:member.accountId},query:undefined,body:{status:"active"}}),"账号已恢复。")}>恢复平台账号</Button>}</details>
      </li>)}
     </ul></SectionCard>
     <SectionCard title="平台能力" description="能力来自当前已装配的服务。可用不代表账号已登录，采集结果以真实任务为准。">
      {capLoading&&<p role="status" className="text-sm text-muted-foreground">正在读取平台能力…</p>}{capError&&<div role="alert" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-destructive"><span>{capError}</span><Button variant="outline" size="sm" disabled={capLoading} onClick={()=>void loadCapabilities()}>重试读取</Button></div>}
      <div className="max-w-full overflow-x-auto"><table aria-label="各平台能力" className="w-full min-w-[42rem] text-left text-sm"><thead><tr><th className="px-2 py-2 font-medium">平台</th>{capabilityKinds.map(kind=><th key={kind.id} className="px-2 py-2 font-medium">{kind.name}</th>)}</tr></thead><tbody>{platforms.map(platform=>{const row=capabilityFor(platform.id);return <tr key={platform.id} className="border-t border-border"><th className="px-2 py-3 align-top font-medium">{platform.name}</th>{capabilityKinds.map(kind=>{const state=row?.[kind.id];return <td key={kind.id} className="px-2 py-3 align-top"><span className={state?.available?"text-success":"text-muted-foreground"}>{state?state.available?"可用":"暂不可用":"未读取"}</span>{state&&<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{state.reason}</p>}{kind.id==="bind"&&row?.bind.available&&row.bind.method==="qr"?<Button className="mt-2" variant="outline" size="sm" disabled={busy||!editable||selected.id!==currentId} onClick={event=>{bindingReturnFocus.current=event.currentTarget;setBindingPlatform(platform.id);}}>扫码绑定{platform.name}账号</Button>:null}</td>;})}</tr>;})}</tbody></table></div>
      {editable&&selected.id!==currentId?<p className="mt-3 text-sm text-muted-foreground">先进入此账号组，再扫码绑定。</p>:null}
     </SectionCard>
     {editable&&<SectionCard title="手动登记平台账号" description={`目标账号组：${selected.name}`}>
      {selected.id!==currentId?<p className="text-sm text-muted-foreground">先进入此账号组，再绑定或登记账号。</p>:<div className="flex flex-col gap-4"><div><p className="my-2 text-xs text-muted-foreground">登记用于保存分发目标，不会验证登录或自动采集数据。</p><div className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1 text-sm">登记平台<select aria-label="登记平台" className={controlClass} value={manualPlatform} disabled={busy} onChange={event=>setManualPlatform(event.target.value as ManualPlatform)}>{platforms.filter(platform=>capabilityFor(platform.id)?.manual.available!==false).map(platform=><option key={platform.id} value={platform.id}>{platform.name}</option>)}</select></label><label className="flex flex-col gap-1 text-sm">平台账号名称<Input value={handle} disabled={busy} onChange={event=>setHandle(event.target.value)} /></label></div><label className="my-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={ack} disabled={busy} onChange={event=>setAck(event.target.checked)}/>确认这是我管理的账号</label><Button variant="outline" disabled={busy||manualCapability?.manual.available===false||!ack||!handle.trim()} onClick={()=>void register()}>登记账号</Button></div></div>}
     </SectionCard>}
     <ResourceGrantsPanel key={`resources:${selected.id}`} group={selected} disabled={busy} onChanged={reload}/>
     {editable&&<SectionCard title="整理历史资料" description="把历史项目与内容归入另一个账号组，先预览完整影响。">{selected.id!==currentId?<p className="text-sm text-muted-foreground">先进入此账号组，再查看和整理历史资料。</p>:<Button variant="outline" disabled={busy} aria-expanded={migrationOpen} onClick={()=>setMigrationOpen(open=>!open)}>{migrationOpen?"收起历史资料":"整理历史资料"}</Button>}</SectionCard>}
     {editable&&selected.id===currentId&&migrationOpen&&<GroupMigrationPanel key={selected.id} sourceGroup={selected} groups={groups} disabled={savingBusy||bindingBusy} onBusyChange={setMigrationBusy} onChanged={async()=>{await reload();if(!alive.current)return;notifyAccountsChanged({source:"account-management",routeRefreshScheduled:true});router.refresh();}}/>}
    </>:<SectionCard title="创建你的第一个账号组"><p className="text-sm text-muted-foreground">一个账号组对应一个创作者或品牌。没有平台账号也可以创建项目、写稿和管理素材。</p></SectionCard>}
   </div>
  </div>
  <Dialog open={bindingPlatform!==null&&selected?.id===currentId} onOpenChange={open=>{if(!open)setBindingPlatform(null);}}><DialogContent onCloseAutoFocus={event=>{const trigger=bindingReturnFocus.current;if(trigger?.isConnected){event.preventDefault();trigger.focus();}}}><DialogHeader><DialogTitle>{bindingPlatform?`扫码绑定${platformName(bindingPlatform)}账号`:"扫码绑定"}</DialogTitle><DialogDescription>扫描打开的平台二维码，登录后自动保存绑定结果。</DialogDescription></DialogHeader>{selected&&bindingPlatform?<AccountBindingPanel key={`${selected.id}:${bindingPlatform}`} platform={bindingPlatform} group={selected} canStart={capabilityFor(bindingPlatform)?.bind.available===true&&capabilityFor(bindingPlatform)?.bind.method==="qr"} disabled={savingBusy||migrationBusy} onBusyChange={setBindingBusy} onChanged={async()=>{await reload();if(!alive.current||readCurrentGroupId()!==selected.id)return;notifyAccountsChanged({source:"account-management",routeRefreshScheduled:true});router.refresh();}}/>:null}</DialogContent></Dialog>
  <Dialog open={transferMember!==null} onOpenChange={open=>{if(!open&&!busy){setTransferMember(null);setPreview(null);}}}><DialogContent><DialogHeader><DialogTitle>转移平台账号</DialogTitle><DialogDescription>{transferMember?.accountHandle} · 先检查影响，再确认转组。</DialogDescription></DialogHeader><label className="text-sm">目标账号组<select className={controlClass} aria-label="目标账号组" value={targetId} disabled={busy} onChange={event=>{setTargetId(event.target.value);setPreview(null);}}><option value="">请选择</option>{groups.filter(group=>group.status==="active"&&group.id!==selectedId).map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   {preview&&<div className="rounded-control border border-border bg-surface-subtle p-3 text-sm"><p>历史作品和数据仍在原组；转组后的新事实进入目标组。</p><p className="mt-2">进行中的任务：{preview.activeTaskCount}</p>{preview.impact&&<ul aria-label="转组影响清单" className="mt-2 space-y-1"><li>历史发布作品：{preview.impact.historyPublicationCount}</li><li>待发布目标：{preview.impact.pendingPublicationTargetCount}</li><li>共享项目：{preview.impact.sharedProjectCount}</li><li>定位版本：{preview.impact.positioningCount}</li><li>素材引用：{preview.impact.assetReferenceCount}</li></ul>}<p className="mt-2">定位、稿件和素材仍留在原组；需要一起整理时，单独预览历史资料归组。</p>{preview.activeTaskCount>0&&<p className="mt-1 text-destructive">请先等待该账号任务结束。其它账号和任务可以继续使用。</p>}</div>}
   <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>{setTransferMember(null);setPreview(null);}}>取消</Button>{preview?<Button disabled={busy||preview.activeTaskCount>0} onClick={()=>void transfer()}>确认转组</Button>:<Button disabled={busy||!targetId} onClick={()=>void readPreview()}>查看转组影响</Button>}</DialogFooter>
  </DialogContent></Dialog>
 </main>;
}
