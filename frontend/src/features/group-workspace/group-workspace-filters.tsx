"use client";
import * as React from "react";
import {usePathname,useRouter,useSearchParams} from "next/navigation";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {ReportDateRange} from "@/features/daily-report/report-date-range";
import {workspaceFilterHref,WORKSPACE_PLATFORMS,platformName,type GroupWorkspace} from "./workspace-query";
export function GroupWorkspaceFilters({workspace,showDate=true}:{workspace:GroupWorkspace;showDate?:boolean}){
 const router=useRouter(),path=usePathname(),search=useSearchParams(),[pending,startTransition]=React.useTransition();
 const accounts=workspace.accounts.filter(a=>!workspace.platform||a.platform===workspace.platform);
 function change(fields:Parameters<typeof workspaceFilterHref>[2]){const href=workspaceFilterHref(path,new URLSearchParams(search.toString()),fields);startTransition(()=>router.push(href,{scroll:false}));}
 return <section aria-label="账号组数据筛选" className="flex min-w-0 flex-col gap-4 rounded-panel border border-border bg-surface p-4">
  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">当前账号组{workspace.status==="archived"?" · 已归档":""}</p><p className="break-words text-sm font-semibold">{workspace.groupName}</p></div><p className="text-xs text-muted-foreground">{workspace.coverage}</p></div>
  <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="平台筛选">{[{id:null,label:"全部平台"},...WORKSPACE_PLATFORMS].map(p=><button key={p.id??"all"} type="button" disabled={pending} aria-pressed={workspace.platform===p.id} onClick={()=>change({platform:p.id})} className={`rounded-control px-3 py-2 text-sm transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${workspace.platform===p.id?"bg-brand-soft font-medium text-brand":"text-muted-foreground"}`}>{p.label}</button>)}</div>
  <div className="flex min-w-0 flex-wrap items-center gap-4"><div className="flex min-w-0 items-center gap-2"><label htmlFor={`workspace-account-${workspace.groupId}`} className="shrink-0 text-sm text-muted-foreground">平台账号</label><Select value={workspace.accountId??"all"} disabled={pending} onValueChange={value=>change({accountId:value==="all"?null:value})}><SelectTrigger id={`workspace-account-${workspace.groupId}`} aria-label="平台账号" className="w-60 max-w-full"><SelectValue placeholder="全部账号"/></SelectTrigger><SelectContent><SelectItem value="all">全部账号</SelectItem>{accounts.map(a=><SelectItem key={a.id} value={a.id}>{platformName(a.platform)} · {a.name}{a.historical?" · 历史归属":a.archived?" · 已归档":""}</SelectItem>)}</SelectContent></Select></div>{showDate&&<ReportDateRange value={{startDate:workspace.startDate,endDate:workspace.endDate}} disabled={pending} onChange={change}/>}</div>
  <p className="text-xs leading-relaxed text-muted-foreground">所选期间发布作品，截至各次采集的累计表现；播放与阅读分别统计。{pending?<span role="status"> 正在读取所选数据…</span>:null}</p>
 </section>;
}
