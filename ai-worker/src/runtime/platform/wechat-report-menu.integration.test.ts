import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import type {Browser} from '@playwright/test';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createWechatBrowserSource,type WechatNativeDownload} from './wechat-browser-source';
import {createVerifiedWechatDomWitnesses} from './wechat-dom-witness';
import {guardedLaunch} from '../browser/chromium-guard';

// 官方公开MpNavigationSub DOM/事件协议的明确合成页面；无真实账号、无平台请求。
const {chromium}=createRequire(resolve(process.cwd(),'../frontend/package.json'))('@playwright/test') as typeof import('@playwright/test');
const origin='https://channels.weixin.qq.com',instant=Date.parse('2026-10-09T04:00:00Z');
const days=Array.from({length:30},(_,i)=>new Date(Date.parse('2026-09-09T00:00:00Z')+i*86400000).toISOString().slice(0,10));
const cells=(dates:string[])=>dates.map(d=>`<tr><td>${d}</td></tr>`).join('');

function reportPage(follower:boolean){
 return `<body><button data-section="daily">全部视频</button><button data-section="followers">关注者增长</button><button data-section="works">单篇视频</button>
 <div class="filter-row"><div class="filter-extra"><a href="javascript:;">下载表格</a></div>
 <label><input type="radio" name="range" value="1" checked>近7天</label><label><input type="radio" name="range" value="2">近30天</label></div>
 <div class="card-title"><span class="info">共13条视频</span></div><div class="ant-table-body"><table>${cells(days.slice(-7))}</table></div>
 <script>let section=${JSON.stringify(follower?'followers':'daily')};
 document.querySelector('.filter-extra a').onclick=event=>{event.preventDefault();const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([${JSON.stringify('日期,播放量\n2026-10-08,0\n明确合成下载字节')}],{type:'text/csv'}));link.download='synthetic.csv';link.click();};
 document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{section=b.dataset.section;});
 document.querySelectorAll('input').forEach(input=>input.onchange=async()=>{
  const dates=${JSON.stringify(days)};document.querySelector('table').innerHTML=(input.value==='2'?dates:dates.slice(-7)).map(d=>'<tr><td>'+d+'</td></tr>').join('');
  if(input.value==='2'&&section==='works'){
   document.querySelector('table').innerHTML=${JSON.stringify(cells(days.slice(-9).concat('2026-10-09')))};
   await fetch('/micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/post_list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startTime:${Date.parse('2026-09-10T00:00:00Z')/1000},endTime:${Date.parse('2026-10-09T00:00:00Z')/1000},pageSize:10,currentPage:1})});
  }
 });</script></body>`;
}
function home(mode:'folded'|'expanded'|'legacy'|'ambiguous'|'finder-folded'|'finder-expanded'|'mixed-ambiguous',direct=false,follower=false){
 const expanded=mode==='expanded'||mode==='finder-expanded';
 const prefix=mode.startsWith('finder-')?'finder-ui-desktop':'weui-desktop';
 const oldMenu=`<li class="weui-desktop-menu__item weui-desktop-menu__sub__wrp"><a class="weui-desktop-menu__link weui-desktop-menu__sub__link" href="javascript:;">▥<span class="weui-desktop-menu__name"><span>数据中心</span></span></a>
 <ul class="weui-desktop-sub-menu" ${expanded?'':'hidden'}><li><a data-path="post">视频数据</a></li><li><a data-path="follower">关注者数据</a></li></ul>
 <div class="weui-desktop-menu__popup_sub_menu" hidden><div>数据中心</div><ul><li><a data-path="post">视频数据</a></li><li><a data-path="follower">关注者数据</a></li></ul></div></li>`;
 const menu=oldMenu.replaceAll('weui-desktop',prefix);
 return `<body><h2 class="finder-nickname">明确合成账号</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-menu-id">synthetic-menu-id</span>
 <style>li{list-style:none}.weui-desktop-menu__sub__wrp,.finder-ui-desktop-menu__sub__wrp{width:150px;padding:12px}.weui-desktop-menu__popup_sub_menu,.finder-ui-desktop-menu__popup_sub_menu{position:absolute;left:165px;top:10px;background:white}a{display:block;cursor:pointer;padding:4px}${!expanded?'.weui-desktop-menu__name,.finder-ui-desktop-menu__name{display:none}':''}</style>
 <ul>${mode==='legacy'?'':menu}${mode==='ambiguous'?menu:mode==='mixed-ambiguous'?oldMenu.replaceAll('weui-desktop','finder-ui-desktop'):''}</ul><main></main><script>
 function renderReport(path){document.querySelector('main').innerHTML='<iframe style="width:900px;height:600px" src="/micro/statistic/'+path+'"></iframe>';}
 document.querySelectorAll('.weui-desktop-menu__sub__wrp,.finder-ui-desktop-menu__sub__wrp').forEach(li=>li.onmouseover=()=>{if(${!expanded})setTimeout(()=>li.querySelector('.weui-desktop-menu__popup_sub_menu,.finder-ui-desktop-menu__popup_sub_menu').hidden=false,150);});
 document.querySelectorAll('[data-path]').forEach(a=>a.onclick=()=>{const p=a.dataset.path;console.log('synthetic-menu-click');history.pushState({},'','/platform/statistic/'+p);renderReport(p);});
 ${direct?`renderReport(${JSON.stringify(follower?'follower':'post')});`:''}
 </script></body>`;
}

