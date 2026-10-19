import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import type {Browser,BrowserContext,ElementHandle,Locator,Page} from '@playwright/test';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {createWechatBrowserSource,type WechatBrowserDiagnostic} from './wechat-browser-source';
import {createVerifiedWechatDomWitnesses} from './wechat-dom-witness';
import {parseWechatNativeReport} from './wechat-native-report-parser';
import {createWechatNativeCollector} from '../../../../backend/src/application/collection/wechat-native-collector';
import {createDb} from '../../../../backend/src/db';
import {executionBrowserProfileLeases} from '../../../../backend/src/schema/execution-browser-profile-leases';
import {createHostBrowserProfileLifecycle} from '../../../../backend/src/modules/execution/host-browser-profile-lifecycle';
import {platformAccounts} from '../../../../backend/src/schema/platform-account';
import {accountGroups,accountGroupMemberships} from '../../../../backend/src/schema/account-groups';
import {platformCollectionBindings,platformNativeReports,platformCatalogs} from '../../../../backend/src/schema/platform-collection';
import {createPlatformCollectionService,createPlatformCollectionTransport} from '../../../../backend/src/modules/platform-collection';
import {lockWorkspaceMembership,assertFrozenWorkspaceMembership} from '../../../../backend/src/modules/platform-account';
import {ENDPOINTS,platformNativeReportsListResponse,type CollectionRunResource,type RequestContext} from '@creatoros/contract';

const {chromium}=createRequire(resolve(process.cwd(),'../frontend/package.json'))('@playwright/test') as typeof import('@playwright/test');
const origin='https://channels.weixin.qq.com',stableId='synthetic-t1363-finder';
const witnessNow=Date.parse('2026-10-09T04:00:00Z');
// 独立外层覆盖collector原30分钟绝对deadline及启动/迁移/资源清理，不把120秒下限当整链上限。
const testBudgetMs=32*60*1000;
const days=Array.from({length:30},(_,i)=>new Date(Date.parse('2026-09-09T00:00:00Z')+i*86400000).toISOString().slice(0,10));
const dailyHeader='时间,播放,推荐,喜欢,评论,分享,关注';
const followerHeader='时间,净增关注,新增关注,取消关注,关注者总数';
const workHeader='视频描述,视频ID,发布时间,完播率,平均播放时长,播放量,推荐,喜欢,评论量,分享量,关注量,转发聊天和朋友圈,设为铃声,设为状态,设为朋友圈封面,企微链接点击次数,企微链接点击人数,添加到通讯录次数,添加到通讯录人数';
const files={
 channelsDaily:['合成说明','合成范围',dailyHeader,...days.map(day=>day+',0,1,2,3,4,5')].join('\r\n'),
 channelsFollowers:['合成说明','合成范围',followerHeader,...days.map(day=>day+',0,1,1,10')].join('\r\n'),
 channelsWorks:[workHeader,'明确合成作品,synthetic-work,2026-10-09,25%,1.25秒,0,1,2,3,4,5,6,7,8,9,10,11,12,13'].join('\r\n'),
};
type MenuMode='collapsed'|'direct'|'lateDirect'|'centre'|'lateCentre'|'both'|'directDuplicateCentre'|'lateDirectDuplicateCentre'|'beforeCentreClick'|'missing'|'hidden'|'duplicateEntry'|'duplicateCentre'|'missingAfterCentre';
type RecoveryCase='button'|'menuitem'|'link'|'labelledby'|'descendant'|'responsive'|'unknown'|'wide'|'conflict'|'disabled'|'occluded'|'duplicateOwner'|'tooltip'|'unrelated'|'duplicateRelated'|'relatedWithUnrelated'|'controlsChange'|'ownerReplace'|'ownerDetach'|'duplicatePanelId'|'reportOwner'|'reportOwnerChild'|'panelReplace'|'ownerNameChange'|'coverOwner';
type FixtureOptions={mode:MenuMode;recoveryCase?:RecoveryCase;cancelRecoveryAt?:'recover_owner'|'hover_owner'|'wait_associated_entry';expireRecoveryAt?:'recover_owner'|'hover_owner'|'wait_associated_entry';cancelAt?:'wait'|'centreClick'|'entryClick'|'route'|'hover';expireAt?:'wait'|'centreClick'|'route'|'hover'|'entryClick';unconfirmedClose?:boolean;throwDiagnostic?:boolean;identity?:'wrong'|'login'|'foreign';fastMissingClock?:boolean;worksAlreadyTarget?:boolean};

