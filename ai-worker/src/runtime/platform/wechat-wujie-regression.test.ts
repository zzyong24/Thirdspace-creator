import {Readable} from 'node:stream';
import {JSDOM} from 'jsdom';
import type {BrowserContext,Download,ElementHandle,Frame,Locator,Page,Request,Response} from '@playwright/test';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createWechatBrowserSource,WechatBrowserSourceError,type WechatNativeDownload} from './wechat-browser-source';
import {createVerifiedWechatDomWitnesses} from './wechat-dom-witness';

// 仅合成浏览器对象：正式source、内置identity/report witness和原生下载字节链均实际执行。
// 不启动Chromium，不连接账号；以下ID、HTML、bytes及重定向均为明确fixture。
const channels='https://channels.weixin.qq.com',official='https://mp.weixin.qq.com';
const instant=Date.parse('2026-10-09T04:00:00Z');
const days=Array.from({length:30},(_,i)=>new Date(Date.parse('2026-09-09T00:00:00Z')+i*86400000).toISOString().slice(0,10));
const rows=(dates:readonly string[])=>dates.map(date=>`<tr><td>${date}</td></tr>`).join('');

function visible(node:Element):boolean{
 for(let current:Element|null=node;current;){
  if(current.hasAttribute('hidden')||current.getAttribute('style')?.includes('display:none'))return false;
  const root=current.getRootNode() as ShadowRoot;
  current=current.parentElement??(root.host??null);
 }
 return true;
}
function layout(dom:JSDOM){
 Object.defineProperty(dom.window.HTMLElement.prototype,'getClientRects',{value:function(this:HTMLElement){return visible(this)?[{width:10,height:10}]:[];}});
}
function evaluate<T>(dom:JSDOM,fn:Function,arg?:unknown):T{
 return (dom.window.eval('('+fn.toString()+')') as (value:unknown)=>T)(arg);
}
function evaluateMany(dom:JSDOM,fn:Function,...args:unknown[]):unknown{
 return (dom.window.eval('('+fn.toString()+')') as (...values:unknown[])=>unknown)(...args);
}
function handle(dom:JSDOM,node:Element):ElementHandle{
 return {evaluate:async(fn:Function,arg:unknown)=>evaluateMany(dom,fn,node,arg),isVisible:async()=>visible(node),dispose:vi.fn(async()=>{})} as unknown as ElementHandle;
}
type LocatorContext={dom:JSDOM;clicked:(node:Element,timeout:number)=>Promise<void>;clockNativeMiss?:()=>void;spend?:(stage:string,requested?:number)=>void};
function locator(context:LocatorContext,read:()=>Element[],observation?:'host'|'window'):Locator{
 const result={
  filter:({visible:onlyVisible}:{visible?:boolean})=>locator(context,()=>read().filter(node=>!onlyVisible||visible(node)),observation),
  count:async()=>{if(observation)context.spend?.('observe:'+observation);const nodes=read();if(!nodes.length)context.clockNativeMiss?.();return nodes.length;},
  click:vi.fn(async(options:{timeout:number})=>{const nodes=read();expect(nodes).toHaveLength(1);await context.clicked(nodes[0]!,options.timeout);}),
  evaluateAll:async(fn:Function,arg:unknown)=>evaluateMany(context.dom,fn,read(),arg),
  getAttribute:async(name:string,options:{timeout:number})=>{context.spend?.('sdk:href',options.timeout);return read()[0]?.getAttribute(name)??null;},
  elementHandle:async()=>read()[0]?handle(context.dom,read()[0]!):null,
  getByText:(text:string)=>locator(context,()=>read().flatMap(node=>textNodes(node.shadowRoot??node,text))),
  locator:(selector:string)=>locator(context,()=>read().flatMap(node=>[...(node.shadowRoot??node).querySelectorAll(selector)]),selector.includes('.filter-row')?'window':undefined),
 };
 return result as unknown as Locator;
}
function textNodes(root:ParentNode,text:string):Element[]{
 return [...root.querySelectorAll('*')].filter(node=>node.textContent?.trim()===text&&![...node.children].some(child=>child.textContent?.trim()===text));
}
function sourceContext(page:Page,onStopped:()=>Promise<void>):BrowserContext{
 let closed=false;
 return {pages:()=>[page],newPage:async()=>page,close:vi.fn(async()=>{if(!closed){closed=true;await onStopped();}})} as unknown as BrowserContext;
}

