"use client";
import * as React from "react";
import {usePathname,useSearchParams} from "next/navigation";
import {creationScopeKey,readCreationScope} from "@/lib/creation-workspace-scope";
import {CURRENT_ACCOUNT_KEY,CURRENT_GROUP_KEY} from "@/lib/http-transport";

type Snapshot={href:string;scope:string;epoch:number};
type Candidate={source:string;node:HTMLElement|null;generation:number;token:number};
type Entry={generation:number;source:Snapshot|null;scope:string;epoch:number;trigger:HTMLElement|null;consumed:boolean};
type Return={href:string;generation:number};
const isSettings=(path:string)=>path==="/settings"||path.startsWith("/settings/");

/** 仅保存实际站内路由提交；焦点候选本身不赋予返回权限。 */
export class SettingsReturnController {
 private epoch=0;private last:Snapshot|null=null;private inSettings=false;
 private candidate:Candidate|null=null;private entry:Entry|null=null;
 private focusReturn:{href:string;node:HTMLElement|null;epoch:number}|null=null;
 generation=0;
 constructor(private readonly origin:string){}
 invalidate(){this.epoch++;this.last=null;this.candidate=null;this.focusReturn=null;}
 capture(href:string,node:HTMLElement|null,token:number){
  const target=new URL(href,this.origin),source=this.last;
  if(target.origin!==this.origin||!isSettings(target.pathname)||this.inSettings||!source||source.epoch!==this.epoch)return;
  this.candidate={source:source.href,node,generation:this.generation+1,token};
 }
 discard(token:number){if(this.candidate?.token===token)this.candidate=null;}
 commit(url:URL,scope:string):HTMLElement|null|undefined{
  if(url.origin!==this.origin)return;
  const href=url.pathname+url.search+url.hash;
  // SEMANTIC_BOUNDARY_ALLOW: 仅核真实地址、范围和世代相等，不推断内容或用户意图。
  if(isSettings(url.pathname)){
   if(!this.inSettings){
    this.generation++;
    const source=this.last?.epoch===this.epoch&&this.last.scope===scope?this.last:null;
    const trigger=source&&this.candidate?.source===source.href&&this.candidate.generation===this.generation?this.candidate.node:null;
    this.entry={generation:this.generation,source,scope,epoch:this.epoch,trigger,consumed:false};
    this.candidate=null;
   }
   this.inSettings=true;return;
  }
  const pending=this.focusReturn;this.focusReturn=null;
  this.inSettings=false;this.entry=null;this.candidate=null;
  this.last={href,scope,epoch:this.epoch};
  if(pending&&pending.epoch===this.epoch&&pending.href===href)return pending.node;
 }
 consume(scope=this.entry?.scope):Return|null{
  const entry=this.entry;
  if(!entry||entry.consumed)return null;
  entry.consumed=true;
  const source=entry.scope===scope&&entry.epoch===this.epoch&&entry.source?.scope===entry.scope&&entry.source.epoch===this.epoch?entry.source:null;
  const href=source?.href.startsWith("/")&&!source.href.startsWith("//")&&!isSettings(new URL(source.href,this.origin).pathname)?source.href:"/";
  this.focusReturn={href,node:source?entry.trigger:null,epoch:this.epoch};
  return {href,generation:entry.generation};
 }
}
interface SettingsReturn {
 readonly generation:number;
 capture(href:string,node:HTMLElement|null,token:number):void;
 discard(token:number):void;
 consume():Return|null;
}
const Context=React.createContext<SettingsReturn|null>(null);
export function useSettingsReturn(){return React.useContext(Context);}

/** 位于稳定Shell内，保存路由快照，不重挂工程或接管创作任务。 */
export function SettingsReturnProvider({children}:{children:React.ReactNode}){
 const pathname=usePathname(),search=useSearchParams()?.toString()??"";
 const controller=React.useRef<SettingsReturnController|null>(null);
 if(!controller.current&&typeof window!=="undefined")controller.current=new SettingsReturnController(window.location.origin);
 const [generation,setGeneration]=React.useState(0),frame=React.useRef<number|null>(null),focusToken=React.useRef(0);
 const signal=React.useRef({pathname,search});
 // eslint-disable-next-line react-hooks/refs -- DOM事件只核本次路由提交信号，不将新地址拼到旧页面。
 signal.current={pathname,search};
 const observe=React.useCallback(()=>{
  const current=controller.current;if(!current)return;
  const actual=new URL(window.location.href),committed=signal.current;
  if(actual.pathname!==committed.pathname||actual.searchParams.toString()!==committed.search)return;
  const focus=current.commit(actual,creationScopeKey(readCreationScope()));
  setGeneration(current.generation);
  if(focus!==undefined){
   if(frame.current!==null)cancelAnimationFrame(frame.current);
   frame.current=requestAnimationFrame(()=>{
    frame.current=null;
    const usable=focus?.isConnected&&focus.getClientRects().length>0&&!focus.closest('[inert],[aria-hidden="true"]');
    const fallback=document.querySelector<HTMLElement>('[data-slot="app-page-content"] h1, [data-slot="app-page-content"] main');
    const node=usable?focus:fallback;
    if(node){if(!usable&&!node.hasAttribute("tabindex"))node.setAttribute("tabindex","-1");node.focus({preventScroll:true});}
   });
  }
 },[]);
 // 每次真实React提交均核地址；同URL的RSC refresh也可能完成新的范围同步。
 React.useEffect(observe);
 React.useEffect(()=>{
  const invalidate=()=>{controller.current?.invalidate();if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}};
  const storage=(event:StorageEvent)=>{if(event.key===null||event.key===CURRENT_GROUP_KEY||event.key===CURRENT_ACCOUNT_KEY)invalidate();};
  window.addEventListener("creatoros:accounts-changed",invalidate);window.addEventListener("storage",storage);
  window.addEventListener("hashchange",observe);window.addEventListener("popstate",observe);
  return()=>{window.removeEventListener("creatoros:accounts-changed",invalidate);window.removeEventListener("storage",storage);window.removeEventListener("hashchange",observe);window.removeEventListener("popstate",observe);if(frame.current!==null)cancelAnimationFrame(frame.current);};
 },[observe]);
 const capture=React.useCallback((href:string,node:HTMLElement|null,token:number)=>controller.current?.capture(href,node,token),[]);
 const discard=React.useCallback((token:number)=>controller.current?.discard(token),[]);
 const consume=React.useCallback(()=>controller.current?.consume(creationScopeKey(readCreationScope()))??null,[]);
 const value=React.useMemo(()=>({generation,capture,discard,consume}),[generation,capture,discard,consume]);
 return <Context.Provider value={value}><div className="contents" onClickCapture={event=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const anchor=event.target instanceof Element?event.target.closest<HTMLAnchorElement>("a[href]"):null;
  if(!anchor||anchor.hasAttribute("download")||(anchor.target&&anchor.target!=="_self"))return;
  capture(anchor.href,anchor,++focusToken.current);
 }}>{children}</div></Context.Provider>;
}
