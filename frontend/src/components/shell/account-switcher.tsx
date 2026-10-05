"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus, Check, Layers } from "lucide-react";
import { client } from "@/lib/contract-client";
import { readCurrentAccountId, readCurrentGroupId, writeCurrentGroupId } from "@/lib/http-transport";
import { useAccountsChanged } from "@/lib/account-events";
import { hasForegroundActivity, listForegroundActivities } from "@/lib/foreground-activity";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resolveCurrentGroup, type SwitcherGroup } from "./account-switcher-logic";
type LoadState = {kind:"loading"}|{kind:"ready";groups:readonly SwitcherGroup[]}|{kind:"error"};

/** 保留原侧栏底部位置；组选中是工作区，平台账号只作具体操作目标。 */
export function AccountSwitcher({collapsed}:{collapsed:boolean}) {
  const router=useRouter(), routerRef=React.useRef(router);
  // eslint-disable-next-line react-hooks/refs -- 最新router只供异步事件消费，不参与视图
  routerRef.current=router;
  const alive=React.useRef(false), epoch=React.useRef(0), inFlight=React.useRef(false), reload=React.useRef(false), frame=React.useRef<number|null>(null);
  const [state,setState]=React.useState<LoadState>({kind:"loading"}),[currentId,setCurrentId]=React.useState<string|null>(null);
  const [pendingSwitch,setPendingSwitch]=React.useState<{id:string;activities:readonly string[]}|null>(null);
  const load=React.useCallback(()=>{
    epoch.current++;
    if(inFlight.current){reload.current=true;return;}
    inFlight.current=true;
    void(async()=>{
      do {
        reload.current=false;
        const version=epoch.current;
        try {
          const groups=(await client.listAccountGroups({params:undefined,query:{page:1,pageSize:100},body:undefined})) as unknown as SwitcherGroup[];
          if(!alive.current||version!==epoch.current)continue;
          const selected=resolveCurrentGroup(groups??[],readCurrentGroupId(),readCurrentAccountId());
          if(selected.shouldPersist){writeCurrentGroupId(selected.currentId,'account-switcher');routerRef.current.refresh();}
          setCurrentId(selected.currentId);setState({kind:"ready",groups:groups??[]});
        }catch{if(alive.current&&version===epoch.current)setState({kind:"error"});}
      }while(alive.current&&reload.current);
      inFlight.current=false;
    })();
  },[]);
  React.useEffect(()=>{
    alive.current=true;load();
    return()=>{alive.current=false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 请求世代不是DOM节点；卸载必须推进以拒绝旧响应
      epoch.current++;
      if(frame.current!==null)window.cancelAnimationFrame(frame.current);
    };
  },[load]);
  useAccountsChanged(detail=>{if(detail.source!=="account-switcher")load();});
  const performSwitch=React.useCallback((id:string)=>{
    epoch.current++;
    writeCurrentGroupId(id,'account-switcher');setCurrentId(id);
    if(frame.current!==null)window.cancelAnimationFrame(frame.current);
    frame.current=window.requestAnimationFrame(()=>{frame.current=null;if(alive.current)routerRef.current.refresh();});
  },[]);
  function select(id:string){if(id===currentId)return;if(hasForegroundActivity()){setPendingSwitch({id,activities:listForegroundActivities()});return;}performSwitch(id);}
  const groups=state.kind==="ready"?state.groups.filter(group=>group.status==="active"):[];
  const current=groups.find(group=>group.id===currentId);
  const label=current?.name??(state.kind==="loading"?"载入账号组…":"未选择账号组");
  const trigger=<button type="button" data-slot="account-switcher-trigger" data-testid="account-switcher-trigger" aria-label={`当前账号组：${label}`} title={label} className={cn("flex cursor-pointer items-center rounded-card border border-border bg-surface text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",collapsed?"size-9 justify-center":"w-full gap-2 px-2.5 py-2")}>
    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><Layers className="size-3.5"/></span>
    {!collapsed&&<><span className="flex min-w-0 flex-1 flex-col"><span className="text-xs text-text-subtle">当前账号组</span><span className="truncate text-sm font-medium">{label}</span></span><ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/></>}
  </button>;
  return <div data-slot="account-switcher" data-testid="account-switcher" data-state={state.kind} className={cn("flex flex-col gap-1",collapsed?"items-center":"w-full")}>
    <DropdownMenu>{collapsed?<Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>:<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>}
      <DropdownMenuContent align="start" side={collapsed?"right":"top"} className="w-64" data-testid="account-switcher-menu"><DropdownMenuLabel>切换账号组</DropdownMenuLabel>
        {!groups.length&&state.kind!=="error"&&<div data-testid="account-switcher-empty" className="px-2 py-2 text-sm text-muted-foreground">还没有账号组。先创建工作区，也可以稍后绑定账号。</div>}
        {groups.map(group=><DropdownMenuItem key={group.id} data-testid="account-switcher-item" data-group-id={group.id} data-selected={group.id===currentId?"true":"false"} onSelect={()=>select(group.id)} className="flex gap-2"><Layers className="size-4 shrink-0" aria-hidden="true"/><span className="min-w-0 flex-1 truncate" title={group.name}>{group.name}</span>{group.id===currentId&&<Check className="size-4 text-brand" aria-hidden="true"/>}</DropdownMenuItem>)}
        <DropdownMenuSeparator/><DropdownMenuItem asChild data-testid="account-switcher-bind"><Link href="/accounts"><Plus className="mr-2 size-4" aria-hidden="true"/>账号组与绑定账号</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {state.kind==="error"&&<div className="text-xs text-muted-foreground" data-testid="account-switcher-error"><span>账号组列表暂不可用</span><button className="ml-1 text-brand" onClick={load}>重试</button></div>}
    <Dialog open={pendingSwitch!==null} onOpenChange={open=>{if(!open)setPendingSwitch(null);}}><DialogContent data-testid="account-switch-confirm"><DialogHeader><DialogTitle>有进行中的操作，切组会离开当前页面</DialogTitle><DialogDescription>切换账号组会离开当前工作区。后台任务继续在创建时的账号组运行。</DialogDescription></DialogHeader>
      <ul className="list-disc pl-5 text-sm" data-testid="account-switch-confirm-activities">{pendingSwitch?.activities.map(activity=><li key={activity}>{activity}</li>)}</ul><DialogFooter><Button variant="outline" data-testid="account-switch-cancel" onClick={()=>setPendingSwitch(null)}>留在当前账号组</Button><Button data-testid="account-switch-confirm-action" onClick={()=>{const target=pendingSwitch;setPendingSwitch(null);if(target)performSwitch(target.id);}}>仍要切换</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