function wujieSourceFixture(options:{visibleIframe?:boolean;duplicateHost?:boolean;unrelatedProxy?:boolean;wrongResponseFrame?:boolean;pauseResponse?:boolean;timedConsumers?:boolean;afterClick?:(action:string)=>void;beforeReceive?:()=>void}={}){
 const timedConsumers=options.timedConsumers===true;
 const dom=new JSDOM('<body><div id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-finder-id">synthetic-finder-id</div><h2 class="finder-nickname">明确fixture显示名</h2><button data-action="center">数据中心</button><a href="javascript:;" data-action="menu">视频数据</a><a href="javascript:;" data-action="follower-menu">关注者数据</a><wujie-app></wujie-app><iframe hidden></iframe></body>',{url:channels+'/platform',runScripts:'outside-only'});
 layout(dom);
 const document=dom.window.document,host=document.querySelector('wujie-app')!,shadow=host.attachShadow({mode:'open'});
 shadow.innerHTML='<button data-action="daily">全部视频</button><button data-action="followers">关注者增长</button><button data-action="works">单篇视频</button><div class="filter-row"><div class="filter-extra"><a data-action="download">下载表格</a></div><label data-action="seven"><input type="radio" name="range" value="1" checked>近7天</label><label data-action="thirty"><input type="radio" name="range" value="2">近30天</label></div><div class="card-title"><span class="info">共13条视频</span></div><div class="ant-table-body"><table>'+rows(days.slice(-7))+'</table></div>';
 const iframe=document.querySelector('iframe')!,runtimeDocument=iframe.contentDocument!,runtimeWindow=iframe.contentWindow! as Window&typeof globalThis;
 Object.defineProperty(runtimeWindow.HTMLElement.prototype,'getClientRects',{value:function(this:HTMLElement){return visible(this)?[{width:10,height:10}]:[];}});
 const nativeQuery=runtimeDocument.querySelectorAll.bind(runtimeDocument);
 let uiData:ParentNode=shadow;
 if(options.visibleIframe){host.remove();iframe.removeAttribute('hidden');runtimeDocument.body.innerHTML=shadow.innerHTML;uiData=runtimeDocument;}
 else{
  // Wujie主realm代理返回父Page真实Shadow节点；Frame locator仍调用保存的原生document。
  let proxyRoot=shadow;
  if(options.unrelatedProxy){const unrelated=document.createElement('div');proxyRoot=unrelated.attachShadow({mode:'open'});proxyRoot.innerHTML=shadow.innerHTML;document.body.append(unrelated);}
  runtimeDocument.querySelectorAll=proxyRoot.querySelectorAll.bind(proxyRoot) as typeof runtimeDocument.querySelectorAll;
  runtimeDocument.querySelector=proxyRoot.querySelector.bind(proxyRoot) as typeof runtimeDocument.querySelector;
 }
 if(options.duplicateHost){const duplicate=document.createElement('wujie-app');duplicate.attachShadow({mode:'open'}).innerHTML=shadow.innerHTML;document.body.append(duplicate);}
 let current=channels+'/platform',expiredNative=false,selected='daily';
 let preparingKind:string|undefined;
 const timeSteps:{stage:string;kind?:string;durationMs:number;requestedMs?:number}[]=[],observed=new Set<string>();
 const spend=(stage:string,requested?:number)=>{
  if(!options.timedConsumers)return;
  const key=preparingKind+':'+stage;
  if(stage.startsWith('observe:')){if(observed.has(key))return;observed.add(key);}
  const duration=stage==='openProfile'?1090000:stage==='observe:identity'?470000:110000;
  if(requested!==undefined)expect(duration).toBeLessThanOrEqual(requested);
  timeSteps.push({stage,...(preparingKind===undefined?{}:{kind:preparingKind}),durationMs:duration,...(requested===undefined?{}:{requestedMs:requested})});vi.setSystemTime(Date.now()+duration);
 };
 const requestListeners=new Set<(request:Request)=>void>();let acceptResponse:((response:Response)=>void)|undefined,lateResponse:(()=>void)|undefined;
 let deliverDownload:(()=>void)|undefined;
 const clicks:string[]=[],timeouts:number[]=[],onStopped=vi.fn(async()=>{}),onReport=vi.fn<(report:WechatNativeDownload)=>Promise<void>>();
 const clicked=async(node:Element,timeout:number)=>{
  timeouts.push(timeout);expect(timeout).toBeGreaterThanOrEqual(120000);const action=node.getAttribute('data-action')!;clicks.push(action);
  spend('sdk:click-'+action,timeout);
  if(action==='menu')current=channels+'/platform/statistic/post';
  if(action==='follower-menu')current=channels+'/platform/statistic/follower';
  dom.reconfigure({url:current});
  if(['daily','followers','works'].includes(action))selected=action;
  if(action==='seven'||action==='thirty'){
   (uiData.querySelector('input[value="1"]') as HTMLInputElement).checked=action==='seven';
   (uiData.querySelector('input[value="2"]') as HTMLInputElement).checked=action==='thirty';
   uiData.querySelector('table')!.innerHTML=rows(selected==='works'?days.slice(-9).concat('2026-10-09'):action==='thirty'?days:days.slice(-7));
   if(action==='thirty'&&selected==='works'){
    const responseFrame=options.wrongResponseFrame?({url:()=>channels+'/micro/statistic/post'} as Frame):runtimeFrame;
    const request={method:()=> 'POST',frame:()=>responseFrame,postDataJSON:()=>({startTime:1788969600,endTime:1791475200,pageSize:10,currentPage:1})} as unknown as Request;
    const response={url:()=>channels+'/micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/post_list',status:()=>200,request:()=>request,finished:async()=>null,json:async()=>({errCode:0,data:{totalCount:13,list:Array.from({length:10},()=>({}))}})} as unknown as Response;
    clicks.push('fresh-request');
    for(const listener of requestListeners)listener(request);
    lateResponse=()=>{clicks.push('fresh-response');acceptResponse?.(response);};if(!options.pauseResponse)lateResponse();
   }
  }
  if(action==='download')deliverDownload?.();
  options.afterClick?.(action);
 };
 const uiContext={dom,clicked,spend},nativeContext={dom,clicked,spend,clockNativeMiss:()=>{if(!expiredNative){expiredNative=true;vi.setSystemTime(Date.now()+120000);}}};
 const runtimeFrame={
  url:()=>channels+(current.endsWith('/follower')?'/micro/statistic/follower':'/micro/statistic/post'),
  getByText:(text:string)=>locator(nativeContext,()=>[...nativeQuery('*')].filter(node=>node.textContent?.trim()===text&&![...node.children].some(child=>child.textContent?.trim()===text))),
  locator:(selector:string)=>locator(nativeContext,()=>[...nativeQuery(selector)],selector.includes('.filter-row')?'window':undefined),
  frameElement:async()=>handle(dom,iframe),
  evaluate:async(fn:Function,arg:unknown)=>{if(arg&&typeof arg==='object'&&'kind' in arg)spend('sdk:report-state-read',120000);const result=(runtimeWindow.eval('('+fn.toString()+')') as (value:unknown)=>unknown)(arg);if(options.unrelatedProxy&&(result===false||result===null)&&!expiredNative){expiredNative=true;vi.setSystemTime(Date.now()+120000);}return result;},
 } as unknown as Frame;
 const bytes=Buffer.from('日期,播放量\n2026-10-08,0\n明确合成日报字节');
 const download={failure:async()=>null,suggestedFilename:()=> 'synthetic-native-'+selected+'.csv',createReadStream:async()=>Readable.from([bytes])} as unknown as Download;
 const page={
  url:()=>current,
  goto:vi.fn(async(url:string,options:{timeout:number})=>{timeouts.push(options.timeout);expect(options.timeout).toBeGreaterThanOrEqual(120000);spend('sdk:goto',options.timeout);current=new URL(url).pathname==='/'?channels+'/platform':url;dom.reconfigure({url:current});}),
  evaluate:async(fn:Function,arg:unknown)=>{if(arg&&typeof arg==='object'&&'platform' in arg&&arg.platform==='wechatVideo'&&'identityPage' in arg&&arg.identityPage===true)spend('observe:identity',480000);return evaluate(dom,fn,arg);},
  frames:()=>{spend('observe:frame');return [runtimeFrame];},
  locator:(selector:string)=>locator(uiContext,()=>[...document.querySelectorAll(selector),...(!options.visibleIframe?[...shadow.querySelectorAll(selector)]:[])],selector==='wujie-app'?'host':undefined),
  getByText:(text:string)=>locator(uiContext,()=>[...textNodes(document,text),...(!options.visibleIframe?textNodes(shadow,text):[])]),
  waitForURL:async(predicate:(url:URL)=>boolean,options:{timeout:number})=>{spend('sdk:waitURL',options.timeout);expect(predicate(new URL(current))).toBe(true);},
  waitForEvent:vi.fn((event:string,options:{timeout:number})=>{expect(event).toBe('download');clicks.push('listen-download');timeouts.push(options.timeout);expect(options.timeout).toBeGreaterThanOrEqual(120000);if(!timedConsumers)return Promise.resolve(download);return new Promise<Download>(resolve=>{deliverDownload=()=>resolve(download);});}),
  on:vi.fn((event:string,listener:(request:Request)=>void)=>{expect(event).toBe('request');requestListeners.add(listener);}),
  off:vi.fn((event:string,listener:(request:Request)=>void)=>{expect(event).toBe('request');requestListeners.delete(listener);}),
  waitForResponse:vi.fn((predicate:(response:Response)=>boolean,options:{timeout:number})=>new Promise<Response>((resolve,reject)=>{
   clicks.push('listen-response');
   timeouts.push(options.timeout);expect(options.timeout).toBeGreaterThanOrEqual(120000);
   const timer=setTimeout(()=>reject(Error('明确合成原生响应等待结束')),options.timeout);
   acceptResponse=response=>{if(predicate(response)){clearTimeout(timer);resolve(response);}};
  })),
 } as unknown as Page;
 const context=sourceContext(page,onStopped),witnesses=createVerifiedWechatDomWitnesses({now:()=>instant});
 const source=createWechatBrowserSource({...witnesses,reportWitness:{prepare:async(...args)=>{preparingKind=args[2];const result=await witnesses.reportWitness.prepare(...args);options.beforeReceive?.();return result;}},openProfile:async()=>{spend('openProfile',1120000);return context;}});
 return {source,page,runtimeFrame,host,shadow,nativeQuery,bytes,onReport,onStopped,clicks,timeouts,timeSteps,setPath:(path:string)=>{current=channels+path;dom.reconfigure({url:current});},releaseResponse:()=>lateResponse?.(),dispose:()=>dom.window.close()};
}

