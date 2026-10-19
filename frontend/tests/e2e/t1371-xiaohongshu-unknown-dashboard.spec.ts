import {test as base,expect,type Page,type BrowserContext} from '@playwright/test';
import {readFileSync,lstatSync,realpathSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ENDPOINTS} from '@creatoros/contract';
import {recordExternalNetworkAttempt,formatExternalNetworkAttempts,type ExternalNetworkAttempt} from '../helpers/network-policy';

const wait={timeout:120_000};
type Overview=ReturnType<typeof ENDPOINTS.getGroupOverview.response.parse>;
type Catalog=ReturnType<typeof ENDPOINTS.listWorks.response.parse>;
type Query={startDate?:string;endDate?:string;platform?:string;accountId?:string};
type Scenario={groupId:string;groupName:string;accountId:string;query:Query;browseViews?:number|null;videoViews?:number|null;followers?:number;likes?:number;catalogWorkCount?:number;includedDateQuery?:Query;includedVideoViews?:number;includedCatalogWorkCount?:number;unattributableWorkCount?:number;publicationCount?:number;contentCount?:number};
type Seed={schema:string;root:string;nonce:string;userId:string;scenarios:Record<'primary'|'browseZero'|'latestUnavailable'|'noMetric'|'ksOutside'|'transferA'|'transferB',Scenario>;facts:Array<{id:string;accountId:string;externalId:string;visibility:string;outboundFrozenAt:string|null;uncertainVisibilityAt:string|null}>;safety:{onlySyntheticPrivateDatabase:boolean;visibilityPromotedToPublic:boolean}};
const test=base.extend({context:async({context},provide)=>{
 const external:ExternalNetworkAttempt[]=[];await isolate(context,external);await provide(context);expect(external,formatExternalNetworkAttempts(external)).toEqual([]);
}});
async function isolate(context:BrowserContext,external:ExternalNetworkAttempt[]){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(['about:','data:','blob:','chrome:'].includes(url.protocol)){await route.continue();return;}if(recordExternalNetworkAttempt(external,'http',url.href))await route.abort('blockedbyclient');else await route.continue();});
 await context.routeWebSocket('**/*',async socket=>{if(recordExternalNetworkAttempt(external,'websocket',socket.url()))await socket.close({code:1008,reason:'External network disabled in isolated acceptance.'});else socket.connectToServer();});
}
function privateFixture(){
 const input=process.env.T1371_FIXTURE_ROOT;if(!input)throw Error('T1371_FIXTURE_ROOT_REQUIRED');const root=realpathSync(input),uid=process.getuid?.(),stat=lstatSync(root);
 if(stat.isSymbolicLink()||!stat.isDirectory()||stat.uid!==uid||(stat.mode&0o077))throw Error('PRIVATE_ROOT_NOT_OWNED');
 const read=(name:string)=>{const file=join(root,name),s=lstatSync(file);if(s.isSymbolicLink()||!s.isFile()||s.uid!==uid||(s.mode&0o077))throw Error('PRIVATE_METADATA_NOT_OWNED');return JSON.parse(readFileSync(file,'utf8'));};
 const owner=read('owner.json'),ready=read('ready.json'),seed=read('t1371-seed-safe.json') as Seed;
 if(owner.task!=='T1355'||owner.root!==root||ready.root!==root||seed.root!==root||!owner.nonce||owner.nonce!==ready.nonce||owner.nonce!==seed.nonce||ready.userId!==seed.userId||owner.pgPort!==ready.pgPort||owner.helperPid!==ready.helperPid||seed.schema!=='t1371-unknown-dashboard-private-seed/v1'||!seed.safety.onlySyntheticPrivateDatabase||seed.safety.visibilityPromotedToPublic)throw Error('PRIVATE_SEED_IDENTITY_MISMATCH');
 expect(seed.facts.length).toBeGreaterThan(0);for(const fact of seed.facts){expect(fact.visibility).toBe('unknown');expect(fact.outboundFrozenAt).not.toBeNull();expect(fact.uncertainVisibilityAt).not.toBeNull();}
 return {root,owner,ready,seed};
}
function query(page:Page):Query{return Object.fromEntries([...new URL(page.url()).searchParams].filter(([key])=>['platform','accountId','startDate','endDate'].includes(key)));}
const filters=(page:Page)=>page.getByRole('region',{name:'账号组数据筛选',exact:true});
const metrics=(page:Page)=>page.getByRole('region',{name:'账号组指标',exact:true});
const metric=(page:Page,label:string)=>metrics(page).getByText(label,{exact:true}).locator('..').locator('p.tabular-nums');
async function overview(page:Page,groupId:string,q=query(page)):Promise<Overview>{
 const response=await page.request.post('/api/v1/dispatch',{...wait,headers:{'x-group-id':groupId,'content-type':'application/json'},data:{id:ENDPOINTS.getGroupOverview.id,input:{params:{groupId},query:q}}});
 expect(response.status(),'真实Next groupOverview HTTP状态').toBe(200);return ENDPOINTS.getGroupOverview.response.parse((await response.json()).data);
}
async function catalog(page:Page,s:Scenario):Promise<Catalog>{
 const response=await page.request.post('/api/v1/dispatch',{...wait,headers:{'x-group-id':s.groupId,'x-account-id':s.accountId,'content-type':'application/json'},data:{id:ENDPOINTS.listWorks.id,input:{params:{accountId:s.accountId},query:{pageSize:100}}}});
 expect(response.status(),'真实同账号目录HTTP状态').toBe(200);const data=ENDPOINTS.listWorks.response.parse((await response.json()).data);expect(data.accountId).toBe(s.accountId);expect(data.nextCursor).toBeNull();return data;
}
async function rendered(page:Page,data:Overview){
 const w=data.workspace;await expect(page.getByTestId('workspace-initialization-loading')).toHaveCount(0,wait);
 await expect(page.getByRole('heading',{name:'创作者总览',exact:true})).toBeVisible(wait);await expect(filters(page).getByText(w.groupName,{exact:true})).toBeVisible(wait);await expect(filters(page)).toContainText(w.coverage,wait);
 for(const [label,value] of [['一期内容（期）',w.contentCount],['平台发布记录（条）',w.publicationCount],['视频累计播放（次）',w.videoViews],['文章累计阅读（次）',w.articleReads],['累计浏览（次）',w.browseViews]] as const)await expect(metric(page,label)).toHaveText(value==null?'—':value.toLocaleString('zh-CN'),wait);
 const scope=await page.evaluate(()=>({groupId:localStorage.getItem('creatoros:current-group'),cookie:document.cookie.match(/(?:^|;\s*)creatoros_current_group=([^;]+)/)?.[1]??null}));expect(scope.groupId).toBe(w.groupId);expect(decodeURIComponent(scope.cookie??'')).toBe(w.groupId);
 const platform=w.platform??query(page).platform,labels:Record<string,string>={xiaohongshu:'小红书',kuaishou:'快手',douyin:'抖音'};
 if(!platform||!labels[platform])throw Error('EXPECTED_PUBLIC_PLATFORM_SCOPE');
 const row=page.getByRole('row').filter({has:page.getByRole('rowheader',{name:new RegExp('^'+labels[platform])})});await expect(row).toHaveCount(1);
 const dto=w.platforms.find(r=>r.platform===platform);for(const [column,value] of [[2,dto?.views],[3,dto?.browses],[4,dto?.reads],[5,dto?.likes]] as const)await expect(row.locator('td').nth(column)).toHaveText(value==null?'—':value.toLocaleString('zh-CN'),wait);
 await expect(metrics(page).getByText(/^账号粉丝合计（人，未去重）：/).locator('span.tabular-nums')).toHaveText(w.followers==null?'—':w.followers.toLocaleString('zh-CN'),wait);
}
async function chooseGroup(page:Page,s:Scenario){
 await page.getByTestId('account-switcher-trigger').click(wait);const menu=page.getByTestId('account-switcher-menu');await expect(menu).toBeVisible(wait);await menu.locator(`[data-group-id="${s.groupId}"]`).click(wait);await expect(menu).toBeHidden(wait);await expect(filters(page).getByText(s.groupName,{exact:true})).toBeVisible(wait);
}
async function selectDay(page:Page,date:string){
 const lazy=page.getByRole('button',{name:'报表起止日期',exact:true});
 if(await lazy.count())await lazy.click(wait);else await page.getByPlaceholder('开始日期',{exact:true}).click(wait);
 const popup=page.locator('.ant-picker-dropdown:visible');await expect(popup).toBeVisible(wait);
 for(const input of [page.getByPlaceholder('开始日期',{exact:true}),page.getByPlaceholder('结束日期',{exact:true})]){
  await input.click(wait);await expect(input).toBeFocused(wait);const cell=popup.locator(`td.ant-picker-cell-in-view[title="${date}"]`);
  if(await cell.count()===0){await expect(popup.locator('.ant-picker-year-btn').first()).toContainText('2026');const shown=Number((await popup.locator('.ant-picker-month-btn').first().innerText()).replace(/\D/g,'')),target=Number(date.slice(5,7));expect(Number.isInteger(shown)).toBe(true);await popup.locator(shown>target?'.ant-picker-header-prev-btn':'.ant-picker-header-next-btn').first().click(wait);}
  await expect(cell).toHaveCount(1);await cell.click(wait);
 }
 await expect(popup).toBeHidden(wait);await expect.poll(()=>query(page).startDate,wait).toBe(date);await expect.poll(()=>query(page).endDate,wait).toBe(date);
}