function topHtml(options:FixtureOptions){
 const entry='<button data-menu="entry">视频数据</button><button data-menu="followers">关注者数据</button>';
 const centre='<button data-menu="centre">数据中心</button>';
 const variant=options.recoveryCase??'button';
 const hiddenLabels='<span id="synthetic-owner-label" hidden>数据中心</span><span hidden>数据中心</span>';
 const panel='<div id="synthetic-associated-panel" hidden>'+entry+'</div>';
 let owner='<button data-collapsed-owner aria-label="数据中心" aria-controls="synthetic-associated-panel">'+hiddenLabels+'▣</button>';
 if(variant==='menuitem')owner=owner.replace('<button','<div role="menuitem"').replace('</button>','</div>');
 if(variant==='link')owner=owner.replace('<button','<a href="javascript:void(0)"').replace('</button>','</a>');
 if(variant==='labelledby')owner=owner.replace('aria-label="数据中心"','aria-labelledby="synthetic-owner-label"');
 if(variant==='unknown'||variant==='wide')owner='<div data-collapsed-owner tabindex="0" style="cursor:pointer" title="数据中心">'+hiddenLabels+'▣</div>';
 if(variant==='conflict')owner=owner.replace('aria-label="数据中心"','aria-label="其它明确合成控制"');
 if(variant==='disabled')owner=owner.replace('<button','<button disabled');
 if(variant==='descendant')owner='<div data-collapsed-owner role="menuitem" aria-label="数据中心">'+hiddenLabels+'▣'+panel+'</div>';
 let collapsed=owner+(variant==='descendant'?'':panel);
 if(variant==='duplicateOwner')collapsed+=owner.replace('id="synthetic-owner-label"','id="synthetic-duplicate-label"');
 if(variant==='responsive')collapsed+='<div hidden>'+owner.replace('id="synthetic-owner-label"','id="synthetic-responsive-label"')+'</div>';
 if(variant==='occluded')collapsed+='<div style="position:fixed;inset:0;z-index:999"></div>';
 if(variant==='tooltip')collapsed=collapsed.replace('id="synthetic-associated-panel"','id="synthetic-associated-panel" role="tooltip"');
 if(variant==='unrelated'||variant==='relatedWithUnrelated')collapsed+='<div id="synthetic-unrelated" hidden>'+entry+'</div>';
 if(variant==='duplicatePanelId')collapsed+='<div id="synthetic-associated-panel" hidden>'+entry+'</div>';
 if(variant==='reportOwner')collapsed='<button data-collapsed-owner data-menu="entry" aria-label="视频数据"><span hidden>视频数据</span>▣</button><button data-collapsed-owner data-menu="followers" aria-label="关注者数据"><span hidden>关注者数据</span>▣</button>';
 if(variant==='reportOwnerChild')collapsed='<div data-collapsed-owner role="menuitem" aria-label="视频数据"><span hidden>视频数据</span>▣'+panel+'</div>';
 if(variant==='duplicateRelated')collapsed=collapsed.replace(panel,'<div id="synthetic-associated-panel" hidden>'+entry+entry+'</div>');

 let menus=options.mode==='collapsed'?collapsed:'';
 if(['direct','both','directDuplicateCentre','duplicateEntry'].includes(options.mode))menus+=entry;
 if(['centre','both','directDuplicateCentre','beforeCentreClick','duplicateCentre','missingAfterCentre'].includes(options.mode))menus+=centre;
 if(['directDuplicateCentre','duplicateCentre'].includes(options.mode))menus+=centre;
 if(options.mode==='duplicateEntry')menus+=entry;
 if(options.mode==='hidden')menus+='<div hidden>'+entry+centre+'</div>';
 return '<!doctype html><meta charset="utf-8"><body>'+
  (options.identity==='login'?'<h1>微信扫码登录</h1>':`<h2 class="finder-nickname">明确合成视频号</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="${options.identity==='wrong'?'synthetic-wrong':stableId}">${options.identity==='wrong'?'synthetic-wrong':stableId}</span>`)+
  '<nav id="menus">'+menus+'</nav><main id="panel"></main><script>'+`
   document.querySelectorAll('[data-collapsed-owner]').forEach(owner=>owner.addEventListener('pointerenter',()=>{window.fixtureEvent('hover');
    const variant=${JSON.stringify(variant)};
    if(variant!=='unrelated'&&document.querySelector('#synthetic-associated-panel'))document.querySelector('#synthetic-associated-panel').hidden=false;
    if(document.querySelector('#synthetic-unrelated'))document.querySelector('#synthetic-unrelated').hidden=false;
    if(variant==='controlsChange')owner.setAttribute('aria-controls','synthetic-changed-panel');
    if(variant==='ownerReplace')owner.replaceWith(owner.cloneNode(true));
    if(variant==='ownerDetach')owner.remove();
    if(variant==='ownerNameChange')owner.setAttribute('aria-label','其它明确合成名称');
    if(variant==='panelReplace'){const panel=document.querySelector('#synthetic-associated-panel');panel.replaceWith(panel.cloneNode(true));}
   }));
   window.addDirect=()=>{document.querySelector('#menus').insertAdjacentHTML('beforeend',${JSON.stringify(entry)});};
   window.addCentre=()=>{document.querySelector('#menus').insertAdjacentHTML('beforeend',${JSON.stringify(centre)});};
   document.addEventListener('click',event=>{
    const action=event.target.dataset.menu;if(!action)return;
    window.fixtureEvent(action);
    if(action==='centre'){${options.mode==='missingAfterCentre'?'':"if(document.querySelector('[data-menu=entry]'))document.querySelectorAll('[data-menu=entry],[data-menu=followers]').forEach(node=>node.remove());else window.addDirect();"}return;}
    document.querySelector('#synthetic-unrelated')?.remove();
    const follower=action==='followers';history.pushState({},'',follower?'/platform/statistic/follower':'/platform/statistic/post');
    document.querySelector('#panel').innerHTML='<iframe style="width:100%;height:600px" src="'+(follower?'/micro/statistic/follower':'/micro/statistic/post')+'"></iframe>';
   });
  `+'</script></body>';
}
function frameHtml(followers:boolean){
 return '<!doctype html><meta charset="utf-8"><body><button data-tab="daily">全部视频</button><button data-tab="works">单篇视频</button><button data-tab="followers">关注者增长</button><div class="card-title"><span class="info">共 1 条视频</span></div><div class="filter-row"><label><input type="radio" name="range" value="1">近7天</label><label><input type="radio" name="range" value="2" checked>近30天</label><div class="filter-extra"><a id="download" href="/fixture-download">下载表格</a></div></div><div class="ant-table-body"><table id="rows"></table></div><script>'+`
  let kind=${JSON.stringify(followers?'channelsFollowers':'channelsDaily')};const days=${JSON.stringify(days)};
  const render=range=>{document.querySelector('#rows').innerHTML=(kind==='channelsWorks'?['2026-10-09']:range===1?days.slice(-7):days).map(day=>'<tr><td>'+day+'</td></tr>').join('');document.querySelector('#download').href='/fixture-download?kind='+kind;};
  document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{kind=button.dataset.tab==='works'?'channelsWorks':button.dataset.tab==='followers'?'channelsFollowers':'channelsDaily';render(2);});
  document.querySelectorAll('input').forEach(input=>input.onchange=async()=>{
   const range=Number(input.value);if(kind==='channelsWorks'&&range===2)await fetch('/micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/post_list',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({startTime:1788969600,endTime:1791475200,pageSize:10,currentPage:1})});render(range);
  });render(2);
 `+'</script></body>';
}