function currentSettingsSourceFixture(options:{missingFields?:boolean;duplicateAppId?:boolean;foreignOrigin?:boolean}={}){
 const dom=new JSDOM('<body><a href="/cgi-bin/settingpage?action=index&fixture=first">账号设置</a><a href="/cgi-bin/settingpage?action=index&fixture=second">账号设置</a><a href="/cgi-bin/settingpage?action=function">功能设置</a><li class="weui-desktop-setting__item"><span class="weui-desktop-setting__item__label">AppID</span><span class="weui-desktop-setting__item__info">wxsynthetic000001</span></li><li class="weui-desktop-setting__item"><span class="weui-desktop-setting__item__label">名称</span><span class="weui-desktop-setting__item__info">明确fixture公众号</span></li></body>',{url:official+'/cgi-bin/settingpage?action=index',runScripts:'outside-only'});
 layout(dom);
 if(options.missingFields)for(const node of dom.window.document.querySelectorAll('li'))node.remove();
 if(options.duplicateAppId){const original=dom.window.document.querySelector('li')!;original.after(original.cloneNode(true));}
 const landed=(options.foreignOrigin?'https://fixture-foreign.invalid':official)+'/cgi-bin/settingpage?action=index';
 let current=landed,entryExpired=false,fieldsExpired=false;
 const onStopped=vi.fn(async()=>{}),entryRead=vi.fn();
 const page={
  url:()=>current,
  goto:vi.fn(async(url:string,options:{timeout:number})=>{expect(options.timeout).toBeGreaterThanOrEqual(120000);current=new URL(url).pathname==='/'?landed:url;dom.reconfigure({url:current});}),
  evaluate:async(fn:Function,arg:unknown)=>{const result=evaluate(dom,fn,arg);if(result&&typeof result==='object'&&'identity' in result&&result.identity===null&&(options.missingFields||options.duplicateAppId)&&!fieldsExpired){fieldsExpired=true;vi.setSystemTime(Date.now()+480000);}return result;},
  locator:()=>({evaluateAll:async(fn:Function)=>{entryRead();const hrefs=evaluateMany(dom,fn,[...dom.window.document.querySelectorAll('a[href]')]);if(!entryExpired){entryExpired=true;vi.setSystemTime(Date.now()+480000);}return hrefs;}}),
 } as unknown as Page;
 const context=sourceContext(page,onStopped),source=createWechatBrowserSource({...createVerifiedWechatDomWitnesses(),openProfile:async()=>context});
 return {source,page,onStopped,entryRead,dispose:()=>dom.window.close()};
}

