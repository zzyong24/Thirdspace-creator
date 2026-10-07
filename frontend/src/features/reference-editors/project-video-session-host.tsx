"use client";
import * as React from "react";
import {DraftChatRequestProvider} from "@/features/draft-workbench/draft-chat-request";
import {writeCurrentGroupId,CURRENT_ACCOUNT_KEY,syncCurrentAccountCookie} from "@/lib/http-transport";
import {usePathname,useRouter} from "next/navigation";
import {creationScopeKey,useCreationScope,type CreationScope} from "@/lib/creation-workspace-scope";
import type {ProductionWorkbenchProps} from "@/features/production/production-workbench";
import {ProductionEditorSession} from "@/features/production/production-editor-entry";
import {StageChatWrapper} from "@/app/(creator)/projects/[projectId]/stage-chat-wrapper";
import {Dialog,DialogContent,DialogDescription,DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {ProjectVideoSessionContext,publishVideoSession,clearVideoSession,isSameVideoWorkspace,type VideoSessionIdentity,type VideoLeaveControl} from "./project-video-session-registry";
type Session={identity:VideoSessionIdentity;scope:CreationScope;props:ProductionWorkbenchProps};
type Pending={target?:Session;resolve?:(accepted:boolean)=>void};
let sequence=0;
export function ProjectVideoSessionHost({selectedOutputId,children}:{selectedOutputId?:string|null;children:React.ReactNode}){
 const pathname=usePathname()??"",router=useRouter(),liveScope=useCreationScope();
 const [session,setSession]=React.useState<Session|null>(null),[pending,setPending]=React.useState<Pending|null>(null),[error,setError]=React.useState(""),[busy,setBusy]=React.useState(false),[backup,setBackup]=React.useState(false),[discard,setDiscard]=React.useState(false);
 const current=React.useRef<Session|null>(null),control=React.useRef<VideoLeaveControl|null>(null),pendingRef=React.useRef<Pending|null>(null),routeToken=React.useRef<object|null>(null),active=React.useRef(true);
 current.current=session;pendingRef.current=pending;
 const offer=React.useCallback((value:Pending)=>{if(pendingRef.current){value.resolve?.(false);return;}pendingRef.current=value;setError("");setBackup(false);setDiscard(false);setPending(value);},[]);
 const attach=React.useCallback((props:ProductionWorkbenchProps,scope:CreationScope)=>{
  if(!props.outputId||!props.projectId)return()=>{};
  const identity={scopeKey:creationScopeKey(scope),projectId:props.projectId,outputId:props.outputId,generation:++sequence};const next={identity,scope:Object.freeze({...scope}),props};const token={};routeToken.current=token;
  const existing=current.current;
  if(!existing){current.current=next;setSession(next);}
  else if(existing.identity.scopeKey===identity.scopeKey&&existing.identity.outputId===identity.outputId){setSession({...existing,props});}
  else offer({target:next});
  return()=>{if(routeToken.current===token)routeToken.current=null;};
 },[offer]);
 const guarded=React.useCallback(async(target:{href?:string;scopeKey?:string})=>{
  const existing=current.current;if(!existing||isSameVideoWorkspace(existing.identity,target))return true;
  const state=control.current?.readState();
  if(state&&!state.dirty&&!state.busy&&!state.pending&&!state.imports){await control.current!.dispose();if(current.current===existing){current.current=null;setSession(null);clearVideoSession(existing.identity.generation);}return true;}
  return new Promise<boolean>(resolve=>offer({resolve}));
 },[offer]);
 React.useEffect(()=>{if(session)publishVideoSession(session.identity,guarded);return()=>{if(session)clearVideoSession(session.identity.generation);};},[session?.identity.generation,guarded]);
 React.useEffect(()=>{active.current=true;const beforeUnload=(event:BeforeUnloadEvent)=>{const state=control.current?.readState();if(state&&(state.dirty||state.pending||state.busy||state.imports)){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",beforeUnload);return()=>{active.current=false;pendingRef.current?.resolve?.(false);window.removeEventListener("beforeunload",beforeUnload);};},[]);
 const onControl=React.useCallback((next:VideoLeaveControl|null)=>{control.current=next;},[]);
 const selected=selectedOutputId;
 const routeProject=pathname.split('/').filter(Boolean);
 const visible=Boolean(session&&!pending&&routeProject[0]==='projects'&&decodeURIComponent(routeProject[1]??'')===session.identity.projectId&&routeProject[2]==='production'&&creationScopeKey(liveScope)===session.identity.scopeKey&&(!selected||selected===session.identity.outputId));
 function stay(){if(busy)return;const old=current.current;pendingRef.current?.resolve?.(false);pendingRef.current=null;setPending(null);setError("");if(old&&creationScopeKey(liveScope)!==old.identity.scopeKey){if(old.scope.groupId)writeCurrentGroupId(old.scope.groupId);else {writeCurrentGroupId(null);if(old.scope.accountId)window.localStorage.setItem(CURRENT_ACCOUNT_KEY,old.scope.accountId);syncCurrentAccountCookie(old.scope.accountId??null);window.dispatchEvent(new Event('creatoros:accounts-changed'));}}
 if(old)router.replace(`/projects/${encodeURIComponent(old.identity.projectId)}/production?outputId=${encodeURIComponent(old.identity.outputId)}`);}
 async function leave(mode:"save"|"discard"){
  const intent=pendingRef.current,existing=current.current,handle=control.current;if(!intent||!existing||!handle||busy)return;
  setBusy(true);setError("");
  try{
   if(mode==="save"){
    const state=handle.readState();if(state.busy||state.imports)throw Error("素材或剪辑操作尚未完成，请等进度结束后保存。");
    if(state.pending)await handle.recoverOriginalReceipt();
    if(!(await handle.saveForLeave()))throw Error("工程尚未确认保存，请恢复原请求或继续编辑。");
    const after=handle.readState();if(after.dirty||after.pending||after.busy||after.imports)throw Error("还有未保存修改或未完成操作，请继续核对原工程。");
   }else if(!backup||!discard)throw Error("请先下载本地备份，再明确放弃当前窗口未保存修改。");
   await handle.dispose();if(!active.current)return;control.current=null;clearVideoSession(existing.identity.generation);pendingRef.current=null;setPending(null);current.current=intent.target??null;setSession(intent.target??null);intent.resolve?.(true);
  }catch(cause){if(active.current)setError(cause instanceof Error?cause.message:"离开尚未完成，原剪辑稿保留");}finally{if(active.current)setBusy(false);}
 }
 const value=React.useMemo(()=>({attach}),[attach]);
 return <ProjectVideoSessionContext.Provider value={value}><div data-video-route-outlet hidden={visible} inert={visible} aria-hidden={visible||undefined}>{children}</div><div data-video-session-outlet hidden={!visible} inert={!visible} aria-hidden={!visible||undefined}>{session?<DraftChatRequestProvider><StageChatWrapper active={visible} projectId={session.props.projectId} projectTitle={session.props.projectTitle}><ProductionEditorSession key={JSON.stringify([session.identity.scopeKey,session.identity.projectId,session.identity.outputId])} {...session.props} scopeOverride={session.scope} visible={visible} onLeaveControl={onControl}/></StageChatWrapper></DraftChatRequestProvider>:null}</div><Dialog open={pending!==null} onOpenChange={open=>{if(!open)stay();}}><DialogContent><DialogTitle>离开前保留剪辑稿</DialogTitle><DialogDescription>当前作品还有未保存修改或未完成的素材操作。选择保存后离开，或继续编辑。</DialogDescription><p className="text-sm">{session?.props.projectTitle}</p>{error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}<div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void leave("save")}>保存并继续</Button><Button variant="outline" disabled={busy} onClick={stay}>继续编辑</Button></div><details className="space-y-3"><summary className="cursor-pointer text-xs text-muted-foreground">无法保存时下载备份</summary><p className="text-xs text-muted-foreground">备份包含工程与素材引用；尚未上传的原文件会单独下载。请确认下载后再离开。</p><Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{if(!control.current)throw Error("编辑器尚未准备好，请继续编辑后再备份");await control.current.exportLocalBackup();setBackup(true);}catch(cause){setError(cause instanceof Error?cause.message:"备份未完成");}finally{setBusy(false);}}}>下载本地备份</Button><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={discard} disabled={!backup||busy} onChange={event=>setDiscard(event.target.checked)}/>已确认下载，放弃此窗口未保存修改</label><Button variant="outline" disabled={busy||!backup||!discard} onClick={()=>void leave("discard")}>备份后离开</Button></details></DialogContent></Dialog></ProjectVideoSessionContext.Provider>;
}
