import type {Frame,Page,Response,Request,Locator,ElementHandle} from '@playwright/test';
import type {NativeReportKind,NativeReportPayload} from '@creatoros/contract';
import {setTimeout as delay} from 'node:timers/promises';
import {WechatBrowserSourceError,type WechatCreatorPlatform,type WechatIdentityWitness,type WechatOperationControls,type WechatReportPageState,type WechatReportWitness,type WechatSectionObservation,type WechatEntryObservation} from './wechat-browser-source';

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
// SEMANTIC_BOUNDARY_ALLOW: 只落实固定精确可访问名、DOM identity、行动资格及aria关联，不推断图标/内容含义。
function namedAction(page:Page,name:string,includeHidden=false):Locator{
 return page.getByRole('button',{name,exact:true,includeHidden}).or(page.getByRole('menuitem',{name,exact:true,includeHidden})).or(page.getByRole('link',{name,exact:true,includeHidden}));
}
function recoveryControls(page:Page,original:WechatOperationControls,end:number):WechatOperationControls{
 return {signal:original.signal,timeoutMs(requested){
  original.signal.throwIfAborted();nativeUrl(page.url(),origins.wechatVideo,'wechatVideo');
  const remaining=end-Date.now();if(remaining<=0)return fail('REPORT_LINK_MISSING','微信后台数据尚未就绪，请查看原任务');
  return Math.min(original.timeoutMs(requested),remaining);
 }};
}
async function actionableNodes(locator:Locator,op:WechatOperationControls):Promise<ElementHandle<Element>[]>{
 op.timeoutMs();const handles=await locator.elementHandles() as ElementHandle<Element>[],valid:ElementHandle<Element>[]=[];let returned=false;
 try{
  for(const handle of handles){
   op.timeoutMs();
   const actionable=await handle.isVisible()&&await handle.isEnabled()&&await handle.evaluate(node=>{
    if(!node.isConnected)return false;
    for(let current:Element|null=node;current;current=current.parentElement??((current.getRootNode() as ShadowRoot).host??null)){
     const style=getComputedStyle(current);if(current.getAttribute('role')?.trim().split(/\s+/).includes('tooltip')||current.hasAttribute('hidden')||current.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return false;
    }
    const box=node.getBoundingClientRect();if(box.width<=0||box.height<=0)return false;
    const root=node.getRootNode() as Document|ShadowRoot,hit=root.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
    return hit===node||!!hit&&node.contains(hit);
   });
   op.timeoutMs();if(!actionable)continue;
   // Locator.or是节点集合并集；再次用真实节点identity核对，不能按相同文字/坐标合并。
   if(!await handle.evaluate((node,previous)=>previous.includes(node),valid))valid.push(handle);
  }
  op.timeoutMs();returned=true;return valid;
 }finally{for(const handle of handles)if(!returned||!valid.includes(handle))await handle.dispose();}
}
/** 原initial missing结束后的独立恢复；最多hover一次，不重开旧全Page观察。 */
async function recoverCollapsedEntry(page:Page,label:string,controls:WechatOperationControls,original:WechatBrowserSourceError,progress:(phase:WechatEntryObservation['entryPhase'])=>void):Promise<void>{
 let owner:ElementHandle<Element>|undefined,selected:ElementHandle<Element>|undefined;
 const panels=new Map<string,ElementHandle<Element>|null>();let controlsValue='';let ownerName=label;
 const check=()=>{controls.signal.throwIfAborted();controls.timeoutMs();nativeUrl(page.url(),origins.wechatVideo,'wechatVideo');};
 const sameOwner=async(op:WechatOperationControls,requireUnique=false)=>{
  op.timeoutMs();
  // hover前才需再次行动资格；展开后只核原DOM/精确语义，不能要求被关联面板覆盖的旧owner仍可再hover。
  const matches=requireUnique?await actionableNodes(namedAction(page,ownerName),op):await namedAction(page,ownerName,true).elementHandles() as ElementHandle<Element>[];
  try{if(requireUnique&&matches.length!==1||!await owner!.evaluate((node,fresh)=>node.isConnected&&fresh.includes(node),matches))return fail('REPORT_NOT_READY','折叠菜单行动节点已变化');op.timeoutMs();}
  finally{for(const handle of matches)await handle.dispose();}
 };
 const binding=async(op:WechatOperationControls,initial=false)=>{
  op.timeoutMs();const value=await owner!.getAttribute('aria-controls')??'';
  if(!initial&&value!==controlsValue)return fail('REPORT_NOT_READY','折叠菜单关联已变化');
  if(initial)controlsValue=value;
  const ids=[...new Set(value.trim().split(/\s+/).filter(Boolean))];
  if(ids.length>16||value.length>1024)return fail('REPORT_NOT_READY','折叠菜单关联无法核实');
  for(const id of ids){
   const count=await owner!.evaluate((node,id)=>[...node.ownerDocument.querySelectorAll('[id]')].filter(element=>element.id===id).length,id);
   if(count>1)return fail('REPORT_NOT_READY','折叠菜单关联面板不唯一');
   const raw=await owner!.evaluateHandle((node,id)=>{const matches=[...node.ownerDocument.querySelectorAll('[id]')].filter(element=>element.id===id);return matches.length===1?matches[0]!:null;},id),current=raw.asElement() as ElementHandle<Element>|null;
   const previous=panels.get(id);
   if(previous){
    const unchanged=current&&await previous.evaluate((node,fresh)=>node===fresh,current);await raw.dispose();
    if(!unchanged)return fail('REPORT_NOT_READY','折叠菜单关联面板已变化');
   }else if(current){panels.set(id,current);}else{await raw.dispose();panels.set(id,null);}
  }
  op.timeoutMs();
 };
 const entries=async(op:WechatOperationControls)=>{
  await sameOwner(op);await binding(op);const all=await actionableNodes(namedAction(page,label),op),related:ElementHandle<Element>[]=[];let returned=false;
  try{
   for(const candidate of all){
    const included=await candidate.evaluate((node,{owner,panels})=>{
     const contains=(ancestor:Element,child:Element)=>{for(let current:Element|null=child;current;current=current.parentElement??((current.getRootNode() as ShadowRoot).host??null))if(current===ancestor)return true;return false;};
     return contains(owner,node)||panels.some(panel=>contains(panel,node));
    },{owner:owner!,panels:[...panels.values()].filter((node):node is ElementHandle<Element>=>node!==null)});
    if(included)related.push(candidate);
   }
   op.timeoutMs();returned=true;return related;
  }finally{for(const candidate of all)if(!returned||!related.includes(candidate))await candidate.dispose();}
 };
 try{
  check();
  owner=await observe(controls,async end=>{
   progress('recover_owner');const op=recoveryControls(page,controls,end);op.timeoutMs();
   const candidates=await actionableNodes(namedAction(page,label).or(namedAction(page,'数据中心')),op);
   if(candidates.length!==1){for(const handle of candidates)await handle.dispose();op.timeoutMs();return null;}
   const chosen=candidates[0]!;
   try{ownerName=await namedAction(page,label).evaluateAll((nodes,node)=>nodes.some(candidate=>candidate===node),chosen)?label:'数据中心';op.timeoutMs();return chosen;}
   catch(error){await chosen.dispose();throw error;}
  },'REPORT_LINK_MISSING',120000);
  const hoverEnd=Date.now()+controls.timeoutMs(120000),hoverOp=recoveryControls(page,controls,hoverEnd);
  progress('hover_owner');await sameOwner(hoverOp,true);await binding(hoverOp,true);hoverOp.timeoutMs();
  await owner.hover({timeout:hoverOp.timeoutMs(120000)});
  hoverOp.timeoutMs();await sameOwner(hoverOp);await binding(hoverOp);hoverOp.timeoutMs();
  selected=await observe(controls,async end=>{
   progress('wait_associated_entry');const op=recoveryControls(page,controls,end),matches=await entries(op);
   if(matches.length!==1){for(const handle of matches)await handle.dispose();op.timeoutMs();return null;}
   op.timeoutMs();return matches[0]!;
  },'REPORT_LINK_MISSING',120000);
  // 点击和父路由等待复用原各一项预算；关联观察end不充当新的点击期限。
  const clickOp=recoveryControls(page,controls,Date.now()+controls.timeoutMs(120000));
  const fresh=await entries(clickOp);
  try{if(fresh.length!==1||!await selected.evaluate((node,current)=>node===current,fresh[0]!))return fail('REPORT_NOT_READY','折叠菜单报表入口已变化');clickOp.timeoutMs();}
  finally{for(const node of fresh)await node.dispose();}
  progress('click_entry');await selected.click({timeout:clickOp.timeoutMs(120000)});clickOp.timeoutMs();check();
 }catch(error){
  check();if(error instanceof WechatBrowserSourceError&&error.code==='REPORT_LINK_MISSING'){throw original;}
  throw error;
 }finally{await selected?.dispose();await owner?.dispose();for(const node of panels.values())await node?.dispose();}
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
export async function readWechatIdentityDom(page:Page,platform:WechatCreatorPlatform){
 const url=nativeUrl(page.url(),origins[platform],platform);
 if(url.pathname!==(platform==='wechatOfficial'?'/cgi-bin/settingpage':'/platform'))return null;
 const information=await page.evaluate(platform=>{
  const visible=(node:Element)=>!node.closest('[hidden]')&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden'&&node.getClientRects().length>0;
  if(platform==='wechatVideo'){
   const ids=[...document.querySelectorAll('#finder-uid-copy.finder-uniq-id')].filter(visible),names=[...document.querySelectorAll('h2.finder-nickname')].filter(visible);
   if(ids.length!==1||names.length!==1)return null;
   const id=ids[0]!.textContent?.trim()??'',copied=ids[0]!.getAttribute('data-clipboard-text')?.trim();
   if(!id||!copied||id!==copied)return null;
   return {platformIdentity:id,displayName:names[0]!.textContent?.trim()??''};
  }
  const items=[...document.querySelectorAll('li.weui-desktop-setting__item')].filter(visible);
  const values=(label:string)=>items.filter(item=>item.querySelector('.weui-desktop-setting__item__label')?.textContent?.trim()===label).map(item=>item.querySelector('.weui-desktop-setting__item__info')?.textContent?.trim()??'');
  const ids=values('AppID'),names=values('名称');
  if(ids.length!==1||names.length!==1||!/^wx[0-9a-zA-Z]+$/.test(ids[0]!))return null;
  return {platformIdentity:ids[0]!,displayName:names[0]!};
 },platform);
 return information?.displayName?{...information,platform,sourcePath:url.pathname}:null;
}
/** SEMANTIC_BOUNDARY_ALLOW: 仅识别已实证的Playwright导航协议异常，不判断登录、身份或内容。 */
async function readOfficialIdentityFields(page:Page,controls:WechatOperationControls){
 try{return await readWechatIdentityDom(page,'wechatOfficial');}
 catch(error){
  controls.signal.throwIfAborted();
  // 只在公众号字段观察的同一Page上等待新上下文；入口、报表和其它错误原样失败。
  if(!(error instanceof Error)||error.name!=='Error'||
   !/Execution context was destroyed, most likely because of a navigation\.?$/.test(error.message)||page.isClosed())throw error;
  try{nativeUrl(page.url(),origins.wechatOfficial,'wechatOfficial');}catch{throw error;}
  return null; // 外层observe保留原end，不能因导航重建480000观察窗口。
 }
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
   else if(nativeUrl(page.url(),origins[platform],platform).pathname!=='/cgi-bin/settingpage'){
    const href=await observe(controls,async()=>{
     nativeUrl(page.url(),origins[platform],platform);
     const hrefs=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')).filter((v):v is string=>!!v));
     const valid=hrefs.flatMap(href=>{try{const url=nativeUrl(href,page.url(),platform);return url.pathname==='/cgi-bin/settingpage'?[url.href]:[];}catch{return [];}});
     return [...new Set(valid)].length===1?valid[0]!:null;
    },'ENTRY_NOT_READY',480000);
    await page.goto(href,{waitUntil:'domcontentloaded',timeout:controls.timeoutMs()});
   }
   return observe(controls,()=>platform==='wechatOfficial'?readOfficialIdentityFields(page,controls):readWechatIdentityDom(page,platform),platform==='wechatOfficial'?'FIELDS_NOT_READY':'IDENTITY_MISSING',480000);
  },
 };
 const reportWitness:WechatReportWitness={async prepare(page,platform,kind,controls){
  if(platform!==(kind.startsWith('official')?'wechatOfficial':'wechatVideo'))return fail('REPORT_PLATFORM_MISMATCH','报表不属于当前平台');
  const current=nativeUrl(page.url(),origins[platform],platform),sourcePath=paths[kind];
  const target=windowFor((options.now??Date.now)(),kind==='channelsWorks');
  if(platform==='wechatOfficial'){
   const hrefs=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')).filter((v):v is string=>!!v));
   const targets=hrefs.flatMap(href=>{try{const url=nativeUrl(href,current.href,platform);return url.pathname===sourcePath?[url.href]:[];}catch{return [];}});
   const unique=[...new Set(targets)];if(unique.length>1)return fail('REPORT_LINK_AMBIGUOUS','原生报表入口不唯一');
   if(!unique.length)return fail('REPORT_LINK_MISSING','当前页面没有原生报表入口');
   await page.goto(unique[0]!,{waitUntil:'domcontentloaded',timeout:controls.timeoutMs()});
  }else if(current.pathname!==sourcePath){
   // 后台菜单实际href为javascript；仅操作唯一可见真实入口，不猜深链。
   const entry=page.getByText(kind==='channelsFollowers'?'关注者数据':'视频数据',{exact:true}).filter({visible:true});
   let entryVisibleCount=await entry.count(),centreVisibleCount:number|undefined,centreClicked=false,recovered=false;
   const progress=(entryPhase:WechatEntryObservation['entryPhase'])=>{try{controls.onEntryObservation?.({entryPhase,entryVisibleCount,...(centreVisibleCount===undefined?{}:{centreVisibleCount}),centreClicked});}catch{/* 诊断不能改变原菜单操作。 */}};
   progress('initial');
   if(entryVisibleCount>1)return fail('REPORT_LINK_AMBIGUOUS','原生报表入口不唯一');
   {
    const centre=page.getByText('数据中心',{exact:true}).filter({visible:true});
    let ready:'entry'|'centre'|undefined;
    try{ready=await observe(controls,async()=>{
     nativeUrl(page.url(),origins[platform],platform);
     entryVisibleCount=await entry.count();controls.signal.throwIfAborted();progress('wait_entry_or_centre');
     if(entryVisibleCount>1)return fail('REPORT_LINK_AMBIGUOUS','原生报表入口不唯一');
     // 同一结束时刻中也允许原合法直接入口晚到；无关centre重复不能反杀该路径。
     if(entryVisibleCount===1)return 'entry' as const;
     centreVisibleCount=await centre.count();controls.signal.throwIfAborted();progress('wait_entry_or_centre');
     if(centreVisibleCount>1)return fail('REPORT_LINK_AMBIGUOUS','原生报表入口不唯一');
     if(centreVisibleCount!==1)return null;
     // 真正点击前重核：菜单异步展开后再点中心可能把刚出现的入口折回去。
     entryVisibleCount=await entry.count();controls.signal.throwIfAborted();progress('wait_entry_or_centre');
     if(entryVisibleCount>1)return fail('REPORT_LINK_AMBIGUOUS','原生报表入口不唯一');
     if(entryVisibleCount===1)return 'entry' as const;
     centreVisibleCount=await centre.count();controls.signal.throwIfAborted();progress('wait_entry_or_centre');
     if(centreVisibleCount>1)return fail('REPORT_LINK_AMBIGUOUS','原生报表入口不唯一');
     if(centreVisibleCount!==1)return null;
     nativeUrl(page.url(),origins[platform],platform);progress('click_centre');
     await centre.click({timeout:controls.timeoutMs()});controls.signal.throwIfAborted();centreClicked=true;
     return 'centre' as const;
    },'REPORT_LINK_MISSING');}catch(error){
     if(!(error instanceof WechatBrowserSourceError)||error.code!=='REPORT_LINK_MISSING'||centreClicked)throw error;
     controls.signal.throwIfAborted();controls.timeoutMs();nativeUrl(page.url(),origins[platform],platform);
     await recoverCollapsedEntry(page,kind==='channelsFollowers'?'关注者数据':'视频数据',controls,error,progress);recovered=true;
    }
    if(ready==='centre')await observe(controls,async()=>{nativeUrl(page.url(),origins[platform],platform);entryVisibleCount=await entry.count();controls.signal.throwIfAborted();progress('wait_entry_after_centre');if(entryVisibleCount>1)return fail('REPORT_LINK_AMBIGUOUS','原生报表入口不唯一');return entryVisibleCount===1?true:null;},'REPORT_LINK_MISSING');
   }
   nativeUrl(page.url(),origins[platform],platform);
   if(!recovered){progress('click_entry');await entry.click({timeout:controls.timeoutMs()});}
   controls.signal.throwIfAborted();progress('wait_target_route');
   await page.waitForURL(url=>url.origin===origins[platform]&&!url.username&&!url.password&&url.pathname===sourcePath,{timeout:controls.timeoutMs()});
   controls.signal.throwIfAborted();try{controls.onEntryObservation?.(undefined);}catch{/* 诊断不能阻断后续报表。 */}
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
