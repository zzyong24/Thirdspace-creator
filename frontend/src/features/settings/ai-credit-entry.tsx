"use client";
import * as React from 'react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {openAiCreditCenter} from '@/lib/open-ai-credit-center';
import {readCurrentAccountId,readCurrentGroupId} from '@/lib/http-transport';

/** 常驻入口只打开原受控额度链路，不创建另一份bootstrap表单。 */
export function AiCreditEntry(){
 const [opening,setOpening]=React.useState(false),[error,setError]=React.useState<string|null>(null);
 const generation=React.useRef(0),controller=React.useRef<AbortController|null>(null),trigger=React.useRef<HTMLButtonElement|null>(null);
 const cancel=React.useCallback(()=>{generation.current++;controller.current?.abort();controller.current=null;setOpening(false);setError(null);trigger.current?.focus({preventScroll:true});},[]);
 React.useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&(opening||error)){event.preventDefault();event.stopPropagation();cancel();}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[opening,error,cancel]);
 React.useEffect(()=>{
  let scope=JSON.stringify([readCurrentGroupId(),readCurrentAccountId()]);
  const change=()=>{const next=JSON.stringify([readCurrentGroupId(),readCurrentAccountId()]);if(next===scope)return;scope=next;generation.current++;controller.current?.abort();controller.current=null;setOpening(false);setError(null);};
  window.addEventListener('creatoros:accounts-changed',change);window.addEventListener('storage',change);
  return()=>{generation.current++;controller.current?.abort();window.removeEventListener('creatoros:accounts-changed',change);window.removeEventListener('storage',change);};
 },[]);
 const open=React.useCallback(async()=>{
  if(controller.current)return;
  const token=++generation.current,active=new AbortController();controller.current=active;
  const live=()=>generation.current===token&&!active.signal.aborted;
  setOpening(true);setError(null);
  try{await openAiCreditCenter({signal:active.signal,isCurrent:live});}
  catch(cause){if(live())setError(cause instanceof Error?cause.message:'暂时无法打开AI额度，请稍后重试');}
  finally{if(generation.current===token){controller.current=null;setOpening(false);}}
 },[]);
 return <div className="pointer-events-auto relative shrink-0" data-slot="global-ai-credit-entry">
  <Button ref={trigger} type="button" variant="outline" disabled={opening} onClick={()=>void open()}>{opening?'正在打开…':'充值'}</Button>{opening?<Button type="button" variant="ghost" onClick={cancel} aria-label="取消打开额度中心">取消</Button>:null}
  {error?<div className="absolute right-0 top-full z-popover mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-4 shadow-popover"><Button type="button" variant="ghost" onClick={cancel} aria-label="关闭充值提示" className="mb-2">关闭</Button><p role="alert" className="text-sm text-destructive">{error}</p><Link href="/settings?highlight=ai-credits" className="mt-2 inline-block text-sm text-brand underline">前往模型设置</Link></div>:null}
 </div>;
}
