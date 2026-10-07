"use client";
import {requestVideoLeave} from "@/features/reference-editors/project-video-session-registry";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus, Check, Layers } from "lucide-react";
import { ENDPOINTS, requestListWithMeta, type Transport } from "@creatoros/contract";
import { fetchCreatorApi, HttpTransportError } from "@/lib/http-transport";
import { readCreationScope, creationScopeKey, type CreationScope } from "@/lib/creation-workspace-scope";
import { useWorkspaceInitialization, isWorkspaceRecoveryPath } from "./workspace-initialization";
import { readCurrentAccountId, readCurrentGroupId, writeCurrentGroupId, CURRENT_GROUP_KEY, syncCurrentGroupCookie } from "@/lib/http-transport";
import { useAccountsChanged, notifyAccountsChanged } from "@/lib/account-events";
import { hasForegroundActivity, listForegroundActivities } from "@/lib/foreground-activity";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resolveCurrentGroup, type SwitcherGroup } from "./account-switcher-logic";
export const WORKSPACE_INITIALIZATION_TIMEOUT_MS = 120_000;

type LoadState = {kind:"loading"}|{kind:"ready";groups:readonly SwitcherGroup[]}|{kind:"error"};

/** 保留原侧栏底部位置；组选中是工作区，平台账号只作具体操作目标。 */
export function AccountSwitcher({collapsed}:{collapsed:boolean}) {
  const router=useRouter(), routerRef=React.useRef(router);
  // eslint-disable-next-line react-hooks/refs -- 最新router只供异步事件消费，不参与视图
  routerRef.current=router;
  const initialization=useWorkspaceInitialization(), initializationRef=React.useRef(initialization);
  // 最新context只供事件消费，避免状态更新重建load/重新读取列表。
  // eslint-disable-next-line react-hooks/refs -- 最新context只供异步事件消费，不参与视图
  initializationRef.current=initialization;
  const alive=React.useRef(false), epoch=React.useRef(0), inFlight=React.useRef(false), reload=React.useRef(false), frame=React.useRef<number|null>(null);
  const firstReady=React.useRef(false), refreshRequired=React.useRef(false), refreshFailed=React.useRef(false), controller=React.useRef<AbortController|null>(null);
  const [refreshPending,startRefresh]=React.useTransition();
  const refreshCompletion=React.useRef<{epoch:number;scope:CreationScope;timer:ReturnType<typeof setTimeout>;cancelWait:()=>void}|null>(null);
  const [state,setState]=React.useState<LoadState>({kind:"loading"}),[currentId,setCurrentId]=React.useState<string|null>(null);
  const [pendingSwitch,setPendingSwitch]=React.useState<{id:string;activities:readonly string[]}|null>(null);
  const cancelInitialRefresh=React.useCallback(()=>{
    const pending=refreshCompletion.current;
    if(pending){refreshCompletion.current=null;clearTimeout(pending.timer);pending.cancelWait();}
  },[]);
  const refreshInitialScope=React.useCallback((scope:CreationScope,version:number)=>{
    cancelInitialRefresh();refreshRequired.current=true;refreshFailed.current=false;
    initializationRef.current?.synchronizing();
    let cancelWait!:()=>void;
    const cancelled=new Promise<void>(resolve=>{cancelWait=resolve;});
    const waiting={epoch:version,scope,timer:setTimeout(()=>{
      if(refreshCompletion.current!==waiting||version!==epoch.current||!alive.current)return;
      cancelInitialRefresh();epoch.current++;refreshFailed.current=true;
      setState({kind:"error"});initializationRef.current?.fail("工作区页面打开超时，请重试。");
    },WORKSPACE_INITIALIZATION_TIMEOUT_MS),cancelWait};
    refreshCompletion.current=waiting;
    startRefresh(async()=>{
      try{
        // Next持有实际刷新生命周期；cancel仅释放旧世代等待，不取消RSC网络或队列。
        await Promise.race([Promise.resolve(routerRef.current.refresh()),cancelled]);
      }catch(error){
        if(refreshCompletion.current!==waiting||version!==epoch.current||!alive.current)return;
        cancelInitialRefresh();epoch.current++;refreshFailed.current=true;
        setState({kind:"error"});initializationRef.current?.fail(error instanceof Error?error.message:"工作区页面暂不可用，请重试。");
      }
    });
  },[cancelInitialRefresh]);
  const load=React.useCallback(()=>{
    epoch.current++;
    if(inFlight.current){reload.current=true;controller.current?.abort();return;}
    cancelInitialRefresh();
    inFlight.current=true;
    initializationRef.current?.begin();
    void(async()=>{
      do {
        reload.current=false;
        const version=epoch.current, abort=new AbortController();controller.current=abort;
        const timer=setTimeout(()=>abort.abort(new Error("工作区读取超时，请重试。")),WORKSPACE_INITIALIZATION_TIMEOUT_MS);
        try {
          const transport:Transport={async request(endpoint,input){
            const response=await fetchCreatorApi("/api/v1/dispatch",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",signal:abort.signal,body:JSON.stringify({id:endpoint.id,input})},{groupId:null,accountId:null});
            abort.signal.throwIfAborted();
            const envelope=await response.json();abort.signal.throwIfAborted();
            if(!response.ok){const error=envelope?.error;throw new HttpTransportError(typeof error?.message==="string"?error.message:typeof error==="string"?error:`请求未完成（${response.status}）`,{status:response.status,code:error?.code,details:error?.details});}
            return envelope;
          }};
          const groups:SwitcherGroup[]=[];let complete=false;
          for(let page=1;page<=20;page++){
            const result=await requestListWithMeta(transport,ENDPOINTS.listAccountGroups,{params:undefined,query:{page,pageSize:100},body:undefined});
            abort.signal.throwIfAborted();
            groups.push(...result.data);
            if(groups.length===result.meta.total){complete=true;break;}
            if(groups.length>result.meta.total||result.data.length===0)throw new Error("账号组列表未完整返回，请重试。");
          }
          if(!complete)throw new Error("账号组列表超过当前可读取的范围，请重试。");
          if(!alive.current||version!==epoch.current)continue;
          const selected=resolveCurrentGroup(groups,readCurrentGroupId(),readCurrentAccountId());
          const wasReady=firstReady.current||initializationRef.current?.isReady();
          // 已放行的工作台只更新菜单；重试/筛选不能自动换根或清掉脏稿。
          if(wasReady){setCurrentId(readCurrentGroupId());setState({kind:"ready",groups});continue;}
          if(selected.shouldPersist){
            if(selected.currentId===null&&initializationRef.current?.preservesInitialAccount(readCurrentAccountId())){
              // 清理失效组意图时保原真实旧账号，不能以初始化门删除合法入口。
              try{window.localStorage.removeItem(CURRENT_GROUP_KEY);}catch{/* 原storage不可用语义保持 */}
              syncCurrentGroupCookie(null);
              notifyAccountsChanged({source:"account-switcher",routeRefreshScheduled:true});
            }else writeCurrentGroupId(selected.currentId,'account-switcher');
          }
          setCurrentId(selected.currentId);setState({kind:"ready",groups});
          const scope=readCreationScope();
          if(selected.shouldPersist||refreshRequired.current){
            refreshInitialScope(scope,version);
          }else{firstReady.current=true;initializationRef.current?.complete(scope);}
        }catch(error){
          if(alive.current&&version===epoch.current){epoch.current++;setState({kind:"error"});initializationRef.current?.fail(error instanceof Error?error.message:"账号组列表暂不可用，请重试。");}
        }finally{clearTimeout(timer);if(controller.current===abort)controller.current=null;}
      }while(alive.current&&reload.current);
      inFlight.current=false;
    })();
  },[cancelInitialRefresh,refreshInitialScope]);
  const retry=React.useCallback(()=>{
    const pathname=window.location.pathname;
    const recovery=isWorkspaceRecoveryPath(pathname);
    if(refreshFailed.current&&!firstReady.current&&!initializationRef.current?.isReady()&&!recovery&&!hasForegroundActivity()){
      // 创作尚未开放，真实重载绕过挂起的Next refresh队列；已放行/恢复页仍保原任务。
      epoch.current++;controller.current?.abort();cancelInitialRefresh();
      if(frame.current!==null){window.cancelAnimationFrame(frame.current);frame.current=null;}
      window.location.reload();return;
    }
    load();
  },[load,cancelInitialRefresh]);
  React.useEffect(()=>{
    if(refreshPending)return;
    const pending=refreshCompletion.current;
    if(!pending||!alive.current||pending.epoch!==epoch.current)return;
    if(creationScopeKey(pending.scope)!==creationScopeKey(readCreationScope()))return;
    cancelInitialRefresh();refreshRequired.current=false;refreshFailed.current=false;
    firstReady.current=true;initializationRef.current?.complete(pending.scope);
  },[refreshPending,state,cancelInitialRefresh]);
  React.useEffect(()=>{
    alive.current=true;load();
    const unregister=initializationRef.current?.registerRetry(retry);
    return()=>{alive.current=false;unregister?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 请求世代不是DOM节点；卸载必须推进以拒绝旧响应
      epoch.current++;controller.current?.abort();
      cancelInitialRefresh();
      if(frame.current!==null)window.cancelAnimationFrame(frame.current);
    };
  },[load,retry,cancelInitialRefresh]);
  useAccountsChanged(detail=>{if(detail.source!=="account-switcher")load();});
  const performSwitch=React.useCallback(async(id:string)=>{
    if(!(await requestVideoLeave({scopeKey:`group:${id}`}))||!alive.current)return;
    const version=++epoch.current;
    const wasReady=firstReady.current||initializationRef.current?.isReady();
    if(!wasReady){cancelInitialRefresh();controller.current?.abort();}
    writeCurrentGroupId(id,'account-switcher');setCurrentId(id);
    if(frame.current!==null)window.cancelAnimationFrame(frame.current);
    frame.current=window.requestAnimationFrame(()=>{
      frame.current=null;if(!alive.current)return;
      if(wasReady)routerRef.current.refresh();
      else if(version===epoch.current)refreshInitialScope(readCreationScope(),version);
    });
  },[cancelInitialRefresh,refreshInitialScope]);
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
    {state.kind==="error"&&<div className="text-xs text-muted-foreground" data-testid="account-switcher-error"><span>账号组列表暂不可用</span><button className="ml-1 text-brand" onClick={retry}>重试</button></div>}
    <Dialog open={pendingSwitch!==null} onOpenChange={open=>{if(!open)setPendingSwitch(null);}}><DialogContent data-testid="account-switch-confirm"><DialogHeader><DialogTitle>有进行中的操作，切组会离开当前页面</DialogTitle><DialogDescription>切换账号组会离开当前工作区。后台任务继续在创建时的账号组运行。</DialogDescription></DialogHeader>
      <ul className="list-disc pl-5 text-sm" data-testid="account-switch-confirm-activities">{pendingSwitch?.activities.map(activity=><li key={activity}>{activity}</li>)}</ul><DialogFooter><Button variant="outline" data-testid="account-switch-cancel" onClick={()=>setPendingSwitch(null)}>留在当前账号组</Button><Button data-testid="account-switch-confirm-action" onClick={()=>{const target=pendingSwitch;setPendingSwitch(null);if(target)performSwitch(target.id);}}>仍要切换</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
