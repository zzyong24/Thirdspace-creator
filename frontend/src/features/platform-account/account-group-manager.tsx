"use client";
import {workspaceErrorCopy} from "./workspace-error-copy";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ENDPOINTS, requestListWithMeta, type AccountGroupResource, type GroupMemberResource, type GroupTransferPreview } from "@creatoros/contract";
import type { PlatformAccountResource } from "@creatoros/backend/modules/platform-account";
import { client } from "@/lib/contract-client";
import { createHttpTransport, readCurrentGroupId, writeCurrentGroupId } from "@/lib/http-transport";
import { notifyAccountsChanged, useAccountsChanged } from "@/lib/account-events";
import { beginForegroundActivity, hasForegroundActivity } from "@/lib/foreground-activity";
import { SectionCard } from "@/components/project/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountBindingPanel, type BindingCompletion } from "./account-binding-panel";
import { AccountVisibilityDialog } from "./account-manager-interactive-region";
import { CheckCircle2, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
const platforms=[{id:"douyin",name:"抖音"},{id:"kuaishou",name:"快手"},{id:"wechatVideo",name:"视频号"},{id:"wechatOfficial",name:"公众号"},{id:"xiaohongshu",name:"小红书"}] as const;
const platformName=(id:string)=>platforms.find(platform=>platform.id===id)?.name??id;
type BindingPlatform=typeof platforms[number]["id"];
type PlatformCapabilities=typeof ENDPOINTS.getPlatformAccountCapabilities.response["_output"];
const capabilityKinds=[{id:"bind",name:"扫码绑定"},{id:"collect",name:"自动采集"},{id:"publish",name:"自动发布"},{id:"draft",name:"平台草稿"}] as const;
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
 const capabilityAvailable=(platform:string,kind:typeof capabilityKinds[number]["id"])=>{const row=capabilityFor(platform);return row?.[kind].available===true&&(kind!=="bind"||row.bind.method==="qr");};
 const visibleCapabilityKinds=capabilityKinds.filter(kind=>platforms.some(platform=>capabilityAvailable(platform.id,kind.id)));
 const visiblePlatforms=platforms.filter(platform=>visibleCapabilityKinds.some(kind=>capabilityAvailable(platform.id,kind.id)));

 const initialSelected=initialGroups.find(group=>group.status==="active")??initialGroups[0];
 const [groups,setGroups]=React.useState(initialGroups),[accounts,setAccounts]=React.useState(initialAccounts),[selectedId,setSelectedId]=React.useState(initialSelected?.id??null);
 const [newName,setNewName]=React.useState(""),[name,setName]=React.useState(initialSelected?.name??""),[savingBusy,setBusy]=React.useState(false),[loading,setLoading]=React.useState(!initialGroups.length),[error,setError]=React.useState<string|null>(null),[message,setMessage]=React.useState<string|null>(null);
 const [currentId,setCurrentId]=React.useState<string|null>(null),[showArchived,setShowArchived]=React.useState(false);
 const [groupsRead,setGroupsRead]=React.useState(initialGroups.length>0),[renameOpen,setRenameOpen]=React.useState(false),[visibilityAccount,setVisibilityAccount]=React.useState<PlatformAccountResource|null>(null);
 const managementTriggers=React.useRef(new Map<string,HTMLButtonElement>());
 const [transferMember,setTransferMember]=React.useState<GroupMemberResource|null>(null),[targetId,setTargetId]=React.useState(""),[preview,setPreview]=React.useState<GroupTransferPreview|null>(null);
 const [bindingPlatform,setBindingPlatform]=React.useState<BindingPlatform|null>(null);
 const [bindingIntent,setBindingIntent]=React.useState<string|null>(null);
 const bindingReturnFocus=React.useRef<HTMLButtonElement|null>(null);
 const [bindingBusy,setBindingBusy]=React.useState(false);
 const busy=savingBusy||bindingBusy;
 const createIntent=React.useRef<{name:string;key:string}|null>(null), transferIntent=React.useRef<{digest:string;key:string}|null>(null);
 const previewEpoch=React.useRef(0), explicitlySelected=React.useRef(false);
 const transferReturnFocus=React.useRef<{element:HTMLButtonElement;selectedGroupId:string;workspaceGroupId:string|null}|null>(null);
 const alive=React.useRef(false),readEpoch=React.useRef(0),inFlight=React.useRef(false),reloadWanted=React.useRef(false),saving=React.useRef(false),selection=React.useRef(selectedId);
 // eslint-disable-next-line react-hooks/refs -- 仅供异步响应检查当前选择，不参与渲染
 selection.current=selectedId;
 type ReadResult={groups:AccountGroupResource[];accounts:PlatformAccountResource[]}|{error:string}|null;
 const reloadDone=React.useRef<Promise<ReadResult>|null>(null);
 const reload=React.useCallback(()=>{
   readEpoch.current++;
   if(inFlight.current){reloadWanted.current=true;return reloadDone.current!;}
   inFlight.current=true;
   let finish!:(value:ReadResult)=>void;
   const promise=new Promise<ReadResult>(resolve=>{finish=resolve;});reloadDone.current=promise;
   void (async()=>{let result:ReadResult=null;try{
   do {
     reloadWanted.current=false;const epoch=readEpoch.current;
     try {
       const readAllGroups=async()=>{
         const all:AccountGroupResource[]=[],transport=createHttpTransport();
         for(let page=1;;page++){
           if(!alive.current||epoch!==readEpoch.current)return null;
           const result=await requestListWithMeta(transport,ENDPOINTS.listAccountGroups,{params:undefined,query:{page,pageSize:100,includeArchived:true},body:undefined});
           if(!alive.current||epoch!==readEpoch.current)return null;
           if(result.meta.page!==page||result.meta.pageSize!==100)throw new Error("账号组分页未按请求返回，请重新读取。");
           // SEMANTIC_BOUNDARY_ALLOW: 只核对分页真实ID，防重复或过期回读，不选择创作内容。
           const ids=new Set(all.map(group=>group.id));
           if(result.data.some(group=>ids.has(group.id))||new Set(result.data.map(group=>group.id)).size!==result.data.length)throw new Error("账号组分页重复，请重新读取。");
           all.push(...result.data);
           if(all.length===result.meta.total)return all;
           if(all.length>result.meta.total||result.data.length===0)throw new Error("账号组列表未完整返回，请重新读取。");
         }
       };
       const readAllAccounts=async()=>{
         const all:PlatformAccountResource[]=[],transport=createHttpTransport();let total:number|undefined;
         for(let page=1;;page++){
           if(!alive.current||epoch!==readEpoch.current)return null;
           const result=await requestListWithMeta(transport,ENDPOINTS.listAccounts,{params:undefined,query:{page,pageSize:100},body:undefined});
           if(!alive.current||epoch!==readEpoch.current)return null;
           if(result.meta.page!==page||result.meta.pageSize!==100||(total!==undefined&&total!==result.meta.total))throw new Error("平台账号分页已变化，请重新读取。");
           total=result.meta.total;
           // SEMANTIC_BOUNDARY_ALLOW: 只核真实分页ID和完整总量，不选择或归类内容。
           const ids=new Set(all.map(account=>account.id));
           if(result.data.some(account=>ids.has(account.id))||new Set(result.data.map(account=>account.id)).size!==result.data.length)throw new Error("平台账号分页重复，请重新读取。");
           all.push(...result.data);
           if(all.length===total)return all;
           if(all.length>total||result.data.length===0)throw new Error("平台账号列表未完整返回，请重新读取。");
         }
       };
       const [readGroups,readAccounts]=await Promise.all([readAllGroups(),readAllAccounts()]);
       if(!alive.current||epoch!==readEpoch.current)continue;
       if(!Array.isArray(readGroups)||!Array.isArray(readAccounts))throw new Error("账号组与平台账号未返回有效列表，请重新读取。");
       const all=readGroups as unknown as AccountGroupResource[];
       setGroupsRead(true);setGroups(all);setAccounts(readAccounts as unknown as PlatformAccountResource[]);setCurrentId(readCurrentGroupId());setLoading(false);result={groups:all,accounts:readAccounts as unknown as PlatformAccountResource[]};
       const preferred=explicitlySelected.current?selection.current:readCurrentGroupId()??selection.current;
       const next=all.find(group=>group.id===preferred)??all.find(group=>group.status==="active")??all[0];
       if(next&&next.id!==selection.current){selection.current=next.id;setSelectedId(next.id);setName(next.name);}
     }catch(err){if(alive.current&&epoch===readEpoch.current){const error=workspaceErrorCopy(err,"账号组暂时读取失败，请重试。");result={error};setLoading(false);setError(error);}}
   }while(alive.current&&reloadWanted.current);
   }finally{inFlight.current=false;reloadDone.current=null;finish(alive.current?result:null);}})();
   return promise;
 },[]);
 React.useEffect(()=>{
   alive.current=true;
   void Promise.resolve().then(()=>{if(alive.current){void reload();}});
   return()=>{alive.current=false;
     // eslint-disable-next-line react-hooks/exhaustive-deps -- 请求世代不是DOM节点；卸载必须推进以拒绝旧响应
     readEpoch.current++;
   };
 },[reload]);
 useAccountsChanged(()=>{void reload();});
 const selected=groups.find(group=>group.id===selectedId),members=selected?.members.filter(member=>member.leftAt===null)??[];
 const editable=selected?.status==="active";
 function choose(group:AccountGroupResource){if(saving.current||bindingBusy)return;explicitlySelected.current=true;setSelectedId(group.id);selection.current=group.id;setName(group.name);setPreview(null);setBindingPlatform(null);setError(null);setMessage(null);}
 function enter(id:string){if(hasForegroundActivity()){setError("有进行中的操作，请先完成操作，再切换到这个账号组。");return;}writeCurrentGroupId(id,"account-management");setCurrentId(id);}
 async function mutate(action:()=>Promise<unknown>,success:string,after?:(result:unknown)=>void,acceptReloadSelection=false){
   if(saving.current)return;saving.current=true;setBusy(true);setError(null);setMessage(null);const originalSelection=selection.current,originalGroup=readCurrentGroupId();const end=beginForegroundActivity("账号组管理正在保存");
   try {const result=await action();if(!alive.current||readCurrentGroupId()!==originalGroup)return;await reload();if(!alive.current||readCurrentGroupId()!==originalGroup)return;if(selection.current===originalSelection||acceptReloadSelection){after?.(result);setMessage(success);}if(readCurrentGroupId()===originalGroup){notifyAccountsChanged({source:"account-management",routeRefreshScheduled:true});router.refresh();}}
   catch(err){if(alive.current&&selection.current===originalSelection)setError(workspaceErrorCopy(err,"操作没有完成，请重试。输入已保留。"));}
   finally{end();saving.current=false;if(alive.current)setBusy(false);}
 }
 async function create(){const value=newName.trim();if(!value||!groupsRead)return;const firstGroup=groups.length===0;if(createIntent.current?.name!==value)createIntent.current={name:value,key:crypto.randomUUID()};const key=createIntent.current.key;await mutate(async()=>{const created=await client.createAccountGroup({params:undefined,query:undefined,body:{name:value,idempotencyKey:key}});return client.getAccountGroup({params:{groupId:created.id},query:undefined,body:undefined});},firstGroup?"账号组已创建，可直接开始定位，无需抖音登录。":"账号组已保存，可以进入工作区继续创作。",result=>{const group=result as AccountGroupResource;setGroups(previous=>[...previous.filter(item=>item.id!==group.id),group]);explicitlySelected.current=true;setSelectedId(group.id);selection.current=group.id;setName(group.name);setNewName("");createIntent.current=null;if(firstGroup){writeCurrentGroupId(group.id,"account-management");setCurrentId(group.id);}},true);}
 async function rename(){if(!selected||!name.trim())return;await mutate(async()=>{await client.updateAccountGroup({params:{groupId:selected.id},query:undefined,body:{name:name.trim(),expectedVersion:selected.version}});return client.getAccountGroup({params:{groupId:selected.id},query:undefined,body:undefined});},"名称已保存。",result=>{const group=result as AccountGroupResource;setGroups(previous=>previous.map(item=>item.id===group.id?group:item));setName(group.name);setRenameOpen(false);});}
 async function toggleArchive(){if(!selected)return;await mutate(async()=>{const operation=selected.status==="active"?client.archiveAccountGroup:client.restoreAccountGroup;await operation({params:{groupId:selected.id},query:undefined,body:{expectedVersion:selected.version}});return client.getAccountGroup({params:{groupId:selected.id},query:undefined,body:undefined});},selected.status==="active"?"账号组已归档，历史资料仍可查看。":"账号组已恢复。",result=>{const group=result as AccountGroupResource;setGroups(previous=>previous.map(item=>item.id===group.id?group:item));explicitlySelected.current=true;if(group.status==="archived"&&readCurrentGroupId()===group.id){writeCurrentGroupId(null,"account-management");setCurrentId(null);}setShowArchived(true);});}
 function openTransfer(member:GroupMemberResource,trigger:HTMLButtonElement){
  if(!selected)return;
  transferReturnFocus.current={element:trigger,selectedGroupId:selected.id,workspaceGroupId:readCurrentGroupId()};
  setTransferMember(member);setTargetId(groups.find(group=>group.status==="active"&&group.id!==selected.id)?.id??"");setPreview(null);
 }
 async function readPreview(){
   if(!transferMember||!targetId||saving.current)return;
   saving.current=true;setBusy(true);setError(null);const epoch=++previewEpoch.current,selectedGroup=selection.current;
   try{const result=await client.previewAccountGroupTransfer({params:undefined,query:undefined,body:{accountId:transferMember.accountId,toGroupId:targetId}});if(alive.current&&epoch===previewEpoch.current&&selectedGroup===selection.current)setPreview(result);}
   catch(err){if(alive.current)setError(workspaceErrorCopy(err,"转组影响暂时读取失败。"));}
   finally{saving.current=false;if(alive.current)setBusy(false);}
 }
 async function transfer(){if(!preview||preview.activeTaskCount>0)return;if(transferIntent.current?.digest!==preview.digest)transferIntent.current={digest:preview.digest,key:crypto.randomUUID()};const key=transferIntent.current.key;await mutate(()=>client.transferAccountGroupMember({params:undefined,query:undefined,body:{...preview,idempotencyKey:key}}),"账号已转组，历史资料留在原组。",()=>{setTransferMember(null);setPreview(null);transferIntent.current=null;});}
 const firstGroup=groupsRead&&!groups.length;
 const newGroupForm=<div className="flex flex-col gap-3"><label htmlFor="new-group-name" className="text-sm">新账号组名称</label><Input id="new-group-name" placeholder="例如：我的创作账号组" value={newName} onChange={event=>setNewName(event.target.value)} disabled={busy||!groupsRead} maxLength={120}/><Button variant={firstGroup?"default":"outline"} disabled={busy||!groupsRead||!newName.trim()} onClick={()=>void create()}>创建账号组</Button></div>;
 return <main data-page="accounts" data-studio-layout="accounts" data-testid="account-manager" data-slot="account-manager" className="flex min-w-0 flex-col gap-section-gap">
  <header><h1 className="text-2xl font-semibold">账号组与绑定账号</h1><p className="mt-1 text-sm text-muted-foreground">每个创作者或品牌一个账号组，可绑定多个平台账号。</p></header>
  {error&&!transferMember&&!renameOpen&&<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive"><span>{error}</span><Button variant="outline" size="sm" disabled={busy} onClick={()=>{setError(null);void reload();}}>重新读取</Button></div>}{message&&<p role="status" className={`flex min-w-0 items-start gap-2 text-sm ${message.startsWith("已绑定")?"text-success":"text-muted-foreground"}`}>{message.startsWith("已绑定")&&<CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0"/>}<span className="min-w-0 break-words">{message.startsWith("已绑定")?<><strong className="font-medium">已绑定</strong>{message.slice(3)}</>:message}</span></p>}
  {!groupsRead?<p role="status" className="text-sm text-muted-foreground">{loading?"正在读取账号组…":"账号组尚未读取，请重新读取后继续。"}</p>:firstGroup?<SectionCard title="创建你的第一个账号组" className="max-w-xl"><div className="flex flex-col gap-5"><ol aria-label="创作上手步骤" className="flex flex-wrap gap-4 text-sm"><li className="font-medium text-brand">1 创建账号组</li><li className="text-muted-foreground">2 开始定位，无需抖音登录</li></ol><p className="text-sm text-muted-foreground">先为你的创作建立一个工作区，再聊经历、优势和目标，生成内容定位。平台账号可按需要稍后绑定。</p>{newGroupForm}</div></SectionCard>:<div data-slot="studio-account-layout" className="grid min-w-0 gap-section-gap lg:grid-cols-[16rem_minmax(0,1fr)]">
   <aside className="min-w-0"><SectionCard title="账号组"><div className="flex flex-col gap-4"><label className="flex gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={event=>setShowArchived(event.target.checked)}/>显示已归档组</label><ul className="flex flex-col gap-1">{groups.filter(group=>showArchived||group.status==="active").map(group=><li key={group.id}><button type="button" disabled={busy} aria-pressed={group.id===selectedId} onClick={()=>choose(group)} className={`w-full rounded-control px-3 py-3 text-left ${group.id===selectedId?"bg-brand-soft text-brand":"hover:bg-surface-subtle"}`}><span className="block break-words text-sm font-medium">{group.name}</span><span className="mt-1 block text-xs text-muted-foreground">{group.status==="archived"?"已归档":`${group.members.filter(member=>member.leftAt===null).length} 个平台账号`}{currentId===group.id?" · 当前工作区":""}</span></button></li>)}</ul><div className="border-t border-border pt-4">{newGroupForm}</div></div></SectionCard></aside>
   {selected?<SectionCard title={selected.name} action={<div className="flex items-center gap-2">{editable&&currentId!==selected.id&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>enter(selected.id)}>进入此账号组</Button>}<DropdownMenu><DropdownMenuTrigger asChild><Button ref={element=>{if(element)managementTriggers.current.set(`group:${selected.id}`,element);}} aria-label={`管理${selected.name}`} title="账号组管理" variant="ghost" size="icon" disabled={busy}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!editable} onSelect={()=>{setName(selected.name);setError(null);setRenameOpen(true);}}>重命名</DropdownMenuItem><DropdownMenuItem onSelect={()=>void toggleArchive()}>{editable?"归档账号组":"恢复账号组"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>}><div className="flex min-w-0 flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">{editable?currentId===selected.id?"当前工作区":"进入此账号组后即可定位和创作，无需先绑定平台":"已归档 · 历史资料仍保留"}</span>{editable&&selected.id===currentId&&<Link href="/projects" className="text-brand">继续创作 →</Link>}</div>
    {editable&&selected.id===currentId&&<div className="flex flex-wrap items-center gap-3"><Button asChild disabled={busy}><Link href="/positioning" aria-disabled={busy} onClick={event=>{if(busy)event.preventDefault();}}>开始定位（无需抖音登录）</Link></Button><p className="text-sm text-muted-foreground">先聊经历、优势和创作目标，资料可以稍后补充。</p></div>}
    <section aria-labelledby="platform-capability-title" className="flex min-w-0 flex-col gap-3">
     <h2 id="platform-capability-title" className="text-base font-semibold">平台能力</h2>
     {capLoading&&<p role="status" className="text-sm text-muted-foreground">正在读取平台能力…</p>}
     {capError&&<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive"><span>{capError}</span><Button variant="outline" size="sm" disabled={capLoading} onClick={()=>void loadCapabilities()}>重试读取</Button></div>}
     {!capLoading&&!capError&&(visiblePlatforms.length?<div className="max-w-full overflow-x-auto"><table aria-label="各平台能力" className="w-full text-left text-sm"><thead><tr><th scope="col" className="px-2 py-2 font-medium">平台</th>{visibleCapabilityKinds.map(kind=><th scope="col" key={kind.id} className="px-2 py-2 font-medium">{kind.name}</th>)}</tr></thead><tbody>{visiblePlatforms.map(platform=>{const row=capabilityFor(platform.id)!;return <tr key={platform.id} className="border-t border-border"><th scope="row" className="px-2 py-3 align-top font-medium">{platform.name}</th>{visibleCapabilityKinds.map(kind=><td key={kind.id} className="px-2 py-3 align-top">{capabilityAvailable(platform.id,kind.id)?kind.id==="bind"?<Button aria-label={`扫码绑定${platform.name}账号`} className="justify-start text-foreground enabled:border-foreground/25 enabled:hover:border-foreground/40 enabled:hover:bg-muted disabled:text-muted-foreground" variant="outline" disabled={busy||!editable||selected.id!==currentId} onClick={event=>{bindingReturnFocus.current=event.currentTarget;setBindingIntent(crypto.randomUUID());setBindingPlatform(platform.id);}}>扫码绑定</Button>:<><span className="text-success">可用</span><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{row[kind.id].reason}</p></>:null}</td>)}</tr>;})}</tbody></table></div>:<p className="text-sm text-muted-foreground">当前没有可用的平台能力。</p>)}
     {editable&&selected.id!==currentId&&<p className="text-sm text-muted-foreground">先进入此账号组，再扫码绑定。</p>}
    </section>
    <section aria-label="组内平台账号" className="border-t border-border pt-4"><h2 className="mb-2 text-base font-semibold">组内平台账号 <span className="font-normal text-muted-foreground">{members.length}</span></h2><ul className="divide-y divide-border" data-testid="account-list">{!members.length&&<li data-testid="account-empty-state" className="py-3 text-sm text-muted-foreground">这个账号组还没有平台账号，可以直接定位和创作；需要同步平台作品时再绑定。</li>}{members.map(member=>{const account=accounts.find(row=>row.id===member.accountId),accountHidden=member.status==="archived"||account?.status==="archived",onlyAccount=accounts.filter(row=>row.status==="active").length===1;return <li key={member.id} data-testid="group-member-row" className="flex min-w-0 items-center justify-between gap-3 py-4"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{member.accountHandle}</p><p className="mt-1 text-xs text-muted-foreground">{platformName(member.platform)} · {accountHidden?"已隐藏":account?.externalAccountId?"已绑定":"身份未验证 · 未自动采集"}</p></div></div><div className="flex shrink-0 items-center gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button ref={element=>{if(element)managementTriggers.current.set(member.id,element);}} variant="ghost" size="icon" disabled={busy} aria-label={`管理${member.accountHandle}`}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!editable} onSelect={()=>{const trigger=managementTriggers.current.get(member.id);if(trigger)openTransfer(member,trigger);}}>转组</DropdownMenuItem>{accountHidden?<DropdownMenuItem disabled={!editable} onSelect={()=>void mutate(()=>client.updateAccount({params:{accountId:member.accountId},query:undefined,body:{status:"active"}}),"账号已恢复。")}>恢复平台账号</DropdownMenuItem>:<DropdownMenuItem disabled={!editable||!account||onlyAccount} onSelect={()=>{if(account)setVisibilityAccount(account);}}>隐藏{onlyAccount?"（至少保留一个账号）":""}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div></li>;})}</ul></section>

   </div></SectionCard>:null}
  </div>}
  <Dialog open={renameOpen&&Boolean(selected)} onOpenChange={open=>{if(!busy)setRenameOpen(open);}}><DialogContent onCloseAutoFocus={event=>{const trigger=selected?managementTriggers.current.get(`group:${selected.id}`):undefined;if(trigger?.isConnected){event.preventDefault();trigger.focus();}}}><DialogHeader><DialogTitle>重命名账号组</DialogTitle><DialogDescription>修改账号组名称，现有资料和平台账号保留。</DialogDescription></DialogHeader><label htmlFor="group-name" className="text-sm">账号组名称</label><Input id="group-name" value={name} disabled={busy} onChange={event=>setName(event.target.value)} maxLength={120}/>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setRenameOpen(false)}>取消</Button><Button disabled={busy||!editable||!name.trim()||name.trim()===selected?.name} onClick={()=>void rename()}>保存名称</Button></DialogFooter></DialogContent></Dialog>
  {visibilityAccount&&<AccountVisibilityDialog account={visibilityAccount} open onCloseAutoFocus={event=>{const member=members.find(row=>row.accountId===visibilityAccount.id),trigger=member?managementTriggers.current.get(member.id):undefined;if(trigger?.isConnected&&selected?.id===readCurrentGroupId()){event.preventDefault();trigger.focus();}}} onOpenChange={open=>{if(!open)setVisibilityAccount(null);}}/>}
  <Dialog open={bindingPlatform!==null&&selected?.id===currentId} onOpenChange={open=>{if(!open)setBindingPlatform(null);}}><DialogContent onCloseAutoFocus={event=>{const trigger=bindingReturnFocus.current;if(trigger?.isConnected){event.preventDefault();trigger.focus();}}}><DialogHeader><DialogTitle>{bindingPlatform?`扫码绑定${platformName(bindingPlatform)}账号`:"扫码绑定"}</DialogTitle><DialogDescription>扫描打开的平台二维码，登录后自动保存绑定结果。</DialogDescription></DialogHeader>{selected&&bindingPlatform?<AccountBindingPanel key={`${selected.id}:${bindingPlatform}`} platform={bindingPlatform} group={selected} startIntent={bindingIntent??undefined} onCompleted={result=>{if(!alive.current||readCurrentGroupId()!==result.groupId||selection.current!==result.groupId)return;setBindingPlatform(null);setBindingIntent(null);setMessage(`已绑定${result.accountHandle}，可继续添加账号。`);}} canStart={capabilityFor(bindingPlatform)?.bind.available===true&&capabilityFor(bindingPlatform)?.bind.method==="qr"} disabled={savingBusy} onBusyChange={setBindingBusy} onChanged={async(result:BindingCompletion)=>{const fresh=await reload();if(!alive.current||readCurrentGroupId()!==selected.id)return;if(!fresh||"error" in fresh)throw Error(fresh&&"error" in fresh?fresh.error:"账号组列表尚未读取，请重新核对原结果。");const target=fresh.groups.find(row=>row.id===result.groupId),account=fresh.accounts.find(row=>row.id===result.accountId);if(!target||target.status!=="active"||!target.members.some(row=>row.accountId===result.accountId&&row.platform===result.platform&&row.status==="active"&&row.leftAt===null)||!account||account.platform!==result.platform)throw Error("绑定账号列表尚未核对，请重新读取原结果。");notifyAccountsChanged({source:"account-management",routeRefreshScheduled:true});router.refresh();}}/>:null}</DialogContent></Dialog>
  <Dialog open={transferMember!==null} onOpenChange={open=>{if(!open&&!busy){setTransferMember(null);setPreview(null);}}}><DialogContent onCloseAutoFocus={event=>{const trigger=transferReturnFocus.current;transferReturnFocus.current=null;if(alive.current&&trigger?.element.isConnected&&trigger.selectedGroupId===selection.current&&trigger.workspaceGroupId===readCurrentGroupId()){event.preventDefault();trigger.element.focus();}}}><DialogHeader><DialogTitle>转移平台账号</DialogTitle><DialogDescription>{transferMember?.accountHandle} · 先检查影响，再确认转组。</DialogDescription></DialogHeader><label className="text-sm">目标账号组<select className={controlClass} aria-label="目标账号组" value={targetId} disabled={busy} onChange={event=>{setTargetId(event.target.value);setPreview(null);}}><option value="">请选择</option>{groups.filter(group=>group.status==="active"&&group.id!==selectedId).map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   {preview&&<div className="rounded-control border border-border bg-surface-subtle p-3 text-sm"><p>历史作品和数据仍在原组；转组后的新事实进入目标组。</p><p className="mt-2">进行中的任务：{preview.activeTaskCount}</p>{preview.impact&&<ul aria-label="转组影响清单" className="mt-2 space-y-1"><li>历史发布作品：{preview.impact.historyPublicationCount}</li><li>待发布目标：{preview.impact.pendingPublicationTargetCount}</li><li>共享项目：{preview.impact.sharedProjectCount}</li><li>定位版本：{preview.impact.positioningCount}</li><li>素材引用：{preview.impact.assetReferenceCount}</li></ul>}<p className="mt-2">定位、稿件和素材仍留在原组。</p>{preview.activeTaskCount>0&&<p className="mt-1 text-destructive">请先等待该账号任务结束。其它账号和任务可以继续使用。</p>}</div>}
   <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>{setTransferMember(null);setPreview(null);}}>取消</Button>{preview?<Button disabled={busy||preview.activeTaskCount>0} onClick={()=>void transfer()}>确认转组</Button>:<Button disabled={busy||!targetId} onClick={()=>void readPreview()}>查看转组影响</Button>}</DialogFooter>
  </DialogContent></Dialog>
 </main>;
}