test('T1371/T1374 XHS与KS unknown真实总览及抖音原事实保护双视口',async({page,context,baseURL},info)=>{
 const fixture=privateFixture(),{seed}=fixture,s=seed.scenarios,origin=new URL(baseURL!).origin,points:unknown[]=[],reads:unknown[]=[],pageErrors:string[]=[],mutations:string[]=[];
 let completed=false;
 const witness=()=>writeFileSync(info.outputPath('witness.json'),JSON.stringify({completed,observedAt:new Date().toISOString(),viewport:page.viewportSize(),seedNonce:seed.nonce,points,reads,pageErrors,mutations,boundary:'仅私有合成service提交→真实Next/HTTP/当前总览UI；非安装恢复、非真实平台采集；外发冻结字段不变由backend同ID前后全等及原collection集成守卫证明，不冒真实发布E2E。'},null,2)+'\n',{mode:0o600});
 page.on('pageerror',error=>pageErrors.push(error.name+':'+error.message));
 page.on('request',request=>{if(request.url().endsWith('/api/v1/dispatch')){const body=request.postDataJSON() as {id?:string};const endpoint=Object.values(ENDPOINTS).find(e=>e.id===body.id);if(endpoint&&endpoint.method!=='GET')mutations.push(endpoint.id);}});
 async function read(row:Scenario){const data=await overview(page,row.groupId);reads.push({query:query(page),workspace:data.workspace});await rendered(page,data);return data;}
 async function mark(name:string){await page.screenshot({path:info.outputPath(name+'.png'),animations:'disabled',fullPage:true});points.push({name,path:new URL(page.url()).pathname,query:query(page),copy:await page.locator('main').innerText()});witness();}
 async function counts(){const response=await fetch(`http://127.0.0.1:${process.env.T1371_HOST_PORT??41419}/state`,{signal:AbortSignal.timeout(120_000)});expect(response.ok).toBe(true);const state=await response.json() as {userId:string;collectionSubmissions:number;aiTaskCount:number;scheduledJobCount:number};expect(state.userId).toBe(seed.userId);return {collectionSubmissions:state.collectionSubmissions,aiTaskCount:state.aiTaskCount,scheduledJobCount:state.scheduledJobCount};}
 await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(s.primary.groupId),url:origin}]);await page.addInitScript(({g,o})=>{if(location.origin===o&&!localStorage.getItem('creatoros:current-group'))localStorage.setItem('creatoros:current-group',g);},{g:s.primary.groupId,o:origin});
 try{
  const identity=await page.request.get('/api/v1/auth/me',wait);expect(identity.status()).toBe(200);expect((await identity.json()).data.id).toBe(seed.userId);const beforeCounts=await counts();
  const beforeCatalogs=new Map<string,Catalog>();for(const row of Object.values(s).filter(row=>row&&seed.facts.some(f=>f.accountId===row.accountId)))if(!beforeCatalogs.has(row.accountId))beforeCatalogs.set(row.accountId,await catalog(page,row));
  for(const data of beforeCatalogs.values()){expect(data.catalogCompleteness).toBe('verifiedComplete');expect(data.catalogGeneration).toBeGreaterThan(0);expect(data.catalogCompletedAt).not.toBeNull();for(const work of data.items){expect(work.directoryState).toBe('current');expect(work.visibility.visibility).toBe('unknown');}}
  // 真实既有侧栏入口，不用直接goto总览替代入口动作。
  await page.goto('/projects',wait);await page.getByTestId('app-sidebar').getByRole('link',{name:'创作者总览',exact:true}).click(wait);await expect(page).toHaveURL(/\/overview(?:\?|$)/,wait);
  await filters(page).getByRole('button',{name:'小红书',exact:true}).click(wait);await expect.poll(()=>query(page).platform,wait).toBe('xiaohongshu');
  await selectDay(page,'2026-10-03');const all=await read(s.primary);
  expect(query(page).accountId).toBeUndefined();expect(all.workspace).toMatchObject({browseViews:123,videoViews:null,articleReads:null,contentCount:1,publicationCount:1,collected:{state:'ready',catalogWorkCount:11,unattributableWorkCount:1}});await expect(filters(page).getByRole('combobox',{name:'平台账号'})).toContainText('全部账号');await mark('current-unknown-all-accounts-123');
  await filters(page).getByRole('combobox',{name:'平台账号'}).click(wait);await page.getByRole('option').filter({hasText:'小红书'}).click(wait);await expect.poll(()=>query(page).accountId,wait).toBe(s.primary.accountId);expect((await read(s.primary)).workspace.browseViews).toBe(123);
  await selectDay(page,'2026-09-01');const outside=await read(s.primary);expect(outside.workspace.browseViews).toBe(999);expect(outside.workspace.collected?.catalogWorkCount).toBe(1);expect(outside.workspace.publicationCount).toBe(0);
  await selectDay(page,'2026-10-03');const restored=await read(s.primary);expect(restored.workspace.browseViews).toBe(123);
  await page.getByRole('link',{name:'已采集作品',exact:true}).click(wait);await expect(page).toHaveURL(/\/accounts\/works(?:\?|$)/,wait);await page.goBack(wait);const returned=await read(s.primary);expect(returned.workspace.browseViews).toBe(123);expect(query(page).accountId).toBe(s.primary.accountId);await page.reload(wait);expect((await read(s.primary)).workspace.browseViews).toBe(123);await mark('same-account-return-refresh-123');
  for(const name of ['browseZero','latestUnavailable','noMetric'] as const){const row=s[name];await chooseGroup(page,row);await page.goto('/overview?'+new URLSearchParams(Object.entries(row.query) as [string,string][]),wait);const data=await read(row);expect(data.workspace.browseViews).toBe(row.browseViews);expect(data.workspace.collected?.catalogWorkCount).toBe(row.catalogWorkCount);if(row.unattributableWorkCount!==undefined)expect(data.workspace.collected?.unattributableWorkCount).toBe(row.unattributableWorkCount);if(name==='browseZero')await expect(page.getByRole('rowheader',{name:/^小红书/})).toContainText('已有采集指标');await mark(name+'-truthful-value');}
  // T1374新增KS平台/账号/日期链；全是合成数据，原目录与累计/项目定义分开。
  const ks=s.ksOutside;await chooseGroup(page,ks);await page.goto('/overview?startDate=2026-10-03&endDate=2026-10-03',wait);
  await filters(page).getByRole('button',{name:'快手',exact:true}).click(wait);await expect.poll(()=>query(page).platform,wait).toBe('kuaishou');
  const ksOutside=await read(ks);expect(ksOutside.workspace).toMatchObject({videoViews:null,browseViews:null,articleReads:null,followers:ks.followers,contentCount:0,publicationCount:0,collected:{catalogWorkCount:0}});await mark('ks-outside-date-honest-null');
  await filters(page).getByRole('combobox',{name:'平台账号'}).click(wait);await page.getByRole('option').filter({hasText:'快手'}).click(wait);await expect.poll(()=>query(page).accountId,wait).toBe(ks.accountId);
  await selectDay(page,'2026-09-01');const ksInside=await read(ks);expect(ksInside.workspace).toMatchObject({videoViews:321,browseViews:null,articleReads:null,followers:9,contentCount:0,publicationCount:0,collected:{state:'ready',catalogWorkCount:1}});
  expect(ksInside.workspace.platforms.find(row=>row.platform==='kuaishou')).toMatchObject({views:321,likes:0});await mark('ks-unknown-included-date-321-zero-like');
  await page.getByRole('link',{name:'已采集作品',exact:true}).click(wait);await expect(page).toHaveURL(/\/accounts\/works(?:\?|$)/,wait);await page.goBack(wait);expect((await read(ks)).workspace.videoViews).toBe(321);expect(query(page).accountId).toBe(ks.accountId);await page.reload(wait);expect((await read(ks)).workspace.videoViews).toBe(321);await mark('ks-account-return-refresh-321');
  await selectDay(page,'2026-10-03');expect((await read(ks)).workspace.videoViews).toBeNull();await selectDay(page,'2026-09-01');expect((await read(ks)).workspace.videoViews).toBe(321);
  // 本轮新增T1356已有Douyin transferA/B原事实控制，非旧T1371 UI曾验。
  for(const name of ['transferA','transferB'] as const){
   const row=s[name];await chooseGroup(page,row);await page.goto('/overview?'+new URLSearchParams(Object.entries(row.query) as [string,string][]),wait);const data=await read(row);
   expect(data.workspace).toMatchObject({videoViews:row.videoViews,contentCount:row.contentCount,publicationCount:row.publicationCount});
   expect(data.workspace.collected?.deduplicatedWorkCount).toBe(name==='transferA'?1:0);await mark('douyin-existing-'+name+'-'+row.videoViews);
  }
  // 同一真实目录ID及原unknown证据读回不变；不把内部数字当成公开资格。
  for(const row of Object.values(s).filter(row=>row&&beforeCatalogs.has(row.accountId)))expect(await catalog(page,row)).toEqual(beforeCatalogs.get(row.accountId));
  expect(await counts()).toEqual(beforeCounts);expect(mutations).toEqual([]);expect(pageErrors).toEqual([]);completed=true;witness();
 }finally{witness();}
});
