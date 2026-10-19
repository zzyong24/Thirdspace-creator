/// <reference lib="dom" />
import type {Frame,Page} from '@playwright/test';

export type NavigationRouteClass='platform_home'|'platform_post'|'platform_follower'|'micro_post'|'micro_follower'|'official_other'|'cross_origin'|'unavailable';
export type NavigationRoot={rootId:string;parentRootId:string|null;kind:'top'|'frame'|'cross_origin_frame'|'open_shadow'|'unavailable_shadow';routeClass:NavigationRouteClass;visible:boolean;documentReadyState:'loading'|'interactive'|'complete'|'unknown';navigationContainerState:'present'|'unknown';entryExactCount:number;entryVisibleCount:number;centreExactCount:number;centreVisibleCount:number;overlayCount:number;truncated:boolean};
export type NavigationCandidate={rootId:string;tag:string;role:string|null;expanded:string|null;hidden:boolean;text:string;bbox:{x:number;y:number;width:number;height:number};visible:boolean;occluded:boolean};
export type WechatNavigationObservation={routeClass:NavigationRouteClass;roots:NavigationRoot[];menuCandidates:NavigationCandidate[];closedShadowUnknownCount:number;truncated:boolean};
export type NavigationObservationControls={signal:AbortSignal;timeoutMs(requested?:number):number;assertScopeFresh():Promise<void>};
const ORIGIN='https://channels.weixin.qq.com';
// SEMANTIC_BOUNDARY_ALLOW: 固定官方路径分类和DOM可见性/遮挡是机械事实；不据此选择创作内容或猜测菜单语义。
export function navigationRouteClass(value:string):NavigationRouteClass{
 try{const url=new URL(value);if(url.origin!==ORIGIN||url.username||url.password)return 'cross_origin';return ({'/platform':'platform_home','/platform/':'platform_home','/':'platform_home','/platform/statistic/post':'platform_post','/platform/statistic/follower':'platform_follower','/micro/statistic/post':'micro_post','/micro/statistic/follower':'micro_follower'} as const)[url.pathname as '/platform']??'official_other';}catch{return 'unavailable';}
}

