import {JSDOM} from 'jsdom';
import {Readable} from 'node:stream';
import type {Page,Frame,Response,BrowserContext,Download,Locator} from '@playwright/test';
import {describe,it,expect,vi} from 'vitest';
import {readWechatIdentityDom,readWechatReportDom,readChannelsWorksResponse,createVerifiedWechatDomWitnesses} from './wechat-dom-witness';
import {createWechatBrowserSource,type WechatOperationControls,WechatBrowserSourceError} from './wechat-browser-source';
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
  const page={url:()=>channels+'/platform',locator:()=>({evaluateAll:async()=>[]}),goto:async()=>{},frames:()=>[frame]} as unknown as Page;
  const witness=createVerifiedWechatDomWitnesses({now:()=>Date.parse('2026-10-09T04:00:00Z')}).reportWitness;
  const result=await witness.prepare(page,'wechatVideo',kind,controls);
  expect(events).toEqual(['tab','7','30']);expect(tabReads).toBeGreaterThan(1);expect(thirtyReads).toBeGreaterThan(1);expect(sevenReads).toBeGreaterThan(1);
  expect(result.state.selection).toMatchObject({startDate:'2026-09-09',endDate:'2026-10-08'});expect(result.state.dates).toHaveLength(30);
 },180000);
 it('重复可见报表标签明确拒绝，不点击第一项或继续选日期',async()=>{
  const click=vi.fn(),locator=vi.fn();const tab={filter:()=>tab,count:async()=>2,click};
  const frame={url:()=>channels+'/micro/statistic/post',getByText:()=>tab,locator} as unknown as Frame;
  const page={url:()=>channels+'/platform',locator:()=>({evaluateAll:async()=>[]}),goto:async()=>{},frames:()=>[frame]} as unknown as Page;
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
  const page={url:()=>channels+'/platform',locator:()=>({evaluateAll:async()=>[]}),goto:async()=>{},frames:()=>[frame],on:(_event:string,fn:Function)=>{listener=fn;},off,waitForResponse:vi.fn((predicate:Function)=>{order.push('listen');return new Promise<Response>(resolve=>{emitThirty=()=>{expect(predicate(earlier)).toBe(false);expect(()=>listener?.({frame:()=>{throw Error('unrelated worker request has no frame');}})).not.toThrow();const fresh=response(1788969600,1791475200,13,{frame});listener?.(fresh.request());expect(predicate(fresh)).toBe(true);resolve(fresh);};});})} as unknown as Page;
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
   const page={url:()=>current,goto:async(url:string)=>{current=url;},evaluate:main.page.evaluate,locator:()=>({evaluateAll:async()=>[]}),frames:()=>frames,on:vi.fn(),off:vi.fn(),waitForResponse:async()=>{entered();return pending;},waitForEvent:async()=>({failure:async()=>null,suggestedFilename:()=> 'fixture.csv',createReadStream:async()=>Readable.from([Buffer.from('明确fixture原生字节')])}) as unknown as Download} as unknown as Page;
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
 const page={url:()=>current,goto:async(url:string)=>{current=url;},evaluate:main.page.evaluate,locator:()=>({evaluateAll:async()=>[]}),frames:()=>[frame]} as unknown as Page;
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
  const locator={count:async()=>1,filter:()=>locator,click:vi.fn()},frameElement=vi.fn();const frame={...s.page,frameElement,locator:()=>locator,getByText:()=>locator} as unknown as Frame;
  const page={url:()=>channels+'/platform',locator:()=>({evaluateAll:async()=>[]}),goto:async()=>{},frames:()=>[frame]} as unknown as Page;
  const result=await createVerifiedWechatDomWitnesses({now:()=>Date.parse('2026-10-09T04:00:00Z')}).reportWitness.prepare(page,'wechatVideo','channelsDaily',controls);
  expect(result.state.selection).toMatchObject({startDate:'2026-09-09',endDate:'2026-10-08'});expect(result.state.dates).toHaveLength(30);expect(frameElement).not.toHaveBeenCalled();
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
  url:()=>current.page.url(),
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
 it('隐藏同源设置入口可导航，两个真实goto后读AppID，不把分析页fields0当失效',async()=>{
  const f=officialIdentitySourceFixture();try{
   await expect(f.source.login('wechatOfficial','/synthetic-only-profile',{onStopped:f.onStopped,onDiagnostic:f.onDiagnostic})).resolves.toEqual({platformIdentity:'wxsynthetic000001',displayName:'相同昵称',source:'wechatOfficial:/cgi-bin/settingpage'});
   expect(vi.mocked(f.page.goto).mock.calls.map(([url])=>new URL(url).pathname)).toEqual(['/','/cgi-bin/settingpage']);
   expect(vi.mocked(f.page.goto).mock.calls.every(([,options])=>options?.timeout===120000)).toBe(true);
   expect(f.identityTimeoutRequests).toEqual([480000,undefined,480000]);expect(f.getFieldReads()).toBe(1);expect(f.onDiagnostic).not.toHaveBeenCalled();expect(f.onStopped).toHaveBeenCalledOnce();
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
