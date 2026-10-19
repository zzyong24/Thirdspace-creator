// 仅待授权的可丢弃研究仪器，不是生产候选；不创建Page/Context，不改身份返回值。
import type {Page} from '@playwright/test';
import type {WechatOperationControls} from './wechat-browser-source';
type IdentityShape={schema:string;eligibleOrigin:boolean;eligiblePath:boolean;documentReadyState:string;exactLoginMessage:boolean;documentIdCount:number;visibleDocumentIdCount:number;documentNameCount:number;visibleDocumentNameCount:number;idTextPresent:boolean;clipboardPresent:boolean;clipboardMatches:boolean;nameTextPresent:boolean;visibleShadowHostCount:number;uniqueOpenShadow:boolean;visibleShadowIdCount:number|null;visibleShadowNameCount:number|null};

export async function observeIdentityShape(page:Page,controls:WechatOperationControls):Promise<void>{
 controls.signal.throwIfAborted();
 const timeoutMs=controls.timeoutMs(120000);
 let timer:ReturnType<typeof setTimeout>|undefined;
 let onAbort:(()=>void)|undefined;
 try{
  const observation=await Promise.race([
   // 固定纯JS文本，不把转译器生成的__name等服务端helper送进页面。
   Promise.resolve().then(()=>{
    controls.signal.throwIfAborted();controls.timeoutMs(120000);
    return page.evaluate<IdentityShape>(`(()=>{
    function visible(node){
     if(!node.isConnected||!node.getClientRects().length||node.closest('[hidden],script,style,template,noscript'))return false;
     for(let parent=node;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden')return false;}
     return true;
    }
    function count(root,selector){return Math.min(1000,root.querySelectorAll(selector).length);}
    function visibleCount(root,selector){return Math.min(1000,[...root.querySelectorAll(selector)].filter(visible).length);}
    const eligibleOrigin=location.origin==='https://channels.weixin.qq.com';
    const eligiblePath=location.pathname==='/platform';
    const ids=[...document.querySelectorAll('#finder-uid-copy.finder-uniq-id')].filter(visible);
    const names=[...document.querySelectorAll('h2.finder-nickname')].filter(visible);
    const hosts=[...document.querySelectorAll('wujie-app')].filter(visible);
    const shadow=hosts.length===1?hosts[0].shadowRoot:null;
    const idTextPresent=ids.length===1&&!!ids[0].textContent?.trim();
    const clipboardPresent=ids.length===1&&!!ids[0].getAttribute('data-clipboard-text')?.trim();
    const clipboardMatches=ids.length===1&&idTextPresent&&clipboardPresent&&ids[0].textContent?.trim()===ids[0].getAttribute('data-clipboard-text')?.trim();
    const nameTextPresent=names.length===1&&!!names[0].textContent?.trim();
    const exactLoginMessage=[...document.querySelectorAll('h1,h2,h3,p,span,div')].some(node=>visible(node)&&['扫码登录','微信扫码登录','请使用微信扫描二维码登录'].includes(node.innerText?.trim()??''));
    return {
     schema:'t1110-identity-shape/v1',eligibleOrigin,eligiblePath,documentReadyState:document.readyState,
     exactLoginMessage,documentIdCount:count(document,'#finder-uid-copy.finder-uniq-id'),visibleDocumentIdCount:Math.min(1000,ids.length),
     documentNameCount:count(document,'h2.finder-nickname'),visibleDocumentNameCount:Math.min(1000,names.length),
     idTextPresent,clipboardPresent,clipboardMatches,nameTextPresent,
     visibleShadowHostCount:Math.min(1000,hosts.length),uniqueOpenShadow:shadow?.mode==='open',
     visibleShadowIdCount:shadow?.mode==='open'?visibleCount(shadow,'#finder-uid-copy.finder-uniq-id'):null,
     visibleShadowNameCount:shadow?.mode==='open'?visibleCount(shadow,'h2.finder-nickname'):null,
    };
   })()`);
   }),
   new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('RESEARCH_SHAPE_OBSERVATION_TIMEOUT')),timeoutMs);
    onAbort=()=>reject(controls.signal.reason);controls.signal.addEventListener('abort',onAbort,{once:true});if(controls.signal.aborted)onAbort();
   }),
  ]);
  controls.signal.throwIfAborted();controls.timeoutMs(120000);
  // 这里只返回固定布尔和有界数量。即使SDK返回错误形状，也不得回显异常正文。
  const expected=['schema','eligibleOrigin','eligiblePath','documentReadyState','exactLoginMessage','documentIdCount','visibleDocumentIdCount','documentNameCount','visibleDocumentNameCount','idTextPresent','clipboardPresent','clipboardMatches','nameTextPresent','visibleShadowHostCount','uniqueOpenShadow','visibleShadowIdCount','visibleShadowNameCount'];
  const bools=['eligibleOrigin','eligiblePath','exactLoginMessage','idTextPresent','clipboardPresent','clipboardMatches','nameTextPresent','uniqueOpenShadow'] as const;
  const counts=['documentIdCount','visibleDocumentIdCount','documentNameCount','visibleDocumentNameCount','visibleShadowHostCount'] as const;
  const nullableCounts=['visibleShadowIdCount','visibleShadowNameCount'] as const;
  if(!observation||Object.keys(observation).length!==expected.length||Object.keys(observation).some(k=>!expected.includes(k))||observation.schema!=='t1110-identity-shape/v1')throw Error('RESEARCH_SHAPE_INVALID');
  if(!['loading','interactive','complete'].includes(observation.documentReadyState)||bools.some(k=>typeof observation[k]!=='boolean')||counts.some(k=>!Number.isSafeInteger(observation[k])||observation[k]<0||observation[k]>1000)||nullableCounts.some(k=>observation[k]!==null&&(!Number.isSafeInteger(observation[k])||observation[k]!<0||observation[k]!>1000)))throw Error('RESEARCH_SHAPE_INVALID');
  try{console.warn('[t1110-identity-shape-research]',JSON.stringify(observation));}catch{/* 不影响原失败或停止。 */}
 }catch{
  try{console.warn('[t1110-identity-shape-research]',JSON.stringify({schema:'t1110-identity-shape-unavailable/v1'}));}catch{}
 }finally{if(timer)clearTimeout(timer);if(onAbort)controls.signal.removeEventListener('abort',onAbort);}
}

// 集成点，仅wechatVideo原identityFields的IDENTITY_MISSING时：
// catch(error) {
//  if(platform==='wechatVideo'&&error instanceof WechatBrowserSourceError&&error.code==='IDENTITY_MISSING') {
//   try{await observeIdentityShape(page,controls);}catch{/* 保原错误和停止路径。 */}
//  }
//  throw error; // 原错误、原signal、原deadline、原onStopped不变。
// }