/** 只读取有界导航结构；候选text为私有证据，调用者不得放入公开响应或日志。 */
export async function readWechatNavigationObservation(page:Page,original:NavigationObservationControls):Promise<WechatNavigationObservation>{
 const controller=new AbortController(),signal=AbortSignal.any([original.signal,controller.signal]);
 const check=async()=>{signal.throwIfAborted();original.timeoutMs(120000);await original.assertScopeFresh();signal.throwIfAborted();};
 let timer:ReturnType<typeof setTimeout>|undefined,onAbort:(()=>void)|undefined;
 const work=async()=>{
  await check();
  const result:WechatNavigationObservation={routeClass:navigationRouteClass(page.url()),roots:[],menuCandidates:[],closedShadowUnknownCount:0,truncated:false};
  if(result.routeClass==='cross_origin'||result.routeClass==='unavailable')throw Object.assign(Error('NAVIGATION_ORIGIN_INVALID'),{code:'SOURCE_URL_INVALID'});
  const depth=(frame:Frame)=>{let level=0;for(let parent=frame.parentFrame();parent&&level<64;parent=parent.parentFrame())level++;return level;};
  // 祖先先处理，Frame元素自己的DOM可见不能代签外层iframe实际可见。
  const frames=page.frames().slice().sort((a,b)=>depth(a)-depth(b)),frameVisibility=new Map<Frame,boolean>();result.truncated=frames.length>32;
  for(const [index,frame] of frames.slice(0,32).entries()){
   await check();const rootId='frame-'+index,parent=frame.parentFrame(),parentIndex=parent?frames.indexOf(parent):-1,parentRootId=parentIndex<0?null:'frame-'+parentIndex;
   const route=navigationRouteClass(frame.url());let visible=index===0;
   if(index!==0)try{const element=await frame.frameElement();try{
    visible=(parent?frameVisibility.get(parent)===true:false)&&await element.isVisible()&&await element.evaluate(node=>{
     for(let current:Element|null=node as Element;current;){const style=getComputedStyle(current);if(current.hasAttribute('hidden')||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return false;const parent:Element|null=current.parentElement;current=parent??((current.getRootNode() as ShadowRoot).host??null);}return true;
    });
   }finally{await element.dispose();}}catch{await check();}
   frameVisibility.set(frame,visible);
   if(route==='cross_origin'||route==='unavailable'){
    result.roots.push({rootId,parentRootId,kind:'cross_origin_frame',routeClass:route,visible,documentReadyState:'unknown',navigationContainerState:'unknown',entryExactCount:0,entryVisibleCount:0,centreExactCount:0,centreVisibleCount:0,overlayCount:0,truncated:false});continue;
   }
   const data=await frame.evaluate(({rootId,parentRootId,frameVisible,isTop,route})=>{
    type Root=Document|ShadowRoot;
    const roots:NavigationRoot[]=[],candidates:NavigationCandidate[]=[];let unknown=0,truncated=false,nodesRemaining=20000;
    const rect=(node:Element)=>{const r=node.getBoundingClientRect();const n=(v:number)=>Math.round(Math.min(1000000,Math.max(-1000000,Number.isFinite(v)?v:0))*100)/100;return {x:n(r.x),y:n(r.y),width:n(r.width),height:n(r.height)};};
    const visible=(node:Element)=>{
     if(!frameVisible||!node.isConnected||!node.getClientRects().length)return false;
     for(let current:Element|null=node;current;){const style=getComputedStyle(current);if(current.hasAttribute('hidden')||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return false;const parent:Element|null=current.parentElement;current=parent??((current.getRootNode() as ShadowRoot).host??null);}
     return true;
    };
    const text=(node:Element)=>(node.textContent??'').replace(/\s+/g,' ').trim();
    const visit=(root:Root,id:string,parentId:string|null,kind:NavigationRoot['kind'])=>{
     if(roots.length>=32||nodesRemaining<=0){truncated=true;return;}
     const all=[...root.querySelectorAll('*')];const nodes=all.slice(0,nodesRemaining);nodesRemaining-=nodes.length;if(nodes.length!==all.length)truncated=true;
     const exact=(label:string)=>nodes.filter(node=>text(node)===label&&![...node.children].some(child=>text(child)===label));
     const entry=exact('视频数据'),centre=exact('数据中心');
     const overlays=nodes.filter(node=>visible(node)&&(node.getAttribute('role')==='dialog'||node.getAttribute('aria-modal')==='true'));
     const containers=nodes.filter(node=>node.matches('nav,aside,[role="navigation"],[role="menu"],[role="menubar"]'));
     roots.push({rootId:id,parentRootId:parentId,kind,routeClass:route,visible:root instanceof ShadowRoot?visible(root.host):frameVisible,documentReadyState:document.readyState,navigationContainerState:containers.length?'present':'unknown',entryExactCount:entry.length,entryVisibleCount:entry.filter(visible).length,centreExactCount:centre.length,centreVisibleCount:centre.filter(visible).length,overlayCount:overlays.length,truncated:nodes.length!==all.length});
     const navigationNodes=new Set<Element>();for(const container of containers)for(const node of container.querySelectorAll('a,button,[role="menuitem"],[role="button"],li,span'))navigationNodes.add(node);
     for(const node of navigationNodes){
      if(candidates.length>=128){truncated=true;break;}const label=text(node);if(!label||[...node.children].some(child=>text(child)===label))continue;if(label.length>80)truncated=true;
      const bbox=rect(node),isVisible=visible(node),x=bbox.x+bbox.width/2,y=bbox.y+bbox.height/2;
      const hit=isVisible?(root instanceof ShadowRoot?root.elementFromPoint(x,y):document.elementFromPoint(x,y)):null;
      candidates.push({rootId:id,tag:node.localName.slice(0,40),role:node.getAttribute('role')?.slice(0,40)??null,expanded:['true','false'].includes(node.getAttribute('aria-expanded')??'')?node.getAttribute('aria-expanded'):null,hidden:node.hasAttribute('hidden')||node.getAttribute('aria-hidden')==='true',text:label.slice(0,80),bbox,visible:isVisible,occluded:isVisible&&hit!==node&&!node.contains(hit)});
     }
     for(const node of nodes){
      if(node.shadowRoot){visit(node.shadowRoot,id+'/shadow-'+roots.length,id,'open_shadow');}
      else if(node.localName.includes('-')){unknown++;if(roots.length<32)roots.push({rootId:id+'/unavailable-'+unknown,parentRootId:id,kind:'unavailable_shadow',routeClass:route,visible:visible(node),documentReadyState:'unknown',navigationContainerState:'unknown',entryExactCount:0,entryVisibleCount:0,centreExactCount:0,centreVisibleCount:0,overlayCount:0,truncated:false});else truncated=true;}
     }
    };
    visit(document,rootId,parentRootId,isTop?'top':'frame');return {roots,candidates,unknown,truncated};
   },{rootId,parentRootId,frameVisible:visible,isTop:index===0,route});
   await check();result.closedShadowUnknownCount+=data.unknown;
   const rootRoom=32-result.roots.length,candidateRoom=128-result.menuCandidates.length;
   if(data.roots.length>rootRoom||data.candidates.length>candidateRoom)result.truncated=true;
   result.roots.push(...data.roots.slice(0,Math.max(0,rootRoom)));result.menuCandidates.push(...data.candidates.slice(0,Math.max(0,candidateRoom)));result.truncated||=data.truncated;
  }
  await check();if(result.routeClass!==navigationRouteClass(page.url()))throw Object.assign(Error('NAVIGATION_ROUTE_CHANGED'),{code:'REPORT_NOT_READY'});return result;
 };
 try{
  return await Promise.race([work(),new Promise<never>((_,reject)=>{const rejectNow=()=>reject(signal.reason);onAbort=rejectNow;signal.addEventListener('abort',rejectNow,{once:true});timer=setTimeout(()=>controller.abort(Object.assign(Error('NAVIGATION_OBSERVATION_EXHAUSTED'),{code:'EXECUTION_DEADLINE_EXCEEDED'})),original.timeoutMs(120000));if(signal.aborted)rejectNow();})]);
 }finally{if(timer)clearTimeout(timer);if(onAbort)signal.removeEventListener('abort',onAbort);controller.abort();}
}