async function storedService(){
 const {db,client}=await createDb();let sequence=0;
 const now=()=>new Date().toISOString(),stamp=now();
 const ctx:RequestContext={userId:'synthetic-user',groupId:'synthetic-group',accountId:'synthetic-account',requestId:'synthetic-t1363',source:'user'};
 await db.insert(platformAccounts).values({id:ctx.accountId!,userId:ctx.userId,platform:'wechatVideo',accountHandle:'明确合成账号',externalAccountId:stableId,createdAt:stamp,updatedAt:stamp});
 await db.insert(accountGroups).values({id:ctx.groupId!,userId:ctx.userId,name:'明确合成组',version:1,createdAt:stamp,updatedAt:stamp});
 await db.insert(accountGroupMemberships).values({id:'synthetic-membership',userId:ctx.userId,groupId:ctx.groupId!,accountId:ctx.accountId!,version:1,joinedAt:stamp});
 await db.insert(platformCollectionBindings).values({accountId:ctx.accountId!,userId:ctx.userId,platform:'wechatVideo',platformIdentity:stableId,scopes:['nativeReports'],proofSource:'verified-native-page',verifiedAt:stamp});
 const service=createPlatformCollectionService({db,now,nextId:p=>p+'-'+(++sequence),sourceAdapters:{wechatVideo:[{platform:'wechatVideo',capability:'nativeReports',supported:true,authState:'authorized',runtimeState:'ready',reasonCode:null,lastVerifiedAt:stamp}]},nativeReportOwnership:{freeze:async(tx,c,a)=>lockWorkspaceMembership(tx,{...c,accountId:a}),assert:assertFrozenWorkspaceMembership}});
 const transport=createPlatformCollectionTransport(()=>service);
 const run=((await transport.request(ENDPOINTS.startCollection,{params:{accountId:ctx.accountId!},query:undefined,body:{capability:'nativeReports',clientRequestId:'synthetic-t1363-single-request'}},ctx)) as {data:CollectionRunResource}).data;
 return {db,client,ctx,service,transport,run};
}

