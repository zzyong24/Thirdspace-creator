import type {Frame,Page,Response,Request,Locator} from '@playwright/test';
import type {NativeReportKind,NativeReportPayload} from '@creatoros/contract';
import {setTimeout as delay} from 'node:timers/promises';
import {WechatBrowserSourceError,type WechatCreatorPlatform,type WechatIdentityWitness,type WechatOperationControls,type WechatReportPageState,type WechatReportWitness,type WechatSectionObservation} from './wechat-browser-source';

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
async function observe<T>(controls:WechatOperationControls,read:()=>Promise<T|null>,code:string,requested?:number):Promise<T>{
 const end=Date.now()+controls.timeoutMs(requested);
 for(;;){controls.signal.throwIfAborted();const value=await read();controls.signal.throwIfAborted();if(value!==null)return value;if(Date.now()>=end)return fail(code,'微信后台数据尚未就绪，请查看原任务');await delay(250,undefined,{signal:controls.signal});}
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
type WorksObservation={selection:NativeReportPayload['selection'];reportedRows:number};
export async function readWechatReportDom(scope:Page|Frame,kind:NativeReportKind,works?:WorksObservation):Promise<WechatReportPageState|null>{
 const official=kind.startsWith('official'),platform=official?'wechatOfficial':'wechatVideo';
 const url=nativeUrl(scope.url(),origins[platform],platform);
 if(official&&url.pathname!==paths[kind]||!official&&url.pathname!==(kind==='channelsFollowers'?'/micro/statistic/follower':'/micro/statistic/post'))return null;
 const raw=await scope.evaluate(({kind,official})=>{
  const visible=(node:Element)=>!node.closest('[hidden]')&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden'&&node.getClientRects().length>0;
  if([...document.querySelectorAll('.ant-spin-spinning,.weui-desktop-loading')].some(visible))return null;
  const dateCells=(selector:string)=>[...document.querySelectorAll(selector)].filter(visible).map(td=>td.textContent?.trim()??'').filter(v=>/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(v)).map(v=>v.replaceAll('/','-'));
  if(official){
   const values=[...new Set([...document.querySelectorAll('input.weui-desktop-form__input')].filter(visible).map(input=>(input as HTMLInputElement).value).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)))].sort();
   const label=kind==='officialContent'?'下载数据明细':'下载表格';
   const links=[...document.querySelectorAll('a[href]')].filter(a=>visible(a)&&a.textContent?.trim()===label);
   if(values.length!==2||links.length!==1)return null;
   return {values,href:(links[0] as HTMLAnchorElement).href,dates:dateCells('table.weui-desktop-table__core-table td')};
  }
  const filters=[...document.querySelectorAll('.filter-row')].filter(row=>visible(row)&&row.querySelector('.filter-extra'));
  if(filters.length!==1||!filters[0]!.querySelector('input[value="2"]:checked'))return null;
  const dates=dateCells('.ant-table-body td');
  if(kind==='channelsWorks'){
   const counts=[...document.querySelectorAll('.card-title .info')].filter(visible).map(x=>/^共\s*(\d+)\s*条视频$/.exec(x.textContent?.trim()??''));
   if(counts.length!==1||!counts[0])return null;
   return {dates,reportedRows:Number(counts[0][1]),visibleRows:dates.length};
  }
  return {dates};
 },{kind,official});
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
   else{
    const href=await observe(controls,async()=>{
     nativeUrl(page.url(),origins[platform],platform);
     const hrefs=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')).filter((v):v is string=>!!v));
     const valid=hrefs.flatMap(href=>{try{const url=nativeUrl(href,page.url(),platform);return url.pathname==='/cgi-bin/settingpage'?[url.href]:[];}catch{return [];}});
     return [...new Set(valid)].length===1?valid[0]!:null;
    },'ENTRY_NOT_READY',480000);
    await page.goto(href,{waitUntil:'domcontentloaded',timeout:controls.timeoutMs()});
   }
   return observe(controls,()=>readWechatIdentityDom(page,platform),platform==='wechatOfficial'?'FIELDS_NOT_READY':'IDENTITY_MISSING',480000);
  },
 };
 const reportWitness:WechatReportWitness={async prepare(page,platform,kind,controls){
  if(platform!==(kind.startsWith('official')?'wechatOfficial':'wechatVideo'))return fail('REPORT_PLATFORM_MISMATCH','报表不属于当前平台');
  const current=nativeUrl(page.url(),origins[platform],platform),sourcePath=paths[kind];
  const target=windowFor((options.now??Date.now)(),kind==='channelsWorks');
  const hrefs=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')).filter((v):v is string=>!!v));
  const targets=hrefs.flatMap(href=>{try{const url=nativeUrl(href,current.href,platform);return url.pathname===sourcePath?[url.href]:[];}catch{return [];}});
  const unique=[...new Set(targets)];if(unique.length>1)return fail('REPORT_LINK_AMBIGUOUS','原生报表入口不唯一');
  if(platform==='wechatOfficial'&&!unique.length)return fail('REPORT_LINK_MISSING','当前页面没有原生报表入口');
  await page.goto(unique[0]??origins[platform]+sourcePath,{waitUntil:'domcontentloaded',timeout:controls.timeoutMs()});
  let scope:Page|Frame=page,works:WorksObservation|undefined;
  if(platform==='wechatVideo'){
   const framePath=kind==='channelsFollowers'?'/micro/statistic/follower':'/micro/statistic/post';
   scope=await observe(controls,async()=>{const frames=page.frames().filter(frame=>{try{const u=nativeUrl(frame.url(),origins[platform],platform);return u.pathname===framePath;}catch{return false;}});return frames.length===1?frames[0]!:null;},'REPORT_PAGE_MISSING');
   const section=kind==='channelsDaily'?'全部视频':kind==='channelsWorks'?'单篇视频':'关注者增长';
   const exactTab=scope.getByText(section,{exact:true}),tab=exactTab.filter({visible:true});
   try{await observe(controls,async()=>{const count=await tab.count();if(count>1)return fail('REPORT_SECTION_AMBIGUOUS','原生报表标签不唯一');return count===1?true:null;},'REPORT_SECTION_MISSING');}
   catch(error){
    controls.signal.throwIfAborted();
    if(!(error instanceof WechatBrowserSourceError)||error.code!=='REPORT_SECTION_MISSING')throw error;
    try{const observation=await readMissingSectionObservation(scope as Frame,exactTab,tab,controls);controls.signal.throwIfAborted();controls.timeoutMs(120000);if(observation)error.observation=observation;}
    catch{controls.signal.throwIfAborted();controls.timeoutMs(120000);}
    throw error;
   }
   await tab.click({timeout:controls.timeoutMs()});
   const thirty=scope.locator(detail+' label:has(input[value="2"])').filter({visible:true}),seven=scope.locator(detail+' label:has(input[value="1"])').filter({visible:true});
   await observe(controls,async()=>await thirty.count()===1&&await seven.count()===1?true:null,'REPORT_WINDOW_MISSING');
   await seven.click({timeout:controls.timeoutMs()});
   if(kind==='channelsWorks'){
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
   }else await thirty.click({timeout:controls.timeoutMs()});
  }
  const read=()=>readWechatReportDom(scope,kind,works);
  const state=await observe(controls,async()=>{
   const state=await read();if(!state)return null;
   if(platform==='wechatVideo'){
    if(state.selection.startDate!==target.startDate||state.selection.endDate!==target.endDate)return null;
    if(kind!=='channelsWorks'&&new Set(state.dates).size!==30)return null;
   }
   return state;
  },'REPORT_NOT_READY');
  const label=kind==='officialContent'?'下载数据明细':'下载表格';
  const download=scope.getByText(label,{exact:true}).filter({visible:true});if(await download.count()!==1)return fail('REPORT_LINK_AMBIGUOUS','原生下载入口不唯一');
  return {scope,download,state,verify:async()=>{const latest=await read();controls.signal.throwIfAborted();if(!latest||JSON.stringify(latest)!==JSON.stringify(state))return fail('REPORT_NOT_READY','下载前原生日期或总数已变化，请查看原任务');}};
 }};
 return {identityWitness,reportWitness};
}
