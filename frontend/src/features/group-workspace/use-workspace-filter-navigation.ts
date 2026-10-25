"use client";
import * as React from "react";
import {usePathname,useRouter,useSearchParams} from "next/navigation";
import {useAccountsChanged} from "@/lib/account-events";
import {readCurrentGroupId} from "@/lib/http-transport";
import {workspaceFilterHref,workspaceQueryFromSearch,type GroupWorkspace} from "./workspace-query";

type Scope=Pick<GroupWorkspace,"groupId"|"platform"|"accountId"|"startDate"|"endDate">&{path:string};
type Read={ticket:number;href:string;scope:Scope;phase:"reading"|"slow"|"error"};
// 只改变读取反馈，不终止请求，也不把旧数据当作新结果。
const SLOW_FILTER_FEEDBACK_MS=2000;
// SEMANTIC_BOUNDARY_ALLOW: 只比较完整请求范围，不选择账号、内容或推断指标。
const scopeKey=(scope:Scope)=>JSON.stringify([scope.groupId,scope.path,scope.platform,scope.accountId,scope.startDate,scope.endDate]);

/** 路由过渡可以先提交骨架；只有匹配的新workspace才能确认筛选完成。 */
export function useWorkspaceFilterNavigation(workspace:GroupWorkspace){
 const router=useRouter(),path=usePathname(),search=useSearchParams();
 const [pending,startTransition]=React.useTransition();
 const [read,setRead]=React.useState<Read|null>(null),[committedTicket,setCommittedTicket]=React.useState(0),[invalidGroup,setInvalidGroup]=React.useState<string|null>(null);
 const sequence=React.useRef(0),latest=React.useRef<Read|null>(null);
 const feedbackTimer=React.useRef<number|null>(null);
 const displayedScope=scopeKey({...workspace,path});
 const disposeFeedback=React.useCallback(()=>{if(feedbackTimer.current!==null){window.clearTimeout(feedbackTimer.current);feedbackTimer.current=null;}},[]);
 const clear=React.useCallback(()=>{disposeFeedback();latest.current=null;setRead(null);},[disposeFeedback]);
 const invalid=invalidGroup===workspace.groupId;
 useAccountsChanged(React.useCallback(detail=>{
  const group=detail.groupId===undefined?readCurrentGroupId():detail.groupId;
  if((detail.groupId!==undefined||group!==null)&&group!==workspace.groupId){clear();setInvalidGroup(workspace.groupId);}
 },[workspace.groupId,clear]));
 React.useEffect(()=>()=>{disposeFeedback();latest.current=null;},[disposeFeedback]);
 React.useEffect(()=>{
  const target=latest.current;
  if(target&&target.phase!=="error"&&!pending&&committedTicket===target.ticket&&scopeKey(target.scope)===displayedScope)clear();
 },[displayedScope,pending,committedTicket,clear]);
 function begin(href:string,scope:Scope,refresh=false){
  if(invalid)return;
  disposeFeedback();
  const target:Read={ticket:++sequence.current,href,scope,phase:"reading"};
  latest.current=target;setRead(target);
  // 从本轮操作开始登记，包含push/refresh的同步开销，不等React effect提交后才计时。
  feedbackTimer.current=window.setTimeout(()=>{
   const current=latest.current;
   if(current?.ticket!==target.ticket)return;
   feedbackTimer.current=null;
   if(current.phase==="reading"){const slow={...current,phase:"slow" as const};latest.current=slow;setRead(slow);}
  },SLOW_FILTER_FEEDBACK_MS);
  startTransition(()=>{
   try{
    if(refresh)router.refresh();else router.push(href,{scroll:false});
    setCommittedTicket(target.ticket);
   }catch{
    if(latest.current?.ticket===target.ticket){disposeFeedback();const failed={...target,phase:"error" as const};latest.current=failed;setRead(failed);}
   }
  });
 }
 function change(fields:Parameters<typeof workspaceFilterHref>[2]){
  if(invalid)return;
  const current=latest.current;
  // 连续操作从最新意图合并，不能借尚未提交的URL把新平台改回旧平台。
  const params=new URLSearchParams(current?.scope.groupId===workspace.groupId&&current.scope.path===path?current.href.split("?")[1]??"":search.toString());
  const href=workspaceFilterHref(path,params,fields);
  if(current?.href===href&&current.phase!=="error")return;
  const query=workspaceQueryFromSearch(Object.fromEntries(new URLSearchParams(href.split("?")[1]??"")));
  begin(href,{groupId:workspace.groupId,path,platform:query.platform??null,accountId:query.accountId??null,startDate:query.startDate??current?.scope.startDate??workspace.startDate,endDate:query.endDate??current?.scope.endDate??workspace.endDate});
 }
 function retry(){
  const target=latest.current;
  if(invalid||!target||target.scope.groupId!==workspace.groupId||target.scope.path!==path||target.phase==="reading")return;
  const requested=new URL(target.href,"https://creatoros.local"),current=new URL(`${path}?${search}`,"https://creatoros.local");
  // 相同query的顺序不影响范围；URL已提交时refresh才会真实重读。
  requested.searchParams.sort();current.searchParams.sort();
  begin(target.href,target.scope,requested.href===current.href);
 }
 return {change,retry,read:read?.scope.groupId===workspace.groupId&&read.scope.path===path?read:null,invalid};
}