// 真实Chromium DOM/iframe、原生download、正式witness/source/parser/collector/service事务。
// 全部请求由本地route合成且DNS禁外连；不读真实profile、凭据、用户数据库或平台。
async function fixture(browser:Browser,options:FixtureOptions){
 const store=await storedService(),context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true,locale:'zh-CN',timezoneId:'Asia/Shanghai'}),page=await context.newPage();
 const controller=new AbortController(),diagnostics:WechatBrowserDiagnostic[]=[],events:string[]=[],budgets:number[]=[];
 let opened=0,closed=0,released=0,downloads=0,physicalConfirmed=0,physicalStoppedAt:number|null=null,leaseReleasedAt:number|null=null,barrier=false,held=false,clockOffset=0,pendingStop:(()=>Promise<void>)|undefined;
 let lastStatus:string|undefined;
 const realNow=Date.now,wallStarted=performance.now(),hoverWallMs:number[]=[],coverProof:Array<{ownerConnected:boolean;controlsUnchanged:boolean;nameUnchanged:boolean;ownerCenterCovered:boolean;entryActionable:boolean}>=[];let resolveReleased!:()=>void;
 const releasedGate=new Promise<void>(resolve=>{resolveReleased=resolve;});
 const awaitHostRelease=async()=>{let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([releasedGate,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('synthetic host release not confirmed')),120000);})]);}finally{if(timer)clearTimeout(timer);}};
 const lifecycle=createHostBrowserProfileLifecycle(store.db,{hostInstanceId:'synthetic-t1367-host',resolveProfile:async authDir=>({userId:store.ctx.userId,authDir,profileKey:'a'.repeat(64),domain:'channels.weixin.qq.com'})});
 const wallClock=options.expireAt||options.fastMissingClock?vi.spyOn(Date,'now').mockImplementation(()=>realNow()+clockOffset):undefined;
 const expire=()=>{clockOffset+=30*60000+1;};
 const exhaustObservation=()=>{clockOffset+=120001;};
 const cancel=()=>controller.abort(new Error('明确合成用户取消'));
 await page.exposeFunction('fixtureEvent',(event:string)=>{events.push(event);if(event==='hover'&&options.cancelAt==='hover')cancel();if(event==='hover'&&options.expireAt==='hover')expire();if((event==='entry'||event==='followers')&&options.expireAt==='entryClick')expire();if(event==='centre'&&options.cancelAt==='centreClick')cancel();if((event==='entry'||event==='followers')&&options.cancelAt==='entryClick')cancel();if(event==='centre'&&options.expireAt==='centreClick')expire();});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin){if(options.identity==='foreign'&&url.origin==='https://synthetic-foreign.invalid')await route.fulfill({contentType:'text/html',body:topHtml(options)});else await route.abort();return;}
  if(url.pathname==='/fixture-download'){
   downloads++;const kind=url.searchParams.get('kind') as keyof typeof files;
   await route.fulfill({headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="synthetic-${kind}.csv"`},body:files[kind]});return;
  }
  if(url.pathname.endsWith('/statistic/post_list')){await route.fulfill({json:{errCode:0,data:{totalCount:1,list:[{}]}}});return;}
  await route.fulfill({contentType:'text/html; charset=utf-8',body:url.pathname.startsWith('/micro/')?frameHtml(url.pathname.endsWith('/follower')):topHtml(options)});
 });
 const rawGetText=page.getByText.bind(page);
 const roleLocator=(locator:Locator):Locator=>new Proxy(locator,{get(node,key){
  if(key==='or')return(other:Locator)=>roleLocator(node.or(other));
  if(key==='elementHandles')return async()=>{const handles=await node.elementHandles() as ElementHandle<Element>[];return handles.map(handle=>new Proxy(handle,{get(element,property){
   if(property==='hover')return async(...args:Parameters<typeof handle.hover>)=>{
    hoverWallMs.push(performance.now()-wallStarted);const controlsBefore=options.recoveryCase==='coverOwner'?await handle.getAttribute('aria-controls'):null,nameBefore=options.recoveryCase==='coverOwner'?await handle.getAttribute('aria-label'):null;
    const result=await handle.hover(...args);
    // 真实hover已resolve后、交回witness前的有限DOM barrier，隔离后置复核；不手抛或mock结果。
    if(options.recoveryCase==='coverOwner')coverProof.push(await handle.evaluate((owner,{controlsBefore,nameBefore})=>{
     const panel=document.querySelector('#synthetic-associated-panel')!,box=owner.getBoundingClientRect();
     (panel as HTMLElement).style.cssText='position:fixed;left:'+box.x+'px;top:'+box.y+'px;min-width:'+box.width+'px;min-height:'+box.height+'px;z-index:100;';
     const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2),entry=[...panel.querySelectorAll('button')].find(node=>node.textContent==='视频数据')!,entryBox=entry.getBoundingClientRect(),entryHit=document.elementFromPoint(entryBox.x+entryBox.width/2,entryBox.y+entryBox.height/2);
     return {ownerConnected:owner.isConnected,controlsUnchanged:owner.getAttribute('aria-controls')===controlsBefore,nameUnchanged:owner.getAttribute('aria-label')===nameBefore,ownerCenterCovered:hit!==owner&&!owner.contains(hit)&&panel.contains(hit),entryActionable:entry.getClientRects().length>0&&!entry.disabled&&(entryHit===entry||entry.contains(entryHit))};
    },{controlsBefore,nameBefore}));return result;
   };
   const value=Reflect.get(element,property,element);return typeof value==='function'?value.bind(element):value;
  }}));};
  const value=Reflect.get(node,key,node);return typeof value==='function'?value.bind(node):value;
 }});
 const observedPage=new Proxy(page,{get(target,key){
  if(key==='getByRole')return(...args:Parameters<Page['getByRole']>)=>roleLocator(page.getByRole(...args));
  if(key==='getByText')return(text:string,params:Parameters<Page['getByText']>[1])=>{
   const wrap=(locator:Locator):Locator=>new Proxy(locator,{get(node,property){
    if(property==='filter')return(...args:Parameters<Locator['filter']>)=>wrap(node.filter(...args));
    if(property==='count')return async()=>{
     const count=await node.count();
     if(!barrier&&text==='视频数据'&&count===0&&['lateDirect','lateDirectDuplicateCentre','lateCentre','missing','hidden'].includes(options.mode)){
      barrier=true;events.push('entry-initial-zero');
      if(options.cancelAt==='wait')cancel();else if(options.expireAt==='wait')expire();
      else if(options.mode==='lateDirect'||options.mode==='lateDirectDuplicateCentre'){
       await page.evaluate(duplicate=>{(window as unknown as {addDirect():void;addCentre():void}).addDirect();if(duplicate){(window as unknown as {addCentre():void}).addCentre();(window as unknown as {addCentre():void}).addCentre();}},options.mode==='lateDirectDuplicateCentre');
       expect(await rawGetText('视频数据',{exact:true}).filter({visible:true}).count()).toBe(1);
       expect(await rawGetText('数据中心',{exact:true}).filter({visible:true}).count()).toBe(options.mode==='lateDirectDuplicateCentre'?2:0);
       events.push('entry-rendered-visible-one');
      }
      else if(options.mode==='lateCentre')await page.evaluate(()=>{(window as unknown as {addCentre():void}).addCentre();});
     }
     if(!barrier&&text==='数据中心'&&count===1&&options.mode==='beforeCentreClick'){barrier=true;events.push('entry-arrived-before-centre-click');await page.evaluate(()=>{(window as unknown as {addDirect():void}).addDirect();});}
     if(options.fastMissingClock&&count===0&&(text==='数据中心'||events.includes('centre')))exhaustObservation();
     return count;
    };
    const value=Reflect.get(node,property,node);return typeof value==='function'?value.bind(node):value;
   }});return wrap(rawGetText(text,params));
  };
  if(key==='waitForURL')return async(...args:Parameters<Page['waitForURL']>)=>{if(options.cancelAt==='route')cancel();if(options.expireAt==='route')expire();await page.waitForURL(...args);};
  if(key==='goto')return async(...args:Parameters<Page['goto']>)=>{budgets.push(args[1]?.timeout??0);return page.goto(options.identity==='foreign'?'https://synthetic-foreign.invalid/':args[0],args[1]);};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 const witnesses=createVerifiedWechatDomWitnesses({now:()=>witnessNow});
 const recoveryPhases=new Map<string,number>();let progressKind='';
 const source=createWechatBrowserSource({...witnesses,reportWitness:{...witnesses.reportWitness,prepare:(p,platform,kind,op)=>witnesses.reportWitness.prepare(p,platform,kind,{...op,onEntryObservation:observation=>{
  op.onEntryObservation?.(observation);if(progressKind!==kind){recoveryPhases.clear();progressKind=kind;}const phase=observation?.entryPhase;if(!phase||!['recover_owner','hover_owner','wait_associated_entry'].includes(phase))return;
  const count=(recoveryPhases.get(phase)??0)+1;recoveryPhases.set(phase,count);events.push('phase:'+phase);
  if(options.cancelRecoveryAt===phase)cancel();if(options.expireRecoveryAt===phase)expire();
  if(options.fastMissingClock&&phase!=='hover_owner'&&count>1)exhaustObservation();
 }})},now:()=>Date.now(),openProfile:async(_dir,_headless,controls)=>{
  opened++;expect(held).toBe(true);
  return new Proxy(context,{get(target,key){
   if(key==='pages')return()=>[observedPage];
   if(key==='close')return async()=>{closed++;if(options.unconfirmedClose)throw new Error('明确合成停止未确认');await target.close();await controls.onStopped?.();};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }}) as BrowserContext;
 }});
 const execute=createWechatNativeCollector({workerId:'synthetic-t1363-worker',claimLease:store.service.claim,renewLease:store.service.renewLease,commitPage:store.service.commitPage,failRun:store.service.failRun,
  authorizeProfile:async(c,lease)=>{expect(c.accountId).toBe(store.ctx.accountId);expect(lease.expectedPlatformIdentity).toBe(stableId);return {authDir:'/synthetic-only-t1363-profile'};},
  acquireProfile:async(authDir,signal)=>{const checkout=await lifecycle.acquire(authDir,signal);held=true;return {...checkout,onStopped:async()=>{await checkout.onStopped();released++;held=false;leaseReleasedAt=performance.now();resolveReleased();}};},parseReport:parseWechatNativeReport,
  collectReports:async o=>{await source.collectNativeReports(o.platform,o.directory,o.expectedPlatformIdentity,{signal:o.signal,deadlineAt:new Date(o.deadlineAt).toISOString(),onStopped:o.onStopped,onStopUnconfirmed:o.onStopUnconfirmed,onPhysicalStopped:()=>{physicalConfirmed++;physicalStoppedAt=performance.now();},onDiagnostic:event=>{diagnostics.push(event);if(options.throwDiagnostic)throw new Error('明确合成日志失败');}},async report=>{
   await o.onReport({...report,platform:o.platform});
   if(options.worksAlreadyTarget&&report.kind==='channelsFollowers'){
    await page.evaluate(()=>{history.pushState({},'','/platform/statistic/post');document.querySelector('#panel')!.innerHTML='<iframe style="width:100%;height:600px" src="/micro/statistic/post"></iframe>';});
    await page.frameLocator('iframe').getByText('全部视频',{exact:true}).waitFor({state:'visible',timeout:120000});events.push('works-already-at-target');
   }
  });},
  onStopUnconfirmed:(_attempt,retry)=>{pendingStop=retry;},
 });
 return {...store,diagnostics,events,budgets,execute:async()=>{const result=await execute(store.ctx,store.run,controller.signal);lastStatus=result.status;return result;},hoverWallMs,coverProof,awaitHostRelease,readHostLease:()=>store.db.select().from(executionBrowserProfileLeases),physical:()=>({opened,closed,released,downloads,held,physicalConfirmed,physicalStoppedAt,leaseReleasedAt,pendingStop:Boolean(pendingStop)}),cleanup:async()=>{if(held&&!options.unconfirmedClose)await awaitHostRelease();if(options.mode!=='collapsed'){expect(hoverWallMs).toHaveLength(0);console.info('[t1367-legacy-safe]',JSON.stringify({mode:options.mode,identity:options.identity??'valid',cancelAt:options.cancelAt??null,expireAt:options.expireAt??null,worksAlreadyTarget:options.worksAlreadyTarget??false,status:lastStatus,hoverActionCount:hoverWallMs.length,physicalConfirmed,released,held,downloads}));}wallClock?.mockRestore();await context.close();await store.client.close();}};
}

describe('T1363 已有视频号菜单时序的真实DOM公共持久链',()=>{
 let browser:Browser;
 beforeAll(async()=>{browser=await chromium.launch({headless:true,timeout:120000,args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost']});},120000);
 afterAll(async()=>{await browser?.close();},120000);
 it('T1367公共主族：完整原120秒missing后仅一次hover关联面板，三报告下载解析事务与公开同run读回',{timeout:testBudgetMs,retry:0},async()=>{
  const f=await fixture(browser,{mode:'collapsed'}),started=performance.now();
  try{
   const result=await f.execute();
   console.info('[t1367-public-safe]',JSON.stringify({status:result.status,reasonCode:result.reasonCode,elapsedMs:Math.round(performance.now()-started),hoverWallMs:f.hoverWallMs.map(Math.round),events:f.events,physical:f.physical(),diagnostics:f.diagnostics}));
   expect(result).toMatchObject({attemptId:f.run.attemptId,status:'complete',committedReports:3});
   expect(f.hoverWallMs).toHaveLength(1);expect(f.hoverWallMs[0]).toBeGreaterThanOrEqual(120000);
   expect(await f.service.status(f.ctx,f.ctx.accountId!,f.run.attemptId)).toMatchObject({status:'complete',committedPages:4});
   const response=await f.transport.request(ENDPOINTS.listNativeReports,{params:{accountId:f.ctx.accountId!},query:{cursor:null,pageSize:20},body:undefined},f.ctx) as {data:unknown};
   const read=platformNativeReportsListResponse.parse(response.data);expect(read.items.map(r=>r.kind).sort()).toEqual(['channelsDaily','channelsFollowers','channelsWorks']);
   expect(read.items.every(r=>r.groupId===f.ctx.groupId)).toBe(true);expect(await f.db.select().from(platformNativeReports)).toHaveLength(3);
   expect(f.physical()).toMatchObject({opened:1,closed:1,released:1,downloads:3,held:false,physicalConfirmed:1});
   expect(f.physical().physicalStoppedAt).not.toBeNull();expect(f.physical().leaseReleasedAt!).toBeGreaterThanOrEqual(f.physical().physicalStoppedAt!);
   const leases=await f.readHostLease();expect(leases).toHaveLength(1);expect(leases[0]!.releasedAt).not.toBeNull();
  }finally{await f.cleanup();}
 });
 it('T1367 IMPL-001：关联panel覆盖owner中心仍只点击唯一命中entry，三报表公共链',{timeout:testBudgetMs,retry:0},async()=>{
  const f=await fixture(browser,{mode:'collapsed',recoveryCase:'coverOwner',fastMissingClock:true});
  try{const result=await f.execute();console.info('[t1367-impl001-safe]',JSON.stringify({status:result.status,reasonCode:result.reasonCode,hoverActionCount:f.hoverWallMs.length,downloads:f.physical().downloads,coverProof:f.coverProof,diagnostics:f.diagnostics}));expect(f.coverProof).toEqual([{ownerConnected:true,controlsUnchanged:true,nameUnchanged:true,ownerCenterCovered:true,entryActionable:true}]);expect(result).toMatchObject({status:'complete',committedReports:3});expect(f.hoverWallMs).toHaveLength(1);expect(f.physical()).toMatchObject({physicalConfirmed:1,released:1,held:false,downloads:3});expect(await f.db.select().from(platformNativeReports)).toHaveLength(3);}finally{await f.cleanup();}
 });
 it.each(['button','menuitem','link','labelledby','descendant','responsive','relatedWithUnrelated','reportOwner'] as const)('T1367辅助加速 %s：严格关联三报告成功且原观察完成前hover为0',{timeout:testBudgetMs,retry:0},async recoveryCase=>{
  const f=await fixture(browser,{mode:'collapsed',recoveryCase,fastMissingClock:true});
  try{expect(await f.execute()).toMatchObject({status:'complete',committedReports:3});expect(f.hoverWallMs).toHaveLength(recoveryCase==='reportOwner'?3:1);expect(f.events.indexOf('phase:recover_owner')).toBeLessThan(f.events.indexOf('hover'));expect(f.physical()).toMatchObject({downloads:3,physicalConfirmed:1,released:1,held:false});expect(await f.db.select().from(platformNativeReports)).toHaveLength(3);}finally{await f.cleanup();}
 });
 it.each(['unknown','wide','conflict','disabled','occluded','duplicateOwner','tooltip','unrelated','duplicateRelated','controlsChange','ownerReplace','ownerDetach','duplicatePanelId','reportOwnerChild','panelReplace','ownerNameChange'] as const)('T1367辅助加速 %s：未知/歧义/关联变更不晚点或提交',{timeout:testBudgetMs,retry:0},async recoveryCase=>{
  const f=await fixture(browser,{mode:'collapsed',recoveryCase,fastMissingClock:true});
  try{expect(await f.execute()).toMatchObject({status:'failed',reasonCode:'EXPORT_FAILED',committedReports:0});expect(f.hoverWallMs.length).toBeLessThanOrEqual(1);if(['unknown','wide','conflict','disabled','occluded','duplicateOwner'].includes(recoveryCase))expect(f.events).not.toContain('hover');expect(f.events).not.toContain('entry');if(recoveryCase==='reportOwnerChild')expect(f.diagnostics[0]).toMatchObject({code:'REPORT_LINK_MISSING',entryObservation:{entryPhase:'wait_associated_entry'}});expect(f.physical()).toMatchObject({downloads:0,physicalConfirmed:1,released:1,held:false});expect(await f.db.select().from(platformNativeReports)).toHaveLength(0);}finally{await f.cleanup();}
 });
 it.each(['recover_owner','hover_owner','wait_associated_entry'] as const)('T1367辅助加速 %s取消：原signal停止恢复且不晚下载提交',{timeout:testBudgetMs,retry:0},async cancelRecoveryAt=>{
  const f=await fixture(browser,{mode:'collapsed',fastMissingClock:true,cancelRecoveryAt});
  try{expect(await f.execute()).toMatchObject({status:'cancelled',committedReports:0});await f.awaitHostRelease();expect(f.physical()).toMatchObject({downloads:0,physicalConfirmed:1,released:1,held:false});expect(await f.db.select().from(platformNativeReports)).toHaveLength(0);}finally{await f.cleanup();}
 });
 it.each(['recover_owner','hover_owner','wait_associated_entry'] as const)('T1367辅助加速 %s原deadline：不续期或晚动作',{timeout:testBudgetMs,retry:0},async expireRecoveryAt=>{
  const f=await fixture(browser,{mode:'collapsed',fastMissingClock:true,expireRecoveryAt});
  try{expect(await f.execute()).toMatchObject({status:'failed',committedReports:0});expect(f.diagnostics[0]?.code).toBe('EXECUTION_DEADLINE_EXCEEDED');expect(f.physical()).toMatchObject({downloads:0,physicalConfirmed:1,released:1,held:false});}finally{await f.cleanup();}
 });
 it.each(['hover','entryClick'] as const)('T1367辅助加速 实际%s动作中取消：关闭与DB释放分别确认，无晚提交',{timeout:testBudgetMs,retry:0},async cancelAt=>{
  const f=await fixture(browser,{mode:'collapsed',fastMissingClock:true,cancelAt});
  try{expect(await f.execute()).toMatchObject({status:'cancelled',committedReports:0});await f.awaitHostRelease();expect(f.physical()).toMatchObject({downloads:0,physicalConfirmed:1,released:1,held:false});expect(await f.db.select().from(platformNativeReports)).toHaveLength(0);}finally{await f.cleanup();}
 });
 it.each(['hover','entryClick'] as const)('T1367辅助加速 实际%s动作中原deadline耗尽，不续期或提交',{timeout:testBudgetMs,retry:0},async expireAt=>{
  const f=await fixture(browser,{mode:'collapsed',fastMissingClock:true,expireAt});
  try{expect(await f.execute()).toMatchObject({status:'failed',committedReports:0});expect(f.physical().downloads).toBe(0);expect(await f.db.select().from(platformNativeReports)).toHaveLength(0);}finally{await f.cleanup();}
 });
 it('初始两个入口0后仅原直接入口晚到：同Page三报告真实下载parse/事务保存并公开读回',{timeout:testBudgetMs,retry:0},async()=>{
  const f=await fixture(browser,{mode:'lateDirect'}),started=performance.now();
  try{
   const result=await f.execute();
   console.info('[t1363-safe]',JSON.stringify({case:'late-direct',status:result.status,reasonCode:result.reasonCode,elapsedMs:Math.round(performance.now()-started),events:f.events,physical:f.physical(),diagnostics:f.diagnostics}));
   expect(f.events).toContain('entry-initial-zero');expect(f.events).toContain('entry-rendered-visible-one');
   expect(result).toMatchObject({attemptId:f.run.attemptId,status:'complete',committedReports:3});
   expect(await f.service.status(f.ctx,f.ctx.accountId!,f.run.attemptId)).toMatchObject({status:'complete',committedPages:4});
   const envelope=await f.transport.request(ENDPOINTS.listNativeReports,{params:{accountId:f.ctx.accountId!},query:{cursor:null,pageSize:20},body:undefined},f.ctx) as {data:unknown};
   const read=platformNativeReportsListResponse.parse(envelope.data);
   expect(read.items.map(report=>report.kind).sort()).toEqual(['channelsDaily','channelsFollowers','channelsWorks']);
   expect(read.items.every(report=>report.groupId===f.ctx.groupId)).toBe(true);
   expect(read.items.flatMap(report=>report.tables.flatMap(table=>table.rows.flat())).some(cell=>cell.raw==='0'&&cell.value===0)).toBe(true);
   expect(await f.db.select().from(platformNativeReports)).toHaveLength(3);expect(await f.db.select().from(platformCatalogs)).toHaveLength(0);
   expect(f.physical()).toMatchObject({opened:1,closed:1,released:1,downloads:3,held:false});expect(f.events).not.toContain('centre');
   expect(f.budgets.every(ms=>ms>=120000)).toBe(true);
  }finally{await f.cleanup();}
 });
 it.each(['direct','centre','lateCentre','both','directDuplicateCentre','lateDirectDuplicateCentre','beforeCentreClick'] as const)('%s旧合法族保持三报告成功，唯一直接入口优先',{timeout:testBudgetMs,retry:0},async mode=>{
  const f=await fixture(browser,{mode});
  try{
   expect(await f.execute()).toMatchObject({status:'complete',committedReports:3});
   expect(await f.service.status(f.ctx,f.ctx.accountId!,f.run.attemptId)).toMatchObject({status:'complete',committedPages:4});
   expect(await f.db.select().from(platformNativeReports)).toHaveLength(3);expect(f.physical()).toMatchObject({opened:1,released:1,downloads:3,held:false});
   expect(f.events).not.toContain('hover');
   if(['direct','both','directDuplicateCentre','lateDirectDuplicateCentre','beforeCentreClick'].includes(mode))expect(f.events).not.toContain('centre');
   else expect(f.events.filter(event=>event==='centre')).toHaveLength(1);
  }finally{await f.cleanup();}
 });
 it('works已在目标父路由时保原免菜单路径，三份报表仍完整事务保存',{timeout:testBudgetMs,retry:0},async()=>{
  const f=await fixture(browser,{mode:'direct',worksAlreadyTarget:true});
  try{
   expect(await f.execute()).toMatchObject({status:'complete',committedReports:3});
   expect(f.events).toContain('works-already-at-target');expect(f.events.filter(event=>event==='entry')).toHaveLength(1);
   expect(await f.db.select().from(platformNativeReports)).toHaveLength(3);expect(f.physical()).toMatchObject({downloads:3,released:1,held:false});
  }finally{await f.cleanup();}
 });
 it.each([
  ['missing','REPORT_LINK_MISSING'],['hidden','REPORT_LINK_MISSING'],['duplicateEntry','REPORT_LINK_AMBIGUOUS'],['duplicateCentre','REPORT_LINK_AMBIGUOUS'],['missingAfterCentre','REPORT_LINK_MISSING'],
 ] as const)('%s真实菜单负族保持原安全failRun',{timeout:testBudgetMs,retry:0},async(mode,code)=>{
  const f=await fixture(browser,{mode,fastMissingClock:true});
  try{
   expect(await f.execute()).toMatchObject({status:'failed',reasonCode:'EXPORT_FAILED',committedReports:0});
   expect(await f.service.status(f.ctx,f.ctx.accountId!,f.run.attemptId)).toMatchObject({status:'failed',reasonCode:'EXPORT_FAILED'});
   expect(f.diagnostics).toHaveLength(1);expect(f.diagnostics[0]).toMatchObject({platform:'wechatVideo',stage:'prepare',kind:'channelsDaily',code});
   expect(f.diagnostics[0]?.entryObservation).toMatchObject({entryPhase:mode==='duplicateEntry'?'initial':mode==='missingAfterCentre'?'wait_entry_after_centre':mode==='missing'||mode==='hidden'?'recover_owner':'wait_entry_or_centre',entryVisibleCount:mode==='duplicateEntry'?2:0,centreClicked:mode==='missingAfterCentre'});
   expect(Object.keys(f.diagnostics[0]?.entryObservation??{}).every(key=>['entryPhase','entryVisibleCount','centreVisibleCount','centreClicked'].includes(key))).toBe(true);
   expect(await f.db.select().from(platformNativeReports)).toHaveLength(0);expect(f.physical()).toMatchObject({opened:1,released:1,downloads:0,held:false});
  }finally{await f.cleanup();}
 });
 it.each(['wrong','login','foreign'] as const)('%s身份边界仍拒绝且不下载',{timeout:testBudgetMs,retry:0},async identity=>{
  const f=await fixture(browser,{mode:'direct',identity});
  try{
   expect(await f.execute()).toMatchObject(identity==='login'?{status:'needsAuth',reasonCode:'LOGIN_REQUIRED'}:identity==='wrong'?{status:'failed',reasonCode:'WRONG_PLATFORM_IDENTITY'}:{status:'failed',reasonCode:'EXPORT_FAILED'});
   expect(f.physical()).toMatchObject({downloads:0,released:1,held:false});expect(await f.db.select().from(platformNativeReports)).toHaveLength(0);
  }finally{await f.cleanup();}
 });
 it.each(['wait','centreClick','entryClick','route'] as const)('%s阶段明确取消不晚下载或提交',{timeout:testBudgetMs,retry:0},async cancelAt=>{
  const f=await fixture(browser,{mode:cancelAt==='wait'?'lateDirect':cancelAt==='centreClick'?'centre':'direct',cancelAt});
  try{
   expect(await f.execute()).toMatchObject({status:'cancelled',reasonCode:'CANCELLED',committedReports:0});
   expect(f.physical().downloads).toBe(0);expect(await f.db.select().from(platformNativeReports)).toHaveLength(0);
  }finally{await f.cleanup();}
 });
 it.each(['wait','centreClick','route'] as const)('%s阶段原deadline耗尽不续观察或晚提交（受控时钟）',{timeout:testBudgetMs,retry:0},async expireAt=>{
  const f=await fixture(browser,{mode:expireAt==='wait'?'lateDirect':expireAt==='centreClick'?'centre':'direct',expireAt});
  try{
   expect(await f.execute()).toMatchObject({status:'failed',reasonCode:'EXPORT_FAILED',committedReports:0});
   expect(f.physical().downloads).toBe(0);expect(await f.db.select().from(platformNativeReports)).toHaveLength(0);
   expect(f.diagnostics[0]?.code).toBe('EXECUTION_DEADLINE_EXCEEDED');
  }finally{await f.cleanup();}
 });
 it('停止未确认保原资源，不冒释放；诊断失败不替换采集错误',{timeout:testBudgetMs,retry:0},async()=>{
  const f=await fixture(browser,{mode:'duplicateEntry',unconfirmedClose:true,throwDiagnostic:true});
  try{
   expect(await f.execute()).toMatchObject({status:'partial',reasonCode:'BROWSER_STOP_UNCONFIRMED',stopUnconfirmed:true});
   expect(f.physical()).toMatchObject({released:0,held:true,pendingStop:true,downloads:0});
   expect(f.diagnostics[0]).toMatchObject({code:'REPORT_LINK_AMBIGUOUS'});expect(await f.db.select().from(platformNativeReports)).toHaveLength(0);
  }finally{await f.cleanup();}
 });
});
