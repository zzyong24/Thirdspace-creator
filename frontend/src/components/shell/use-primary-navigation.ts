"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {useSettingsReturn} from "./settings-return-context";
import { useAccountsChanged } from "@/lib/account-events";
import { CURRENT_ACCOUNT_KEY, CURRENT_GROUP_KEY } from "@/lib/http-transport";

// 只改变等待反馈，不中止路由、缩短工作区预算或把页面标为就绪。
const SLOW_NAVIGATION_FEEDBACK_MS = 3_000;
type NavigationIntent = {href:string;target:string;source:string;token:number;committed:boolean};
function hasVisibleRouteLoading() {
  // Activity保留的隐藏骨架不代表当前页面仍在读取。
  return Array.from(document.querySelectorAll('[data-slot="route-loading"]'))
    .some(node=>node.getClientRects().length>0);
}

/** 同一目标在途复用；不同目标立即切换。完成 token 防止旧过渡解开新导航的锁。 */
export function usePrimaryNavigation() {
  const router = useRouter();
  const pathname=usePathname(),search=useSearchParams()?.toString()??"";
  const routeSignal=useRef({pathname,search});
  const settingsReturn=useSettingsReturn();
  const sequence = useRef(0);
  const latest = useRef<NavigationIntent|null>(null);
  const recoverable=useRef<NavigationIntent|null>(null);
  const feedbackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const observer=useRef<MutationObserver|null>(null);
  const [pendingHref,setPendingHref] = useState<string|null>(null);
  const [slowHref,setSlowHref]=useState<string|null>(null);
  const [settledToken,setSettledToken] = useState(0);
  const [error,setError] = useState<string|null>(null);
  const [isPending,startTransition] = useTransition();
  const dispose=useCallback(()=>{
    if(feedbackTimer.current!==null){clearTimeout(feedbackTimer.current);feedbackTimer.current=null;}
    observer.current?.disconnect();observer.current=null;
  },[]);
  const clear = useCallback(()=>{
    dispose();latest.current=null;recoverable.current=null;
    setPendingHref(null);setSlowHref(null);setError(null);
  },[dispose]);
  const observeCommit=useCallback(()=>{
    const intent=latest.current;if(!intent)return;
    const actual=new URL(window.location.href),signal=routeSignal.current;
    // SEMANTIC_BOUNDARY_ALLOW: 只核真实完整URL及React已提交的pathname/query相等，拒绝旧路由提交。
    if(actual.href!==intent.target||signal.pathname!==actual.pathname||signal.search!==actual.searchParams.toString())return;
    // 同URL重试不能用开始时就存在的地址冒充本轮完成，仍等真实过渡提交。
    if(intent.source===intent.target&&!intent.committed)return;
    intent.committed=true;setPendingHref(null);
    if(!hasVisibleRouteLoading())clear();
  },[clear]);
  useAccountsChanged(clear);
  useEffect(()=>{
    const storage=(event:StorageEvent)=>{if(event.key===null||event.key===CURRENT_GROUP_KEY||event.key===CURRENT_ACCOUNT_KEY)clear();};
    window.addEventListener('storage',storage);
    return()=>{window.removeEventListener('storage',storage);dispose();latest.current=null;recoverable.current=null;};
  },[clear,dispose]);
  // 目标提交独立于其它尚未结束的transition；同URL骨架移除另由局部DOM观察收尾。
  useEffect(()=>{
    routeSignal.current={pathname,search};
    const intent=latest.current;if(!intent)return;
    // 在外部路由本次提交之后结算，旧微任务与已卸载实例不得清新导航。
    queueMicrotask(()=>{
      if(latest.current!==intent)return;
      observeCommit();
      if(latest.current!==intent||isPending||intent.token!==settledToken)return;
      if(intent.target!==window.location.href){
        settingsReturn?.discard(intent.token);clear();recoverable.current=intent;
        setError("页面暂时无法打开，请重试。");return;
      }
      // 地址栏可以领先React路由上下文；过渡结束不能绕过observeCommit的提交校验。
      const actual=new URL(window.location.href),signal=routeSignal.current;
      if(signal.pathname!==actual.pathname||signal.search!==actual.searchParams.toString())return;
      intent.committed=true;
      if(hasVisibleRouteLoading()){
        setPendingHref(null);observeCommit();
      }else clear();
    });
  });
  const navigateNow = useCallback((href:string,retrying=false)=>{
    // SEMANTIC_BOUNDARY_ALLOW: 仅完整地址相等判断，不选择内容或改变用户导航意图。
    const target = new URL(href,window.location.href).href;
    if(!retrying&&latest.current?.target===target)return;
    // 同页骨架普通点击只观察，不重复请求；恢复按钮才明确重试。
    const observingOnly=!retrying&&target===window.location.href&&hasVisibleRouteLoading();
    dispose();
    const token=++sequence.current;
    setError(null);setSlowHref(null);recoverable.current=null;
    const intent:NavigationIntent={href,target,source:window.location.href,token,committed:observingOnly};
    latest.current=intent;
    setPendingHref(observingOnly?null:href);
    feedbackTimer.current=setTimeout(()=>{
      if(latest.current!==intent)return;
      observeCommit();
      if(latest.current!==intent)return;
      // 留在真实读取中的慢态；不重发、不取消，也不宣布目标页面已加载。
      recoverable.current=intent;setPendingHref(null);setSlowHref(href);
    },SLOW_NAVIGATION_FEEDBACK_MS);
    observer.current=new MutationObserver(observeCommit);
    observer.current.observe(document.querySelector('[data-slot="app-page-content"]')??document.body,
      {childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style','class','aria-hidden']});
    if(observingOnly)return;
    startTransition(()=>{
      try {
        settingsReturn?.capture(href,document.activeElement instanceof HTMLElement?document.activeElement:null,token);
        if(retrying&&target===window.location.href)router.refresh();
        else router.push(href);
        // 与路由在同一次 transition 中提交，即使缓存瞬时命中也会释放。
        setSettledToken(token);
      } catch {
        settingsReturn?.discard(token);
        if(latest.current?.token===token) {
          clear();
          recoverable.current=intent;
          setError("页面暂时无法打开，请重试。");
        }
      }
    });
  },[router,clear,dispose,observeCommit,settingsReturn]);
  // 路由离开由稳定宿主保留原稿；只有实际更换作品或账号组才处理离开决定。
  const navigate=useCallback((href:string)=>navigateNow(href),[navigateNow]);
  const retry=useCallback(()=>{
    const intent=recoverable.current;if(intent)navigateNow(intent.href,true);
  },[navigateNow]);
  return {navigate,pendingHref,slowHref,error,retry};
}
