"use client";
import {workspaceErrorCopy} from "./workspace-error-copy";
import * as React from "react";
import {BookOpen,FileImage,ArrowRight} from "lucide-react";
import type {AccountGroupResource} from "@creatoros/contract";
import {ENDPOINTS,createClient} from "@creatoros/contract";
import {readCurrentGroupId,createHttpTransport} from "@/lib/http-transport";
import {beginForegroundActivity} from "@/lib/foreground-activity";
import {Button} from "@/components/ui/button";
import {SectionCard} from "@/components/project/section-card";
type DeletePreview=typeof ENDPOINTS.previewAssetDelete.response["_output"];
type GroupResourceGrantResource=typeof ENDPOINTS.listGroupResourceGrants.response["_output"];
type GroupResourceRevokePreview=typeof ENDPOINTS.previewGroupResourceGrantRevoke.response["_output"];
const consumerName:Record<string,string>={material_links:"项目资料",segment_assets:"制作片段素材",export_records:"导出成片",content_outputs:"内容版本",publication_revisions:"发布封面",knowledge_items:"知识引用",ai_messages:"对话附件",ai_tasks:"创作任务"};
export function ResourceGrantsPanel({group,onChanged,onBusyChange,disabled=false}:{group:AccountGroupResource;onChanged?:()=>void|Promise<void>;onBusyChange?:(busy:boolean)=>void;disabled?:boolean}){
 const api=React.useMemo(()=>createClient(ENDPOINTS,createHttpTransport("/api/v1",{groupId:group.id,accountId:null})),[group.id]);
 const [grantLimit,setGrantLimit]=React.useState(10),[consumerLimit,setConsumerLimit]=React.useState(8);
 const [rows,setRows]=React.useState<GroupResourceGrantResource[]>([]),[plan,setPlan]=React.useState<GroupResourceRevokePreview|null>(null),[deletion,setDeletion]=React.useState<DeletePreview|null>(null),[showRevoked,setShowRevoked]=React.useState(false),[loading,setLoading]=React.useState(true),[busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null),[message,setMessage]=React.useState<string|null>(null),[stale,setStale]=React.useState(false);
 const alive=React.useRef(false),epoch=React.useRef(0),writeEpoch=React.useRef(0),busyChange=React.useRef(onBusyChange),working=React.useRef(false),reading=React.useRef<{epoch:number;promise:Promise<void>}|null>(null),release=React.useRef<(()=>void)|null>(null);
 React.useEffect(()=>{busyChange.current=onBusyChange;},[onBusyChange]);
 const current=React.useCallback(()=>readCurrentGroupId()===group.id,[group.id]);
 const check=React.useCallback(()=>{if(!alive.current||!current()||(working.current&&writeEpoch.current!==epoch.current))throw Error("请先进入此账号组，再查看共享资源。");},[current]);
 const load=React.useCallback(():Promise<void>=>{
  const ticket=epoch.current,pending=reading.current;
  if(pending){
   if(pending.epoch===ticket)return pending.promise;
   // 等原请求完全收尾；等待者保留自己的轮次，不替过期调用重新盖章。
   return pending.promise.then(()=>{if(!alive.current||ticket!==epoch.current)return;return load();});
  }
  const request={epoch:ticket,promise:Promise.resolve()};
  request.promise=Promise.resolve().then(async()=>{
   if(!alive.current||ticket!==epoch.current)return;
   try{
    check();setLoading(true);
    const result=await api.listGroupResourceGrants({params:undefined,query:undefined,body:undefined});
    check();if(ticket!==epoch.current)return;
    if(!Array.isArray(result))throw Error("共享授权列表读取失败，请重试。");
    setRows(result);setError(null);
   }catch(e){if(alive.current&&ticket===epoch.current)setError(workspaceErrorCopy(e,"共享授权读取失败。"));}
   finally{if(alive.current&&ticket===epoch.current)setLoading(false);}
  }).finally(()=>{if(reading.current===request)reading.current=null;});
  reading.current=request;return request.promise;
 },[check,api]);
 React.useEffect(()=>{
  alive.current=true;setRows([]);setPlan(null);setDeletion(null);setMessage(null);setError(null);setStale(false);setLoading(true);void load();
  const expire=()=>{epoch.current++;};
  const scopeChanged=()=>{if(current())return;expire();setRows([]);setPlan(null);setDeletion(null);setMessage(null);setError("账号组已切换，请在当前账号组重新查看共享资源。");setLoading(false);};
  window.addEventListener("creatoros:accounts-changed",scopeChanged);
  return()=>{alive.current=false;expire();window.removeEventListener("creatoros:accounts-changed",scopeChanged);release.current?.();release.current=null;busyChange.current?.(false);};
 },[current,load]);
 async function action(run:()=>Promise<void>){if(working.current||disabled)return;working.current=true;const ticket=epoch.current;writeEpoch.current=ticket;setBusy(true);setError(null);release.current=beginForegroundActivity("共享资源管理");onBusyChange?.(true);try{check();await run();}catch(e){if(alive.current&&ticket===epoch.current){setError(workspaceErrorCopy(e,"操作未完成，请重试。"));setStale(true);}}finally{working.current=false;release.current?.();release.current=null;if(alive.current&&ticket===epoch.current){setBusy(false);onBusyChange?.(false);}}}
 async function preview(id:string){await action(async()=>{const result=await api.previewGroupResourceGrantRevoke({params:{grantId:id},query:undefined,body:undefined});check();setPlan(result);setConsumerLimit(8);setDeletion(null);setMessage(null);setStale(false);});}
 async function revoke(){if(!plan||stale)return;const chosen=plan;await action(async()=>{await api.revokeGroupResourceGrant({params:{grantId:chosen.id},query:undefined,body:{digest:chosen.digest,expectedOriginVersion:chosen.originVersion,expectedTargetVersion:chosen.targetVersion}});check();const verified=await api.previewGroupResourceGrantRevoke({params:{grantId:chosen.id},query:undefined,body:undefined});check();if(!verified.revokedAt)throw Error("撤销状态尚未核对，请重新读取影响。");setPlan(verified);setRows(old=>old.map(row=>row.id===verified.id?verified:row));setMessage("授权已撤销，使用记录保留。");setStale(false);await load();check();await onChanged?.();});}
 const locked=disabled||busy||loading,visible=rows.filter(row=>showRevoked||!row.revokedAt);
 return <SectionCard title="共享资源" description="资料保留在原组，目标组通过授权继续引用。">
  <div className="flex min-w-0 flex-col gap-4">
   <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showRevoked} disabled={busy} onChange={event=>setShowRevoked(event.target.checked)}/>显示已撤销授权</label><Button variant="outline" size="sm" disabled={locked} onClick={()=>void load()}>重新读取</Button></div>
   {loading&&<p role="status" className="text-sm text-muted-foreground">正在读取共享资源…</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm text-success">{message}</p>}
   {!loading&&!error&&!visible.length&&<p className="text-sm leading-relaxed text-muted-foreground">当前没有共享授权。整理历史资料时，需要的素材与知识会保留来源并授权给目标组。</p>}
   <ul className="space-y-3">{visible.slice(0,grantLimit).map(row=><li key={row.id} className="rounded-control border border-border p-3"><div className="flex min-w-0 items-start gap-3">{row.resourceType==="asset"?<FileImage aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground"/>:<BookOpen aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground"/>}<div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{row.resourceTitle}</p><p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground"><span className="break-words">{row.originGroupName}</span><ArrowRight aria-hidden className="size-3 shrink-0"/><span className="break-words">{row.targetGroupName}</span></p><p className="mt-1 text-sm text-muted-foreground">{row.revokedAt?"已撤销":row.originGroupId===group.id?"向目标组共享":"从原组获得引用权限"}</p></div><Button variant="outline" size="sm" disabled={locked} onClick={()=>void preview(row.id)}>查看影响</Button></div></li>)}</ul>{visible.length>grantLimit&&<Button variant="outline" size="sm" disabled={locked} onClick={()=>setGrantLimit(limit=>limit+20)}>显示更多共享授权（已显示{grantLimit} / {visible.length}）</Button>}
   {plan&&<section aria-label="共享授权影响" className="rounded-card border border-border bg-surface p-4"><h3 className="break-words text-base font-semibold">{plan.resourceTitle}</h3><p className="mt-2 break-words text-sm">原组：{plan.originGroupName} · 目标组：{plan.targetGroupName}</p><div className="mt-4"><h4 className="text-sm font-medium">资源使用情况</h4>{plan.consumers.length?<ul className="mt-2 space-y-2">{plan.consumers.slice(0,consumerLimit).map(row=><li key={`${row.consumerType}:${row.id}`} className="rounded-control border border-border p-3"><p className="break-words text-sm font-medium">{row.title}</p><p className="mt-1 text-sm text-muted-foreground">{consumerName[row.consumerType]??"资源引用"} · {row.groupName} · {row.current?"当前引用": "历史使用记录"}</p></li>)}</ul>:<p className="mt-2 text-sm text-muted-foreground">没有发现目标组的引用或历史使用记录。</p>}{plan.consumers.length>consumerLimit&&<Button className="mt-3" variant="outline" size="sm" disabled={locked} onClick={()=>setConsumerLimit(limit=>limit+20)}>显示更多使用记录（已显示{consumerLimit} / {plan.consumers.length}）</Button>}</div>
    {plan.reason&&<p className="mt-3 text-sm leading-relaxed text-muted-foreground">{plan.reason}</p>}{plan.originGroupId!==group.id&&<p className="mt-3 text-sm text-muted-foreground">此授权由原组管理；进入“{plan.originGroupName}”后可处理撤销。</p>}{stale&&<p className="mt-3 text-sm text-destructive">确认前请重新预览最新影响。</p>}
    <div className="mt-4 flex flex-wrap gap-3"><Button variant="outline" size="sm" disabled={locked} onClick={()=>void preview(plan.id)}>重新预览影响</Button>{plan.resourceType==="asset"&&plan.originGroupId===group.id&&<Button variant="outline" size="sm" disabled={locked} onClick={()=>void action(async()=>{const result=await api.previewAssetDelete({params:{assetId:plan.resourceId},query:undefined,body:undefined});check();setDeletion(result);})}>查看素材删除影响</Button>}{plan.originGroupId===group.id&&group.status==="active"&&!plan.revokedAt&&<Button variant="destructive" size="sm" disabled={locked||stale||!plan.canRevoke} onClick={()=>void revoke()}>确认撤销授权</Button>}</div>
   </section>}
   {deletion&&<section aria-label="素材删除影响" className="rounded-card border border-border p-4"><h3 className="text-sm font-semibold">{deletion.resourceTitle} · 删除影响</h3><p className="mt-2 text-sm">{deletion.reason??"没有有效共享授权，素材可移入回收站。"}</p><p className="mt-2 text-sm text-muted-foreground">{deletion.grants.length} 条共享授权 · {deletion.consumerCount} 条当前引用</p>{deletion.consumers.length>0&&<ul className="mt-3 space-y-2 text-sm">{deletion.consumers.map(row=><li key={`${row.consumerType}:${row.id}`} className="break-words">{row.title} · {row.groupName}</li>)}</ul>}</section>}
  </div>
 </SectionCard>;
}
