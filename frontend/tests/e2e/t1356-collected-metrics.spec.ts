import {test as base,expect,chromium,type Page,type BrowserContext,type Locator,type Route,type Request as BrowserRequest} from '@playwright/test';
import {readFileSync,lstatSync,realpathSync,mkdtempSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {ENDPOINTS} from '@creatoros/contract';
import {recordExternalNetworkAttempt,formatExternalNetworkAttempts,type ExternalNetworkAttempt} from '../helpers/network-policy';

const wait={timeout:120_000};
type Overview=ReturnType<typeof ENDPOINTS.getGroupOverview.response.parse>;
type Query={startDate:string;endDate:string;platform?:string;accountId?:string};
type Scenario={groupId:string;groupName:string;accountId:string;query:Query;browseViews?:number|null;videoViews?:number|null;likes?:number;followers?:number;catalogWorkCount?:number;unattributableWorkCount?:number;publicationCount?:number;contentCount?:number;deduplicatedWorkCount?:number;includedDateQuery?:Query;includedVideoViews?:number;recentPublication?:{publicationId:string;projectId:string;outputId:string};legacyPublication?:{publicationId:string;projectId:string;outputId:string}};
type ScenarioName='primary'|'ksOutside'|'browseZero'|'latestUnavailable'|'noMetric'|'transferA'|'transferB';
type Seed={schema:string;root:string;nonce:string;userId:string;scenarios:Record<ScenarioName,Scenario>;safety:{overlapInjected:boolean}};
type PrivateIdentity={root:string;dataDir:string;nonce:string;task:string;helperPid:number;pgPid:number;pgPort:number;databaseURL:string;userId:string;currentGroupId:string;currentGroupName:string};
const test=base.extend({context:async({context},provide)=>{
 const external:ExternalNetworkAttempt[]=[];await isolate(context,external);
 await provide(context);expect(external,formatExternalNetworkAttempts(external)).toEqual([]);
}});
async function isolate(context:BrowserContext,external:ExternalNetworkAttempt[]){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(['about:','data:','blob:','chrome:'].includes(url.protocol)){await route.continue();return;}if(recordExternalNetworkAttempt(external,'http',url.href))await route.abort('blockedbyclient');else await route.continue();});
 await context.routeWebSocket('**/*',async socket=>{if(recordExternalNetworkAttempt(external,'websocket',socket.url()))await socket.close({code:1008,reason:'External network disabled in isolated acceptance.'});else socket.connectToServer();});
}
function privateFixture(){
 const input=process.env.T1356_FIXTURE_ROOT;if(!input)throw Error('T1356_FIXTURE_ROOT_REQUIRED');const root=realpathSync(input);
 const read=(name:string)=>{const path=join(root,name),s=lstatSync(path);if(s.isSymbolicLink()||!s.isFile()||s.uid!==process.getuid?.()||(s.mode&0o077))throw Error('PRIVATE_METADATA_NOT_OWNED');return JSON.parse(readFileSync(path,'utf8'));};
 const rootStat=lstatSync(root);if(!rootStat.isDirectory()||rootStat.uid!==process.getuid?.()||(rootStat.mode&0o077))throw Error('PRIVATE_ROOT_NOT_OWNED');
 const owner=read('owner.json') as PrivateIdentity,ready=read('ready.json') as PrivateIdentity,seed=read('dashboard-seed-safe.json') as Seed;
 if(owner.task!=='T1355'||owner.root!==root||ready.root!==root||seed.root!==root||!owner.nonce||owner.nonce!==ready.nonce||owner.nonce!==seed.nonce||ready.userId!==seed.userId||owner.pgPort!==ready.pgPort||owner.helperPid!==ready.helperPid||ready.dataDir!==join(root,'pgdata')||seed.schema!=='t1356-collected-dashboard-private-seed/v1'||seed.safety.overlapInjected)throw Error('PRIVATE_SEED_IDENTITY_MISMATCH');
 return {root,owner,ready,seed};
}
function pathFor(query:Query){const q=new URLSearchParams(Object.entries(query));return '/?'+q.toString();}
function pageQuery(page:Page):Record<string,string>{const u=new URL(page.url());return Object.fromEntries(['platform','accountId','startDate','endDate'].flatMap(k=>u.searchParams.get(k)?[[k,u.searchParams.get(k)!]]:[]));}
async function overview(page:Page,groupId:string,query:Record<string,string>):Promise<Overview>{
 const response=await page.request.post('/api/v1/dispatch',{...wait,headers:{'x-group-id':groupId,'content-type':'application/json'},data:{id:ENDPOINTS.getGroupOverview.id,input:{params:{groupId},query}}});
 expect(response.status(),'真实Next groupOverview HTTP状态').toBe(200);return ENDPOINTS.getGroupOverview.response.parse((await response.json()).data);
}
const filters=(page:Page)=>page.getByRole('region',{name:'账号组数据筛选',exact:true});
const summary=(page:Page)=>page.getByRole('region',{name:'总览指标',exact:true});
const grid=(page:Page)=>page.getByRole('region',{name:'工作台',exact:true});
function metric(page:Page,id:string){return summary(page).locator(`[data-slot="metric-card"][id="${id}"]`);}
async function sixCards(page:Page){
 const cards=grid(page).locator(':scope > div');await expect(cards).toHaveCount(6);
 const headings=['继续创作','待办事项','热门选题','最近发布','数据概览','创作建议'];
 for(let i=0;i<headings.length;i++)await expect(cards.nth(i).getByRole('region',{name:headings[i],exact:true})).toBeVisible(wait);
}
async function rendered(page:Page,data:Overview){
 await expect(filters(page).getByText(data.workspace.groupName,{exact:true})).toBeVisible(wait);
 await expect(page.getByTestId('workspace-initialization-loading')).toHaveCount(0,wait);
 await expect(summary(page).locator('[data-slot="metric-card"]')).toHaveCount(data.metrics.length);
 for(const m of data.metrics){const card=metric(page,m.id);await expect(card).toHaveAccessibleName(m.label);await expect(card.locator('span.tabular-nums')).toHaveText(m.value,wait);}
 await expect(filters(page)).toContainText(data.workspace.coverage,wait);await sixCards(page);
 const scope=await page.evaluate(()=>({groupId:localStorage.getItem('creatoros:current-group'),cookie:document.cookie.match(/(?:^|;\s*)creatoros_current_group=([^;]+)/)?.[1]??null}));
 expect(scope.groupId).toBe(data.workspace.groupId);expect(decodeURIComponent(scope.cookie??'')).toBe(data.workspace.groupId);
}
async function chooseGroup(page:Page,groupId:string,groupName:string){
 const trigger=page.getByTestId('account-switcher-trigger'),menu=page.getByTestId('account-switcher-menu');
 await expect(menu).toBeHidden(wait);await expect(trigger).toHaveAttribute('aria-expanded','false',wait);await trigger.click(wait);await expect(menu).toBeVisible(wait);
 await menu.locator(`[data-group-id="${groupId}"]`).click(wait);await expect(menu).toBeHidden(wait);await expect(trigger).toHaveAccessibleName(`当前账号组：${groupName}`,wait);
}
async function checkExpected(data:Overview,s:Scenario){
 expect(data.workspace.groupId).toBe(s.groupId);expect(data.workspace.startDate).toBe(s.query.startDate);expect(data.workspace.endDate).toBe(s.query.endDate);
 expect(data.workspace.platform).toBe(s.query.platform??null);
 for(const key of ['browseViews','videoViews','followers','publicationCount','contentCount'] as const)if(key in s)expect(data.workspace[key],key).toBe(s[key]);
 for(const key of ['catalogWorkCount','unattributableWorkCount','deduplicatedWorkCount'] as const)if(key in s)expect(data.workspace.collected?.[key],key).toBe(s[key]);
 if('likes' in s)expect(data.metrics.find(m=>m.id==='g-likes')?.value).toBe(String(s.likes));
 expect(data.dataOverview.trend).toEqual([]);expect(data.workspace.metricMode).toBe('published_and_collected_in_period_cumulative');
}
async function realDateSelection(page:Page,date:string){
 // RangePicker inputReadOnly=true：实际点击日历，不能fill或改input.value代签。
 await page.getByRole('button',{name:'报表起止日期',exact:true}).click(wait);
 const popup=page.locator('.ant-picker-dropdown:visible');await expect(popup).toBeVisible(wait);
 // 每次选择先确认真实active字段，再按当前面板导航；rc-picker切到结束字段时可能重置月份。
 const start=page.getByPlaceholder('开始日期',{exact:true}),end=page.getByPlaceholder('结束日期',{exact:true});
 for(const input of [start,end]){
  await input.click(wait);await expect(input).toBeFocused(wait);
  const cell=popup.locator(`td.ant-picker-cell-in-view[title="${date}"]`);
  if(await cell.count()===0){
   await expect(popup.locator('.ant-picker-year-btn').first()).toContainText('2026');
   await expect(popup.locator('.ant-picker-month-btn').first()).toContainText('10');
   await popup.locator('.ant-picker-header-prev-btn').first().click(wait);
  }
  await expect(cell).toHaveCount(1);await cell.click(wait);
 }
 await expect(popup).toBeHidden(wait);await expect.poll(()=>new URL(page.url()).searchParams.get('startDate'),wait).toBe(date);await expect.poll(()=>new URL(page.url()).searchParams.get('endDate'),wait).toBe(date);
}
type SqlClient={query(sql:string):Promise<{rows:Array<Record<string,unknown>>}>;release():void};
type SqlPool={connect():Promise<SqlClient>;end():Promise<void>};
async function privateSql(fixture:ReturnType<typeof privateFixture>){
 const {root,owner,ready}=fixture,url=new URL(ready.databaseURL);
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||Number(url.port)!==ready.pgPort||url.username!=='t1355_fixture'||url.password||url.pathname!=='/creatoros_t1355'||url.search||url.hash)throw Error('PRIVATE_SQL_URL_MISMATCH');
 const lines=readFileSync(join(ready.dataDir,'postmaster.pid'),'utf8').split('\n');if(Number(lines[0])!==ready.pgPid||lines[1]!==ready.dataDir||Number(lines[3])!==ready.pgPort||lines[5]!=='127.0.0.1')throw Error('PRIVATE_SQL_POSTMASTER_MISMATCH');
 for(const [pid,needle]of [[ready.pgPid,ready.dataDir],[owner.helperPid,'binding-fixture-server.mts']] as const){const ps=execFileSync('/bin/ps',['-p',String(pid),'-o','uid=,command='],{timeout:180_000,encoding:'utf8'});if(!ps.trim().startsWith(String(process.getuid?.()))||!ps.includes(needle))throw Error('PRIVATE_SQL_PROCESS_MISMATCH');}
 if(process.env.T1356_PG_PORT!==String(ready.pgPort)||root!==realpathSync(ready.root))throw Error('PRIVATE_SQL_ENV_PORT_MISMATCH');
 const requireBackend=createRequire(resolve(__dirname,'../../../backend/package.json'));
 const {Pool}=requireBackend('pg') as {Pool:new(config:{connectionString:string;connectionTimeoutMillis:number})=>SqlPool};
 const pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:120_000}),client=await pool.connect();
 const identity=async()=>{const row=(await client.query("SELECT current_user AS role,current_database() AS database,inet_server_port() AS port,current_setting('data_directory') AS data_dir")).rows[0];if(row?.role!=='t1355_fixture'||row.database!=='creatoros_t1355'||Number(row.port)!==ready.pgPort||row.data_dir!==ready.dataDir)throw Error('PRIVATE_SQL_SERVER_IDENTITY_MISMATCH');};
 try{await identity();return {client,pool,identity};}catch(error){client.release();await pool.end();throw error;}
}

