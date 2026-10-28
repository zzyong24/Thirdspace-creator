import {JSDOM} from 'jsdom';
import {Readable} from 'node:stream';
import type {Page,Frame,Response,BrowserContext,Download,Locator} from '@playwright/test';
import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';
import {readWechatIdentityDom,readWechatReportDom,readChannelsWorksResponse,createVerifiedWechatDomWitnesses} from './wechat-dom-witness';
import {createWechatBrowserSource,type WechatOperationControls,WechatBrowserSourceError} from './wechat-browser-source';
// 旧合法iframe夹具补齐真实父路由和菜单；不改变原标签、日期、响应断言。
function channelsTestPage(config:Record<string,any>):Page{
 let current=config.url();const originalLocator=config.locator,originalGoto=config.goto;
 for(const frame of config.frames())if(!frame.frameElement)frame.frameElement=async()=>({isVisible:async()=>true,dispose:async()=>{}});
 const page={evaluate:async(_fn:Function,arg:unknown)=>arg===undefined?false:{identity:null},...config,url:()=>current,goto:async(url:string,options:unknown)=>{current=url;await originalGoto?.(url,options);},
  locator:(selector:string)=>selector==='wujie-app'?{filter(){return this;},count:async()=>0}:originalLocator(selector),
  getByText:(text:string)=>({filter(){return this;},count:async()=>1,click:async()=>{if(text==='视频数据')current=channels+'/platform/statistic/post';if(text==='关注者数据')current=channels+'/platform/statistic/follower';}}),
  waitForURL:async(predicate:(url:URL)=>boolean)=>{expect(predicate(new URL(current))).toBe(true);},
 };return page as unknown as Page;
}
// 普通DOM和原生响应的合成协议夹具；不连接账户、不伪称真人扫码。
function surface(html:string,url:string){
 const dom=new JSDOM(html,{url,runScripts:'outside-only'});
 Object.defineProperty(dom.window.HTMLElement.prototype,'getClientRects',{value:function(this:HTMLElement){return this.closest('[hidden]')?[]:[{width:10,height:10}];}});
 const page={url:()=>url,evaluate:async(fn:Function,arg:unknown)=>(dom.window.eval('('+fn.toString()+')') as Function)(arg)} as unknown as Page;
 return {page,dom};
}
const controls:WechatOperationControls={signal:new AbortController().signal,timeoutMs:()=>120000};
const oa='https://mp.weixin.qq.com',channels='https://channels.weixin.qq.com';
const visible='<style>*{display:block}</style>';
// jsdom无布局；实际reader用getComputedStyle+hidden属性判断，visibility辅助由夹具提供。
const settings=(id='wxsynthetic000001')=>visible+`<li class="weui-desktop-setting__item"><span class="weui-desktop-setting__item__label">公众号ID</span><span class="weui-desktop-setting__item__info">modifiable-name</span></li><li class="weui-desktop-setting__item"><span class="weui-desktop-setting__item__label">AppID</span><span class="weui-desktop-setting__item__info">${id}</span></li><li class="weui-desktop-setting__item"><span class="weui-desktop-setting__item__label">名称</span><span class="weui-desktop-setting__item__info">相同昵称</span></li><section hidden>关联小程序AppID wxother00000000</section>`;
const contextLost=(suffix='')=>Error('page.evaluate: Execution context was destroyed, most likely because of a navigation'+suffix);
function fieldsFixture(read:()=>void,options:{url?:string;closed?:boolean}={}){
 const dom=surface(settings(), 'https://mp.weixin.qq.com/cgi-bin/settingpage');let reads=0;
 const page={url:()=>reads?options.url??oa+'/cgi-bin/settingpage':oa+'/cgi-bin/settingpage',isClosed:()=>options.closed??false,
  evaluate:async(fn:Function,arg:unknown)=>{reads++;read();return dom.page.evaluate(fn as never,arg as never);}} as unknown as Page;
 return {page,dispose:()=>dom.dom.window.close(),reads:()=>reads};
}
describe('T1354 公众号字段观察窄恢复边界',()=>{
 it.each(['','.'])('字段瞬态%s后继续同一观察，不重置480000预算',async suffix=>{
  let calls=0;const f=fieldsFixture(()=>{if(++calls===1)throw contextLost(suffix);}),requests:(number|undefined)[]=[];
  try{await expect(createVerifiedWechatDomWitnesses().identityWitness.read(f.page,'wechatOfficial',{signal:controls.signal,timeoutMs:r=>{requests.push(r);return 480000;}})).resolves.toMatchObject({platformIdentity:'wxsynthetic000001'});expect(f.reads()).toBe(2);expect(requests).toEqual([480000]);}finally{f.dispose();}
 });
 it.each(['unknown','timeout','syntax','closed','foreign','target'] as const)('%s不当导航瞬态吞掉',async mode=>{
  const error=mode==='unknown'?Error('fixture unknown'):mode==='target'?Error('Target page, context or browser has been closed'):contextLost();
  if(mode==='timeout')error.name='TimeoutError';if(mode==='syntax')error.name='SyntaxError';
  const f=fieldsFixture(()=>{throw error;},{closed:mode==='closed',url:mode==='foreign'?'https://foreign.invalid/cgi-bin/settingpage':undefined});
  try{await expect(createVerifiedWechatDomWitnesses().identityWitness.read(f.page,'wechatOfficial',controls)).rejects.toBe(error);expect(f.reads()).toBe(1);}finally{f.dispose();}
 });
 it('字段瞬态不能续原观察期限',async()=>{
  vi.useFakeTimers();vi.setSystemTime(Date.parse('2026-10-19T00:00:00Z'));const f=fieldsFixture(()=>{vi.setSystemTime(Date.now()+480000);throw contextLost();});
  try{await expect(createVerifiedWechatDomWitnesses().identityWitness.read(f.page,'wechatOfficial',{signal:controls.signal,timeoutMs:()=>480000})).rejects.toMatchObject({code:'FIELDS_NOT_READY'});expect(f.reads()).toBe(1);}finally{f.dispose();vi.useRealTimers();}
 });
 it('取消优先于字段瞬态，不再读取',async()=>{
  const controller=new AbortController(),reason=Error('fixture cancelled'),f=fieldsFixture(()=>{controller.abort(reason);throw contextLost();});
  try{await expect(createVerifiedWechatDomWitnesses().identityWitness.read(f.page,'wechatOfficial',{signal:controller.signal,timeoutMs:()=>480000})).rejects.toBe(reason);expect(f.reads()).toBe(1);}finally{f.dispose();}
 });
});
const download=(kind:string,start='2026-09-09',end='2026-10-08')=>visible+`<input class="weui-desktop-form__input" value="${start}"><input class="weui-desktop-form__input" value="${end}"><a class="mass_all-downlink" href="/misc/${kind==='officialContent'?'appmsganalysis?action=download_summary_tendency&begin_timestamp=1788960350&end_timestamp=1791465950':`useranalysis?action=download&begin_date=${start}&end_date=${end}`}">${kind==='officialContent'?'下载数据明细':'下载表格'}</a>`;
function response(start=1788969600,end=1791475200,totalCount=13,options:{status?:number;errCode?:number;frame?:Frame;method?:string}={}){
 const request={method:()=>options.method??'POST',frame:()=>options.frame,postDataJSON:()=>({startTime:start,endTime:end,pageSize:10,currentPage:1})};
 return {url:()=>channels+'/micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/post_list',status:()=>options.status??200,request:()=>request,json:async()=>({errCode:options.errCode??0,errMsg:'',data:{totalCount,list:Array.from({length:Math.min(totalCount,10)},()=>({}))}}),finished:async()=>null} as unknown as Response;
}
describe('T1110 已实测普通DOM协议（合成fixture）',()=>{
 it('隐藏登录提示不误报有效Cookie，只有实际可见扫码提示才登录失效',async()=>{
  const witnesses=createVerifiedWechatDomWitnesses();
  expect(await witnesses.identityWitness.isLoggedOut(surface(visible+'<span style="visibility:hidden">微信扫码登录</span>',channels+'/platform').page,'wechatVideo',controls)).toBe(false);
  expect(await witnesses.identityWitness.isLoggedOut(surface(visible+'<span>微信扫码登录</span>',channels+'/platform').page,'wechatVideo',controls)).toBe(true);
 });
 it.each(['wechatOfficial','wechatVideo'] as const)('%s可见父容器中的隐藏扫码文字不证明登录失效',async platform=>{
  const witness=createVerifiedWechatDomWitnesses().identityWitness;
  const url=(platform==='wechatOfficial'?oa:channels)+'/';
  for(const hidden of ['visibility:hidden','display:none']){
   expect(await witness.isLoggedOut(surface(visible+`<div><span style="${hidden}">微信扫码登录</span></div>`,url).page,platform,controls)).toBe(false);
  }
  expect(await witness.isLoggedOut(surface(visible+'<div>微信<span>扫码</span>登录<span hidden>旧模板</span></div>',url).page,platform,controls)).toBe(true);
 });
 it('公众号固定账号设置AppID，同昵称不同ID；不取可修改ID或关联应用',async()=>{
  const a=surface(settings(),oa+'/cgi-bin/settingpage');
  expect(await readWechatIdentityDom(a.page,'wechatOfficial')).toMatchObject({platformIdentity:'wxsynthetic000001',displayName:'相同昵称',sourcePath:'/cgi-bin/settingpage'});
  const b=surface(settings('wxsynthetic000002'),oa+'/cgi-bin/settingpage');
  expect((await readWechatIdentityDom(b.page,'wechatOfficial'))?.platformIdentity).toBe('wxsynthetic000002');
  expect(await readWechatIdentityDom(surface(settings(''),oa+'/cgi-bin/settingpage').page,'wechatOfficial')).toBeNull();
  expect(await readWechatIdentityDom(surface(settings()+settings(),oa+'/cgi-bin/settingpage').page,'wechatOfficial')).toBeNull();
  await expect(readWechatIdentityDom(surface(settings(),'https://foreign.invalid/cgi-bin/settingpage').page,'wechatOfficial')).rejects.toMatchObject({code:'SOURCE_URL_INVALID'});
 });
 it('视频号普通首页唯一码；昵称/session不兜底，重复或不一致ID拒绝',async()=>{
  const html=visible+'<h2 class="finder-nickname">相同昵称</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-stable-id">synthetic-stable-id</span>';
  expect(await readWechatIdentityDom(surface(html,channels+'/platform').page,'wechatVideo')).toMatchObject({platformIdentity:'synthetic-stable-id'});
  expect(await readWechatIdentityDom(surface(html.replace('data-clipboard-text="synthetic-stable-id"','data-clipboard-text="wrong-id"'),channels+'/platform').page,'wechatVideo')).toBeNull();
  expect(await readWechatIdentityDom(surface(visible+'<h2 class="finder-nickname">相同昵称</h2>',channels+'/platform').page,'wechatVideo')).toBeNull();
 });
 it('公众号图表页无日期表也用真实日期输入和原生href同窗证明，不伪造dates',async()=>{
  const state=await readWechatReportDom(surface(download('officialContent'),oa+'/misc/appmsganalysis').page,'officialContent');
  expect(state).toMatchObject({selection:{startDate:'2026-09-09',endDate:'2026-10-08'},dates:[],windowEvidence:{kind:'nativeDateInputs',startDate:'2026-09-09',endDate:'2026-10-08'}});
  const stale=download('officialContent').replace('1788960350','1789565150');
  expect(await readWechatReportDom(surface(stale,oa+'/misc/appmsganalysis').page,'officialContent')).toBeNull();
 });
 it('公众号关注表分页10条仍保实际31日范围；重复可见输入不猜第一对',async()=>{
  const html=download('officialFollowers','2026-09-08')+'<input class="weui-desktop-form__input" value="2026-09-08"><input class="weui-desktop-form__input" value="2026-10-08"><table class="weui-desktop-table__core-table"><tr><td>2026-10-08</td></tr></table>';
  expect(await readWechatReportDom(surface(html,oa+'/misc/useranalysis').page,'officialFollowers')).toMatchObject({selection:{startDate:'2026-09-08',endDate:'2026-10-08'},dates:['2026-10-08']});
  expect(await readWechatReportDom(surface(html+'<input class="weui-desktop-form__input" value="2026-09-01">',oa+'/misc/useranalysis').page,'officialFollowers')).toBeNull();
 });
 it('单篇实际请求窗口与日报不同；仅当前frame响应成功、页总数匹配才就绪',async()=>{
  const f={} as Frame;
  const result=await readChannelsWorksResponse(response(1788969600,1791475200,13,{frame:f}),f,controls);
  expect(result).toEqual({selection:{startDate:'2026-09-10',endDate:'2026-10-09',timeZone:'Asia/Shanghai',meaning:'publishedDates'},reportedRows:13});
  for(const bad of [response(1788969600000,1791475200000,13,{frame:f}),response(1788969600,1791475200,13,{frame:{} as Frame}),response(1788969600,1791475200,13,{frame:f,errCode:1}),response(1788969600,1791475200,13,{frame:f,status:500})]) await expect(readChannelsWorksResponse(bad,f,controls)).rejects.toMatchObject({code:'REPORT_RESPONSE_INVALID'});
 });
 it.each(['channelsDaily','channelsFollowers'] as const)('%s等待实际标签和详情日期控件渲染后才选择近30天',async kind=>{
  const events:string[]=[],days=Array.from({length:30},(_,i)=>new Date(Date.parse('2026-09-09T00:00:00Z')+i*86400000).toISOString().slice(0,10));
  const html=visible+'<div class="filter-row"><div class="filter-extra"><a>下载表格</a></div><input type="radio" value="2" checked></div><div class="ant-table-body"><table>'+days.map(day=>'<tr><td>'+day+'</td></tr>').join('')+'</table></div>';
  const path=kind==='channelsFollowers'?'/micro/statistic/follower':'/micro/statistic/post',s=surface(html,channels+path);
  let tabReads=0,thirtyReads=0,sevenReads=0,tabClicked=false;
  const tab={filter:()=>tab,count:async()=>++tabReads===1?0:1,click:async()=>{tabClicked=true;events.push('tab');}};
  const thirty={filter:()=>thirty,count:async()=>{expect(tabClicked).toBe(true);return ++thirtyReads===1?0:1;},click:async()=>{events.push('30');}};
  const seven={filter:()=>seven,count:async()=>{expect(tabClicked).toBe(true);return ++sevenReads===1?0:1;},click:async()=>{events.push('7');}};
  const download={filter:()=>download,count:async()=>1};
  const frame={...s.page,locator:(selector:string)=>selector.includes('value="2"')?thirty:seven,getByText:(text:string)=>text==='下载表格'?download:tab} as unknown as Frame;
  const page=channelsTestPage({url:()=>channels+'/platform',locator:()=>({evaluateAll:async()=>[]}),goto:async()=>{},frames:()=>[frame]});
  const witness=createVerifiedWechatDomWitnesses({now:()=>Date.parse('2026-10-09T04:00:00Z')}).reportWitness;
  const result=await witness.prepare(page,'wechatVideo',kind,controls);
  expect(events).toEqual(['tab','7','30']);expect(tabReads).toBeGreaterThan(1);expect(thirtyReads).toBeGreaterThan(1);expect(sevenReads).toBeGreaterThan(1);
  expect(result.state.selection).toMatchObject({startDate:'2026-09-09',endDate:'2026-10-08'});expect(result.state.dates).toHaveLength(30);
 },180000);
 it('重复可见报表标签明确拒绝，不点击第一项或继续选日期',async()=>{
  const click=vi.fn(),locator=vi.fn();const tab={filter:()=>tab,count:async()=>2,click};
  const frame={url:()=>channels+'/micro/statistic/post',getByText:()=>tab,locator} as unknown as Frame;
  const page=channelsTestPage({url:()=>channels+'/platform',locator:()=>({evaluateAll:async()=>[]}),goto:async()=>{},frames:()=>[frame]});
  await expect(createVerifiedWechatDomWitnesses().reportWitness.prepare(page,'wechatVideo','channelsDaily',controls)).rejects.toMatchObject({code:'REPORT_SECTION_AMBIGUOUS'});
  expect(click).not.toHaveBeenCalled();expect(locator).not.toHaveBeenCalled();
 });
 it('近30天明确命中详情控件；先监听原生response后点击，不选趋势first',async()=>{
  let clicked=false;const order:string[]=[];
  const frame={} as Frame;
  let emitThirty!:()=>void;
  const detail={filter:()=>detail,count:async()=>1,click:vi.fn(async()=>{order.push('click-detail-30');clicked=true;emitThirty();})};
  const seven={filter:()=>seven,count:async()=>1,click:vi.fn(async()=>{order.push('click-detail-7');})};
  const downloadLocator={filter:()=>downloadLocator,count:async()=>1};
  const tableHtml=visible+'<div class="filter-row"><div class="filter-extra"><a>下载表格</a></div><input type="radio" value="2" checked></div><div class="card-title"><span class="info">共13条视频</span></div><div class="ant-table-body"><table><tr><td>2026/09/17</td></tr></table></div>';
  const s=surface(tableHtml,channels+'/micro/statistic/post');
  Object.assign(frame,{url:()=>channels+'/micro/statistic/post',evaluate:s.page.evaluate,locator:vi.fn((selector:string)=>selector.includes('value="2"')?detail:selector.includes('value="1"')?seven:downloadLocator),getByText:()=>({filter:()=>({count:async()=>1,click:async()=>{}})})});
  let listener:Function|undefined;
  const off=vi.fn(()=>{listener=undefined;});
  // 此请求在监听前已发出：同窗旧response晚到，不能给这次点击签就绪。
  const earlier=response(1788969600,1791475200,13,{frame});
  const page=channelsTestPage({url:()=>channels+'/platform',locator:()=>({evaluateAll:async()=>[]}),goto:async()=>{},frames:()=>[frame],on:(_event:string,fn:Function)=>{listener=fn;},off,waitForResponse:vi.fn((predicate:Function)=>{order.push('listen');return new Promise<Response>(resolve=>{emitThirty=()=>{expect(predicate(earlier)).toBe(false);expect(()=>listener?.({frame:()=>{throw Error('unrelated worker request has no frame');}})).not.toThrow();const fresh=response(1788969600,1791475200,13,{frame});listener?.(fresh.request());expect(predicate(fresh)).toBe(true);resolve(fresh);};});})});
  // 选择后跨上海午夜仍沿本次已冻结的原生请求日期，不重新解释“今天”。
  const now=vi.fn().mockReturnValueOnce(Date.parse('2026-10-09T15:59:00Z')).mockReturnValue(Date.parse('2026-10-09T16:01:00Z'));
  const witness=createVerifiedWechatDomWitnesses({now}).reportWitness;
  const result=await witness.prepare(page,'wechatVideo','channelsWorks',controls);
  expect(result.state).toMatchObject({reportedRows:13,visibleRows:1,selectedWindow:true});expect(clicked).toBe(true);
  expect(order.indexOf('listen')).toBeLessThan(order.indexOf('click-detail-30'));
  expect(vi.mocked(frame.locator).mock.calls.some(([s])=>s.startsWith('.filter-row:has(.filter-extra)'))).toBe(true);
  expect(now).toHaveBeenCalledOnce();
  expect(off).toHaveBeenCalledOnce();
 },180000);
 it.each(['cancel','deadline'] as const)('实际source与内置witness等待原生响应时%s，实停后晚响应不提交第三份',async mode=>{
  vi.useFakeTimers();vi.setSystemTime(Date.parse('2026-10-09T04:00:00Z'));
  try{
   let current=channels+'/platform',resolveResponse!:(r:Response)=>void,entered!:()=>void;
   const listening=new Promise<void>(resolve=>{entered=resolve;});
   const pending=new Promise<Response>(resolve=>{resolveResponse=resolve;});
   const days=Array.from({length:30},(_,i)=>new Date(Date.parse('2026-09-09T00:00:00Z')+i*86400000).toISOString().slice(0,10));
   const html=visible+'<div class="filter-row"><div class="filter-extra"><a>下载表格</a></div><input value="2" type="radio" checked></div><div class="ant-table-body"><table>'+days.map(day=>'<tr><td>'+day+'</td></tr>').join('')+'</table></div>';
   const locator={filter:()=>locator,count:async()=>1,click:async()=>{},getAttribute:async()=>null} as unknown as Locator;
   const postDom=surface(html,channels+'/micro/statistic/post'),followerDom=surface(html,channels+'/micro/statistic/follower');
   const frames=[postDom,followerDom].map(s=>({...s.page,locator:()=>locator,getByText:()=>locator})) as unknown as Frame[];
   const main=surface(visible+'<h2 class="finder-nickname">合成本人</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-stable-id">synthetic-stable-id</span>',channels+'/platform');
   const page=channelsTestPage({url:()=>current,goto:async(url:string)=>{current=url;},evaluate:main.page.evaluate,locator:()=>({evaluateAll:async()=>[]}),frames:()=>frames,on:vi.fn(),off:vi.fn(),waitForResponse:async()=>{entered();return pending;},waitForEvent:async()=>({failure:async()=>null,suggestedFilename:()=> 'fixture.csv',createReadStream:async()=>Readable.from([Buffer.from('明确fixture原生字节')])}) as unknown as Download});
   const onStopped=vi.fn(async()=>{}),close=vi.fn(async()=>{await onStopped();}),context={pages:()=>[page],close} as unknown as BrowserContext;
   const source=createWechatBrowserSource({...createVerifiedWechatDomWitnesses(),openProfile:async()=>context});
   const controller=new AbortController(),onReport=vi.fn(async()=>{});
   const run=source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-stable-id',{signal:controller.signal,deadlineAt:new Date(Date.now()+240000).toISOString(),onStopped},onReport);
   const rejected=expect(run).rejects.toMatchObject(mode==='cancel'?{message:'synthetic-user-cancel'}:{code:'EXECUTION_DEADLINE_EXCEEDED'});
   await listening;expect(onReport).toHaveBeenCalledTimes(2);
   if(mode==='cancel')controller.abort(Error('synthetic-user-cancel'));else await vi.advanceTimersByTimeAsync(240000);
   await rejected;expect(close).toHaveBeenCalled();expect(onStopped).toHaveBeenCalled();
   resolveResponse(response(1788969600,1791475200,13,{frame:frames[0]}));
   await vi.advanceTimersByTimeAsync(0);expect(onReport).toHaveBeenCalledTimes(2);expect(page.off).toHaveBeenCalled();
  }finally{vi.useRealTimers();}
 },180000);
});

