import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import type {Browser} from '@playwright/test';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {createWechatBrowserSource,type WechatNativeDownload} from './wechat-browser-source';
import {createVerifiedWechatDomWitnesses} from './wechat-dom-witness';
import {guardedLaunch} from '../browser/chromium-guard';

// 明确合成官方Wujie对象关系：hidden runtime与可见Shadow。只访问拦截fixture，无用户账号。
const {chromium}=createRequire(resolve(process.cwd(),'../frontend/package.json'))('@playwright/test') as typeof import('@playwright/test');
const origin='https://channels.weixin.qq.com',instant=Date.parse('2026-10-09T04:00:00Z');
const days=Array.from({length:30},(_,i)=>new Date(Date.parse('2026-09-09T00:00:00Z')+i*86400000).toISOString().slice(0,10));
const rows=(dates:string[])=>dates.map(d=>`<tr><td>${d}</td></tr>`).join('');
type Variant='recovery-home'|'permanent-home'|'recovery-budget'|'home'|'home-root'|'home-slash'|'canonical'|'home-proxy-without-sandbox'|'forged-iframe'|'missing-sandbox'|'wrong-root'|'wrong-iframe'|'wrong-path'|'wrong-origin'|'duplicate-host'|'foreign-parent'|'replace-host'|'date-drift';
function child(variant:Variant){
 const html=`<button data-section="daily">全部视频</button><button data-section="followers">关注者增长</button><button data-section="works">单篇视频</button><div class="filter-row"><div class="filter-extra"><a href="javascript:;">下载表格</a></div><label><input type="radio" name="range" value="1" checked>近7天</label><label><input type="radio" name="range" value="2">近30天</label></div><div class="card-title"><span class="info">共13条视频</span></div><div class="ant-table-body"><table>${rows(days.slice(-7))}</table></div>`;
 return `<body><script>setTimeout(()=>{
 const host=parent.document.querySelector('wujie-app'),ui=host.shadowRoot;ui.innerHTML=${JSON.stringify(html)};
 const variant=${JSON.stringify(variant)},sandbox={iframe:frameElement,shadowRoot:ui,proxyLocation:{origin:location.origin,pathname:location.pathname}};
 if(variant==='wrong-root')sandbox.shadowRoot=parent.document.createElement('div').attachShadow({mode:'open'});
 if(variant==='wrong-iframe')sandbox.iframe=parent.document.createElement('iframe');
 if(variant==='forged-iframe')sandbox.iframe={contentWindow:window};
 if(variant==='home-proxy-without-sandbox')document.querySelectorAll=ui.querySelectorAll.bind(ui);
 if(variant==='wrong-path')sandbox.proxyLocation.pathname='/micro/statistic/other';
 if(variant==='wrong-origin')sandbox.proxyLocation.origin='https://foreign.invalid';
 if(variant!=='missing-sandbox'&&variant!=='home-proxy-without-sandbox')window.__WUJIE=sandbox;
 if(variant==='duplicate-host'){const d=parent.document.createElement('wujie-app');d.attachShadow({mode:'open'}).innerHTML=ui.innerHTML;host.after(d);}
 if(variant==='permanent-home'||(variant==='recovery-home'||variant==='recovery-budget')&&parent.syntheticEntries===1){const other=parent.document.createElement('wujie-app');other.style.cssText='display:block;width:900px;height:600px';other.setAttribute('data-wujie-id','synthetic-other');other.attachShadow({mode:'open'}).innerHTML=ui.innerHTML;host.replaceWith(other);host.setAttribute('data-wujie-id','synthetic-statistic');frameElement.setAttribute('name','synthetic-statistic');}
 if(variant!=='canonical')parent.history.replaceState({},'',variant==='foreign-parent'?'/platform/other':variant==='home-root'?'/':variant==='home-slash'?'/platform/':'/platform');
 console.log('synthetic-rendered-ready');let section=location.pathname.endsWith('follower')?'followers':'daily';
 ui.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{section=b.dataset.section;console.log('synthetic-report-click');if(variant==='replace-host')host.replaceWith(host.cloneNode(true));});
 ui.querySelector('.filter-extra a').onclick=event=>{event.preventDefault();console.log('synthetic-download');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['明确合成Wujie下载字节'],{type:'text/csv'}));a.download='synthetic.csv';a.click();};
 ui.querySelectorAll('input').forEach(input=>input.onchange=async()=>{
  const days=${JSON.stringify(days)};ui.querySelector('table').innerHTML=(input.value==='2'?days:days.slice(-7)).map(d=>'<tr><td>'+d+'</td></tr>').join('');
  if(input.value==='2'&&variant==='date-drift')ui.querySelector('table').innerHTML='<tr><td>2020-01-01</td></tr>';
  if(input.value==='2'&&section==='works'){
   ui.querySelector('table').innerHTML=${JSON.stringify(rows(days.slice(-9).concat('2026-10-09')))};
   await fetch('/micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/post_list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startTime:${Date.parse('2026-09-10T00:00:00Z')/1000},endTime:${Date.parse('2026-10-09T00:00:00Z')/1000},pageSize:10,currentPage:1})});
  }
 });
 },150)</script></body>`;
}
const home=`<body><h2 class="finder-nickname">明确合成账号</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-rendered-id">synthetic-rendered-id</span><li class="weui-desktop-menu__sub__wrp"><span class="weui-desktop-menu__name">数据中心</span><ul class="weui-desktop-sub-menu"><a data-path="post">视频数据</a><a data-path="follower">关注者数据</a></ul></li><main></main><script>document.querySelectorAll('[data-path]').forEach(a=>a.onclick=()=>{window.syntheticEntries=(window.syntheticEntries||0)+1;console.log('synthetic-menu-entry');if(window.syntheticVariant==='recovery-budget'&&window.syntheticEntries===2)return;history.pushState({},'','/platform/statistic/'+a.dataset.path);document.querySelector('main').innerHTML='<wujie-app style="display:block;width:900px;height:600px"></wujie-app><iframe hidden src="/micro/statistic/'+a.dataset.path+'"></iframe>';document.querySelector('wujie-app').attachShadow({mode:'open'});});</script></body>`;

