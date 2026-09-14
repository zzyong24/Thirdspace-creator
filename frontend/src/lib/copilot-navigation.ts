import {OVERLAY_QUERY_KEY,OVERLAY_OPEN_VALUE} from './overlay-constants';
const overlayKeys=new Set([OVERLAY_QUERY_KEY,'surface','fn','prefill','selKind','selId','selTitle','scope']);
/** 仅同页弹窗状态走浏览器历史；其它页面/筛选导航仍交给 Next。 */
export function copilotLocalTarget(href:string,currentHref:string):string|null{
 const current=new URL(currentHref),target=new URL(href,current);
 if(target.origin!==current.origin||target.pathname!==current.pathname||target.searchParams.get(OVERLAY_QUERY_KEY)!==OVERLAY_OPEN_VALUE)return null;
 for(const key of target.searchParams.keys())if(!overlayKeys.has(key)&&JSON.stringify(target.searchParams.getAll(key))!==JSON.stringify(current.searchParams.getAll(key)))return null;
 for(const key of overlayKeys)current.searchParams.delete(key);
 for(const [key,value] of target.searchParams)if(overlayKeys.has(key))current.searchParams.append(key,value);
 if(target.hash)current.hash=target.hash;
 return `${current.pathname}${current.search}${current.hash}`;
}
/** capture 阶段阻止 Next Link 为弹层发起 RSC 导航；保留组合键和跨页链接。 */
export function handleCopilotLocalClick(event:MouseEvent){
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;
 if(!(anchor instanceof HTMLAnchorElement)||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self'))return;
 const target=copilotLocalTarget(anchor.href,window.location.href);if(!target)return;
 event.preventDefault();
 // Next 的 native history 集成会同步 useSearchParams，不请求服务端页面。
 window.history.pushState(null,'',target);
}

/** 按钮等程序化入口与链接复用同一条本地打开路径。 */
export function openCopilotLocally(href:string):boolean{
 const target=copilotLocalTarget(href,window.location.href);if(!target)return false;
 window.history.pushState(null,'',target);return true;
}