// 五字段失败观察：全链仅浏览器/时间为明确合成fixture，不运行真实平台。
function missingSectionFixture(mode:'ok'|'throw'|'pending'='ok',exactCount=1,frameVisible=false){
 let current=channels+'/platform',release!:(value:unknown)=>void,entered!:()=>void;
 const pending=new Promise<unknown>(resolve=>{release=resolve;}),probing=new Promise<void>(resolve=>{entered=resolve;});
 const onStopped=vi.fn(async()=>{}),onReport=vi.fn(async()=>{}),onDiagnostic=vi.fn();
 const exact={count:vi.fn(async()=>exactCount),filter:()=>tab},tab={count:vi.fn(async()=>0),click:vi.fn()};
 const handle={isVisible:vi.fn(async()=>frameVisible),dispose:vi.fn(async()=>{})};
 const stats=surface(visible+'<p>fixture-private-body-token</p>',channels+'/micro/statistic/post');
 Object.defineProperty(stats.dom.window.document,'readyState',{value:'complete'});
 Object.defineProperty(stats.dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent??'';}});
 const evaluate=vi.fn(async(fn:Function,arg:unknown)=>{entered();if(mode==='throw')throw Error('Cookie=fixture-private-cookie https://secret.invalid/token /private/profile');if(mode==='pending')return pending;return stats.page.evaluate(fn as never,arg);});
 const frame={url:()=>channels+'/micro/statistic/post',getByText:()=>exact,locator:vi.fn(),frameElement:vi.fn(async()=>handle),evaluate} as unknown as Frame;
 const main=surface(visible+'<h2 class="finder-nickname">合成本人</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-stable-id">synthetic-stable-id</span>',channels+'/platform');
 const page=channelsTestPage({url:()=>current,goto:async(url:string)=>{current=url;},evaluate:main.page.evaluate,locator:()=>({evaluateAll:async()=>[]}),frames:()=>[frame]});
 const close=vi.fn(async()=>{await onStopped();}),context={pages:()=>[page],close} as unknown as BrowserContext;
 const witnesses=createVerifiedWechatDomWitnesses(),source=createWechatBrowserSource({...witnesses,openProfile:async()=>context});
 return {source,witnesses,page,frame,tab,exact,handle,evaluate,close,onStopped,onReport,onDiagnostic,probing,release:(value:unknown)=>release(value)};
}
describe('T1110 SECTION_MISSING一次受限失败观察候选',()=>{
 it.each([[1,false],[0,true]] as const)('实际source失败后仅取同frame固定数字：exact=%s visibleFrame=%s',async(exactCount,frameVisible)=>{
  vi.useFakeTimers();vi.setSystemTime(Date.parse('2026-10-09T04:00:00Z'));try{
   const f=missingSectionFixture('ok',exactCount,frameVisible),run=f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-stable-id',{deadlineAt:new Date(Date.now()+360000).toISOString(),onStopped:f.onStopped,onDiagnostic:f.onDiagnostic},f.onReport),rejected=expect(run).rejects.toMatchObject({code:'REPORT_SECTION_MISSING'});
   await vi.advanceTimersByTimeAsync(120000);await rejected;
   expect(f.evaluate).toHaveBeenCalledOnce();expect(f.frame.frameElement).toHaveBeenCalledOnce();expect(f.handle.dispose).toHaveBeenCalledOnce();
   const event=f.onDiagnostic.mock.calls[0]?.[0];expect(event).toMatchObject({stage:'prepare',kind:'channelsDaily',code:'REPORT_SECTION_MISSING',observation:{exactTabCount:exactCount,visibleTabCount:0,frameElementVisible:frameVisible,documentReadyState:'complete'}});expect(event.observation.bodyTextLength).toBeGreaterThan(0);expect(Object.keys(event.observation).sort()).toEqual(['bodyTextLength','documentReadyState','exactTabCount','frameElementVisible','visibleTabCount']);expect(JSON.stringify(event)).not.toContain('fixture-private');
   expect(f.tab.click).not.toHaveBeenCalled();expect(f.frame.locator).not.toHaveBeenCalled();expect(f.onReport).not.toHaveBeenCalled();expect(f.close).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{vi.useRealTimers();}
 });
 it('probe自身异常保原SECTION_MISSING，不输出probe秘密并按原停止',async()=>{
  vi.useFakeTimers();try{const f=missingSectionFixture('throw'),run=f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-stable-id',{onStopped:f.onStopped,onDiagnostic:f.onDiagnostic},f.onReport),rejected=expect(run).rejects.toMatchObject({code:'REPORT_SECTION_MISSING'});await vi.advanceTimersByTimeAsync(120000);await rejected;expect(f.evaluate).toHaveBeenCalledOnce();expect(f.onDiagnostic.mock.calls[0]?.[0]).not.toHaveProperty('observation');expect(JSON.stringify(f.onDiagnostic.mock.calls)).not.toContain('fixture-private');expect(f.onStopped).toHaveBeenCalledOnce();}finally{vi.useRealTimers();}
 });
 it.each(['cancel','deadline'] as const)('挂起probe中%s优先，实停后晚快照不附加、不发第二诊断',async mode=>{
  vi.useFakeTimers();try{
   const f=missingSectionFixture('pending'),controller=new AbortController(),deadlineAt=new Date(Date.now()+180000).toISOString();
   const run=f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-stable-id',{signal:controller.signal,deadlineAt,onStopped:f.onStopped,onDiagnostic:f.onDiagnostic},f.onReport),rejected=expect(run).rejects.toMatchObject(mode==='cancel'?{message:'fixture user cancelled'}:{code:'EXECUTION_DEADLINE_EXCEEDED'});
   await vi.advanceTimersByTimeAsync(120000);await f.probing;if(mode==='cancel')controller.abort(Error('fixture user cancelled'));else await vi.advanceTimersByTimeAsync(60000);await rejected;expect(f.onStopped).toHaveBeenCalled();expect(f.onDiagnostic).toHaveBeenCalledOnce();expect(f.onDiagnostic.mock.calls[0]?.[0]).not.toHaveProperty('observation');
   f.release({documentReadyState:'complete',bodyTextLength:44});await vi.advanceTimersByTimeAsync(0);expect(f.onDiagnostic).toHaveBeenCalledOnce();expect(f.onDiagnostic.mock.calls[0]?.[0]).not.toHaveProperty('observation');expect(f.onReport).not.toHaveBeenCalled();expect(f.tab.click).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
 });
 it('失败观察自己的有限上限不续期也不取代原missing',async()=>{
  vi.useFakeTimers();try{const f=missingSectionFixture('pending'),run=f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-stable-id',{deadlineAt:new Date(Date.now()+360000).toISOString(),onStopped:f.onStopped,onDiagnostic:f.onDiagnostic}),rejected=expect(run).rejects.toMatchObject({code:'REPORT_SECTION_MISSING'});await vi.advanceTimersByTimeAsync(120000);await f.probing;await vi.advanceTimersByTimeAsync(120000);await rejected;expect(f.onStopped).toHaveBeenCalledOnce();expect(f.onDiagnostic.mock.calls[0]?.[0]).not.toHaveProperty('observation');f.release({documentReadyState:'complete',bodyTextLength:5});await vi.advanceTimersByTimeAsync(0);expect(f.onDiagnostic).toHaveBeenCalledOnce();}finally{vi.useRealTimers();}
 });
 it('原期限已到但signal尚未派发，不能吞预算错误或启动probe',async()=>{
  vi.useFakeTimers();try{
   const f=missingSectionFixture(),controller=new AbortController(),end=Date.now()+120000;
   const control:WechatOperationControls={signal:controller.signal,timeoutMs:()=>{const remaining=end-Date.now();if(remaining<=0)throw new WechatBrowserSourceError('EXECUTION_DEADLINE_EXCEEDED','fixture original deadline');return remaining;}};
   const run=f.witnesses.reportWitness.prepare(f.page,'wechatVideo','channelsDaily',control),rejected=expect(run).rejects.toMatchObject({code:'EXECUTION_DEADLINE_EXCEEDED'});await vi.advanceTimersByTimeAsync(120000);await rejected;expect(controller.signal.aborted).toBe(false);expect(f.evaluate).not.toHaveBeenCalled();expect(f.frame.frameElement).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
 });
 it('合法就绪路径不观察iframe失败快照，不改变原日期选择',async()=>{
  const days=Array.from({length:30},(_,i)=>new Date(Date.parse('2026-09-09T00:00:00Z')+i*86400000).toISOString().slice(0,10));
  const s=surface(visible+'<div class="filter-row"><div class="filter-extra"><a>下载表格</a></div><input value="2" type="radio" checked></div><div class="ant-table-body"><table>'+days.map(day=>'<tr><td>'+day+'</td></tr>').join('')+'</table></div>',channels+'/micro/statistic/post');
  const locator={count:async()=>1,filter:()=>locator,click:vi.fn()},frameElement=vi.fn(async()=>({isVisible:async()=>true,dispose:async()=>{}})),evaluate=vi.fn(s.page.evaluate);const frame={...s.page,evaluate,frameElement,locator:()=>locator,getByText:()=>locator} as unknown as Frame;
  const page=channelsTestPage({url:()=>channels+'/platform',locator:()=>({evaluateAll:async()=>[]}),goto:async()=>{},frames:()=>[frame]});
  const result=await createVerifiedWechatDomWitnesses({now:()=>Date.parse('2026-10-09T04:00:00Z')}).reportWitness.prepare(page,'wechatVideo','channelsDaily',controls);
  expect(result.state.selection).toMatchObject({startDate:'2026-09-09',endDate:'2026-10-08'});expect(result.state.dates).toHaveLength(30);expect(frameElement).toHaveBeenCalledOnce();expect(evaluate).toHaveBeenCalledOnce();expect(evaluate.mock.calls[0]?.[1]).toMatchObject({kind:'channelsDaily'}); // 正常确认可见iframe与报表读取，未运行失败五字段probe。
 });
 it('重复标签没有失败观察，仍不点击不查日期',async()=>{
  const f=missingSectionFixture();vi.mocked(f.tab.count).mockResolvedValue(2);await expect(f.witnesses.reportWitness.prepare(f.page,'wechatVideo','channelsDaily',controls)).rejects.toMatchObject({code:'REPORT_SECTION_AMBIGUOUS'});expect(f.evaluate).not.toHaveBeenCalled();expect(f.frame.frameElement).not.toHaveBeenCalled();expect(f.tab.click).not.toHaveBeenCalled();expect(f.frame.locator).not.toHaveBeenCalled();
 });
});

// 真实public source + 内置identity reader；仅浏览器DOM/导航/时间为合成fixture。
function officialIdentitySourceFixture(mode:'ready'|'entryMissing'|'fieldsMissing'='ready',options:{onEntryRead?:()=>void;onSettingsNavigation?:()=>void}={}){
 let current=surface(visible,oa+'/'),fieldReads=0;
 const href='/cgi-bin/settingpage?action=index&token=fixture-private-token';
 const onStopped=vi.fn(async()=>{}),onDiagnostic=vi.fn(),page={
  url:()=>current.page.url(),isClosed:()=>closed,
  goto:vi.fn(async(url:string)=>{
   current.dom.window.close();
   if(new URL(url).pathname==='/cgi-bin/settingpage'){
    options.onSettingsNavigation?.();current=surface(mode==='fieldsMissing'?visible:settings(),url);
   }else current=surface(mode==='entryMissing'?visible:visible+`<a hidden href="${href}">账号设置</a>`,url);
  }),
  locator:()=>({evaluateAll:async(fn:Function)=>{
   options.onEntryRead?.();
   const result=(current.dom.window.eval('('+fn.toString()+')') as Function)([...current.dom.window.document.querySelectorAll('a[href]')]);
   if(mode==='entryMissing')vi.setSystemTime(Date.now()+480000);return result;
  }}),
  evaluate:async(fn:Function,arg:unknown)=>{
   if(current.page.url().includes('/cgi-bin/settingpage')){fieldReads++;if(mode==='fieldsMissing')vi.setSystemTime(Date.now()+480000);}
   return current.page.evaluate(fn as never,arg as never);
  },
 } as unknown as Page;
 let closed=false;const context={pages:()=>[page],newPage:async()=>page,close:vi.fn(async()=>{if(!closed){closed=true;await onStopped();}})} as unknown as BrowserContext;
 const witnesses=createVerifiedWechatDomWitnesses(),identityTimeoutRequests:(number|undefined)[]=[];
 const source=createWechatBrowserSource({...witnesses,identityWitness:{...witnesses.identityWitness,read:(page,platform,op)=>witnesses.identityWitness.read(page,platform,{signal:op.signal,timeoutMs:(requested)=>{identityTimeoutRequests.push(requested);return op.timeoutMs(requested);}})},openProfile:async()=>context});
 return {source,page,context,onStopped,onDiagnostic,identityTimeoutRequests,dispose:()=>current.dom.window.close(),getFieldReads:()=>fieldReads};
}
describe('T1110 公众号两段身份读取真实source合成链',()=>{
 it('T1354 未证实的入口evaluateAll异常仍结束原login并停止profile',async()=>{
  const f=officialIdentitySourceFixture('ready',{onEntryRead:()=>{throw contextLost();}});
  try{await expect(f.source.login('wechatOfficial','/synthetic-only-profile',{onStopped:f.onStopped,onDiagnostic:f.onDiagnostic})).rejects.toMatchObject({code:'BROWSER_OPERATION_FAILED'});expect(f.getFieldReads()).toBe(0);expect(f.onStopped).toHaveBeenCalledOnce();expect(f.onDiagnostic).toHaveBeenCalledWith({platform:'wechatOfficial',stage:'readIdentity',code:'BROWSER_OPERATION_FAILED',exceptionName:'Error',failureKind:'EXECUTION_CONTEXT_DESTROYED'});}finally{f.dispose();}
 });
 it('隐藏同源设置入口可导航，两个真实goto后读AppID，不把分析页fields0当失效',async()=>{
  const f=officialIdentitySourceFixture();try{
   await expect(f.source.login('wechatOfficial','/synthetic-only-profile',{onStopped:f.onStopped,onDiagnostic:f.onDiagnostic})).resolves.toEqual({platformIdentity:'wxsynthetic000001',displayName:'相同昵称',source:'wechatOfficial:/cgi-bin/settingpage'});
   expect(vi.mocked(f.page.goto).mock.calls.map(([url])=>new URL(url).pathname)).toEqual(['/','/cgi-bin/settingpage']);
   expect(vi.mocked(f.page.goto).mock.calls.every(([,options])=>options?.timeout===120000)).toBe(true);
   expect(f.identityTimeoutRequests).toEqual([480000,undefined,undefined,undefined,undefined,undefined,480000]); // 新入口在读前/后、goto前/后复核原期限，两段480000仍各建一次。
   expect(f.getFieldReads()).toBe(1);expect(f.onDiagnostic).not.toHaveBeenCalled();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
 it.each([['entryMissing','ENTRY_NOT_READY',1,0],['fieldsMissing','FIELDS_NOT_READY',2,1]] as const)('%s只回本段固定code，原中文不变且非auth，不泄漏入口query',async(mode,code,gotos,fieldReads)=>{
  vi.useFakeTimers();vi.setSystemTime(Date.parse('2026-10-09T04:00:00Z'));const f=officialIdentitySourceFixture(mode);
  try{
   await expect(f.source.login('wechatOfficial','/synthetic-only-profile',{onStopped:f.onStopped,onDiagnostic:f.onDiagnostic})).rejects.toMatchObject({code,message:'微信后台数据尚未就绪，请查看原任务'});
   expect(f.onDiagnostic).toHaveBeenCalledWith({platform:'wechatOfficial',stage:'readIdentity',code,exceptionName:'WechatBrowserSourceError'});
   expect(f.page.goto).toHaveBeenCalledTimes(gotos);expect(f.getFieldReads()).toBe(fieldReads);expect(f.onStopped).toHaveBeenCalledOnce();
   expect(JSON.stringify(f.onDiagnostic.mock.calls)).not.toContain('fixture-private-token');
  }finally{f.dispose();vi.useRealTimers();}
 });
 it.each(['cancel','deadline'] as const)('原%s优先：身份入口中断不导航设置页、不晚读字段、不重发',async mode=>{
  vi.useFakeTimers();vi.setSystemTime(Date.parse('2026-10-09T04:00:00Z'));
  const controller=new AbortController(),reason=Error('fixture original user cancellation'),start=Date.now();
  const f=officialIdentitySourceFixture('entryMissing',{onEntryRead:()=>{if(mode==='cancel')controller.abort(reason);else vi.setSystemTime(start+10001);}});
  try{
   const run=f.source.login('wechatOfficial','/synthetic-only-profile',{signal:controller.signal,deadlineAt:new Date(start+10000).toISOString(),onStopped:f.onStopped,onDiagnostic:f.onDiagnostic});
   if(mode==='cancel')await expect(run).rejects.toBe(reason);else await expect(run).rejects.toMatchObject({code:'EXECUTION_DEADLINE_EXCEEDED'});
   expect(f.page.goto).toHaveBeenCalledOnce();expect(f.getFieldReads()).toBe(0);expect(f.onDiagnostic).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{f.dispose();vi.useRealTimers();}
 });
});


describe.sequential('T1424 视频号真实Chromium同Page身份导航恢复',()=>{
 let browser:import('@playwright/test').Browser;
 beforeAll(async()=>{const {chromium}=await import('@playwright/test');browser=await chromium.launch({headless:true,timeout:120000,args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost']});},120000);
 afterAll(async()=>{await browser?.close();},120000);
 it.each(['normal','loginCheck','identityRead'] as const)('%s真实导航机制且只开原profile',async phase=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();let evaluations=0,losses=0,opened=0,closed=0,raced=false;
  const fields='<h2 class="finder-nickname">合成视频号</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-video-id">synthetic-video-id</span>';
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==channels){await route.abort();return;}await route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><body>'+(url.pathname==='/platform'?fields:'<p>合成普通首页</p>')+'</body>'});});
  const rawEvaluate=page.evaluate.bind(page),rawGoto=page.goto.bind(page);
  const protectedPage=new Proxy(page,{get(target,key){
   if(key==='evaluate')return async(fn:Parameters<Page['evaluate']>[0],arg:unknown)=>{
    evaluations++;const targetCall=phase==='loginCheck'?1:2;
    if(phase!=='normal'&&!raced&&evaluations===targetCall){raced=true;const navigation=rawGoto(channels+(phase==='loginCheck'?'/?fixture-race=1':'/platform?fixture-race=1'),{waitUntil:'domcontentloaded',timeout:120000});
     try{return await rawEvaluate(fn,arg);}catch(error){if(error instanceof Error&&error.message.includes('Execution context was destroyed'))losses++;throw error;}finally{await navigation;}
    }
    return rawEvaluate(fn,arg);
   }
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const protectedContext=new Proxy(context,{get(target,key){if(key==='pages')return()=>[protectedPage];if(key==='close')return async()=>{closed++;await target.close();};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}) as BrowserContext;
  const source=createWechatBrowserSource({...createVerifiedWechatDomWitnesses(),openProfile:async()=>{opened++;return protectedContext;}});
  try{
   let result:unknown,error:unknown;try{result=await source.readIdentity('wechatVideo','/synthetic-isolated-profile','synthetic-video-id',{deadlineAt:new Date(Date.now()+1970000).toISOString()});}catch(caught){error=caught;}
   console.info('T1424 synthetic Chromium identity',{phase,contextLosses:losses,opened,closed});
   expect(losses).toBe(phase==='normal'?0:1);expect(error).toBeUndefined();expect(result).toMatchObject({platformIdentity:'synthetic-video-id',displayName:'合成视频号'});expect(opened).toBe(1);expect(closed).toBe(1);expect(page.isClosed()).toBe(true);
  }finally{await context.close();}
 },120000);
 it('正常核验在真实同Page SPA错路径的可见qr及时LOGIN_REQUIRED，不进入报表',async()=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();let closed=0;
  await context.route('**/*',async route=>{const url=new URL(route.request().url());await route.fulfill({contentType:'text/html',body:url.origin===channels&&url.pathname==='/platform'?'<script>history.replaceState(null,"","/synthetic-login")</script><iframe src="https://open.weixin.qq.com/connect/qrconnect?state=synthetic-only"></iframe>':'<p>synthetic ordinary page</p>'});});
  const managed=new Proxy(context,{get(target,key){if(key==='close')return async()=>{closed++;await target.close();};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}),prepare=vi.fn(),onReport=vi.fn();
  const source=createWechatBrowserSource({...createVerifiedWechatDomWitnesses(),openProfile:async()=>managed,reportWitness:{prepare}});
  try{await expect(source.collectNativeReports('wechatVideo','/synthetic-isolated-profile','synthetic-bound-id',{deadlineAt:new Date(Date.now()+1970000).toISOString()},onReport)).rejects.toMatchObject({code:'LOGIN_REQUIRED'});expect(prepare).not.toHaveBeenCalled();expect(onReport).not.toHaveBeenCalled();expect(closed).toBe(1);expect(page.isClosed()).toBe(true);}finally{await context.close();}
 },120000);

});

function videoFieldsFixture(onRead:()=>void,options:{closed?:boolean;afterUrl?:string}={}){
 const dom=surface(visible+'<h2 class="finder-nickname">合成视频号</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-video-id">synthetic-video-id</span>',channels+'/platform');
 let reads=0,current=channels+'/platform';const page={url:()=>current,isClosed:()=>options.closed??false,goto:vi.fn(async()=>{}),evaluate:async(fn:Function,arg:unknown)=>{reads++;if(options.afterUrl)current=options.afterUrl;onRead();return dom.page.evaluate(fn as never,arg as never);}} as unknown as Page;
 return {page,reads:()=>reads,dispose:()=>dom.dom.window.close()};
}
describe('T1424 视频号字段观察同end/协议边界（合成DOM）',()=>{
 it.each(['','.', '.\r\nCall log: fixture-private'])('固定字段协议%s只继续原observe，不重做goto',async suffix=>{
  let calls=0;const f=videoFieldsFixture(()=>{if(++calls===1)throw contextLost(suffix);});
  try{await expect(createVerifiedWechatDomWitnesses().identityWitness.read(f.page,'wechatVideo',controls)).resolves.toMatchObject({platformIdentity:'synthetic-video-id'});expect(f.reads()).toBe(2);expect(f.page.goto).toHaveBeenCalledOnce();}finally{f.dispose();}
 });
 it.each(['closed','foreign','credentials','name','prefix','handle'] as const)('%s字段错误原样冒泡不恢复',async mode=>{
  const error=mode==='prefix'?Error('业务提示：'+contextLost().message):mode==='handle'?Error('page.evaluateHandle: Execution context was destroyed, most likely because of a navigation.'):contextLost();if(mode==='name')error.name='TypeError';
  const f=videoFieldsFixture(()=>{throw error;},{closed:mode==='closed',afterUrl:mode==='foreign'?'https://foreign.invalid/platform':mode==='credentials'?'https://name:secret@channels.weixin.qq.com/platform':undefined});
  try{await expect(createVerifiedWechatDomWitnesses().identityWitness.read(f.page,'wechatVideo',controls)).rejects.toBe(error);expect(f.reads()).toBe(1);expect(f.page.goto).toHaveBeenCalledOnce();}finally{f.dispose();}
 });
 it.each(['lateValue','contextAtEnd','delayBeyondEnd'] as const)('%s保480000字段原end，不采迟到值或再evaluate',async mode=>{
  vi.useFakeTimers();const f=videoFieldsFixture(()=>{vi.setSystemTime(Date.now()+(mode==='delayBeyondEnd'?479900:480000));if(mode!=='lateValue')throw contextLost();});
  try{
   const requested:Array<number|undefined>=[];const run=createVerifiedWechatDomWitnesses().identityWitness.read(f.page,'wechatVideo',{signal:controls.signal,timeoutMs:value=>{requested.push(value);return value??120000;}});
   const rejected=expect(run).rejects.toMatchObject({code:'IDENTITY_MISSING'});await vi.advanceTimersByTimeAsync(mode==='delayBeyondEnd'?250:0);await rejected;
   expect(f.reads()).toBe(1);expect(requested.filter(value=>value===480000)).toHaveLength(1);expect(f.page.goto).toHaveBeenCalledOnce();
  }finally{f.dispose();vi.useRealTimers();}
 });
 it('视频号字段goto失败不重试，取消优先于context恢复',async()=>{
  const f=videoFieldsFixture(()=>{}),error=Error('page.goto: Navigation to "x" is interrupted by another navigation to "y"');vi.mocked(f.page.goto).mockRejectedValueOnce(error);
  try{await expect(createVerifiedWechatDomWitnesses().identityWitness.read(f.page,'wechatVideo',controls)).rejects.toBe(error);expect(f.reads()).toBe(0);expect(f.page.goto).toHaveBeenCalledOnce();}finally{f.dispose();}
  const controller=new AbortController(),reason=Error('fixture original cancelled'),g=videoFieldsFixture(()=>{controller.abort(reason);throw contextLost();});
  try{await expect(createVerifiedWechatDomWitnesses().identityWitness.read(g.page,'wechatVideo',{signal:controller.signal,timeoutMs:()=>480000})).rejects.toBe(reason);expect(g.reads()).toBe(1);}finally{g.dispose();}
 });
});

describe('T1424 身份原同次evaluate的脱敏shape',()=>{
 const html=visible+'<h2 class="finder-nickname">random-private-name-27</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="random-private-id-83">random-private-id-83</span>';
 it('原成功identity不变、一次evaluate同时得到精确/宽selector计数且不输出值',async()=>{
  const s=surface(html,channels+'/platform?token=random-private-query-19'),observation=vi.fn();s.page.evaluate=vi.fn(s.page.evaluate);
  try{
   expect(await readWechatIdentityDom(s.page,'wechatVideo',observation)).toMatchObject({platformIdentity:'random-private-id-83',displayName:'random-private-name-27'});expect(s.page.evaluate).toHaveBeenCalledOnce();expect(observation).toHaveBeenCalledOnce();
   expect(observation.mock.calls[0]![0]).toMatchObject({routeClass:'identity',rootScan:'complete',roots:[{kind:'top',uidRaw:1,uidVisible:1,nameRaw:1,nameVisible:1,uidIdRaw:1,nameClassRaw:1,idTextPresent:true,copyPresent:true,copyMatches:true,namePresent:true}]});
   expect(JSON.stringify(observation.mock.calls)).not.toMatch(/random-private|https:|clipboard-text/);
  }finally{s.dom.window.close();}
 });
 it('诊断异常不替换成功identity；路径短路不增加evaluate',async()=>{
  const s=surface(html,channels+'/platform'),other=surface(html,channels+'/platform/');other.page.evaluate=vi.fn(other.page.evaluate);const observation=vi.fn(()=>{throw Error('random-private callback failure');});
  try{await expect(readWechatIdentityDom(s.page,'wechatVideo',observation)).resolves.toMatchObject({platformIdentity:'random-private-id-83'});expect(await readWechatIdentityDom(other.page,'wechatVideo',observation)).toBeNull();expect(other.page.evaluate).not.toHaveBeenCalled();expect(observation).toHaveBeenCalledTimes(2);}finally{s.dom.window.close();other.dom.window.close();}
 });
 it('shadow中有候选只诊断不放行顶层identity，界定根归属',async()=>{
  const s=surface(visible+'<div id="host"></div>',channels+'/platform');s.dom.window.document.querySelector('#host')!.attachShadow({mode:'open'}).innerHTML=html;const observation=vi.fn();
  try{expect(await readWechatIdentityDom(s.page,'wechatVideo',observation)).toBeNull();expect(observation).toHaveBeenCalledOnce();const roots=observation.mock.calls[0]![0].roots;expect(roots[0]).toMatchObject({kind:'top',uidVisible:0,nameVisible:0});expect(roots).toEqual(expect.arrayContaining([expect.objectContaining({kind:'openShadow',uidVisible:1,nameVisible:1,uidInRoot:true,nameInRoot:true})]));}finally{s.dom.window.close();}
 });
});

describe('T1424 shape不改变身份等价表与诊断失败边界',()=>{
 const id='<span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="private-copy-602">private-copy-602</span>',name='<h2 class="finder-nickname">private-name-791</h2>';
 it.each(['missing','duplicate','hidden','empty','mismatch','emptyName','broadOnly'] as const)('%s保持原null，只有固定计数/布尔观察',async mode=>{
  const markup=mode==='missing'?name:mode==='duplicate'?id+id+name:mode==='hidden'?'<div hidden>'+id+'</div>'+name:mode==='empty'?id.replaceAll('private-copy-602','')+name:mode==='mismatch'?id.replace('>private-copy-602','>private-other-298')+name:mode==='emptyName'?id+name.replace('private-name-791',''):id.replace(' class="finder-uniq-id"','')+name.replaceAll('h2','div');
  const s=surface(visible+markup,channels+'/platform?private-query-302'),observation=vi.fn();
  try{expect(await readWechatIdentityDom(s.page,'wechatVideo')).toBeNull();expect(await readWechatIdentityDom(s.page,'wechatVideo',observation)).toBeNull();expect(observation).toHaveBeenCalledOnce();expect(JSON.stringify(observation.mock.calls)).not.toMatch(/private-|channels|clipboard/);if(mode==='broadOnly')expect(observation.mock.calls[0]![0].roots[0]).toMatchObject({uidRaw:0,nameRaw:0,uidIdRaw:1,nameClassRaw:1});}finally{s.dom.window.close();}
 });
 it('metadata计算异常或异步callback失败保留原有效identity，不吞原evaluate异常',async()=>{
  const s=surface(visible+id+name,channels+'/platform'),observation=vi.fn();
  try{s.dom.window.document.createTreeWalker=()=>{throw Error('private metadata exception');};await expect(readWechatIdentityDom(s.page,'wechatVideo',observation)).resolves.toMatchObject({platformIdentity:'private-copy-602'});expect(observation).not.toHaveBeenCalled();
   const actual=Error('private original evaluate error');s.page.evaluate=vi.fn(async()=>{throw actual;});await expect(readWechatIdentityDom(s.page,'wechatVideo',observation)).rejects.toBe(actual);
  }finally{s.dom.window.close();}
  const g=surface(visible+id+name,channels+'/platform');try{await expect(readWechatIdentityDom(g.page,'wechatVideo',async()=>{throw Error('private async metadata');})).resolves.toMatchObject({platformIdentity:'private-copy-602'});}finally{g.dom.window.close();}
 });
 it('同origin frame只记录根归属，不从frame认领顶层身份；未知封闭shadow不报空目录',async()=>{
  const s=surface(visible+'<iframe src="'+channels+'/fixture"></iframe><private-host></private-host>',channels+'/platform'),observation=vi.fn();
  try{const frame=s.dom.window.document.querySelector('iframe')!;frame.contentDocument!.write('<html><body>'+visible+id+name+'</body></html>');frame.contentDocument!.close();Object.defineProperty((frame.contentWindow as unknown as Window & typeof globalThis).HTMLElement.prototype,'getClientRects',{value:()=>[{width:10,height:10}]});s.dom.window.document.querySelector('private-host')!.attachShadow({mode:'closed'}).innerHTML=id+name;
   expect(await readWechatIdentityDom(s.page,'wechatVideo',observation)).toBeNull();expect(observation.mock.calls[0]![0]).toMatchObject({frameCount:1,foreignFrameCount:0,unknownShadowCount:1,roots:[{kind:'top',uidRaw:0},{kind:'frame',parent:0,uidRaw:1,nameRaw:1,uidInRoot:true}]});
  }finally{s.dom.window.close();}
 });
 it('foreign origin仍原错且无evaluate/shape；路径短路count为unknown不是0',async()=>{
  const s=surface(visible+id+name,'https://private-foreign.invalid/platform'),other=surface(visible+id+name,channels+'/platform/'),observation=vi.fn();s.page.evaluate=vi.fn(s.page.evaluate);
  try{await expect(readWechatIdentityDom(s.page,'wechatVideo',observation)).rejects.toMatchObject({code:'SOURCE_URL_INVALID'});expect(s.page.evaluate).not.toHaveBeenCalled();expect(observation).not.toHaveBeenCalled();expect(await readWechatIdentityDom(other.page,'wechatVideo',observation)).toBeNull();expect(observation.mock.calls[0]![0]).toMatchObject({routeClass:'identity_slash',rootScan:'not_run',frameCount:null,unknownShadowCount:null,roots:[]});}finally{s.dom.window.close();other.dom.window.close();}
 });
 it('count封顶且扫描有界；超界不冒完整观察',async()=>{
  const s=surface(visible+id.repeat(1001)+name+'<div></div>'.repeat(2001),channels+'/platform'),observation=vi.fn();
  try{expect(await readWechatIdentityDom(s.page,'wechatVideo',observation)).toBeNull();expect(observation.mock.calls[0]![0]).toMatchObject({truncated:true,rootScan:'limited',roots:[{uidRaw:1000,uidVisible:1000}]});}finally{s.dom.window.close();}
 });
 it.each(['deadline','cancel'] as const)('%s后不接纳同次evaluate迟到shape，保原end/取消',async mode=>{
  vi.useFakeTimers();const controller=new AbortController(),reason=Error('private cancellation'),observation=vi.fn();const f=videoFieldsFixture(()=>{if(mode==='deadline')vi.setSystemTime(Date.now()+480000);else controller.abort(reason);});
  try{const run=createVerifiedWechatDomWitnesses().identityWitness.read(f.page,'wechatVideo',{signal:controller.signal,timeoutMs:value=>value??120000,onIdentityObservation:observation});if(mode==='deadline')await expect(run).rejects.toMatchObject({code:'IDENTITY_MISSING'});else await expect(run).rejects.toBe(reason);expect(observation).not.toHaveBeenCalled();expect(f.reads()).toBe(1);expect(f.page.goto).toHaveBeenCalledOnce();}finally{f.dispose();vi.useRealTimers();}
 });
});

describe('T1424 root扫描有限归属',()=>{
 it('foreign frame不读取子DOM，openShadow多根限8并标limited',async()=>{
  const s=surface(visible+'<iframe src="https://private-cross-origin.invalid/secret"></iframe>'+Array.from({length:10},()=>'<div class="host"></div>').join(''),channels+'/platform'),observation=vi.fn();
  try{for(const host of s.dom.window.document.querySelectorAll('.host'))host.attachShadow({mode:'open'}).innerHTML='<h2 class="finder-nickname">private shadow</h2>';
   expect(await readWechatIdentityDom(s.page,'wechatVideo',observation)).toBeNull();const shape=observation.mock.calls[0]![0];expect(shape).toMatchObject({frameCount:1,foreignFrameCount:1,truncated:true,rootScan:'limited'});expect(shape.roots).toHaveLength(8);expect(shape.roots.slice(1).every((r:{kind:string;parent:number})=>r.kind==='openShadow'&&r.parent===0)).toBe(true);expect(JSON.stringify(shape)).not.toMatch(/private|https|secret/);
  }finally{s.dom.window.close();}
 });
});

describe('T1424 聚合count截断诚实性',()=>{
 it('1001custom-tag未知shadow封顶必须limited而非完整1000',async()=>{
  const s=surface(visible+'<private-host></private-host>'.repeat(1001),channels+'/platform'),observation=vi.fn();
  try{expect(await readWechatIdentityDom(s.page,'wechatVideo',observation)).toBeNull();expect(observation.mock.calls[0]![0]).toMatchObject({unknownShadowCount:1000,truncated:true,rootScan:'limited'});}finally{s.dom.window.close();}
 });
});

describe('T1424 EXP2 官方wrongpath有限诊断（不改变身份门）',()=>{
 function wrongSurface(html:string,url=channels+'/'){
  const s=surface(visible+html,url),times:number[]=[];
  const page={...s.page,url:()=>s.dom.window.location.href,isClosed:()=>false,goto:vi.fn(async()=>{}),evaluate:vi.fn(async(fn:Function,arg:unknown)=>{times.push(Date.now());return s.page.evaluate(fn as never,arg as never);})} as unknown as Page;
  return {...s,page,times};
 }
 it.each([['/','official_root'],['/platform/','identity_slash'],['/platform/statistic/post','platform_post'],['/platform/statistic/follower','platform_follower'],['/micro/statistic/post','micro_post'],['/micro/statistic/follower','micro_follower'],['/private-unknown-367','official_other']])('%s只输出固定route/ready/login元数据，原身份仍null',async(path,routeClass)=>{
  const s=wrongSurface('<p>微信扫码登录</p>',channels+path+'?private-query-629#private-hash-481'),observation=vi.fn();
  try{expect(await readWechatIdentityDom(s.page,'wechatVideo',observation,true)).toBeNull();expect(s.page.evaluate).toHaveBeenCalledOnce();expect(observation).toHaveBeenCalledOnce();expect(observation.mock.calls[0]![0]).toMatchObject({routeClass,loginPromptVisible:true,rootScan:'not_run',roots:[],frameCount:null,foreignFrameCount:null,unknownShadowCount:null});expect(JSON.stringify(observation.mock.calls)).not.toMatch(/private|https:|扫码/);}finally{s.dom.window.close();}
 });
 it('只有原poll的0/1/3/7秒机会，最多4附加evaluate，delay取消保原AbortError/cause',async()=>{
  vi.useFakeTimers();const base=Date.now(),controller=new AbortController(),reason=Error('synthetic EXP2 stop'),s=wrongSurface('<p>普通内容</p>'),observation=vi.fn();
  try{const run=createVerifiedWechatDomWitnesses().identityWitness.read(s.page,'wechatVideo',{signal:controller.signal,timeoutMs:value=>value??120000,onIdentityObservation:observation}).catch(error=>error);await vi.advanceTimersByTimeAsync(0);for(const advance of [1000,2000,4000,3000]){await vi.advanceTimersByTimeAsync(advance);await (await import('node:timers/promises')).setTimeout(275);}controller.abort(reason);expect(await run).toMatchObject({name:'AbortError',code:'ABORT_ERR',cause:reason});expect(s.times.map(time=>time-base)).toEqual([0,1000,3000,7000]);expect(s.page.goto).toHaveBeenCalledOnce();expect(observation.mock.calls.every(([shape])=>shape.loginPromptVisible===false&&shape.rootScan==='not_run')).toBe(true);}finally{s.dom.window.close();vi.useRealTimers();}
 });
 it('wrongpath新增evaluate pending也受原480000字段end，不借600000',async()=>{
  vi.useFakeTimers();const s=wrongSurface('<p>普通内容</p>'),observation=vi.fn();let release!:(value:unknown)=>void;vi.mocked(s.page.evaluate).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}) as never);
  try{const run=createVerifiedWechatDomWitnesses().identityWitness.read(s.page,'wechatVideo',{signal:controls.signal,timeoutMs:value=>value??120000,onIdentityObservation:observation}).catch(error=>error);await vi.advanceTimersByTimeAsync(120000);await (await import('node:timers/promises')).setTimeout(275);expect(s.page.evaluate).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(360000);expect(await run).toMatchObject({code:'IDENTITY_MISSING'});expect(s.page.evaluate).toHaveBeenCalledOnce();release({identity:null,shape:{routeClass:'official_root',loginPromptVisible:true}});await vi.advanceTimersByTimeAsync(0);expect(observation).not.toHaveBeenCalled();}finally{s.dom.window.close();vi.useRealTimers();}
 });
});

describe('T1424 EXP2 独评最小边界',()=>{
 function fixture(html='<p>普通内容</p>',url=channels+'/'){
  const s=surface(visible+html,url),times:number[]=[];
  const page={...s.page,url:()=>s.dom.window.location.href,isClosed:()=>false,goto:vi.fn(async()=>{}),evaluate:vi.fn(async(fn:Function,arg:unknown)=>{times.push(Date.now());return s.page.evaluate(fn as never,arg as never);})} as unknown as Page;
  return {...s,page,times};
 }
 it.each([
  ['<p>扫码登录</p>',true],['<p>微信扫码登录</p>',true],['<p>请使用微信扫描二维码登录</p>',true],['<p>微信<span>扫码</span>登录</p>',true],
  ['<p hidden>扫码登录</p>',false],['<div style="display:none"><p>微信扫码登录</p></div>',false],['<p style="visibility:hidden">扫码登录</p>',false],['<p>请扫码登录查看</p>',false],['<script>扫码登录</script><p>普通内容</p>',false],
 ])('prompt观察与原isLoggedOut算法等价 %#',async(html,expected)=>{
  const s=fixture(String(html)),onObservation=vi.fn();
  try{expect(await createVerifiedWechatDomWitnesses().identityWitness.isLoggedOut(s.page,'wechatVideo',controls)).toBe(expected);expect(await readWechatIdentityDom(s.page,'wechatVideo',onObservation,true)).toBeNull();expect(onObservation.mock.calls[0]![0]).toMatchObject({loginPromptVisible:expected,rootScan:'not_run',roots:[],frameCount:null});expect(s.page.evaluate).toHaveBeenCalledTimes(2);}finally{s.dom.window.close();}
 });
 it('exact shape的login为unknown，不新增prompt正文遍历',async()=>{
  const s=fixture('<h2 class="finder-nickname">synthetic-name</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-id">synthetic-id</span>',channels+'/platform'),onObservation=vi.fn(),queries=vi.spyOn(s.dom.window.document,'querySelectorAll');
  try{expect(await readWechatIdentityDom(s.page,'wechatVideo',onObservation)).toMatchObject({platformIdentity:'synthetic-id'});expect(onObservation.mock.calls[0]![0]).toMatchObject({loginPromptVisible:null,qrLoginFrameRaw:null,qrLoginFrameVisible:null});expect(queries.mock.calls.some(([selector])=>selector==='iframe')).toBe(false);expect(queries.mock.calls.some(([selector])=>selector==='h1,h2,h3,p,span,div')).toBe(false);}finally{s.dom.window.close();}
 });
 it('metadata错误保null且机会预消耗，不补偿失败',async()=>{
  vi.useFakeTimers();const s=fixture(),controller=new AbortController(),reason=Error('synthetic stop'),onObservation=vi.fn();vi.mocked(s.page.evaluate).mockRejectedValue(Error('private metadata failure'));
  try{const run=createVerifiedWechatDomWitnesses().identityWitness.read(s.page,'wechatVideo',{signal:controller.signal,timeoutMs:value=>value??120000,onIdentityObservation:onObservation}).catch(error=>error);await vi.advanceTimersByTimeAsync(0);for(const advance of [1000,2000,4000,3000]){await vi.advanceTimersByTimeAsync(advance);await (await import('node:timers/promises')).setTimeout(275);}expect(s.page.evaluate).toHaveBeenCalledTimes(4);controller.abort(reason);expect(await run).toMatchObject({name:'AbortError',cause:reason});expect(onObservation).not.toHaveBeenCalled();}finally{controller.abort(reason);s.dom.window.close();vi.useRealTimers();}
 });
 it('跨过机会只取最新due，不catchup突发补发',async()=>{
  vi.useFakeTimers();const s=fixture(),base=Date.now(),controller=new AbortController(),reason=Error('synthetic stop');const evaluate=async(fn:Function,arg:unknown)=>(s.dom.window.eval('('+fn.toString()+')') as Function)(arg);let first=true;
  vi.mocked(s.page.evaluate).mockImplementation(async(fn,arg)=>{if(typeof fn!=='function')throw Error('合成fixture只接受函数');s.times.push(Date.now());if(first){first=false;const value=await evaluate(fn,arg);vi.setSystemTime(base+5000);return value;}return evaluate(fn,arg);});
  try{const run=createVerifiedWechatDomWitnesses().identityWitness.read(s.page,'wechatVideo',{signal:controller.signal,timeoutMs:value=>value??120000,onIdentityObservation:()=>{}}).catch(error=>error);await vi.advanceTimersByTimeAsync(0);for(const advance of [250,1750,3000]){await vi.advanceTimersByTimeAsync(advance);await (await import('node:timers/promises')).setTimeout(275);}controller.abort(reason);await run;expect(s.times.map(time=>time-base)).toEqual([0,5250,7000]);}finally{controller.abort(reason);s.dom.window.close();vi.useRealTimers();}
 });
 it('微任务间取消不调用新增SDK，race取消保reason并隔离late',async()=>{
  const s=fixture(),controller=new AbortController(),reason=Error('synthetic microtask cancel'),onObservation=vi.fn();
  try{const run=createVerifiedWechatDomWitnesses().identityWitness.read(s.page,'wechatVideo',{signal:controller.signal,timeoutMs:value=>value??120000,onIdentityObservation:onObservation}).catch(error=>error);queueMicrotask(()=>controller.abort(reason));expect(await run).toBe(reason);expect(s.page.evaluate).not.toHaveBeenCalled();expect(onObservation).not.toHaveBeenCalled();}finally{controller.abort(reason);s.dom.window.close();}
  const g=fixture(),cancel=new AbortController();let release!:(value:unknown)=>void;vi.mocked(g.page.evaluate).mockImplementation(()=>new Promise(resolve=>{release=resolve;}) as never);
  try{const run=createVerifiedWechatDomWitnesses().identityWitness.read(g.page,'wechatVideo',{signal:cancel.signal,timeoutMs:value=>value??120000,onIdentityObservation:onObservation}).catch(error=>error);await new Promise(resolve=>setImmediate(resolve));expect(g.page.evaluate).toHaveBeenCalledOnce();cancel.abort(reason);expect(await run).toBe(reason);release({identity:null,shape:{routeClass:'official_root',loginPromptVisible:true}});await new Promise(resolve=>setImmediate(resolve));expect(onObservation).not.toHaveBeenCalled();}finally{cancel.abort(reason);g.dom.window.close();}
 });
 it('微任务回exact跳过新增求值，下一个原poll正常核原身份',async()=>{
  const s=fixture('<h2 class="finder-nickname">synthetic-name</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-id">synthetic-id</span>',channels+'/platform'),onObservation=vi.fn();let reads=0;s.page.url=()=>++reads===1?channels+'/':channels+'/platform';
  try{expect(await createVerifiedWechatDomWitnesses().identityWitness.read(s.page,'wechatVideo',{...controls,onIdentityObservation:onObservation})).toMatchObject({platformIdentity:'synthetic-id'});expect(s.page.evaluate).toHaveBeenCalledOnce();expect(onObservation.mock.calls[0]![0]).toMatchObject({routeClass:'identity',rootScan:'complete',loginPromptVisible:null});}finally{s.dom.window.close();}
 });
 it('actual evaluate内先拒foreign，不读其DOM或输出shape',async()=>{
  const s=fixture(),onObservation=vi.fn(),queries=vi.spyOn(s.dom.window.document,'querySelectorAll'),evaluate=async(fn:Function,arg:unknown)=>(s.dom.window.eval('('+fn.toString()+')') as Function)(arg);vi.mocked(s.page.evaluate).mockImplementation(async(fn,arg)=>{if(typeof fn!=='function')throw Error('合成fixture只接受函数');s.dom.reconfigure({url:'https://private-foreign.invalid/private-path?private-query'});return evaluate(fn,arg);});
  try{await expect(createVerifiedWechatDomWitnesses().identityWitness.read(s.page,'wechatVideo',{...controls,onIdentityObservation:onObservation})).rejects.toMatchObject({code:'SOURCE_URL_INVALID'});expect(s.page.evaluate).toHaveBeenCalledOnce();expect(queries).not.toHaveBeenCalled();expect(onObservation).not.toHaveBeenCalled();}finally{s.dom.window.close();}
 });
});

describe('T1424 EXP2 二维码iframe固定src元数据',()=>{
 const endpoint='https://open.weixin.qq.com/connect/qrconnect?appid=private-app-673&state=private-state-824';
 it.each([['visible','<iframe src="'+endpoint+'"></iframe>',1,1],['hidden','<div style="display:none"><iframe src="'+endpoint+'"></iframe></div>',1,0],['near','<iframe src="https://open.weixin.qq.com.evil.invalid/connect/qrconnect"></iframe><iframe src="https://open.weixin.qq.com/connect/qrconnect/next"></iframe><iframe src="http://open.weixin.qq.com/connect/qrconnect"></iframe><iframe src="https://private-user:private-pass@open.weixin.qq.com/connect/qrconnect"></iframe>',0,0]] as const)('%s只投影raw/visible，不读frameDOM或登录放行',async(_kind,html,raw,seen)=>{
  const s=surface(visible+html,channels+'/'),onObservation=vi.fn();
  try{for(const iframe of s.dom.window.document.querySelectorAll('iframe')){Object.defineProperty(iframe,'contentDocument',{configurable:true,get(){throw Error('不允许读取frame DOM');}});Object.defineProperty(iframe,'contentWindow',{configurable:true,get(){throw Error('不允许读取frame window');}});}
   expect(await readWechatIdentityDom(s.page,'wechatVideo',onObservation,true)).toBeNull();expect(onObservation.mock.calls[0]![0]).toMatchObject({qrLoginFrameRaw:raw,qrLoginFrameVisible:seen,rootScan:'not_run',roots:[],frameCount:null,foreignFrameCount:null,unknownShadowCount:null});expect(JSON.stringify(onObservation.mock.calls)).not.toMatch(/private|open.weixin|qrconnect|appid|state/);
  }finally{for(const iframe of s.dom.window.document.querySelectorAll('iframe')){Reflect.deleteProperty(iframe,'contentDocument');Reflect.deleteProperty(iframe,'contentWindow');}s.dom.window.close();}
 });
 it('超过1000封顶标truncated，不能冒称root扫描limited',async()=>{
  const s=surface(visible+'<iframe src="'+endpoint+'"></iframe>',channels+'/'),onObservation=vi.fn(),query=s.dom.window.document.querySelectorAll.bind(s.dom.window.document),iframe=query('iframe')[0]!;
  Object.defineProperty(s.dom.window.document,'querySelectorAll',{value:(selector:string)=>selector==='iframe'?Array.from({length:1001},()=>iframe):query(selector)});
  try{expect(await readWechatIdentityDom(s.page,'wechatVideo',onObservation,true)).toBeNull();expect(onObservation.mock.calls[0]![0]).toMatchObject({qrLoginFrameRaw:1000,qrLoginFrameVisible:1000,truncated:true,rootScan:'not_run',roots:[],frameCount:null});}finally{for(const iframe of s.dom.window.document.querySelectorAll('iframe')){Reflect.deleteProperty(iframe,'contentDocument');Reflect.deleteProperty(iframe,'contentWindow');}s.dom.window.close();}
 });
});

describe('T1424 EXP2 二维码计数故障保持unknown',()=>{
 it.each(['attribute','visible'] as const)('%s失败不伪造0或半份计数，保留已知route/prompt',async mode=>{
  const s=surface(visible+'<iframe src="https://open.weixin.qq.com/connect/qrconnect?state=private-state"></iframe>',channels+'/'),iframe=s.dom.window.document.querySelector('iframe')!,onObservation=vi.fn();
  if(mode==='attribute')iframe.getAttribute=()=>{throw Error('private attr failure');};else Object.defineProperty(iframe,'getClientRects',{value(){throw Error('private rect failure');}});
  try{expect(await readWechatIdentityDom(s.page,'wechatVideo',onObservation,true)).toBeNull();expect(onObservation.mock.calls[0]![0]).toMatchObject({routeClass:'official_root',loginPromptVisible:false,qrLoginFrameRaw:null,qrLoginFrameVisible:null,rootScan:'not_run',roots:[]});expect(JSON.stringify(onObservation.mock.calls)).not.toContain('private');}finally{s.dom.window.close();}
 });
});

describe('T1424 修复goto后官方登录见证及时needsAuth',()=>{
 const qr='<iframe src="https://open.weixin.qq.com/connect/qrconnect?appid=synthetic-private-app&state=synthetic-private-state"></iframe>';
 it.each(['none','throw','pending'] as const)('source预检false后重定向可见qr，diagnostic %s不能决定业务',async observer=>{
  const s=surface(visible+'<p>普通入口</p>',channels+'/'),controller=new AbortController(),reason=Error('synthetic RED deadline'),prepare=vi.fn(),onReport=vi.fn();let closed=false;
  const page={...s.page,url:()=>s.dom.window.location.href,isClosed:()=>closed,goto:vi.fn(async(url:string)=>{s.dom.reconfigure({url:url.endsWith('/platform')?channels+'/synthetic-login':url});s.dom.window.document.body.innerHTML=url.endsWith('/platform')?qr:'<p>普通入口</p>';})} as unknown as Page;
  const close=vi.fn(async()=>{closed=true;}),context={pages:()=>[page],close} as unknown as BrowserContext;
  const source=createWechatBrowserSource({...createVerifiedWechatDomWitnesses(),reportWitness:{prepare},openProfile:async()=>context});
  const timer=setTimeout(()=>controller.abort(reason),500);
  try{const onDiagnostic=observer==='none'?undefined:observer==='throw'?()=>{throw Error('synthetic logger');}:()=>new Promise<void>(()=>{});const error=await source.collectNativeReports('wechatVideo','/synthetic-isolated-profile','synthetic-bound-id',{signal:controller.signal,onDiagnostic},onReport).catch(error=>error);
   expect(error).toMatchObject({code:'LOGIN_REQUIRED'});expect(controller.signal.aborted).toBe(false);expect(prepare).not.toHaveBeenCalled();expect(onReport).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();expect(closed).toBe(true);
  }finally{clearTimeout(timer);controller.abort(reason);s.dom.window.close();}
 });
});

describe('T1424 修复业务见证必要反证',()=>{
 const qr='<iframe src="https://open.weixin.qq.com/connect/qrconnect?state=synthetic-private"></iframe>',identity='<h2 class="finder-nickname">synthetic-name</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-id">synthetic-id</span>';
 const bound={...controls,timeoutMs:(value?:number)=>value??120000,identityVerification:'boundIdentity' as const};
 function fields(html:string,url=channels+'/synthetic-login'){
  const s=surface(visible+html,url),page={...s.page,url:()=>s.dom.window.location.href,isClosed:()=>false,goto:vi.fn(async()=>{})} as unknown as Page;return {...s,page};
 }
 it.each(['hidden','parentHidden','visibility','near','empty'] as const)('%s不是明确登录见证，不把null放行身份',async mode=>{
  const html=mode==='hidden'?'<section hidden>'+qr+'</section>':mode==='parentHidden'?'<section style="display:none">'+qr+'</section>':mode==='visibility'?'<section style="visibility:hidden">'+qr+'</section>':mode==='near'?'<iframe src="https://open.weixin.qq.com.evil.invalid/connect/qrconnect"></iframe><iframe src="http://open.weixin.qq.com/connect/qrconnect"></iframe><iframe src="https://open.weixin.qq.com/connect/qrconnect/next"></iframe><iframe src="https://user:pass@open.weixin.qq.com/connect/qrconnect"></iframe>':'<p>普通页</p>',s=fields(html);
  try{expect(await readWechatIdentityDom(s.page,'wechatVideo',undefined,true,true)).toBeNull();}finally{s.dom.window.close();}
 });
 it.each(['attribute','visible'] as const)('%s业务读取异常不吞为false或LOGIN_REQUIRED',async mode=>{
  const s=fields(qr),iframe=s.dom.window.document.querySelector('iframe')!,error=Error('synthetic private witness failure');if(mode==='attribute')iframe.getAttribute=()=>{throw error;};else Object.defineProperty(iframe,'getClientRects',{value(){throw error;}});
  try{await expect(readWechatIdentityDom(s.page,'wechatVideo',undefined,true,true)).rejects.toBe(error);}finally{s.dom.window.close();}
 });
 it('exact非空身份优先，背景qr不改变原身份准入',async()=>{
  const s=fields(identity+qr,channels+'/platform');try{expect(await createVerifiedWechatDomWitnesses().identityWitness.read(s.page,'wechatVideo',bound)).toMatchObject({platformIdentity:'synthetic-id',displayName:'synthetic-name',sourcePath:'/platform'});}finally{s.dom.window.close();}
 });
 it('interactive login同一窗口保原等待，完成后仍成功',async()=>{
  const s=fields('<p>入口</p>',channels+'/'),controller=new AbortController(),reason=Error('synthetic stop');let closed=false;
  const page={...s.page,isClosed:()=>closed,goto:vi.fn(async(url:string)=>{s.dom.reconfigure({url:url.endsWith('/platform')?channels+'/synthetic-login':url});s.dom.window.document.body.innerHTML=url.endsWith('/platform')?qr:'<p>入口</p>';})} as unknown as Page;
  const close=vi.fn(async()=>{closed=true;}),source=createWechatBrowserSource({...createVerifiedWechatDomWitnesses(),openProfile:async()=>({pages:()=>[page],close}) as unknown as BrowserContext});
  const complete=setTimeout(()=>{s.dom.reconfigure({url:channels+'/platform'});s.dom.window.document.body.innerHTML=identity;},300),stop=setTimeout(()=>controller.abort(reason),2000);
  try{expect(await source.login('wechatVideo','/synthetic-profile',{signal:controller.signal})).toMatchObject({platformIdentity:'synthetic-id'});expect(controller.signal.aborted).toBe(false);expect(close).toHaveBeenCalledOnce();}finally{clearTimeout(complete);clearTimeout(stop);controller.abort(reason);s.dom.window.close();}
 });
 it('诊断四次机会耗尽后业务见证仍工作，callback抛错不能吞登录错误',async()=>{
  vi.useFakeTimers();const s=fields('<p>普通页</p>'),controller=new AbortController(),reason=Error('synthetic stop'),observer=vi.fn(()=>{throw Error('synthetic logger');});
  try{const run=createVerifiedWechatDomWitnesses().identityWitness.read(s.page,'wechatVideo',{...bound,signal:controller.signal,onIdentityObservation:observer}).catch(error=>error);await vi.advanceTimersByTimeAsync(0);for(const advance of [1000,2000,4000]){await vi.advanceTimersByTimeAsync(advance);await (await import('node:timers/promises')).setTimeout(275);}expect(observer).toHaveBeenCalledTimes(4);s.dom.window.document.body.innerHTML=qr;await vi.advanceTimersByTimeAsync(1000);await (await import('node:timers/promises')).setTimeout(275);controller.abort(reason);expect(await run).toMatchObject({code:'LOGIN_REQUIRED'});expect(observer).toHaveBeenCalledTimes(4);}finally{controller.abort(reason);s.dom.window.close();vi.useRealTimers();}
 });
 it.each(['cancel','end'] as const)('%s优先于同次求值返回的LOGIN见证',async mode=>{
  vi.useFakeTimers();const s=fields(qr),controller=new AbortController(),reason=Error('synthetic cancelled'),evaluate=s.page.evaluate.bind(s.page);
  const page={...s.page,evaluate:async(fn:Function,arg:unknown)=>{const value=await evaluate(fn as never,arg as never);if(mode==='cancel')controller.abort(reason);else vi.setSystemTime(Date.now()+480000);return value;}} as unknown as Page;
  try{const run=createVerifiedWechatDomWitnesses().identityWitness.read(page,'wechatVideo',{...bound,signal:controller.signal});if(mode==='cancel')await expect(run).rejects.toBe(reason);else await expect(run).rejects.toMatchObject({code:'IDENTITY_MISSING'});}finally{controller.abort(reason);s.dom.window.close();vi.useRealTimers();}
 });
 it('业务pending在120s不重开，480000原end截止且late LOGIN不生效',async()=>{
  vi.useFakeTimers();const s=fields(qr);let release!:(value:unknown)=>void;const evaluate=vi.fn(()=>new Promise(resolve=>{release=resolve;})),page={...s.page,evaluate} as unknown as Page;
  try{const run=createVerifiedWechatDomWitnesses().identityWitness.read(page,'wechatVideo',bound).catch(error=>error);await vi.advanceTimersByTimeAsync(120000);await (await import('node:timers/promises')).setTimeout(275);expect(evaluate).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(360000);expect(await run).toMatchObject({code:'IDENTITY_MISSING'});release({identity:null,loginRequired:true});await vi.advanceTimersByTimeAsync(0);expect(evaluate).toHaveBeenCalledOnce();}finally{s.dom.window.close();vi.useRealTimers();}
 });
 it('actual wrongpath不一致或返回后path漂移，不能采纳旧LOGIN',async()=>{
  const s=fields(qr),queries=vi.spyOn(s.dom.window.document,'querySelectorAll'),first=s.page.url;s.page.url=()=>channels+'/different-entry';
  try{expect(await readWechatIdentityDom(s.page,'wechatVideo',undefined,true,true)).toBeNull();expect(queries).not.toHaveBeenCalled();s.page.url=first;const evaluate=s.page.evaluate.bind(s.page),page={...s.page,evaluate:async(fn:Function,arg:unknown)=>{const result=await evaluate(fn as never,arg as never);s.dom.reconfigure({url:channels+'/changed-after-evaluate'});return result;}} as unknown as Page;expect(await readWechatIdentityDom(page,'wechatVideo',undefined,true,true)).toBeNull();}finally{s.dom.window.close();}
 });
 it('业务context destroyed仍只恢复原Page/原end，未知错误原样冒泡',async()=>{
  const s=fields(qr),evaluate=s.page.evaluate.bind(s.page);let reads=0;
  const page={...s.page,evaluate:async(fn:Function,arg:unknown)=>{if(++reads===1)throw contextLost();return evaluate(fn as never,arg as never);}} as unknown as Page;
  try{await expect(createVerifiedWechatDomWitnesses().identityWitness.read(page,'wechatVideo',bound)).rejects.toMatchObject({code:'LOGIN_REQUIRED'});expect(reads).toBe(2);expect(s.page.goto).toHaveBeenCalledOnce();}finally{s.dom.window.close();}
 });
});

// 路由单测只核导航拒绝/短路；三份文件和真实事务由channels公共Chromium族证明。
describe('T1424 固定官方报表导航边界',()=>{
 function navigation(start=channels+'/platform',options:{landed?:string;status?:number;loggedOut?:boolean;afterGoto?:()=>void;error?:Error}={}){
  let current=start;const entered=Error('synthetic report root reached');
  const goto=vi.fn(async(url:string)=>{if(options.error)throw options.error;current=options.landed??url;options.afterGoto?.();return {status:()=>options.status??200};});
  const frames=vi.fn(()=>{throw entered;}),evaluate=vi.fn(async(_fn?:unknown,arg?:unknown)=>arg===undefined?options.loggedOut??false:{identity:null});
  return {entered,goto,frames,evaluate,page:{url:()=>current,goto,frames,evaluate} as unknown as Page};
 }
 it.each([['channelsDaily','post'],['channelsFollowers','follower'],['channelsWorks','post']] as const)('%s只用固定官方%s父路径，不需要菜单或调用URL',async(kind,path)=>{
  const f=navigation();await expect(createVerifiedWechatDomWitnesses().reportWitness.prepare(f.page,'wechatVideo',kind,controls)).rejects.toBe(f.entered);
  expect(f.goto).toHaveBeenCalledExactlyOnceWith(channels+'/platform/statistic/'+path,{waitUntil:'domcontentloaded',timeout:120000});expect(f.frames).toHaveBeenCalledOnce();
 });
 it.each([['channelsDaily','post'],['channelsFollowers','follower'],['channelsWorks','post']] as const)('%s已在目标父路径不重复goto或重新读取身份',async(kind,path)=>{
  const f=navigation(channels+'/platform/statistic/'+path);await expect(createVerifiedWechatDomWitnesses().reportWitness.prepare(f.page,'wechatVideo',kind,controls)).rejects.toBe(f.entered);
  expect(f.goto).not.toHaveBeenCalled();expect(f.evaluate).not.toHaveBeenCalled();
 });
 it.each(['unknown','toString','__proto__','officialContent'])('未知或平台不匹配kind %s不导航',async kind=>{
  const f=navigation();await expect(createVerifiedWechatDomWitnesses().reportWitness.prepare(f.page,'wechatVideo',kind as never,controls)).rejects.toMatchObject({code:'REPORT_PLATFORM_MISMATCH'});expect(f.goto).not.toHaveBeenCalled();expect(f.frames).not.toHaveBeenCalled();
 });
 it.each(['https://foreign.invalid/platform/statistic/post','https://name@channels.weixin.qq.com/platform/statistic/post'])('错误origin或credentials不读取登录/报表',async landed=>{
  const f=navigation(undefined,{landed});await expect(createVerifiedWechatDomWitnesses().reportWitness.prepare(f.page,'wechatVideo','channelsDaily',controls)).rejects.toMatchObject({code:'SOURCE_URL_INVALID'});expect(f.goto).toHaveBeenCalledOnce();expect(f.evaluate).not.toHaveBeenCalled();expect(f.frames).not.toHaveBeenCalled();
 });
 it.each([['home',channels+'/platform',200],['forbidden',channels+'/platform/statistic/post',403],['missing',channels+'/platform/statistic/post',404]] as const)('%s不能以正常返回冒报表ready',async(_kind,landed,status)=>{
  const f=navigation(undefined,{landed,status});await expect(createVerifiedWechatDomWitnesses().reportWitness.prepare(f.page,'wechatVideo','channelsDaily',controls)).rejects.toMatchObject({code:'REPORT_PAGE_MISSING'});expect(f.frames).not.toHaveBeenCalled();expect(f.goto).toHaveBeenCalledOnce();
 });
 it('真实登录见证优先于非目标路径，保持LOGIN_REQUIRED而不推断过期',async()=>{
  const f=navigation(undefined,{landed:channels+'/',loggedOut:true});await expect(createVerifiedWechatDomWitnesses().reportWitness.prepare(f.page,'wechatVideo','channelsDaily',controls)).rejects.toMatchObject({code:'LOGIN_REQUIRED'});expect(f.frames).not.toHaveBeenCalled();expect(f.goto).toHaveBeenCalledOnce();
 });
 it('普通goto异常不重试，不吞成登录/成功',async()=>{
  const error=Error('synthetic navigation failed'),f=navigation(undefined,{error});await expect(createVerifiedWechatDomWitnesses().reportWitness.prepare(f.page,'wechatVideo','channelsDaily',controls)).rejects.toBe(error);expect(f.goto).toHaveBeenCalledOnce();expect(f.frames).not.toHaveBeenCalled();
 });
 it.each(['before','afterGoto','afterLogin'] as const)('%s取消优先，无晚报表读取',async phase=>{
  const controller=new AbortController(),reason=Error('synthetic cancelled');if(phase==='before')controller.abort(reason);
  const f=navigation(undefined,{afterGoto:()=>{if(phase==='afterGoto')controller.abort(reason);}});if(phase==='afterLogin')f.evaluate.mockImplementation(async()=>{controller.abort(reason);return true;});
  await expect(createVerifiedWechatDomWitnesses().reportWitness.prepare(f.page,'wechatVideo','channelsDaily',{...controls,signal:controller.signal})).rejects.toBe(reason);expect(f.frames).not.toHaveBeenCalled();expect(f.goto).toHaveBeenCalledTimes(phase==='before'?0:1);
 });
 it.each(['before','afterGoto','afterLogin'] as const)('%s原deadline已尽，即使迟到goto/login成功也不采纳',async phase=>{
  let expired=phase==='before';const error=Object.assign(Error('synthetic original deadline'),{code:'EXECUTION_DEADLINE_EXCEEDED'}),f=navigation(undefined,{afterGoto:()=>{if(phase==='afterGoto')expired=true;}});
  if(phase==='afterLogin')f.evaluate.mockImplementation(async()=>{expired=true;return true;});
  const op={...controls,timeoutMs:(requested?:number)=>{if(expired)throw error;return Math.min(requested??120000,120000);}};
  await expect(createVerifiedWechatDomWitnesses().reportWitness.prepare(f.page,'wechatVideo','channelsDaily',op)).rejects.toBe(error);expect(f.frames).not.toHaveBeenCalled();expect(f.goto).toHaveBeenCalledTimes(phase==='before'?0:1);
 });
});

describe('T1424 固定报表导航复用原可信QR业务见证',()=>{
 const qr='<iframe src="https://open.weixin.qq.com/connect/qrconnect?appid=synthetic&state=synthetic"></iframe>';
 it.each(['normal','cancel','deadline','foreign'] as const)('%s：无顶层登录文案的QR重定向，父取消/期限及官方origin优先',async mode=>{
  const s=surface(visible+qr,channels+'/fixture-login'),controller=new AbortController(),reason=Object.assign(Error('synthetic original stop'),{code:'EXECUTION_DEADLINE_EXCEEDED'});let current=channels+'/platform',calls=0,expired=false;
  const goto=vi.fn(async()=>{current=channels+'/fixture-login';return {status:()=>200};}),frames=vi.fn(()=>[]);
  const page={url:()=>current,goto,frames,evaluate:async(fn:Function,arg:unknown)=>{const value=await s.page.evaluate(fn as never,arg as never);if(++calls===2){if(mode==='cancel')controller.abort(reason);if(mode==='deadline')expired=true;if(mode==='foreign')current='https://foreign.invalid/fixture-login';}return value;}} as unknown as Page;
  const op={signal:controller.signal,timeoutMs:(requested?:number)=>{if(expired)throw reason;return requested??120000;}};
  try{const run=createVerifiedWechatDomWitnesses().reportWitness.prepare(page,'wechatVideo','channelsDaily',op);if(mode==='cancel'||mode==='deadline')await expect(run).rejects.toBe(reason);else await expect(run).rejects.toMatchObject({code:mode==='foreign'?'SOURCE_URL_INVALID':'LOGIN_REQUIRED'});expect(calls).toBe(2);expect(goto).toHaveBeenCalledOnce();expect(frames).not.toHaveBeenCalled();}finally{s.dom.window.close();}
 });
});


const officialEntryContextLost=(suffix='')=>Error('locator.evaluateAll: Execution context was destroyed, most likely because of a navigation'+suffix);
function officialEntryFixture(onEntry?:(state:{calls:number;setUrl:(url:string)=>void;setEntryHref:(href:string)=>void;showSettings:()=>void;close:()=>void})=>void,onGoto?:()=>void){
 const dom=surface(visible+'<a href="/cgi-bin/settingpage?fixture=old-href">账号设置</a>',oa+'/cgi-bin/home');let calls=0,closed=false,fieldReads=0;
 const setUrl=(url:string)=>dom.dom.reconfigure({url});
 const showSettings=()=>{setUrl(oa+'/cgi-bin/settingpage');dom.dom.window.document.body.innerHTML=settings();};
 const page={url:()=>dom.dom.window.location.href,isClosed:()=>closed,goto:vi.fn(async()=>{onGoto?.();showSettings();}),
  locator:()=>({evaluateAll:vi.fn(async(fn:Function)=>{calls++;onEntry?.({calls,setUrl,setEntryHref:href=>dom.dom.window.document.querySelector('a')!.setAttribute('href',href),showSettings,close:()=>{closed=true;}});return (dom.dom.window.eval('('+fn.toString()+')') as Function)([...dom.dom.window.document.querySelectorAll('a[href]')]);})}),
  evaluate:async(fn:Function,arg:unknown)=>{fieldReads++;return dom.page.evaluate(fn as never,arg as never);},
 } as unknown as Page;
 const read=(op:WechatOperationControls=controls)=>createVerifiedWechatDomWitnesses().identityWitness.read(page,'wechatOfficial',op);
 return {page,read,calls:()=>calls,fieldReads:()=>fieldReads,dispose:()=>dom.dom.window.close()};
}
describe('T1406 公众号入口evaluateAll实证协议窄恢复',()=>{
 it.each(['','.','\nCall log: fixture-private'])('入口固定前缀%s仅重观测原Page，不重建入口480s end',async suffix=>{
  const f=officialEntryFixture(({calls})=>{if(calls===1)throw officialEntryContextLost(suffix);});const requests:(number|undefined)[]=[];
  try{await expect(f.read({signal:controls.signal,timeoutMs:r=>{requests.push(r);return r??120000;}})).resolves.toMatchObject({platformIdentity:'wxsynthetic000001'});expect(f.calls()).toBe(2);expect(f.page.goto).toHaveBeenCalledOnce();expect(requests.filter(r=>r===480000)).toHaveLength(2);}finally{f.dispose();}
 });
 it.each(['throw','return'] as const)('自动落settings后%s也丢弃旧href，不多余goto',async mode=>{
  const f=officialEntryFixture(({showSettings})=>{showSettings();if(mode==='throw')throw officialEntryContextLost();});
  try{await expect(f.read()).resolves.toMatchObject({sourcePath:'/cgi-bin/settingpage',platformIdentity:'wxsynthetic000001'});expect(f.calls()).toBe(1);expect(f.page.goto).not.toHaveBeenCalled();expect(f.fieldReads()).toBe(1);}finally{f.dispose();}
 });
 it('同path query变化丢弃旧href，重新观察后只导航新href',async()=>{
  const f=officialEntryFixture(({calls,setUrl,setEntryHref})=>{if(calls===1)setUrl(oa+'/cgi-bin/home?fixture=new-session');else setEntryHref('/cgi-bin/settingpage?fixture=new-href');});
  try{await expect(f.read()).resolves.toMatchObject({platformIdentity:'wxsynthetic000001'});expect(f.calls()).toBe(2);expect(f.page.goto).toHaveBeenCalledExactlyOnceWith(oa+'/cgi-bin/settingpage?fixture=new-href',expect.objectContaining({waitUntil:'domcontentloaded'}));}finally{f.dispose();}
 });
 it('goto预算读取恰耗完入口end时不向SDK传timeout零',async()=>{
  vi.useFakeTimers();const start=Date.parse('2026-10-24T00:00:00Z');vi.setSystemTime(start);let inheritedChecks=0;const f=officialEntryFixture();
  const op={signal:controls.signal,timeoutMs:(r?:number)=>{if(r===undefined&&++inheritedChecks===4)vi.setSystemTime(start+480000);return r??120000;}};
  try{await expect(f.read(op)).rejects.toMatchObject({code:'ENTRY_NOT_READY'});expect(f.page.goto).not.toHaveBeenCalled();expect(f.fieldReads()).toBe(0);}finally{f.dispose();vi.useRealTimers();}
 });
 it.each(['throw','return'] as const)('原入口end后%s不采用迟到href，不导航/读字段',async mode=>{
  vi.useFakeTimers();const start=Date.parse('2026-10-24T00:00:00Z');vi.setSystemTime(start);
  const f=officialEntryFixture(()=>{vi.setSystemTime(start+480000);if(mode==='throw')throw officialEntryContextLost();});
  try{await expect(f.read({signal:controls.signal,timeoutMs:r=>r??120000})).rejects.toMatchObject({code:'ENTRY_NOT_READY'});expect(f.calls()).toBe(1);expect(f.page.goto).not.toHaveBeenCalled();expect(f.fieldReads()).toBe(0);}finally{f.dispose();vi.useRealTimers();}
 });
 it.each(['throw','return'] as const)('取消优先%s，未采纳晚结果/未再导航',async mode=>{
  const controller=new AbortController(),reason=Error('synthetic original cancel');const f=officialEntryFixture(()=>{controller.abort(reason);if(mode==='throw')throw officialEntryContextLost();});
  try{await expect(f.read({signal:controller.signal,timeoutMs:r=>r??120000})).rejects.toBe(reason);expect(f.calls()).toBe(1);expect(f.page.goto).not.toHaveBeenCalled();expect(f.fieldReads()).toBe(0);}finally{f.dispose();}
 });
 it.each(['foreign','closed'] as const)('瞬态后%s不重观测或接受身份',async mode=>{
  const error=officialEntryContextLost();const f=officialEntryFixture(({setUrl,close})=>{if(mode==='foreign')setUrl('https://foreign.invalid/cgi-bin/home');else close();throw error;});
  try{await expect(f.read()).rejects.toBe(error);expect(f.calls()).toBe(1);expect(f.page.goto).not.toHaveBeenCalled();expect(f.fieldReads()).toBe(0);}finally{f.dispose();}
 });
 it.each(['foreign','closed'] as const)('入口成功返回但%s，不采用旧href',async mode=>{
  const f=officialEntryFixture(({setUrl,close})=>{if(mode==='foreign')setUrl('https://foreign.invalid/cgi-bin/home');else close();});
  try{await expect(f.read()).rejects.toMatchObject({code:mode==='foreign'?'SOURCE_URL_INVALID':'BROWSER_OPERATION_FAILED'});expect(f.page.goto).not.toHaveBeenCalled();expect(f.fieldReads()).toBe(0);}finally{f.dispose();}
 });
 it.each([
  Error('page.evaluate: Execution context was destroyed, most likely because of a navigation.'),
  Error('Execution context was destroyed, most likely because of a navigation.'),
  Error('业务提示：locator.evaluateAll: Execution context was destroyed, most likely because of a navigation.'),
  Error('locator.evaluateAll: Execution context was destroyed, most likely because of a navigation problem'),
  Object.assign(officialEntryContextLost(),{name:'TimeoutError'}),
  Error('locator.evaluateAll: Target page, context or browser has been closed'),
  Error('fixture-private unknown'),
 ])('近似/未知/其它协议 %# 保原异常，不复用字段宽尾匹配',async error=>{
  const f=officialEntryFixture(()=>{throw error;});try{await expect(f.read()).rejects.toBe(error);expect(f.calls()).toBe(1);expect(f.page.goto).not.toHaveBeenCalled();}finally{f.dispose();}
 });
 it.each([
  Error('page.goto: Navigation to "https://mp.weixin.qq.com/cgi-bin/settingpage?fixture=private" is interrupted by another navigation to "https://mp.weixin.qq.com/cgi-bin/home"'),
  Error('page.goto: net::ERR_ABORTED at https://mp.weixin.qq.com/cgi-bin/settingpage?fixture=private'),
 ])('设置goto未证协议 %# 不恢复，不再读取入口',async error=>{
  const f=officialEntryFixture(undefined,()=>{throw error;});try{await expect(f.read()).rejects.toBe(error);expect(f.calls()).toBe(1);expect(f.page.goto).toHaveBeenCalledOnce();expect(f.fieldReads()).toBe(0);}finally{f.dispose();}
 });
 it('重复入口瞬态共享最初480s end，第二次耗尽不导航也不建字段窗口',async()=>{
  vi.useFakeTimers();const start=Date.parse('2026-10-24T00:00:00Z');vi.setSystemTime(start);const requests:(number|undefined)[]=[];
  const f=officialEntryFixture(({calls})=>{vi.setSystemTime(start+calls*240000);throw officialEntryContextLost();});
  try{await expect(f.read({signal:controls.signal,timeoutMs:r=>{requests.push(r);return r??120000;}})).rejects.toMatchObject({code:'ENTRY_NOT_READY'});expect(f.calls()).toBe(2);expect(requests.filter(r=>r===480000)).toHaveLength(1);expect(f.page.goto).not.toHaveBeenCalled();expect(f.fieldReads()).toBe(0);}finally{f.dispose();vi.useRealTimers();}
 });
 it.each(['cancel','deadline','closed','foreign'] as const)('设置goto返回后%s优先，不晚读字段或返回身份',async mode=>{
  vi.useFakeTimers();const start=Date.parse('2026-10-24T00:00:00Z');vi.setSystemTime(start);const controller=new AbortController(),reason=Error('synthetic cancel after goto');
  const f=officialEntryFixture(undefined,()=>{if(mode==='cancel')controller.abort(reason);if(mode==='deadline')vi.setSystemTime(start+480000);if(mode==='closed')f.page.isClosed=()=>true;if(mode==='foreign')f.page.url=()=> 'https://foreign.invalid/cgi-bin/settingpage';});
  try{const reading=f.read({signal:controller.signal,timeoutMs:r=>r??120000});if(mode==='cancel')await expect(reading).rejects.toBe(reason);else await expect(reading).rejects.toMatchObject({code:mode==='deadline'?'ENTRY_NOT_READY':mode==='foreign'?'SOURCE_URL_INVALID':'BROWSER_OPERATION_FAILED'});expect(f.page.goto).toHaveBeenCalledOnce();expect(f.fieldReads()).toBe(0);expect(f.calls()).toBe(1);}finally{f.dispose();vi.useRealTimers();}
 });
 it('原父deadline先于入口end，瞬态不能借完整480s',async()=>{
  vi.useFakeTimers();const start=Date.parse('2026-10-24T00:00:00Z');vi.setSystemTime(start);const error=new WechatBrowserSourceError('EXECUTION_DEADLINE_EXCEEDED','synthetic inherited end');
  const f=officialEntryFixture(()=>{vi.setSystemTime(start+1001);throw officialEntryContextLost();});
  try{await expect(f.read({signal:controls.signal,timeoutMs:r=>{const remaining=start+1000-Date.now();if(remaining<=0)throw error;return Math.min(r??120000,remaining);}})).rejects.toBe(error);expect(f.calls()).toBe(1);expect(f.page.goto).not.toHaveBeenCalled();expect(f.fieldReads()).toBe(0);}finally{f.dispose();vi.useRealTimers();}
 });
 it('设置goto的正timeout仍裁剪到原入口剩余时间',async()=>{
  vi.useFakeTimers();const start=Date.parse('2026-10-24T00:00:00Z');vi.setSystemTime(start);const f=officialEntryFixture(()=>vi.setSystemTime(start+479999));
  try{await expect(f.read({signal:controls.signal,timeoutMs:r=>r??120000})).resolves.toMatchObject({platformIdentity:'wxsynthetic000001'});expect(f.page.goto).toHaveBeenCalledExactlyOnceWith(expect.any(String),{waitUntil:'domcontentloaded',timeout:1});}finally{f.dispose();vi.useRealTimers();}
 });

});