describe('可见报表与hidden runtime精确归属，真实Chromium公共三报表链',()=>{
 let browser:Browser;
 beforeAll(async()=>{browser=await chromium.launch({headless:true,timeout:120000,args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost']});},120000);
 afterAll(async()=>{await browser?.close();},120000);
 async function fixture(variant:Variant,onReady?:()=>void){
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}),page=await context.newPage();let downloads=0,ready=0,clicks=0,entries=0,stopped=false;
  page.on('console',m=>{if(m.text()==='synthetic-download')downloads++;if(m.text()==='synthetic-rendered-ready'){ready++;onReady?.();}if(m.text()==='synthetic-menu-entry')entries++;if(m.text()==='synthetic-report-click')clicks++;});
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin){await route.abort();return;}if(u.pathname.endsWith('/post_list')){await route.fulfill({json:{errCode:0,data:{totalCount:13,list:Array.from({length:10},()=>({}))}}});return;}await route.fulfill({contentType:'text/html; charset=utf-8',body:u.pathname.startsWith('/micro/statistic/')?child(variant):home.replace('<script>','<script>window.syntheticVariant='+JSON.stringify(variant)+';')});});
  const source=createWechatBrowserSource({...createVerifiedWechatDomWitnesses({now:()=>instant}),openProfile:async(_dir,_headless,c)=>guardedLaunch(null,async()=>context,{signal:c.signal,onStopped:c.onStopped,timeoutMs:120000})});
  return {source,context,page,downloads:()=>downloads,entries:()=>entries,ready:()=>ready,clicks:()=>clicks,stopped:()=>stopped,onStopped:async()=>{stopped=true;}};
 }
 it.each(['recovery-home','home','home-root','home-slash','canonical'] as const)('%s父路径下归属成立则完整导出三报表',{timeout:120000,retry:0},async variant=>{
  const f=await fixture(variant),reports:WechatNativeDownload[]=[],abort=new AbortController(),timer=setTimeout(()=>abort.abort(),4000);
  try{
   const result=await f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-rendered-id',{signal:abort.signal,onStopped:f.onStopped},async r=>{reports.push(r);});
   expect(result.map(r=>r.kind)).toEqual(['channelsDaily','channelsFollowers','channelsWorks']);expect(reports).toHaveLength(3);expect(f.downloads()).toBe(3);if(variant==='recovery-home')expect(f.entries()).toBe(4);
   expect(result[0]!.selection).toMatchObject({startDate:'2026-09-09',endDate:'2026-10-08',meaning:'statisticsDates'});expect(result[2]).toMatchObject({expectedRows:13,selection:{startDate:'2026-09-10',endDate:'2026-10-09',meaning:'publishedDates'}});
   expect(result.every(r=>Buffer.from(r.bytes).includes(Buffer.from('明确合成Wujie下载字节')))).toBe(true);expect(f.stopped()).toBe(true);expect(f.page.isClosed()).toBe(true);
  }finally{clearTimeout(timer);await f.context.close();}
 });
 it.each(['home-proxy-without-sandbox','forged-iframe','missing-sandbox','wrong-root','wrong-iframe','wrong-path','wrong-origin','duplicate-host','foreign-parent','replace-host','date-drift'] as const)('%s禁止下载或保存不可靠报表',{timeout:120000,retry:0},async variant=>{
  const f=await fixture(variant),reports:WechatNativeDownload[]=[],abort=new AbortController(),timer=setTimeout(()=>abort.abort(),1800);
  try{
   await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-rendered-id',{signal:abort.signal,onStopped:f.onStopped},async r=>{reports.push(r);})).rejects.toBeDefined();
   expect(f.ready()).toBeGreaterThan(0);expect(f.downloads()).toBe(0);expect(reports).toHaveLength(0);expect(f.stopped()).toBe(true);expect(f.page.isClosed()).toBe(true);
   if(['home-proxy-without-sandbox','forged-iframe','missing-sandbox','wrong-root','wrong-iframe','wrong-path','wrong-origin','duplicate-host','foreign-parent'].includes(variant))expect(f.clicks()).toBe(0);
  }finally{clearTimeout(timer);await f.context.close();}
 });
 it('永久回到另一个面板最多恢复一次，仍不导出',{timeout:120000,retry:0},async()=>{
  const f=await fixture('permanent-home'),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),2500),reports:WechatNativeDownload[]=[];
  try{await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-rendered-id',{signal:abort.signal,onStopped:f.onStopped},async r=>{reports.push(r);})).rejects.toBeDefined();expect(f.entries()).toBe(2);expect(f.downloads()).toBe(0);expect(reports).toHaveLength(0);expect(f.stopped()).toBe(true);}
  finally{clearTimeout(timer);await f.context.close();}
 });
 it('恢复菜单等待裁剪在原根观察剩余，不能再开120秒',{timeout:120000,retry:0},async()=>{
  const nativeNow=Date.now.bind(Date);let offset=0;const clock=vi.spyOn(Date,'now').mockImplementation(()=>nativeNow()+offset);
  const f=await fixture('recovery-budget',()=>{offset=119000;}),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),2500);
  try{await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-rendered-id',{signal:abort.signal,onStopped:f.onStopped})).rejects.toBeDefined();expect(f.entries()).toBe(2);expect(abort.signal.aborted).toBe(false);expect(f.downloads()).toBe(0);expect(f.stopped()).toBe(true);}
  finally{clearTimeout(timer);clock.mockRestore();await f.context.close();}
 });

});
