"use client";
import {normalizeWorkspacePlatform} from "./platform-metrics";
import {usePathname} from "next/navigation";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {ReportDateRange} from "@/features/daily-report/report-date-range";
import {WORKSPACE_PLATFORMS,platformName,type GroupWorkspace} from "./workspace-query";
import {useWorkspaceFilterNavigation} from "./use-workspace-filter-navigation";
export function GroupWorkspaceFilters({workspace,showDate=true}:{workspace:GroupWorkspace;showDate?:boolean}){
 const path=usePathname();
 // 路由/账号组换根时丢弃该根的读取意图，不能向另一个组重放旧筛选。
 return <GroupWorkspaceFilterControls key={`${workspace.groupId}:${path}`} workspace={workspace} showDate={showDate}/>;
}
function GroupWorkspaceFilterControls({workspace,showDate}:{workspace:GroupWorkspace;showDate:boolean}){
 const {change,retry,read,invalid}=useWorkspaceFilterNavigation(workspace);
 const selected=read?.scope??workspace;
 const accounts=workspace.accounts.filter(a=>!selected.platform||normalizeWorkspacePlatform(a.platform)===normalizeWorkspacePlatform(selected.platform));
 const scopeName=(scope:Pick<GroupWorkspace,"platform"|"accountId"|"startDate"|"endDate">)=>`${scope.platform?platformName(scope.platform):"全部平台"}${scope.accountId?` · ${workspace.accounts.find(a=>a.id===scope.accountId)?.name??"所选账号"}`:" · 全部账号"} · ${scope.startDate} — ${scope.endDate}`;
 return <section aria-label="账号组数据筛选" className="flex min-w-0 flex-col gap-4 rounded-panel border border-border bg-surface p-4">
  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">当前账号组{workspace.status==="archived"?" · 已归档":""}</p><p className="break-words text-sm font-semibold">{workspace.groupName}</p></div><p className="text-xs text-muted-foreground">{workspace.coverage}</p></div>
  <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="平台筛选">{[{id:null,label:"全部平台"},...WORKSPACE_PLATFORMS].map(p=><button key={p.id??"all"} type="button" aria-pressed={(selected.platform?normalizeWorkspacePlatform(selected.platform):null)===p.id} onClick={()=>change({platform:p.id})} className={`rounded-control px-3 py-2 text-sm transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${(selected.platform?normalizeWorkspacePlatform(selected.platform):null)===p.id?"bg-brand-soft font-medium text-brand":"text-muted-foreground"}`}>{p.label}</button>)}</div>
  <div className="flex min-w-0 flex-wrap items-center gap-4"><div className="flex min-w-0 items-center gap-2"><label htmlFor={`workspace-account-${workspace.groupId}`} className="shrink-0 text-sm text-muted-foreground">平台账号</label><Select value={selected.accountId??"all"} onValueChange={value=>change({accountId:value==="all"?null:value})}><SelectTrigger id={`workspace-account-${workspace.groupId}`} aria-label="平台账号" className="w-60 max-w-full"><SelectValue placeholder="全部账号"/></SelectTrigger><SelectContent><SelectItem value="all">全部账号</SelectItem>{accounts.map(a=><SelectItem key={a.id} value={a.id}>{platformName(a.platform)} · {a.name}{a.historical?" · 历史归属":a.archived?" · 已归档":""}</SelectItem>)}</SelectContent></Select></div>{showDate&&<ReportDateRange value={{startDate:selected.startDate,endDate:selected.endDate}} onChange={change}/>}</div>
  {invalid?<p role="status" className="text-xs text-muted-foreground">账号组已切换，请等待当前账号组的数据。</p>:read?<div role={read.phase==="error"?"alert":"status"} className="flex flex-col items-start gap-2 text-xs text-muted-foreground"><p>{read.phase==="error"?"所选数据暂时无法读取，请重试。":read.phase==="slow"?"读取较慢，仍保留已显示的数据。可继续筛选或重试。":"正在读取所选数据…"}</p><p>当前仍显示：{scopeName(workspace)}</p><p>正在读取：{scopeName(read.scope)}</p>{read.phase!=="reading"&&<button type="button" onClick={retry} className="rounded-control border border-border px-3 py-2 text-sm text-brand hover:bg-brand-soft">重试读取所选数据</button>}</div>:null}
 </section>;
}