afterEach(()=>{vi.useRealTimers();});
describe('T1110 Wujie分离DOM与当前公众号设置页：正式source回归（合成浏览器）',()=>{
 it('隐藏Frame原生标签0但同Page唯一可见Shadow标签1：日报字节应交回原callback',async()=>{
  vi.useFakeTimers();vi.setSystemTime(instant);const f=wujieSourceFixture(),stop=new WechatBrowserSourceError('SYNTHETIC_AFTER_FIRST_REPORT','首份交回后的明确合成截停');
  try{
   expect(f.nativeQuery('button')).toHaveLength(0);
   expect(f.shadow.querySelectorAll('button[data-action="daily"]')).toHaveLength(1);
   expect(visible(f.host)).toBe(true);
   const proxied=await f.runtimeFrame.evaluate(()=>document.querySelector('button[data-action="daily"]')?.getRootNode()===parent.document.querySelector('wujie-app')?.shadowRoot);
   expect(proxied).toBe(true);
   f.onReport.mockImplementation(async()=>{throw stop;});
   const run=f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-finder-id',{deadlineAt:new Date(instant+2400000).toISOString(),onStopped:f.onStopped},f.onReport);
   await expect(run).rejects.toBe(stop);
   expect(f.onReport).toHaveBeenCalledOnce();
   expect(f.onReport).toHaveBeenCalledWith(expect.objectContaining({kind:'channelsDaily',bytes:f.bytes,sourcePath:'/platform/statistic/post',selection:{startDate:'2026-09-09',endDate:'2026-10-08',timeZone:'Asia/Shanghai',meaning:'statisticsDates'}}));
   expect(f.clicks.filter(action=>['daily','seven','thirty','download'].includes(action))).toEqual(['daily','seven','thirty','download']);
   expect(f.page.waitForEvent).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
 it('公开login起步实际落在settingpage且存在3个设置href：直接读唯一AppID而不重走入口',async()=>{
  vi.useFakeTimers();vi.setSystemTime(instant);const f=currentSettingsSourceFixture();
  try{
   await expect(f.source.login('wechatOfficial','/synthetic-only-profile',{deadlineAt:new Date(instant+2400000).toISOString(),onStopped:f.onStopped})).resolves.toEqual({platformIdentity:'wxsynthetic000001',displayName:'明确fixture公众号',source:'wechatOfficial:/cgi-bin/settingpage'});
   expect(f.page.goto).toHaveBeenCalledOnce();expect(f.entryRead).not.toHaveBeenCalled();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
 it.each(['missingFields','duplicateAppId','foreignOrigin'] as const)('当前settingpage的%s仍拒绝，不能用多入口修正绕身份保护',async mode=>{
  vi.useFakeTimers();vi.setSystemTime(instant);const f=currentSettingsSourceFixture({missingFields:mode==='missingFields',duplicateAppId:mode==='duplicateAppId',foreignOrigin:mode==='foreignOrigin'});
  try{
   await expect(f.source.login('wechatOfficial','/synthetic-only-profile',{onStopped:f.onStopped})).rejects.toMatchObject({code:mode==='foreignOrigin'?'SOURCE_URL_INVALID':'FIELDS_NOT_READY'});
   expect(f.entryRead).not.toHaveBeenCalled();expect(f.page.goto).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
 it('三份原生report完整source链：Shadow控件与真实runtimeFrame新request各守自己的根',async()=>{
  vi.useFakeTimers();vi.setSystemTime(instant);const f=wujieSourceFixture();
  try{
   const result=await f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-finder-id',{onStopped:f.onStopped},f.onReport);
   expect(result.map(report=>report.kind)).toEqual(['channelsDaily','channelsFollowers','channelsWorks']);
   expect(f.onReport.mock.calls.map(([report])=>report.kind)).toEqual(['channelsDaily','channelsFollowers','channelsWorks']);
   expect(result[2]).toMatchObject({expectedRows:13,selection:{startDate:'2026-09-10',endDate:'2026-10-09',timeZone:'Asia/Shanghai',meaning:'publishedDates'}});
   expect(vi.mocked(f.page.goto).mock.calls.map(([url])=>new URL(url).pathname)).toEqual(['/','/platform','/platform/statistic/post','/platform/statistic/follower','/platform/statistic/post']);
   expect(f.clicks.filter(action=>['menu','follower-menu'].includes(action))).toEqual([]);
   const workClicks=f.clicks.slice(f.clicks.indexOf('works'));
   expect(workClicks).toEqual(['works','seven','listen-response','thirty','fresh-request','fresh-response','listen-download','download']);
   expect(f.page.on).toHaveBeenCalledOnce();expect(f.page.off).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
 it('普通可见iframe且无Wujie：原daily/followers/works全部合法下载继续成功',async()=>{
  vi.useFakeTimers();vi.setSystemTime(instant);const f=wujieSourceFixture({visibleIframe:true});
  try{
   const result=await f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-finder-id',{onStopped:f.onStopped},f.onReport);
   expect(result.map(report=>report.kind)).toEqual(['channelsDaily','channelsFollowers','channelsWorks']);
   expect(result[0]?.selection).toMatchObject({startDate:'2026-09-09',endDate:'2026-10-08',meaning:'statisticsDates'});
   expect(result[2]).toMatchObject({expectedRows:13,selection:{startDate:'2026-09-10',endDate:'2026-10-09',meaning:'publishedDates'}});
   expect(f.onReport).toHaveBeenCalledTimes(3);expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
 it.each(['duplicateHost','unrelatedProxy','duplicateFrame','duplicateSection'] as const)('%s拒绝跨根或任取第一项，不点日期、不交回报表',async mode=>{
  vi.useFakeTimers();vi.setSystemTime(instant);const f=wujieSourceFixture({duplicateHost:mode==='duplicateHost',unrelatedProxy:mode==='unrelatedProxy'});
  if(mode==='duplicateFrame')f.page.frames=()=>[f.runtimeFrame,{...f.runtimeFrame} as Frame];
  if(mode==='duplicateSection'){const duplicate=f.shadow.ownerDocument.createElement('button');duplicate.textContent='全部视频';f.shadow.append(duplicate);}
  try{
   await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-finder-id',{onStopped:f.onStopped},f.onReport)).rejects.toMatchObject({code:mode==='duplicateFrame'?'REPORT_PAGE_MISSING':mode==='unrelatedProxy'?'REPORT_SECTION_MISSING':'REPORT_SECTION_AMBIGUOUS'});
   expect(f.clicks.filter(action=>['daily','seven','thirty','download'].includes(action))).toEqual([]);
   expect(f.page.waitForEvent).not.toHaveBeenCalled();expect(f.onReport).not.toHaveBeenCalled();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
 it.each(['pagePath','pinnedHost'] as const)('真实prepare后、下载前%s变化：旧日期不得自证ready',async mode=>{
  vi.useFakeTimers();vi.setSystemTime(instant);let f:ReturnType<typeof wujieSourceFixture>;
  f=wujieSourceFixture({beforeReceive:()=>{if(mode==='pagePath')f.setPath('/platform');else f.host.remove();}});
  try{
   await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-finder-id',{onStopped:f.onStopped},f.onReport)).rejects.toMatchObject({code:'REPORT_NOT_READY'});
   expect(f.page.waitForEvent).not.toHaveBeenCalled();expect(f.onReport).not.toHaveBeenCalled();expect(f.clicks).not.toContain('download');expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
 it('Shadow日期切换时原cancel优先，不下载且实际close后才确认停止',async()=>{
  vi.useFakeTimers();vi.setSystemTime(instant);const controller=new AbortController(),reason=Error('明确合成原用户取消');
  const f=wujieSourceFixture({afterClick:action=>{if(action==='thirty')controller.abort(reason);}});
  try{
   await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-finder-id',{signal:controller.signal,onStopped:f.onStopped},f.onReport)).rejects.toBe(reason);
   expect(f.page.waitForEvent).not.toHaveBeenCalled();expect(f.onReport).not.toHaveBeenCalled();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
 it('同origin同endpoint但不同runtimeFrame的fresh response不授权works，不丢前两份',async()=>{
  vi.useFakeTimers();vi.setSystemTime(instant);const f=wujieSourceFixture({wrongResponseFrame:true});
  try{
   const run=f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-finder-id',{onStopped:f.onStopped},f.onReport);
   const rejected=expect(run).rejects.toMatchObject({code:'BROWSER_OPERATION_FAILED'});
   void rejected.catch(()=>{});
   await vi.advanceTimersByTimeAsync(120000);await rejected;
   expect(f.onReport.mock.calls.map(([report])=>report.kind)).toEqual(['channelsDaily','channelsFollowers']);
   expect(f.page.waitForEvent).toHaveBeenCalledTimes(2);expect(f.page.off).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
 it.each(['cancel','deadline'] as const)('等待Wujie真实runtime响应期间%s优先，停止后晚response不交第三份',async mode=>{
  vi.useFakeTimers();vi.setSystemTime(instant);const controller=new AbortController(),reason=Error('明确合成原用户取消'),f=wujieSourceFixture({pauseResponse:true});
  try{
   const deadline=mode==='deadline'?120000:240000;
   const run=f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-finder-id',{signal:controller.signal,deadlineAt:new Date(instant+deadline).toISOString(),onStopped:f.onStopped},f.onReport);
   const rejected=mode==='cancel'?expect(run).rejects.toBe(reason):expect(run).rejects.toMatchObject({code:'EXECUTION_DEADLINE_EXCEEDED'});
   void rejected.catch(()=>{});
   await vi.advanceTimersByTimeAsync(0);expect(f.page.waitForResponse).toHaveBeenCalledOnce();
   if(mode==='cancel')controller.abort(reason);else await vi.advanceTimersByTimeAsync(deadline);
   await rejected;expect(f.onStopped).toHaveBeenCalledOnce();
   f.releaseResponse();await vi.advanceTimersByTimeAsync(0);
   expect(f.onReport.mock.calls.map(([report])=>report.kind)).toEqual(['channelsDaily','channelsFollowers']);expect(f.page.waitForEvent).toHaveBeenCalledTimes(2);
  }finally{f.dispose();}
 });
 it('正式source固定路线消费者逐段在原预算与总截止内慢成功，按准确阶段交第三份',async()=>{
  vi.useFakeTimers();vi.setSystemTime(instant);const f=wujieSourceFixture({timedConsumers:true});
  try{
   const result=await f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-finder-id',{onStopped:f.onStopped},f.onReport);
   const stages=['openProfile','sdk:goto','sdk:goto','observe:identity',...['daily','followers','works'].flatMap(kind=>[
    'sdk:goto','observe:frame','observe:host','sdk:click-'+kind,'observe:window','sdk:click-seven','sdk:click-thirty','sdk:report-state-read','sdk:report-state-read','sdk:href','sdk:click-download',
   ])];
   expect(f.timeSteps.map(step=>step.stage)).toEqual(stages);
   expect(f.timeSteps.filter(step=>!['openProfile','observe:identity'].includes(step.stage))).toHaveLength(35);
   expect(Date.now()-instant).toBe(1090000+470000+35*110000);expect(Date.now()-instant).toBeLessThan(7370000);
   expect(f.timeSteps.reduce((sum,step)=>sum+step.durationMs,0)).toBe(Date.now()-instant);
   expect(f.timeSteps).toContainEqual({stage:'openProfile',durationMs:1090000,requestedMs:1120000});
   expect(f.timeSteps).toContainEqual({stage:'observe:identity',durationMs:470000,requestedMs:480000});
   expect(f.timeSteps.filter(step=>!['openProfile','observe:identity'].includes(step.stage)).every(step=>step.durationMs===110000)).toBe(true);
   expect(f.timeSteps.some(step=>step.stage==='onReport')).toBe(false);
   expect(result).toHaveLength(3);expect(f.onReport).toHaveBeenCalledTimes(3);expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
});