describe('视频号真实菜单 → 原source/DOM witness/原生下载（真实Chromium，合成官方页面）',()=>{
 let browser:Browser;
 beforeAll(async()=>{browser=await chromium.launch({headless:true,timeout:120000,args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost']});},120000);
 afterAll(async()=>{await browser?.close();},120000);
 async function fixture(mode:'folded'|'expanded'|'legacy'|'ambiguous'|'finder-folded'|'finder-expanded'|'mixed-ambiguous',diagnosticClock?:()=>number){
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}),page=await context.newPage();let directReports=0,released=false,menuClicks=0;
  page.on('console',message=>{if(message.text()==='synthetic-menu-click')menuClicks++;});
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin!==origin){await route.abort();return;}
   if(u.pathname.endsWith('/post_list')){await route.fulfill({json:{errCode:0,data:{totalCount:13,list:Array.from({length:10},()=>({}))}}});return;}
   if(u.pathname==='/synthetic-native.csv'){await route.fulfill({headers:{'Content-Type':'text/csv','Content-Disposition':'attachment; filename="synthetic.csv"'},body:'日期,播放量\n2026-10-08,0\n明确合成下载字节'});return;}
   if(u.pathname.startsWith('/micro/statistic/')){await route.fulfill({contentType:'text/html',body:reportPage(u.pathname.endsWith('follower'))});return;}
   const direct=u.pathname.startsWith('/platform/statistic/');if(direct)directReports++;
   // 明确复现整页启动的路由回退；菜单点击使用当前SPA而不会整页重载。
   const fixedWorks=mode==='legacy'||mode==='ambiguous'||mode==='mixed-ambiguous';
   const html=home(mode,direct&&fixedWorks,u.pathname.endsWith('follower'))+(direct&&!fixedWorks?'<script>history.replaceState({},"","/platform")</script>':'');
   await route.fulfill({contentType:'text/html; charset=utf-8',body:html});
  });
  const source=createWechatBrowserSource({...createVerifiedWechatDomWitnesses({now:()=>instant}),...(diagnosticClock?{now:diagnosticClock}:{}),openProfile:async(_dir,_headless,c)=>guardedLaunch(null,async()=>context,{signal:c.signal,onStopped:c.onStopped,timeoutMs:120000})});
  return {source,page,context,directReports:()=>directReports,menuClicks:()=>menuClicks,released:()=>released,onStopped:async()=>{released=true;}};
 }
 it.each(['folded','expanded','legacy','finder-folded','finder-expanded'] as const)('%s完整原生三报表保留日期/响应/下载核验',{timeout:120000,retry:0},async mode=>{
  const f=await fixture(mode),reports:WechatNativeDownload[]=[];
  try{
   const result=await f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-menu-id',{onStopped:f.onStopped},async report=>{reports.push(report);});
   expect(result.map(r=>r.kind)).toEqual(['channelsDaily','channelsFollowers','channelsWorks']);expect(reports).toHaveLength(3);
   expect(result[0]!.selection).toMatchObject({startDate:'2026-09-09',endDate:'2026-10-08',meaning:'statisticsDates'});
   expect(result[2]).toMatchObject({expectedRows:13,selection:{startDate:'2026-09-10',endDate:'2026-10-09',meaning:'publishedDates'}});
   expect(result.every(r=>Buffer.from(r.bytes).includes(Buffer.from('明确合成下载字节')))).toBe(true);expect(f.directReports()).toBe(mode==='legacy'?3:0);expect(f.released()).toBe(true);expect(f.page.isClosed()).toBe(true);
  }finally{await f.context.close();}
 });
 it.each(['ambiguous','mixed-ambiguous'] as const)('%s两个同标题菜单不选第一项，安全回退固定路径仍完成合法同步',{timeout:120000,retry:0},async mode=>{
  const f=await fixture(mode),reports:WechatNativeDownload[]=[];
  try{await f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','synthetic-menu-id',{onStopped:f.onStopped},async r=>{reports.push(r);});expect(reports.map(r=>r.kind)).toEqual(['channelsDaily','channelsFollowers','channelsWorks']);expect(f.menuClicks()).toBe(0);expect(f.directReports()).toBe(3);expect(f.released()).toBe(true);}
  finally{await f.context.close();}
 });
 it('T1456 report-entry沿原真实菜单进入再拍两帧，不走整页goto或导出',{timeout:120000,retry:0},async()=>{
  let clock=Date.now(),shots=0,downloads=0;const f=await fixture('folded',()=>clock),directory=await mkdtemp('/tmp/t1456-menu-');
  const screenshot=f.page.screenshot.bind(f.page);f.page.screenshot=async options=>{shots++;if(shots===1)setTimeout(()=>{clock+=120000;},1000);return screenshot(options);};f.page.on('download',()=>{downloads++;});
  try{const result=await f.source.observeNavigation('/synthetic-only-profile','synthetic-menu-id',{diagnosticRunId:'same-menu-diagnosis',targetPage:'report-entry',privateEvidenceDir:directory,deadlineAt:new Date(clock+2450000).toISOString(),assertScopeFresh:async()=>{},onStopped:f.onStopped} as never);expect(f.menuClicks()).toBe(1);expect(f.directReports()).toBe(0);expect(result.snapshots.map(x=>x.routeClass)).toEqual(['platform_post','platform_post']);expect(shots).toBe(2);expect(downloads).toBe(0);expect(f.released()).toBe(true);expect(f.page.isClosed()).toBe(true);}
  finally{await f.context.close();await rm(directory,{recursive:true,force:true});}
 });

});
