'use client';
import * as React from 'react';
import {createPortal} from 'react-dom';
import {DraftChatRail} from './draft-chat-rail';
import {Button} from '@/components/ui/button';
type Dock={mount:HTMLElement;token:object;open:()=>void};
type DockPort={dock:(mount:HTMLElement,open:()=>void)=>()=>void;openDirector:()=>void};
const Context=React.createContext<DockPort|null>(null);
export const useStageChatDock=()=>React.useContext(Context);
/** 唯一Chat portal的目标恒定；停靠只移动其DOM，不重建会话/未发输入。 */
export function VideoStageChatDock({projectId,projectTitle,children,active=true}:{projectId:string|null;projectTitle:string|null;children:React.ReactNode;active?:boolean}){
 const parking=React.useRef<HTMLDivElement>(null),mount=React.useRef<HTMLDivElement|null>(null),registration=React.useRef<Dock|null>(null),live=React.useRef(true),activeRef=React.useRef(active);
 React.useLayoutEffect(()=>{activeRef.current=active;},[active]);
 const [portalTarget,setPortalTarget]=React.useState<HTMLElement|null>(null),[docked,setDocked]=React.useState(false),[collapsed,setCollapsed]=React.useState(false);
 const place=React.useCallback(()=>{const node=mount.current;if(!node)return;const target=activeRef.current&&registration.current?.mount.isConnected?registration.current.mount:parking.current;if(target&&node.parentNode!==target)target.appendChild(node);},[]);
 const attachParking=React.useCallback((target:HTMLDivElement|null)=>{
  parking.current=target;if(!target)return;
  if(!mount.current){const node=document.createElement('div');node.className='flex h-full min-h-0 min-w-0 flex-col';node.dataset.videoChatMount='';mount.current=node;setPortalTarget(node);}place();
 },[place]);
 React.useLayoutEffect(()=>{live.current=true;const parkingNode=parking.current;return()=>{live.current=false;registration.current=null;const node=mount.current;if(node&&parkingNode)parkingNode.appendChild(node);};},[]);

 const dock=React.useCallback((target:HTMLElement,open:()=>void)=>{
  if(target.dataset.creatorosAddon!=='director')throw Error('编导停靠目标不属于当前工作面');
  const token={};registration.current={mount:target,open,token};place();if(live.current)setDocked(true);
  return()=>{if(registration.current?.token!==token)return;registration.current=null;place();if(live.current)setDocked(false);};
 },[place]);
 const openDirector=React.useCallback(()=>{setCollapsed(false);registration.current?.open();place();},[place]);
 React.useLayoutEffect(()=>{place();},[active,place]);
 const value=React.useMemo(()=>({dock,openDirector}),[dock,openDirector]);
 return <Context.Provider value={value}><div className="@container/video-dock flex min-h-0 min-w-0 flex-1 flex-col"><div className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch @[960px]/video-dock:flex-row" data-video-chat-dock>
  <div className="w-full min-w-0 @[960px]/video-dock:w-auto @[960px]/video-dock:flex-1">{children}</div>
  <aside className={docked?'hidden':'flex w-full min-w-0 shrink-0 flex-col border-t border-border bg-surface @[960px]/video-dock:w-[360px] @[960px]/video-dock:border-l @[960px]/video-dock:border-t-0'} hidden={docked||!active} inert={docked||!active} aria-hidden={docked||!active||undefined} aria-label="编导对话">
   <div className="flex justify-end border-b border-border p-2"><Button size="sm" variant="ghost" onClick={()=>setCollapsed(v=>!v)}>{collapsed?'展开编导':'收起编导'}</Button></div>
   <div ref={attachParking} className="h-[min(720px,calc(100dvh-180px))] min-h-0 min-w-0" hidden={collapsed} inert={collapsed}/>
  </aside>
  {portalTarget&&projectId&&projectTitle?createPortal(<DraftChatRail projectId={projectId} projectTitle={projectTitle}/>,portalTarget):null}
 </div></div></Context.Provider>;
}