test('T1356 既有typed采集经真实Next与首页同scope、日期与累计语义',async({page,context,baseURL},info)=>{
 const fixture=privateFixture(),{seed,root}=fixture,s=seed.scenarios,origin=new URL(baseURL!).origin;
 const points:Array<Record<string,unknown>>=[],publicReads:Array<Record<string,unknown>>=[],pageErrors:string[]=[],mutations:string[]=[],onboardingWrites:unknown[]=[],pending=new Set<BrowserRequest>();
 let completed=false;let baselineCounts:Record<string,number>|undefined;
 const business=(r:BrowserRequest)=>r.url().startsWith(origin)&&(r.url().endsWith('/api/v1/dispatch')||new URL(r.url()).searchParams.has('_rsc'));
 page.on('request',request=>{if(business(request))pending.add(request);if(request.url().endsWith('/api/v1/dispatch')){const body=request.postDataJSON() as {id?:string;input?:unknown};if(body.id==='settings.onboarding.group.patch')onboardingWrites.push(body.input);const endpoint=Object.values(ENDPOINTS).find(e=>e.id===body.id);if(endpoint&&endpoint.method!=='GET')mutations.push(endpoint.id);}});
 page.on('requestfinished',request=>pending.delete(request));page.on('requestfailed',request=>pending.delete(request));page.on('pageerror',error=>pageErrors.push(error.name+':'+error.message));
 const witness=()=>writeFileSync(info.outputPath('witness.json'),JSON.stringify({completed,observedAt:new Date().toISOString(),seedRoot:root,seedNonce:seed.nonce,viewport:page.viewportSize(),points,publicReads,pageErrors,mutations,onboardingWrites,baselineCounts,boundary:'真实私有PG→Next persistence→HTTP/SSR→正式UI；页面既有引导进度写单独记录，摘要读取不提交采集；平台源为明确合成事实；无membership重叠UI注入，相关保护引用backend实测；截图尚待独立看图',notCoveredInBrowser:['重叠/非法区间与A→B→A完整边界族引用backend定向Gate']},null,2)+'\n',{mode:0o600});
 async function sourceCounts(){const response=await fetch(`http://127.0.0.1:${process.env.T1356_HOST_PORT??41369}/state`,{signal:AbortSignal.timeout(120_000)});expect(response.ok).toBe(true);const state=await response.json() as {userId:string;currentGroupId:string;collectionSubmissions:number;aiTaskCount:number;scheduledJobCount:number};expect(state.userId).toBe(seed.userId);expect(state.currentGroupId).toBe(fixture.ready.currentGroupId);const value={collectionSubmissions:state.collectionSubmissions,aiTaskCount:state.aiTaskCount,scheduledJobCount:state.scheduledJobCount};for(const count of Object.values(value)){expect(Number.isInteger(count)).toBe(true);expect(count).toBeGreaterThanOrEqual(0);}return value;}
 async function mark(name:string,check_ids:string[],conditions:string[]=[],extra:Record<string,unknown>={}){await page.screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});points.push({point:name,check_ids,conditions,url:page.url(),copy:await page.locator('body').innerText(),...extra});witness();}
 async function read(groupId:string,query=pageQuery(page)){const data=await overview(page,groupId,query);publicReads.push({groupId:data.workspace.groupId,query,workspace:data.workspace,metrics:data.metrics,recentPublicationIds:data.recentPublications.map(p=>p.id)});return data;}
 async function visit(name:ScenarioName){
  const row=s[name];
  // 代表数据族的下一次硬导航，必须等当前动作真实完成；有意A/B竞态在下面单独控制。
  await expect.poll(()=>pending.size,wait).toBe(0);
  if(await page.evaluate(()=>localStorage.getItem('creatoros:current-group'))!==row.groupId)await chooseGroup(page,row.groupId,row.groupName);
  await expect(filters(page).getByText(row.groupName,{exact:true})).toBeVisible(wait);await expect(page.getByTestId('workspace-initialization-loading')).toHaveCount(0,wait);await expect.poll(()=>pending.size,wait).toBe(0);
  await page.goto(pathFor(row.query),wait);const data=await read(row.groupId);await checkExpected(data,row);await rendered(page,data);await expect.poll(()=>pending.size,wait).toBe(0);return data;
 }
 await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(s.primary.groupId),url:origin}]);
 await page.addInitScript(({g,o})=>{if(location.origin===o&&!localStorage.getItem('creatoros:current-group'))localStorage.setItem('creatoros:current-group',g);},{g:s.primary.groupId,o:origin});
 try{
  const identityResponse=await page.request.get('/api/v1/auth/me',wait);expect(identityResponse.status()).toBe(200);expect((await identityResponse.json()).data.id).toBe(seed.userId);baselineCounts=await sourceCounts();expect(baselineCounts.collectionSubmissions).toBe(14);expect(baselineCounts.aiTaskCount).toBe(0);witness();
  await page.goto(pathFor({startDate:s.primary.query.startDate,endDate:s.primary.query.endDate}),wait);
  const all=await read(s.primary.groupId);expect(all.workspace.browseViews).toBe(123);expect(all.workspace.videoViews).toBeNull();expect(all.workspace.publicationCount).toBe(1);expect(all.workspace.contentCount).toBe(1);expect(all.workspace.pendingCount).toBe(0);expect(all.workspace.collected?.catalogWorkCount).toBe(11);expect(all.workspace.collected?.unattributableWorkCount).toBe(1);
  expect(all.metrics.map(m=>m.id)).toEqual(['g-content','g-pubs','g-pending','g-video','g-read','g-browse']);await rendered(page,all);
  await expect(metric(page,'g-video').locator('span.tabular-nums')).toHaveText('—');await expect(metric(page,'g-browse').locator('span.tabular-nums')).toHaveText('123');
  await summary(page).scrollIntoViewIfNeeded();await mark('six-summary-original-five-plus-browse',['typed_metrics_same_scope','truthful_metric_semantics','responsive_caption']);
  const slots=['continue-creating-card','todo-card','trending-topics-card','recent-publications-card','data-overview-card','creation-suggestions-card'];
  // 逐张检查实际六卡标题可到达，截图按固定顺序留存，不用CSS缩放拼假整页。
  for(let i=0;i<6;i++){const card=grid(page).locator(':scope > div').nth(i);await card.locator('[data-slot="card-title"]').first().scrollIntoViewIfNeeded();await expect(card.locator('[data-slot="card-title"]').first()).toBeInViewport(wait);await mark(`workbench-card-${i+1}`,['error_and_other_cards','responsive_caption'],[],{slotHint:slots[i]});}
  const xhsButton=filters(page).getByRole('button',{name:'小红书',exact:true});await xhsButton.focus();await page.keyboard.press('Enter');await expect.poll(()=>new URL(page.url()).searchParams.get('platform'),wait).toBe('xiaohongshu');const xhs=await read(s.primary.groupId);await checkExpected(xhs,s.primary);await rendered(page,xhs);
  await expect(metric(page,'g-views')).toHaveAccessibleName('浏览（次）');await expect(metric(page,'g-likes').locator('span.tabular-nums')).toHaveText('0');await expect(metric(page,'g-finish').locator('span.tabular-nums')).toHaveText('—');
  const recent=page.locator('[data-slot="recent-publications-card"]');await expect(recent.locator('[data-slot="publication-row"]')).toHaveCount(1);expect(xhs.recentPublications.map(p=>p.id)).toEqual([s.primary.recentPublication!.publicationId]);await expect(recent.getByText('0 次浏览',{exact:true})).toBeVisible(wait);await expect(recent).not.toContainText('次播放');
  const chart=page.locator('[data-slot="data-overview-card"]');await expect(chart.getByRole('heading',{name:'近期作品累计浏览',exact:true})).toBeVisible(wait);await expect(chart.getByRole('figure',{name:'近期作品累计浏览',exact:true})).toBeVisible(wait);await expect(chart).not.toContainText('近期作品累计播放');await expect(page.getByTestId('dashboard-data-trend')).toHaveCount(0);
  await expect(filters(page)).toContainText('当前组已读取 11 条平台作品 · 数据为累计值');await expect(filters(page)).not.toContainText(/有归属采集记录的作品范围|已知覆盖|ingestedAt|metricKey/);
  await chart.scrollIntoViewIfNeeded();await mark('xhs-123-known-zero-recent-browse',['typed_metrics_same_scope','truthful_metric_semantics','filters_and_navigation'],['keyboard']);
  const account=xhs.workspace.accounts.find(a=>a.id===s.primary.accountId)!;const accountTrigger=filters(page).getByRole('combobox',{name:'平台账号',exact:true});await accountTrigger.focus();await page.keyboard.press('ArrowDown');const option=page.getByRole('option',{name:`小红书 · ${account.name}`,exact:true});await expect(option).toBeVisible(wait);await option.focus();await expect(option).toBeFocused();await page.keyboard.press('Enter');await expect.poll(()=>new URL(page.url()).searchParams.get('accountId'),wait).toBe(account.id);const scoped=await read(s.primary.groupId);expect(scoped.workspace.accountId).toBe(account.id);await rendered(page,scoped);await mark('real-account-filter-keyboard',['filters_and_navigation'],['keyboard','repeat']);
  // 真正client路由后用浏览器goBack，不用goto伪造历史。
  await filters(page).getByRole('button',{name:'全部平台',exact:true}).click(wait);await expect.poll(()=>new URL(page.url()).searchParams.has('platform'),wait).toBe(false);await page.goBack(wait);await expect.poll(()=>new URL(page.url()).searchParams.get('accountId'),wait).toBe(account.id);await rendered(page,await read(s.primary.groupId));await page.reload(wait);await rendered(page,await read(s.primary.groupId));await mark('account-filter-real-back-refresh',['filters_and_navigation','typed_metrics_same_scope'],['back','refresh']);
  await visit('browseZero');await expect(metric(page,'g-views').locator('span.tabular-nums')).toHaveText('0');await mark('known-browse-zero',['typed_metrics_same_scope','truthful_metric_semantics'],['repeat']);
  await visit('latestUnavailable');await expect(metric(page,'g-views').locator('span.tabular-nums')).toHaveText('—');await expect(metric(page,'g-likes').locator('span.tabular-nums')).toHaveText('0');await expect(summary(page)).not.toContainText('99');await mark('latest-unavailable-no-old-99',['typed_metrics_same_scope','error_and_other_cards'],['empty']);
  await visit('noMetric');await expect(metric(page,'g-views').locator('span.tabular-nums')).toHaveText('—');await expect(page.locator('[data-slot="recent-publications-card"]')).toContainText('当前筛选内暂无发布记录');await mark('no-metric-unattributable',['frozen_group_attribution','typed_metrics_same_scope'],['empty']);
  await visit('ksOutside');await expect(metric(page,'g-views').locator('span.tabular-nums')).toHaveText('—');await mark('ks-outside-publication-window',['typed_metrics_same_scope','filters_and_navigation'],['empty']);
  await realDateSelection(page,'2026-09-01');const ksInside=await read(s.ksOutside.groupId);expect(ksInside.workspace.startDate).toBe('2026-09-01');expect(ksInside.workspace.endDate).toBe('2026-09-01');expect(ksInside.workspace.videoViews).toBe(0);await rendered(page,ksInside);await expect(metric(page,'g-views').locator('span.tabular-nums')).toHaveText('0');await mark('ks-real-calendar-included-zero',['typed_metrics_same_scope','filters_and_navigation'],['repeat']);
  await visit('transferA');const a=await read(s.transferA.groupId);expect(a.workspace.accounts.find(row=>row.id===s.transferA.accountId)?.historical).toBe(true);expect(a.recentPublications.map(p=>p.id)).toEqual([s.transferA.legacyPublication!.publicationId]);await mark('transfer-a-old-publication-key-values',['frozen_group_attribution','truthful_metric_semantics']);
  await visit('transferB');await expect(page.locator('[data-slot="recent-publications-card"]')).toContainText('当前筛选内暂无发布记录');await mark('transfer-b-new-metrics-exclusive',['frozen_group_attribution','typed_metrics_same_scope']);

  // 原A筛选RSC仅在发送前等待；B原HTTP完成后放行原A，禁止重写新projection响应。
  await visit('primary');await filters(page).getByRole('button',{name:'全部平台',exact:true}).click(wait);await expect.poll(()=>new URL(page.url()).searchParams.has('platform'),wait).toBe(false);await rendered(page,await read(s.primary.groupId));
  let releaseA!:()=>void,finishA!:()=>void,releaseB!:()=>void,finishB!:()=>void,held=false,heldB=false;const sendA=new Promise<void>(done=>{releaseA=done;}),aDone=new Promise<void>(done=>{finishA=done;}),sendB=new Promise<void>(done=>{releaseB=done;}),bDone=new Promise<void>(done=>{finishB=done;}),lateErrors:string[]=[];
  let gatedA:BrowserRequest|undefined,terminalA:{kind:'finished'|'failed';at:number;status?:number;finishedError?:string|null;failure?:string}|undefined;
  const aFinished=async(request:BrowserRequest)=>{if(request!==gatedA)return;const response=await request.response(),error=response?await response.finished():'NO_RESPONSE';terminalA={kind:'finished',at:Date.now(),status:response?.status(),finishedError:error instanceof Error?error.message:error};};
  const aFailed=(request:BrowserRequest)=>{if(request===gatedA)terminalA={kind:'failed',at:Date.now(),failure:request.failure()?.errorText??'UNKNOWN'};};
  page.on('requestfinished',aFinished);page.on('requestfailed',aFailed);
  const requestGroup=async(request:BrowserRequest)=>decodeURIComponent(((await request.allHeaders())['cookie']??'').match(/(?:^|;\s*)creatoros_current_group=([^;]+)/)?.[1]??'');
  const oldA=async(route:Route)=>{const u=new URL(route.request().url()),group=await requestGroup(route.request());const gateA=!held&&u.pathname==='/'&&u.searchParams.get('platform')==='xiaohongshu'&&group===s.primary.groupId,gateB=!heldB&&u.pathname==='/'&&group===s.transferB.groupId;if(gateA||gateB){if(gateA){gatedA=route.request();held=true;await sendA;}else{heldB=true;await sendB;}try{await route.continue();}catch(error){if(!route.request().failure())lateErrors.push(error instanceof Error?error.message:'原RSC路由未正常交付');}finally{if(gateA)finishA();else finishB();}}else await route.continue();};
  await page.route('**/*_rsc=*',oldA);
  try{
   await filters(page).getByRole('button',{name:'小红书',exact:true}).click(wait);await expect.poll(()=>held,wait).toBe(true);
   const responseB=page.waitForResponse(async r=>r.url().includes('_rsc=')&&await requestGroup(r.request())===s.transferB.groupId,{timeout:120_000});await chooseGroup(page,s.transferB.groupId,s.transferB.groupName);await expect(page.getByTestId('workspace-initialization-loading')).toBeVisible(wait);await expect(filters(page).getByText(s.primary.groupName,{exact:true})).toHaveCount(0);await mark('group-switch-pending-old-scope-hidden',['filters_and_navigation','frozen_group_attribution'],['loading']);
   await expect.poll(()=>heldB,wait).toBe(true);releaseB();await bDone;const actualB=await responseB;expect(actualB.status()).toBe(200);expect(await actualB.finished()).toBe(null);const bTerminalAt=Date.now();releaseA();await aDone;await expect.poll(()=>terminalA!==undefined,wait).toBe(true);if(terminalA!.kind==='finished'){expect(terminalA!.status).toBe(200);expect(terminalA!.finishedError).toBeNull();}else expect(terminalA!.failure).toMatch(/ERR_ABORTED|NS_BINDING_ABORTED/);await expect.poll(()=>pending.size,wait).toBe(0);await rendered(page,await read(s.transferB.groupId));await expect(filters(page).getByText(s.primary.groupName,{exact:true})).toHaveCount(0);expect(lateErrors).toEqual([]);await mark('late-original-a-cannot-replace-b',['filters_and_navigation','frozen_group_attribution'],['repeat'],{oldRequestTerminal:terminalA,newRequestTerminal:{status:actualB.status(),at:bTerminalAt},evidenceMeaning:terminalA!.kind==='finished'?'旧A原响应终态后B保持一致':'旧A真实取消后B保持一致，不冒成功payload晚到'});
  }finally{releaseA();releaseB();if(held)await aDone;if(heldB)await bDone;await page.unroute('**/*_rsc=*',oldA);page.off('requestfinished',aFinished);page.off('requestfailed',aFailed);}
  await visit('primary');await filters(page).getByRole('button',{name:'全部平台',exact:true}).click(wait);await expect.poll(()=>new URL(page.url()).searchParams.has('platform'),wait).toBe(false);await rendered(page,await read(s.primary.groupId));
  await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveClass(/dark/);await summary(page).scrollIntoViewIfNeeded();await mark('dark-six-summary',['responsive_caption']);for(const index of [0,3,4,5]){await grid(page).locator(':scope > div').nth(index).locator('[data-slot="card-title"]').first().scrollIntoViewIfNeeded();await mark(`dark-workbench-${index+1}`,['responsive_caption']);}await page.emulateMedia({colorScheme:'light'});

  const zoom=await chromium.launchPersistentContext(mkdtempSync(join(root,'chrome-200-')),{channel:'chrome',headless:true,timeout:120_000,viewport:page.viewportSize()!,locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'}),zoomExternal:ExternalNetworkAttempt[]=[];
  zoom.setDefaultTimeout(120_000);zoom.setDefaultNavigationTimeout(120_000);
  let zoomControl:Locator|undefined,previousZoom:string|undefined;
  try{
   await isolate(zoom,zoomExternal);await zoom.addCookies(await context.cookies());await zoom.addInitScript(({g,o})=>{if(location.origin===o)localStorage.setItem('creatoros:current-group',g);},{g:s.primary.groupId,o:origin});
   const businessPage=await zoom.newPage(),settings=await zoom.newPage(),cdp=await zoom.newCDPSession(businessPage);await businessPage.goto(origin+pathFor({startDate:s.primary.query.startDate,endDate:s.primary.query.endDate}),wait);await rendered(businessPage,await overview(businessPage,s.primary.groupId,{startDate:s.primary.query.startDate,endDate:s.primary.query.endDate}));
   await settings.goto('chrome://settings/appearance',wait);const choices=await settings.locator('select').evaluateAll(nodes=>nodes.map(node=>{const e=node as HTMLSelectElement;return {id:e.id,value:e.value,labels:[...e.options].map(o=>o.textContent?.trim())};}));const choice=choices.filter(c=>c.labels.includes('200%'));expect(choice).toHaveLength(1);zoomControl=settings.locator('select#'+choice[0]!.id);previousZoom=choice[0]!.value;await zoomControl.selectOption({label:'200%'});await expect.poll(async()=>(await cdp.send('Page.getLayoutMetrics')).cssVisualViewport.zoom,wait).toBe(2);await businessPage.bringToFront();
   const layout=await businessPage.evaluate(()=>({rootZoom:getComputedStyle(document.documentElement).zoom,bodyZoom:getComputedStyle(document.body).zoom,innerWidth,innerHeight}));expect(layout.rootZoom).toBe('1');expect(layout.bodyZoom).toBe('1');await sixCards(businessPage);
   for(let i=0;i<6;i++){const card=summary(businessPage).locator('[data-slot="metric-card"]').nth(i);await card.scrollIntoViewIfNeeded();await expect(card).toBeInViewport(wait);const bounds=await card.boundingBox();expect(bounds).not.toBeNull();expect(bounds!.width).toBeGreaterThan(100);await businessPage.screenshot({path:info.outputPath(`native-chrome-200-summary-${i+1}.png`),animations:'disabled'});}
   for(let i=0;i<6;i++){const heading=grid(businessPage).locator(':scope > div').nth(i).locator('[data-slot="card-title"]').first();await heading.scrollIntoViewIfNeeded();await expect(heading).toBeInViewport(wait);await businessPage.screenshot({path:info.outputPath(`native-chrome-200-workbench-${i+1}.png`),animations:'disabled'});}
   const action=filters(businessPage).getByRole('button',{name:'小红书',exact:true});await action.scrollIntoViewIfNeeded();await action.focus();await businessPage.keyboard.press('Enter');await expect.poll(()=>new URL(businessPage.url()).searchParams.get('platform'),wait).toBe('xiaohongshu');const zoomData=await overview(businessPage,s.primary.groupId,pageQuery(businessPage));expect(zoomData.workspace.browseViews).toBe(123);await rendered(businessPage,zoomData);await businessPage.screenshot({path:info.outputPath('native-chrome-200-filter-operated.png'),animations:'disabled'});
   points.push({point:'native-chrome-200-real-filter',check_ids:['responsive_caption','filters_and_navigation'],conditions:['zoom','keyboard'],nativeZoom:2,layout,copy:await businessPage.locator('body').innerText()});expect(zoomExternal,formatExternalNetworkAttempts(zoomExternal)).toEqual([]);witness();
  }finally{if(zoomControl&&previousZoom!==undefined)await zoomControl.selectOption(previousZoom);await zoom.close();}

  // 最后一族：只在已核nonce/PID/端口的本次私有库制造真实SQL读取失败，并在finally恢复。
  await visit('primary');await expect.poll(()=>pending.size,wait).toBe(0);const beforeFault=await read(s.primary.groupId);expect(beforeFault.workspace.browseViews).toBe(123);
  const sql=await privateSql(fixture),hidden='t1356_hidden_metrics_'+crypto.randomUUID().replaceAll('-','');let renamed=false,restored=false;const faultEvidence:Record<string,unknown>={nonce:seed.nonce,groupId:s.primary.groupId,query:pageQuery(page),injected:false,restored:false};
  try{
   await sql.identity();const beforeCount=(await sql.client.query('SELECT count(*)::int AS count FROM public.platform_work_metric_snapshots')).rows[0]!.count;faultEvidence.beforeCount=beforeCount;
   await sql.client.query(`ALTER TABLE public.platform_work_metric_snapshots RENAME TO "${hidden}"`);renamed=true;faultEvidence.injected=true;
   const degraded=await read(s.primary.groupId);expect(degraded.workspace.collected).toMatchObject({state:'unavailable',catalogWorkCount:null,unattributableWorkCount:null,deduplicatedWorkCount:null,metrics:[]});expect(degraded.workspace.publicationCount).toBe(1);expect(degraded.workspace.contentCount).toBe(1);expect(degraded.workspace.browseViews).toBe(0);expect(degraded.recentPublications.map(p=>p.id)).toEqual([s.primary.recentPublication!.publicationId]);
   await page.reload(wait);await rendered(page,degraded);await expect(filters(page)).toContainText('平台采集摘要暂不可读');await expect(metric(page,'g-views').locator('span.tabular-nums')).toHaveText('0');await expect(page.locator('[data-slot="recent-publications-card"]').getByText('0 次浏览',{exact:true})).toBeVisible(wait);await mark('real-summary-sql-failure-retains-legacy-and-six-cards',['error_and_other_cards','truthful_metric_semantics'],['error'],{scope:'真实私有SQL失败，不stub DTO或新projection'});
  }finally{
   try{if(renamed){await sql.identity();await sql.client.query(`ALTER TABLE public."${hidden}" RENAME TO platform_work_metric_snapshots`);restored=true;faultEvidence.restored=true;faultEvidence.afterCount=(await sql.client.query('SELECT count(*)::int AS count FROM public.platform_work_metric_snapshots')).rows[0]!.count;expect(faultEvidence.afterCount).toBe(faultEvidence.beforeCount);}}
   finally{sql.client.release();await sql.pool.end();writeFileSync(info.outputPath('summary-failure-and-restore.json'),JSON.stringify(faultEvidence,null,2)+'\n',{mode:0o600});}
  }
  expect(restored).toBe(true);const recovered=await read(s.primary.groupId);expect(recovered.workspace.browseViews).toBe(123);expect(recovered.workspace.collected?.state).toBe('ready');await page.reload(wait);await rendered(page,recovered);await mark('same-scope-sql-restored-123',['error_and_other_cards','typed_metrics_same_scope'],['refresh']);
  const copy=await page.locator('body').innerText();for(const row of Object.values(s)){expect(copy).not.toContain(row.groupId);expect(copy).not.toContain(row.accountId);}expect(mutations.filter(id=>id!=='settings.onboarding.group.patch')).toEqual([]);
  // 现有引导会按真实成员/导入项目自动同步进度；仅准本fixture各组的精确派生内容。
  const expectedProgress=new Map(Object.entries(s).map(([name,row])=>[row.groupId,{params:{groupId:row.groupId},body:{completedSteps:name==='primary'?['import-account','confirm-origin']:name==='transferA'?['confirm-origin']:['import-account'],origin:name==='primary'||name==='transferA'?'existing':null}}]));
  expect(onboardingWrites).toHaveLength(mutations.filter(id=>id==='settings.onboarding.group.patch').length);
  for(const input of onboardingWrites){const target=(input as {params?:{groupId?:string}}|undefined)?.params?.groupId;expect(target).toBeDefined();expect(expectedProgress.has(target!)).toBe(true);expect(input).toEqual(expectedProgress.get(target!));}
  expect(pageErrors).toEqual([]);
  const background=await sourceCounts();expect(background).toEqual(baselineCounts);
  completed=true;points.push({point:'completed-readonly-source-counts',check_ids:['typed_metrics_same_scope','error_and_other_cards'],conditions:[],background});witness();
 }finally{witness();}
});
