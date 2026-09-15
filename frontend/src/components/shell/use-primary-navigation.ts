"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAccountsChanged } from "@/lib/account-events";

/** 同一目标在途复用；不同目标立即切换。完成 token 防止旧过渡解开新导航的锁。 */
export function usePrimaryNavigation() {
  const router = useRouter();
  const sequence = useRef(0);
  const latest = useRef<{target:string;token:number}|null>(null);
  const [pendingHref,setPendingHref] = useState<string|null>(null);
  const [settledToken,setSettledToken] = useState(0);
  const [error,setError] = useState<string|null>(null);
  const [isPending,startTransition] = useTransition();
  const clear = useCallback(()=>{latest.current=null;setPendingHref(null)},[]);
  useAccountsChanged(clear);
  useEffect(()=>()=>{latest.current=null},[]);
  useEffect(()=>{
    if(!isPending && latest.current?.token===settledToken) clear();
  },[isPending,settledToken,clear]);
  const navigate = useCallback((href:string)=>{
    // SEMANTIC_BOUNDARY_ALLOW: 仅完整地址相等判断，不选择内容或改变用户导航意图。
    const target = new URL(href,window.location.href).href;
    if(latest.current?.target===target) return;
    const token=++sequence.current;
    setError(null);
    latest.current={target,token};
    setPendingHref(href);
    startTransition(()=>{
      try {
        router.push(href);
        // 与路由在同一次 transition 中提交，即使缓存瞬时命中也会释放。
        setSettledToken(token);
      } catch {
        if(latest.current?.token===token) {
          clear();
          setError("页面暂时无法打开，请重试。");
        }
      }
    });
  },[router,clear]);
  return {navigate,pendingHref,error};
}
