import type {Frame,Page,Response,Request,Locator,ElementHandle} from '@playwright/test';
import type {NativeReportKind,NativeReportPayload} from '@creatoros/contract';
import {setTimeout as delay} from 'node:timers/promises';
import {canRetryWechatVideoIdentityContext,WechatBrowserSourceError,type WechatCreatorPlatform,type WechatIdentityWitness,type WechatOperationControls,type WechatReportPageState,type WechatReportWitness,type WechatSectionObservation,type WechatIdentityObservation,type WechatIdentityRootObservation} from './wechat-browser-source';

// T1110 2026-10-09普通账号页/原生详情实测。只核身份、日期、响应和完整性，不做语义选择。
// SEMANTIC_BOUNDARY_ALLOW: DOM标签、日期格式和原生响应为固定协议，不解释内容或推断指标累计口径。
const origins={wechatOfficial:'https://mp.weixin.qq.com',wechatVideo:'https://channels.weixin.qq.com'};
const paths={officialContent:'/misc/appmsganalysis',officialFollowers:'/misc/useranalysis',channelsDaily:'/platform/statistic/post',channelsFollowers:'/platform/statistic/follower',channelsWorks:'/platform/statistic/post'};
const worksEndpoint='/micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/post_list';
const detail='.filter-row:has(.filter-extra)';
const fail=(code:string,message:string):never=>{throw new WechatBrowserSourceError(code,message);};
function nativeUrl(value:string,base:string,platform:WechatCreatorPlatform):URL{
 let url:URL;try{url=new URL(value,base);}catch{return fail('SOURCE_URL_INVALID','微信普通页面链接无效');}
 if(url.origin!==origins[platform]||url.username||url.password)return fail('SOURCE_URL_INVALID','微信页面不属于当前官方会话');return url;
}
function dateSeconds(value:unknown):string|null{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>9999999999)return null;
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(value*1000));
}
const dayValid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function windowFor(now:number,work:boolean){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(now)),zero=Date.parse(today+'T00:00:00Z');
 return {startDate:new Date(zero-(work?29:30)*86400000).toISOString().slice(0,10),endDate:new Date(zero-(work?0:1)*86400000).toISOString().slice(0,10)};
}
async function observe<T>(controls:WechatOperationControls,read:(end:number)=>Promise<T|null>,code:string,requested?:number):Promise<T>{
 const end=Date.now()+controls.timeoutMs(requested);
 for(;;){controls.signal.throwIfAborted();const value=await read(end);controls.signal.throwIfAborted();if(value!==null)return value;if(Date.now()>=end)return fail(code,'微信后台数据尚未就绪，请查看原任务');await delay(250,undefined,{signal:controls.signal});}
}
/** 一次失败后的固定数字快照；不读取/返回正文、链接或身份，不改原报表选择。 */
async function readMissingSectionObservation(frame:Frame,exact:Locator,visible:Locator,controls:WechatOperationControls):Promise<WechatSectionObservation|undefined>{
 controls.signal.throwIfAborted();const timeoutMs=controls.timeoutMs(120000);
 let timer:ReturnType<typeof setTimeout>|undefined,onAbort:(()=>void)|undefined;
 const probing=Promise.resolve().then(async()=>{
  controls.signal.throwIfAborted();
  const [exactTabCount,visibleTabCount,frameElementVisible,documentState]=await Promise.all([
   exact.count(),visible.count(),
   (async()=>{const element=await frame.frameElement();try{return await element.isVisible();}finally{await element.dispose().catch(()=>{});}})(),
   frame.evaluate(()=>({documentReadyState:document.readyState,bodyTextLength:(document.body?.innerText??'').length})),
  ]);
  return {exactTabCount,visibleTabCount,frameElementVisible,...documentState};
 });
 try{
  const observation=await Promise.race([probing,new Promise<undefined>((resolve,reject)=>{
   timer=setTimeout(()=>resolve(undefined),timeoutMs);onAbort=()=>reject(controls.signal.reason);controls.signal.addEventListener('abort',onAbort,{once:true});if(controls.signal.aborted)onAbort();
  })]);
  controls.signal.throwIfAborted();controls.timeoutMs(120000);return observation;
 }finally{if(timer)clearTimeout(timer);if(onAbort)controls.signal.removeEventListener('abort',onAbort);}
}
export async function readWechatIdentityDom(page:Page,platform:WechatCreatorPlatform,onObservation?:(value:WechatIdentityObservation)=>void,observeWrongPath=false,verifyWrongPath=false){
 const url=nativeUrl(page.url(),origins[platform],platform);
 const notify=(value:WechatIdentityObservation|undefined)=>{if(value)try{void Promise.resolve(onObservation?.(value)).catch(()=>{});}catch{/* 形状观察不能替换原identity。 */}};
 if(verifyWrongPath&&url.pathname==='/platform')return null;
 const identityPage=!observeWrongPath&&url.pathname===(platform==='wechatOfficial'?'/cgi-bin/settingpage':'/platform');
 if(!identityPage&&!(platform==='wechatVideo'&&(observeWrongPath||verifyWrongPath))){
  if(platform==='wechatVideo'&&onObservation)notify({routeClass:({'/':'official_root','/platform/':'identity_slash','/platform/statistic/post':'platform_post','/platform/statistic/follower':'platform_follower','/micro/statistic/post':'micro_post','/micro/statistic/follower':'micro_follower'} as Record<string,WechatIdentityObservation['routeClass']>)[url.pathname]??'official_other',loginPromptVisible:null,qrLoginFrameRaw:null,qrLoginFrameVisible:null,routeUnchanged:true,readyState:'unknown',rootScan:'not_run',frameCount:null,foreignFrameCount:null,unknownShadowCount:null,truncated:false,roots:[]});
  return null;
 }
 const result=await page.evaluate(({platform,diagnose,identityPage,sourcePath,verifyWrongPath})=>{
  const visible=(node:Element)=>!node.closest('[hidden]')&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden'&&node.getClientRects().length>0;
  if(platform==='wechatVideo'){
   const promptVisible=(node:Element)=>{
    if(!node.getClientRects().length||node.closest('[hidden],script,style,template,noscript')||getComputedStyle(node).visibility==='hidden')return false;
    for(let parent:Element|null=node;parent;parent=parent.parentElement)if(getComputedStyle(parent).display==='none')return false;
    return true;
   };
   const readQrFrames=()=>{
    const frames=[...document.querySelectorAll('iframe')].filter(frame=>{
     const rawSrc=frame.getAttribute('src')??'';
     try{const src=new URL(rawSrc,location.href);return src.origin==='https://open.weixin.qq.com'&&src.pathname==='/connect/qrconnect'&&!src.username&&!src.password;}catch{return false;}
    });
    return {raw:Math.min(1000,frames.length),visible:Math.min(1000,frames.filter(promptVisible).length),truncated:frames.length>1000};
   };
   const metadata=(readLoginPrompt:boolean,knownQr?:{raw:number;visible:number;truncated:boolean}):WechatIdentityObservation|undefined=>{
    // 只读官方当前快照；导航到foreign时不触碰其DOM或用未知path猜登录状态。
    if(location.origin!=='https://channels.weixin.qq.com')return undefined;
    const routes:Record<string,WechatIdentityObservation['routeClass']>={'/':'official_root','/platform':'identity','/platform/':'identity_slash','/platform/statistic/post':'platform_post','/platform/statistic/follower':'platform_follower','/micro/statistic/post':'micro_post','/micro/statistic/follower':'micro_follower'};
    let loginPromptVisible:boolean|null=null,qrLoginFrameRaw:number|null=null,qrLoginFrameVisible:number|null=null,truncated=false;
    if(readLoginPrompt){
     // 与原isLoggedOut逐字同算法；此布尔只观察，false不能解释为已经登录。
     try{
      const visibleText=(node:Element)=>{
       const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text='',current:Node|null;
       while((current=walker.nextNode()))if(current.parentElement&&promptVisible(current.parentElement))text+=current.textContent??'';
       return text.trim();
      };
      loginPromptVisible=[...document.querySelectorAll('h1,h2,h3,p,span,div')].some(node=>promptVisible(node)&&['扫码登录','微信扫码登录','请使用微信扫描二维码登录'].includes(visibleText(node)));
     }catch{/* 未知提示观察保持null。 */}
     try{
      // 官方公开wxLogin.js固定入口的机械候选计数；不读query值、frameDOM或据此判断登录。
      const counts=knownQr??readQrFrames();
      qrLoginFrameRaw=counts.raw;qrLoginFrameVisible=counts.visible;truncated=counts.truncated;
     }catch{qrLoginFrameRaw=null;qrLoginFrameVisible=null;/* 读取属性/可见性未知时不能伪造0或半份计数。 */}
    }
    return {routeClass:routes[location.pathname]??'official_other',routeUnchanged:location.pathname===sourcePath,loginPromptVisible,qrLoginFrameRaw,qrLoginFrameVisible,readyState:document.readyState,rootScan:'not_run',frameCount:null,foreignFrameCount:null,unknownShadowCount:null,truncated,roots:[]};
   };
   if(!identityPage){
    if(verifyWrongPath){
     if(location.origin!=='https://channels.weixin.qq.com'||location.pathname!==sourcePath)return {identity:null};
     // 业务见证来自受信核验模式的当前DOM，独立于诊断callback/采样/cap；读取异常保原失败。
     const counts=readQrFrames();let shape:WechatIdentityObservation|undefined;
     if(diagnose)try{shape=metadata(true,counts);}catch{/* 可选观察失败不替换业务见证。 */}
     return {identity:null,loginRequired:counts.visible>0,shape};
    }
    try{return {identity:null,shape:diagnose?metadata(true):undefined};}catch{return {identity:null};}
   }
   const ids=[...document.querySelectorAll('#finder-uid-copy.finder-uniq-id')].filter(visible),names=[...document.querySelectorAll('h2.finder-nickname')].filter(visible);
   // 原顶层身份判定先完成；frame/shadow观察绝不参与准入。
   let identity:{platformIdentity:string;displayName:string}|null=null;
   if(ids.length===1&&names.length===1){
    const id=ids[0]!.textContent?.trim()??'',copied=ids[0]!.getAttribute('data-clipboard-text')?.trim();
    if(id&&copied&&id===copied)identity={platformIdentity:id,displayName:names[0]!.textContent?.trim()??''};
   }
   let shape:WechatIdentityObservation|undefined;
   if(diagnose)try{
    const base=metadata(false);if(!base)return {identity};
    const roots:WechatIdentityRootObservation[]=[],pending:Array<{root:Document|ShadowRoot;kind:WechatIdentityRootObservation['kind'];parent:number|null;visible:boolean}>=[{root:document,kind:'top',parent:null,visible:true}];
    let frameCount=0,foreignFrameCount=0,unknownShadowCount=0,truncated=false,visited=0;
    for(let cursor=0;cursor<pending.length;cursor++){
     const item=pending[cursor]!,root=item.root,index=roots.length;
     const exactIds=[...root.querySelectorAll('#finder-uid-copy.finder-uniq-id')],exactNames=[...root.querySelectorAll('h2.finder-nickname')],broadIds=[...root.querySelectorAll('#finder-uid-copy')],broadNames=[...root.querySelectorAll('.finder-nickname')];
     const validIds=exactIds.filter(visible),validNames=exactNames.filter(visible),id=validIds.length===1?validIds[0]:undefined,name=validNames.length===1?validNames[0]:undefined;
     const idText=id?.textContent?.trim(),copy=id?.getAttribute('data-clipboard-text')?.trim();
     if([exactIds.length,exactNames.length,broadIds.length,broadNames.length].some(count=>count>1000))truncated=true;
     roots.push({kind:item.kind,parent:item.parent,visible:item.visible,uidRaw:Math.min(1000,exactIds.length),uidVisible:Math.min(1000,validIds.length),nameRaw:Math.min(1000,exactNames.length),nameVisible:Math.min(1000,validNames.length),uidIdRaw:Math.min(1000,broadIds.length),uidIdVisible:Math.min(1000,broadIds.filter(visible).length),nameClassRaw:Math.min(1000,broadNames.length),nameClassVisible:Math.min(1000,broadNames.filter(visible).length),idTextPresent:id?!!idText:null,copyPresent:id?!!copy:null,copyMatches:id?!!idText&&!!copy&&idText===copy:null,namePresent:name?!!name.textContent?.trim():null,uidInRoot:id?Node.prototype.getRootNode.call(id)===root:null,nameInRoot:name?Node.prototype.getRootNode.call(name)===root:null});
     const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);
     for(let node=walker.nextNode() as Element|null;node;node=walker.nextNode() as Element|null){
      if(++visited>2000){truncated=true;break;}
      let child:Document|ShadowRoot|null=null,kind:WechatIdentityRootObservation['kind']='openShadow';
      if(node.localName==='iframe'){
       frameCount++;if(frameCount>1000){frameCount=1000;truncated=true;}kind='frame';
       try{const frame=node as HTMLIFrameElement;if(frame.contentWindow?.location.origin===location.origin)child=frame.contentDocument;else {foreignFrameCount++;if(foreignFrameCount>1000){foreignFrameCount=1000;truncated=true;}}}catch{foreignFrameCount++;if(foreignFrameCount>1000){foreignFrameCount=1000;truncated=true;}}
      }else if(node.shadowRoot)child=node.shadowRoot;
      else if(node.localName.includes('-')){unknownShadowCount++;if(unknownShadowCount>1000){unknownShadowCount=1000;truncated=true;}}
      if(child){if(pending.length<8)pending.push({root:child,kind,parent:index,visible:item.visible&&visible(node)});else truncated=true;}
     }
     if(visited>2000)break;
    }
    shape={...base,rootScan:truncated?'limited':'complete',frameCount,foreignFrameCount,unknownShadowCount,truncated,roots};
   }catch{/* 可选元数据失败只省略观察；保留上方原identity。 */}
   return {identity,shape};
  }
  const items=[...document.querySelectorAll('li.weui-desktop-setting__item')].filter(visible);
  const values=(label:string)=>items.filter(item=>item.querySelector('.weui-desktop-setting__item__label')?.textContent?.trim()===label).map(item=>item.querySelector('.weui-desktop-setting__item__info')?.textContent?.trim()??'');
  const ids=values('AppID'),names=values('名称');
  if(ids.length!==1||names.length!==1||!/^wx[0-9a-zA-Z]+$/.test(ids[0]!))return {identity:null};
  return {identity:{platformIdentity:ids[0]!,displayName:names[0]!}};
 },{platform,diagnose:platform==='wechatVideo'&&!!onObservation,identityPage,sourcePath:url.pathname,verifyWrongPath});
 if(platform==='wechatVideo'){
  const current=observeWrongPath||verifyWrongPath?nativeUrl(page.url(),origins.wechatVideo,'wechatVideo'):url;
  if(result.shape&&current.pathname!==url.pathname)result.shape.routeUnchanged=false;notify(result.shape);
  if(verifyWrongPath&&'loginRequired' in result&&result.loginRequired&&current.pathname===url.pathname)return fail('LOGIN_REQUIRED','微信后台需要本人重新登录');
 }
 const information=result.identity;
 return information?.displayName?{...information,platform,sourcePath:url.pathname}:null;
}
/** SEMANTIC_BOUNDARY_ALLOW: 仅识别已实证的Playwright导航协议异常，不判断登录、身份或内容。 */
async function readOfficialIdentityFields(page:Page,controls:WechatOperationControls){
 try{return await readWechatIdentityDom(page,'wechatOfficial');}
 catch(error){
  controls.signal.throwIfAborted();
  // 只在公众号字段观察的同一Page上等待新上下文；入口另有独立窄协议，报表和其它错误原样失败。
  if(!(error instanceof Error)||error.name!=='Error'||
   !/Execution context was destroyed, most likely because of a navigation\.?$/.test(error.message)||page.isClosed())throw error;
  try{nativeUrl(page.url(),origins.wechatOfficial,'wechatOfficial');}catch{throw error;}
  return null; // 外层observe保留原end，不能因导航重建480000观察窗口。
 }
}
/** SEMANTIC_BOUNDARY_ALLOW: 仅恢复已实证locator.evaluateAll同页导航协议，入口end只建一次。 */
async function navigateOfficialIdentityEntry(page:Page,controls:WechatOperationControls){
 const check=(end:number)=>{controls.signal.throwIfAborted();controls.timeoutMs();if(Date.now()>=end)return fail('ENTRY_NOT_READY','微信后台数据尚未就绪，请查看原任务');};
 const current=()=>{if(page.isClosed())return fail('BROWSER_OPERATION_FAILED','微信账号身份暂未核对完成，请查看原任务');return nativeUrl(page.url(),origins.wechatOfficial,'wechatOfficial');};
 const entry=await observe(controls,async end=>{
  check(end);const before=current();if(before.pathname==='/cgi-bin/settingpage')return {end,href:null};
  let hrefs:string[];
  try{hrefs=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')).filter((v):v is string=>!!v));}
  catch(error){
   check(end);
   if(!(error instanceof Error)||error.name!=='Error'||!/^locator\.evaluateAll: Execution context was destroyed, most likely because of a navigation\.?(?:\r?\n|$)/.test(error.message)||page.isClosed())throw error;
   try{nativeUrl(page.url(),origins.wechatOfficial,'wechatOfficial');}catch{throw error;}
   return null;
  }
  check(end);const after=current();if(after.pathname==='/cgi-bin/settingpage')return {end,href:null};
  if(after.href!==before.href)return null; // 自动跳转后不采用旧DOM href。
  const valid=hrefs.flatMap(href=>{try{const url=nativeUrl(href,after.href,'wechatOfficial');return url.pathname==='/cgi-bin/settingpage'?[url.href]:[];}catch{return [];}});
  const unique=[...new Set(valid)];return unique.length===1?{end,href:unique[0]!}:null;
 },'ENTRY_NOT_READY',480000);
 check(entry.end);if(current().pathname==='/cgi-bin/settingpage')return;
 if(!entry.href)return fail('ENTRY_NOT_READY','微信后台数据尚未就绪，请查看原任务');
 // goto在恢复catch之外；未证导航中断/网络错误仍结束原任务，不新增导航重试。
 const inherited=controls.timeoutMs(),remaining=entry.end-Date.now();if(remaining<=0)return fail('ENTRY_NOT_READY','微信后台数据尚未就绪，请查看原任务');
 await page.goto(entry.href,{waitUntil:'domcontentloaded',timeout:Math.min(inherited,remaining)});
 check(entry.end);current();
}
type RenderedShadow={pagePath:string;section:string};
type WorksObservation={selection:NativeReportPayload['selection'];reportedRows:number};
export async function readWechatReportDom(scope:Page|Frame,kind:NativeReportKind,works?:WorksObservation,shadow?:RenderedShadow):Promise<WechatReportPageState|null>{
 const official=kind.startsWith('official'),platform=official?'wechatOfficial':'wechatVideo';
 const url=nativeUrl(scope.url(),origins[platform],platform);
 if(official&&url.pathname!==paths[kind]||!official&&url.pathname!==(kind==='channelsFollowers'?'/micro/statistic/follower':'/micro/statistic/post'))return null;
 const raw=await scope.evaluate(({kind,official,shadow})=>{
  const visible=(node:Element)=>!node.closest('[hidden]')&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden'&&node.getClientRects().length>0;
  let root:Document|ShadowRoot=document;
  if(shadow){
   const parent=window.parent as Window & typeof globalThis;
   if(parent.location.origin!=='https://channels.weixin.qq.com'||parent.location.pathname!==shadow.pagePath)return null;
   const hosts=[...parent.document.querySelectorAll('wujie-app')].filter(node=>node.getClientRects().length>0&&!node.closest('[hidden]')&&parent.getComputedStyle(node).display!=='none'&&parent.getComputedStyle(node).visibility!=='hidden');
   const rendered=hosts.length===1?hosts[0]!.shadowRoot:null;if(!rendered||rendered.mode!=='open')return null;
   const nodes=[...document.querySelectorAll('*')].filter(node=>visible(node)&&node.textContent?.trim()===shadow.section&&![...node.children].some(child=>child.textContent?.trim()===shadow.section));
   // Wujie会改写getRootNode/ownerDocument；原生contains才核实际可见根。
   if(nodes.length!==1||!parent.Node.prototype.contains.call(rendered,nodes[0]!))return null;
   root=rendered;
  }
  if([...root.querySelectorAll('.ant-spin-spinning,.weui-desktop-loading')].some(visible))return null;
  const dateCells=(selector:string)=>[...root.querySelectorAll(selector)].filter(visible).map(td=>td.textContent?.trim()??'').filter(v=>/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(v)).map(v=>v.replaceAll('/','-'));
  if(official){
   const values=[...new Set([...root.querySelectorAll('input.weui-desktop-form__input')].filter(visible).map(input=>(input as HTMLInputElement).value).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)))].sort();
   const label=kind==='officialContent'?'下载数据明细':'下载表格';
   const links=[...root.querySelectorAll('a[href]')].filter(a=>visible(a)&&a.textContent?.trim()===label);
   if(values.length!==2||links.length!==1)return null;
   return {values,href:(links[0] as HTMLAnchorElement).href,dates:dateCells('table.weui-desktop-table__core-table td')};
  }
  const filters=[...root.querySelectorAll('.filter-row')].filter(row=>visible(row)&&row.querySelector('.filter-extra'));
  if(filters.length!==1||!filters[0]!.querySelector('input[value="2"]:checked'))return null;
  const dates=dateCells('.ant-table-body td');
  if(kind==='channelsWorks'){
   const counts=[...root.querySelectorAll('.card-title .info')].filter(visible).map(x=>/^共\s*(\d+)\s*条视频$/.exec(x.textContent?.trim()??''));
   if(counts.length!==1||!counts[0])return null;
   return {dates,reportedRows:Number(counts[0][1]),visibleRows:dates.length};
  }
  return {dates};
 },{kind,official,shadow});
 if(!raw)return null;
 if(official){
  if(!('values' in raw)||!raw.values||!('href' in raw)||!raw.href)return null;
  const [startDate,endDate]=raw.values;if(!startDate||!endDate||!dayValid(startDate)||!dayValid(endDate)||startDate>endDate)return null;
  const href=nativeUrl(raw.href,url.href,platform);if(href.pathname!==paths[kind])return null;
  let first:string|null,last:string|null;
  if(kind==='officialContent'){
   if(href.searchParams.get('action')!=='download_summary_tendency')return null;
   first=dateSeconds(Number(href.searchParams.get('begin_timestamp')));last=dateSeconds(Number(href.searchParams.get('end_timestamp')));
  }else{first=href.searchParams.get('begin_date');last=href.searchParams.get('end_date');}
  if(first!==startDate||last!==endDate)return null;
  return {selection:{startDate,endDate,timeZone:'Asia/Shanghai',meaning:'statisticsDates'},dates:raw.dates,windowEvidence:{kind:'nativeDateInputs',startDate,endDate}};
 }
 if(kind==='channelsWorks'){
  if(!works||!('reportedRows' in raw)||raw.reportedRows!==works.reportedRows||!('visibleRows' in raw)||raw.visibleRows===undefined||raw.visibleRows>works.reportedRows)return null;
  return {selection:works.selection,dates:raw.dates,selectedWindow:true,reportedRows:raw.reportedRows,visibleRows:raw.visibleRows};
 }
 const dates=[...new Set(raw.dates)].sort();if(!dates.length||dates.some(v=>!dayValid(v)))return null;
 return {selection:{startDate:dates[0]!,endDate:dates.at(-1)!,timeZone:'Asia/Shanghai',meaning:'statisticsDates'},dates};
}
export async function readChannelsWorksResponse(response:Response,frame:Frame,controls:WechatOperationControls):Promise<WorksObservation>{
 controls.signal.throwIfAborted();let body:{errCode?:unknown;data?:{totalCount?:unknown;list?:unknown}},selection:NativeReportPayload['selection'];
 try{
  const url=nativeUrl(response.url(),origins.wechatVideo,'wechatVideo'),request=response.request();
  if(url.pathname!==worksEndpoint||response.status()!==200||request.method()!=='POST'||request.frame()!==frame)return fail('REPORT_RESPONSE_INVALID','单篇视频原生响应未对应当前页面');
  const data=request.postDataJSON() as {startTime?:unknown;endTime?:unknown;pageSize?:unknown;currentPage?:unknown};
  const startDate=dateSeconds(data.startTime),endDate=dateSeconds(data.endTime);
  if(!startDate||!endDate||startDate>endDate||data.currentPage!==1||data.pageSize!==10)return fail('REPORT_RESPONSE_INVALID','单篇视频原生日期协议无效');
  const result=await response.finished();controls.signal.throwIfAborted();if(result)return fail('REPORT_RESPONSE_INVALID','单篇视频原生响应未完成');
  body=await response.json();selection={startDate,endDate,timeZone:'Asia/Shanghai',meaning:'publishedDates'};
 }catch(error){if(error instanceof WechatBrowserSourceError||controls.signal.aborted)throw error;return fail('REPORT_RESPONSE_INVALID','单篇视频原生响应无法核对');}
 const count=body?.data?.totalCount;
 if(body?.errCode!==0||typeof count!=='number'||!Number.isSafeInteger(count)||count<0||count>10000||!Array.isArray(body.data?.list)||body.data.list.length!==Math.min(count,10))return fail('REPORT_RESPONSE_INVALID','单篇视频原生总数无法核对');
 return {selection,reportedRows:count};
}
export function createVerifiedWechatDomWitnesses(options:{now?:()=>number}={}):{identityWitness:WechatIdentityWitness;reportWitness:WechatReportWitness}{
 const identityWitness:WechatIdentityWitness={
  async isLoggedOut(page,platform,controls){
   controls.signal.throwIfAborted();nativeUrl(page.url(),origins[platform],platform);
   // 只使用官方页明确的扫码登录提示，缺字段/网络错误不是Cookie过期证据。
   return page.evaluate(()=>{
    const visible=(node:Element)=>{
     if(!node.getClientRects().length||node.closest('[hidden],script,style,template,noscript')||getComputedStyle(node).visibility==='hidden')return false;
     for(let parent:Element|null=node;parent;parent=parent.parentElement)if(getComputedStyle(parent).display==='none')return false;
     return true;
    };
    const visibleText=(node:Element)=>{
     const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text='',current:Node|null;
     while((current=walker.nextNode()))if(current.parentElement&&visible(current.parentElement))text+=current.textContent??'';
     return text.trim();
    };
    return [...document.querySelectorAll('h1,h2,h3,p,span,div')].some(node=>visible(node)&&['扫码登录','微信扫码登录','请使用微信扫描二维码登录'].includes(visibleText(node)));
   });
  },
  async read(page,platform,controls){
   if(platform==='wechatVideo')await page.goto(origins[platform]+'/platform',{waitUntil:'domcontentloaded',timeout:controls.timeoutMs()});
   else if(nativeUrl(page.url(),origins[platform],platform).pathname!=='/cgi-bin/settingpage')await navigateOfficialIdentityEntry(page,controls);
   if(platform==='wechatOfficial')return observe(controls,()=>readOfficialIdentityFields(page,controls),'FIELDS_NOT_READY',480000);
   let wrongPathStarted:number|undefined,nextOpportunity=0;
   const opportunities=[0,1000,3000,7000];
   return observe(controls,async end=>{
    const check=()=>{controls.signal.throwIfAborted();controls.timeoutMs();if(Date.now()>=end)return fail('IDENTITY_MISSING','微信后台数据尚未就绪，请查看原任务');};
    check();const wrongPath=nativeUrl(page.url(),origins.wechatVideo,'wechatVideo').pathname!=='/platform';
    let sampleWrongPath=false;
    if(wrongPath&&controls.onIdentityObservation){
     wrongPathStarted??=Date.now();const elapsed=Date.now()-wrongPathStarted;
     if(nextOpportunity<opportunities.length&&elapsed>=opportunities[nextOpportunity]!){
      // 机会先消耗，跨过的时点不catchup；每个原poll最多一次，绝不补偿失败。
      while(nextOpportunity+1<opportunities.length&&elapsed>=opportunities[nextOpportunity+1]!)nextOpportunity++;
      nextOpportunity++;sampleWrongPath=true;
     }
    }
    const verifyWrongPath=wrongPath&&controls.identityVerification==='boundIdentity';
    if(sampleWrongPath||verifyWrongPath){
     let accepting=true,timer:ReturnType<typeof setTimeout>|undefined,onAbort:(()=>void)|undefined;
     try{
      const pending=Promise.resolve().then(()=>{
       check();if(nativeUrl(page.url(),origins.wechatVideo,'wechatVideo').pathname==='/platform')return null;
       return readWechatIdentityDom(page,platform,sampleWrongPath?value=>{if(!accepting)return;check();nativeUrl(page.url(),origins.wechatVideo,'wechatVideo');controls.onIdentityObservation?.(value);}:undefined,true,verifyWrongPath);
      });
      await Promise.race([pending,new Promise<null>((resolve,reject)=>{
       const remaining=end-Date.now();timer=setTimeout(()=>resolve(null),Math.max(0,Math.min(remaining,controls.timeoutMs(remaining))));
       onAbort=()=>reject(controls.signal.reason);controls.signal.addEventListener('abort',onAbort,{once:true});if(controls.signal.aborted)onAbort();
      })]);
      check();nativeUrl(page.url(),origins.wechatVideo,'wechatVideo');return null;
     }catch(error){check();if(verifyWrongPath&&!canRetryWechatVideoIdentityContext(page,error,controls))throw error;return null;}
     finally{accepting=false;if(timer)clearTimeout(timer);if(onAbort)controls.signal.removeEventListener('abort',onAbort);}
    }
    try{const value=await readWechatIdentityDom(page,platform,wrongPath?undefined:value=>{check();controls.onIdentityObservation?.(value);});check();return value;}
    catch(error){check();if(!canRetryWechatVideoIdentityContext(page,error,controls))throw error;return null;}
   },'IDENTITY_MISSING',480000);
  },
 };
 const reportWitness:WechatReportWitness={async prepare(page,platform,kind,controls){
  if(!Object.prototype.hasOwnProperty.call(paths,kind)||platform!==(kind.startsWith('official')?'wechatOfficial':'wechatVideo'))return fail('REPORT_PLATFORM_MISMATCH','报表不属于当前平台');
  controls.signal.throwIfAborted();controls.timeoutMs();
  const current=nativeUrl(page.url(),origins[platform],platform),sourcePath=paths[kind];
  const target=windowFor((options.now??Date.now)(),kind==='channelsWorks');
  if(platform==='wechatOfficial'){
   const hrefs=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')).filter((v):v is string=>!!v));
   const targets=hrefs.flatMap(href=>{try{const url=nativeUrl(href,current.href,platform);return url.pathname===sourcePath?[url.href]:[];}catch{return [];}});
   const unique=[...new Set(targets)];if(unique.length>1)return fail('REPORT_LINK_AMBIGUOUS','原生报表入口不唯一');
   if(!unique.length)return fail('REPORT_LINK_MISSING','当前页面没有原生报表入口');
   await page.goto(unique[0]!,{waitUntil:'domcontentloaded',timeout:controls.timeoutMs()});
  }else if(current.pathname!==sourcePath){
   // SEMANTIC_BOUNDARY_ALLOW: 只用既有kind→固定官方父路由协议，不按图标/文本猜导航或平台权限。
   const response=await page.goto(new URL(sourcePath,origins.wechatVideo).href,{waitUntil:'domcontentloaded',timeout:controls.timeoutMs(120000)});
   controls.signal.throwIfAborted();controls.timeoutMs();nativeUrl(page.url(),origins.wechatVideo,'wechatVideo');
   const loggedOut=await identityWitness.isLoggedOut(page,'wechatVideo',controls);
   controls.signal.throwIfAborted();controls.timeoutMs();
   if(loggedOut)return fail('LOGIN_REQUIRED','微信后台需要本人重新登录');
   // 仅复用原boundIdentity错路径QR业务见证；不读报表页身份、不再goto身份首页。
   try{await readWechatIdentityDom(page,'wechatVideo',undefined,true,true);}
   catch(error){controls.signal.throwIfAborted();controls.timeoutMs();nativeUrl(page.url(),origins.wechatVideo,'wechatVideo');throw error;}
   controls.signal.throwIfAborted();controls.timeoutMs();
   const landed=nativeUrl(page.url(),origins.wechatVideo,'wechatVideo');
   if(landed.pathname!==sourcePath||response&&response.status()>=400)return fail('REPORT_PAGE_MISSING','原生报表页面尚未就绪，请查看原任务');
  }
  let scope:Page|Frame=page,uiRoot:Page|Frame|Locator=page,works:WorksObservation|undefined,shadow:RenderedShadow|undefined;
  let host:ElementHandle<Element>|null=null,frameElement:ElementHandle<Node>|undefined;
  const rootReady=async()=>{
   controls.signal.throwIfAborted();controls.timeoutMs();
   if(platform!=='wechatVideo')return true;
   if(nativeUrl(page.url(),origins[platform],platform).pathname!==sourcePath)return false;
   const framePath=kind==='channelsFollowers'?'/micro/statistic/follower':'/micro/statistic/post';
   const frames=page.frames().filter(frame=>{try{return nativeUrl(frame.url(),origins[platform],platform).pathname===framePath;}catch{return false;}});
   if(frames.length!==1||frames[0]!==scope)return false;
   if(host){
    const same=await host.evaluate(node=>{
     const visible=(node:Element)=>node.isConnected&&!node.closest('[hidden]')&&node.getClientRects().length>0&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden';
     const hosts=[...document.querySelectorAll('wujie-app')].filter(visible);
     return hosts.length===1&&hosts[0]===node&&node.shadowRoot?.mode==='open';
    });controls.signal.throwIfAborted();if(!same)return false;
    const associated=await scope.evaluate(({pagePath,section})=>{
     const parent=window.parent as Window & typeof globalThis;
     if(parent.location.origin!=='https://channels.weixin.qq.com'||parent.location.pathname!==pagePath)return false;
     const visible=(node:Element)=>!node.closest('[hidden]')&&node.getClientRects().length>0&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden';
     const hosts=[...parent.document.querySelectorAll('wujie-app')].filter(node=>node.getClientRects().length>0&&!node.closest('[hidden]')&&parent.getComputedStyle(node).display!=='none'&&parent.getComputedStyle(node).visibility!=='hidden');
     const root=hosts.length===1?hosts[0]!.shadowRoot:null;
     const nodes=[...document.querySelectorAll('*')].filter(node=>visible(node)&&node.textContent?.trim()===section&&![...node.children].some(child=>child.textContent?.trim()===section));
     return !!root&&root.mode==='open'&&nodes.length===1&&parent.Node.prototype.contains.call(root,nodes[0]!);
    },shadow!);controls.signal.throwIfAborted();return associated;
   }
   const visible=await frameElement?.isVisible();controls.signal.throwIfAborted();return visible===true;
  };
  const assertRoot=async()=>{if(!await rootReady())return fail('REPORT_NOT_READY','当前数据面板已变化，请查看原任务');};
  if(platform==='wechatVideo'){
   const framePath=kind==='channelsFollowers'?'/micro/statistic/follower':'/micro/statistic/post';
   scope=await observe(controls,async()=>{const frames=page.frames().filter(frame=>{try{const u=nativeUrl(frame.url(),origins[platform],platform);return u.pathname===framePath;}catch{return false;}});if(frames.length>1)return fail('REPORT_PAGE_MISSING','原生报表页面不唯一');return frames.length===1?frames[0]!:null;},'REPORT_PAGE_MISSING');
   uiRoot=scope;
   const section=kind==='channelsDaily'?'全部视频':kind==='channelsWorks'?'单篇视频':'关注者增长';
   let exactTab=scope.getByText(section,{exact:true}),tab=exactTab.filter({visible:true});
   try{
    await observe(controls,async()=>{
     const hosts=page.locator('wujie-app').filter({visible:true}),hostCount=await hosts.count();
     if(hostCount>1)return fail('REPORT_SECTION_AMBIGUOUS','原生数据面板不唯一');
     if(hostCount===1&&!host){
      const candidate=hosts.getByText(section,{exact:true}).filter({visible:true}),count=await candidate.count();
      if(count>1)return fail('REPORT_SECTION_AMBIGUOUS','原生报表标签不唯一');
      if(count===1){host=await hosts.elementHandle({timeout:controls.timeoutMs()});if(!host)return null;shadow={pagePath:sourcePath,section};uiRoot=hosts;exactTab=hosts.getByText(section,{exact:true});tab=exactTab.filter({visible:true});}
     }
     const count=await tab.count();controls.signal.throwIfAborted();
     if(count>1)return fail('REPORT_SECTION_AMBIGUOUS','原生报表标签不唯一');
     if(count!==1)return null;
     if(host)return await rootReady()?true:null;
     frameElement??=await (scope as Frame).frameElement();return await rootReady()?true:null;
    },'REPORT_SECTION_MISSING');
   }catch(error){
    controls.signal.throwIfAborted();
    if(!(error instanceof WechatBrowserSourceError)||error.code!=='REPORT_SECTION_MISSING')throw error;
    // 原五字段仍严格来自同Frame；可见Shadow分支不拼接两种根的诊断。
    if(!host)try{const observation=await readMissingSectionObservation(scope as Frame,exactTab,tab,controls);controls.signal.throwIfAborted();controls.timeoutMs(120000);if(observation)error.observation=observation;}
    catch{controls.signal.throwIfAborted();controls.timeoutMs(120000);}
    throw error;
   }
   await assertRoot();await tab.click({timeout:controls.timeoutMs()});
   const thirty=uiRoot.locator(detail+' label:has(input[value="2"])').filter({visible:true}),seven=uiRoot.locator(detail+' label:has(input[value="1"])').filter({visible:true});
   await observe(controls,async()=>await thirty.count()===1&&await seven.count()===1?true:null,'REPORT_WINDOW_MISSING');
   await assertRoot();await seven.click({timeout:controls.timeoutMs()});
   if(kind==='channelsWorks'){
    await assertRoot();
    const frame=scope as Frame,newRequests=new Set<Request>();
    const observeRequest=(request:Request)=>{try{if(request.frame()===frame)newRequests.add(request);}catch{/* 没有实际frame的无关请求不构成此窗口证据。 */}};
    page.on('request',observeRequest);
    try{
     const pending=page.waitForResponse(response=>{try{
      const request=response.request(),url=nativeUrl(response.url(),origins[platform],platform),data=request.postDataJSON() as {startTime?:unknown;endTime?:unknown};
      return newRequests.has(request)&&url.pathname===worksEndpoint&&request.frame()===frame&&dateSeconds(data.startTime)===target.startDate&&dateSeconds(data.endTime)===target.endDate;
     }catch{return false;}},{timeout:controls.timeoutMs()});void pending.catch(()=>{});
     await thirty.click({timeout:controls.timeoutMs()});works=await readChannelsWorksResponse(await pending,frame,controls);
    }finally{page.off('request',observeRequest);}
   }else{await assertRoot();await thirty.click({timeout:controls.timeoutMs()});}
  }
  const read=async()=>{if(!await rootReady())return null;const state=await readWechatReportDom(scope,kind,works,shadow);controls.signal.throwIfAborted();return await rootReady()?state:null;};
  const state=await observe(controls,async()=>{
   const state=await read();if(!state)return null;
   if(platform==='wechatVideo'){
    if(state.selection.startDate!==target.startDate||state.selection.endDate!==target.endDate)return null;
    if(kind!=='channelsWorks'&&new Set(state.dates).size!==30)return null;
   }
   return state;
  },'REPORT_NOT_READY');
  const label=kind==='officialContent'?'下载数据明细':'下载表格';
  const download=uiRoot.getByText(label,{exact:true}).filter({visible:true});if(await download.count()!==1)return fail('REPORT_LINK_AMBIGUOUS','原生下载入口不唯一');
  return {scope,download,state,verify:async()=>{const latest=await read();controls.signal.throwIfAborted();if(!latest||JSON.stringify(latest)!==JSON.stringify(state))return fail('REPORT_NOT_READY','下载前原生日期或总数已变化，请查看原任务');}};
 }};
 return {identityWitness,reportWitness};
}
