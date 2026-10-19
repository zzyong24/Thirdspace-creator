import {test as base,expect,type Page,type BrowserContext,type Request as BrowserRequest} from '@playwright/test';
import {readFileSync,writeFileSync,lstatSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ENDPOINTS} from '@creatoros/contract';
import {recordExternalNetworkAttempt,formatExternalNetworkAttempts,type ExternalNetworkAttempt} from '../helpers/network-policy';
const wait={timeout:120_000};
const errorMessage=(value:unknown)=>value instanceof Error?value.message:String(value);
const test=base.extend({context:async({context},use)=>{
 const external:ExternalNetworkAttempt[]=[];
 await context.route('**/*',async route=>{if(recordExternalNetworkAttempt(external,'http',route.request().url()))await route.abort('blockedbyclient');else await route.continue();});
 await context.routeWebSocket('**/*',async socket=>{if(recordExternalNetworkAttempt(external,'websocket',socket.url()))await socket.close({code:1008,reason:'External network disabled in isolated acceptance.'});else socket.connectToServer();});
 await use(context);expect(external,formatExternalNetworkAttempts(external)).toEqual([]);
}});
function fixture(){
 const input=process.env.T1356_FIXTURE_ROOT;if(!input)throw Error('PRIVATE_ROOT_REQUIRED');const root=realpathSync(input),stat=lstatSync(root);
 if(root!==input||!stat.isDirectory()||stat.uid!==process.getuid?.()||(stat.mode&0o077))throw Error('PRIVATE_ROOT_NOT_OWNED');
 const read=(name:string)=>{const p=join(root,name),s=lstatSync(p);if(s.isSymbolicLink()||!s.isFile()||s.uid!==process.getuid?.()||(s.mode&0o077))throw Error('PRIVATE_METADATA_NOT_OWNED');return JSON.parse(readFileSync(p,'utf8'));};
 const owner=read('owner.json'),ready=read('ready.json'),seed=read('dashboard-seed-safe.json');
 if(owner.task!=='T1355'||owner.root!==root||ready.root!==root||seed.root!==root||!owner.nonce||owner.nonce!==ready.nonce||owner.nonce!==seed.nonce||ready.userId!==seed.userId||owner.helperPid!==ready.helperPid||owner.pgPort!==ready.pgPort||ready.dataDir!==join(root,'pgdata')||seed.schema!=='t1356-collected-dashboard-private-seed/v1')throw Error('PRIVATE_FIXTURE_IDENTITY_MISMATCH');
 return {root,ready,seed};
}
function flightScopes(body:Buffer){
 const scopes:Array<{kind:string;path:string;groupId:string|null}>=[];
 function visit(value:unknown,path:string){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach((v,i)=>visit(v,`${path}[${i}]`));return;}const row=value as Record<string,unknown>;for(const key of ['initialScope','workspace']){const child=row[key];if(child&&typeof child==='object'&&'groupId'in child){const groupId=(child as {groupId:unknown}).groupId;if(typeof groupId==='string'||groupId===null)scopes.push({kind:key,path,groupId});}}for(const [key,child]of Object.entries(row))visit(child,path+'.'+key);}
 for(const line of body.toString().split('\n')){const i=line.indexOf(':');if(i<0)continue;try{visit(JSON.parse(line.slice(i+1)),'record:'+line.slice(0,i));}catch{/* Flight其他协议记录不冒JSON或猜scope。 */}}
 return scopes;
}
const filters=(page:Page)=>page.getByRole('region',{name:'账号组数据筛选',exact:true});
async function choose(page:Page,id:string,name:string,keyboard=false){
 const menu=page.getByTestId('account-switcher-menu'),trigger=page.getByTestId('account-switcher-trigger');
 await expect(menu).toBeHidden(wait);await trigger.click(wait);await expect(menu).toBeVisible(wait);const item=menu.locator(`[data-group-id="${id}"]`);
 if(keyboard){await item.focus();await expect(item).toBeFocused(wait);await page.keyboard.press('Enter');}else await item.click(wait);
 await expect(menu).toBeHidden(wait);await expect(trigger).toHaveAccessibleName(`当前账号组：${name}`,wait);
}
async function current(page:Page,id:string,name:string){
 await expect(filters(page).getByText(name,{exact:true})).toBeVisible(wait);await expect(page.getByTestId('workspace-initialization-loading')).toHaveCount(0,wait);await expect(page.getByTestId('workspace-initialization-error')).toHaveCount(0,wait);
 const state=await page.evaluate(()=>({storage:localStorage.getItem('creatoros:current-group'),cookie:decodeURIComponent(document.cookie.match(/(?:^|;\s*)creatoros_current_group=([^;]+)/)?.[1]??'')}));expect(state).toEqual({storage:id,cookie:id});
 const u=new URL(page.url()),query=Object.fromEntries(['platform','accountId','startDate','endDate'].flatMap(key=>u.searchParams.get(key)?[[key,u.searchParams.get(key)!]]:[]));
 const response=await page.request.post('/api/v1/dispatch',{...wait,headers:{'x-group-id':id},data:{id:ENDPOINTS.getGroupOverview.id,input:{params:{groupId:id},query}}});expect(response.status()).toBe(200);const dto=ENDPOINTS.getGroupOverview.response.parse((await response.json()).data);expect(dto.workspace.groupId).toBe(id);expect(dto.workspace.groupName).toBe(name);
 for(const metric of dto.metrics){const card=page.getByRole('region',{name:'总览指标',exact:true}).locator(`[data-slot="metric-card"][id="${metric.id}"]`);await expect(card.locator('span.tabular-nums')).toHaveText(metric.value,wait);}
 return dto;
}
test('待完成筛选与切组使用真实Next收尾并排除旧响应',async({page,context,baseURL},info)=>{
 const {root,ready,seed}=fixture(),a=seed.scenarios.primary,b=seed.scenarios.transferB,origin=new URL(baseURL!).origin;
 const points:Array<Record<string,unknown>>=[],network:Array<Record<string,unknown>>=[],pageErrors:string[]=[],requestIds=new Map<BrowserRequest,number>(),unfinished=new Map<number,Record<string,unknown>>();let sequence=0,completed=false;let baselineCounts:Record<string,number>|undefined;
 const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const save=()=>writeFileSync(info.outputPath('witness.json'),JSON.stringify({commit,completed,viewport:page.viewportSize(),points,network,pageErrors,baselineCounts,unfinished:[...unfinished.values()],seedRoot:root,seedNonce:seed.nonce,boundary:'真实私有PG/Next/原RSC；只在response阶段暂停/继续，不读取暂停body、不提供Cookie/header/body改写；终态后单次BrowserResponse原bytesSHA与真实scope。旧onboarding请求不冒当前RSC终态。'},null,2)+'\n',{mode:0o600});
 page.on('pageerror',error=>pageErrors.push(error.name+':'+error.message));
 page.on('request',request=>{if(!request.url().startsWith(origin))return;const u=new URL(request.url());if(u.pathname!=='/api/v1/dispatch'&&!u.searchParams.has('_rsc'))return;const id=++sequence;requestIds.set(request,id);let operation:string|undefined;try{operation=request.postDataJSON()?.id;}catch{}unfinished.set(id,{id,path:u.pathname,rsc:u.searchParams.has('_rsc'),operation,startedAt:Date.now()});});
 const terminal=(event:'requestfinished'|'requestfailed',request:BrowserRequest)=>{const id=requestIds.get(request);if(id!==undefined){const row=unfinished.get(id);if(row)network.push({...row,terminal:event,at:Date.now(),failure:request.failure()?.errorText??null});unfinished.delete(id);}};
 page.on('requestfinished',request=>terminal('requestfinished',request));page.on('requestfailed',request=>terminal('requestfailed',request));
 async function snap(name:string,checks:string[],conditions:string[]=[],extra:Record<string,unknown>={}){const state=await page.evaluate(()=>({url:location.pathname+location.search,storageGroup:localStorage.getItem('creatoros:current-group'),cookieGroup:decodeURIComponent(document.cookie.match(/(?:^|;\s*)creatoros_current_group=([^;]+)/)?.[1]??''),loading:!!document.querySelector('[data-testid="workspace-initialization-loading"]'),error:document.querySelector('[data-testid="workspace-initialization-error"]')?.textContent??null}));await page.screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});points.push({point:name,check_ids:checks,conditions,at:Date.now(),...state,...extra,copy:await page.locator('body').innerText()});save();}
 async function counts(){const response=await fetch(`http://127.0.0.1:${process.env.T1356_HOST_PORT??41369}/state`,{signal:AbortSignal.timeout(120_000)});expect(response.ok).toBe(true);const state=await response.json() as {userId:string;currentGroupId:string;collectionSubmissions:number;aiTaskCount:number;scheduledJobCount:number};expect(state.userId).toBe(seed.userId);expect(state.currentGroupId).toBe(ready.currentGroupId);const value={collectionSubmissions:state.collectionSubmissions,aiTaskCount:state.aiTaskCount,scheduledJobCount:state.scheduledJobCount};for(const count of Object.values(value)){expect(Number.isInteger(count)).toBe(true);expect(count).toBeGreaterThanOrEqual(0);}return value;}
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
 async function delayedA(name:string,initialUrl:string){
  if(await page.evaluate(()=>localStorage.getItem('creatoros:current-group'))!==a.groupId)await choose(page,a.groupId,a.groupName);await page.goto(initialUrl,wait);await current(page,a.groupId,a.groupName);
  let held:{requestId:string;networkId?:string;url:string;status:number}|undefined,bHeld:{requestId:string;status:number}|undefined,bReleased=false,released=false,aResult:Record<string,unknown>|undefined,bResult:Record<string,unknown>|undefined,probeError:string|undefined;const tasks:Promise<void>[]=[];
  const release=async()=>{if(held&&!released){released=true;await cdp.send('Fetch.continueResponse',{requestId:held.requestId});}};
  const releaseB=async()=>{if(bHeld&&!bReleased){bReleased=true;await cdp.send('Fetch.continueResponse',{requestId:bHeld.requestId});}};
  const paused=(event:{requestId:string;networkId?:string;request:{url:string};responseStatusCode?:number})=>{const task=(async()=>{const u=new URL(event.request.url);if(!held&&u.pathname==='/'&&u.searchParams.get('platform')==='xiaohongshu'&&event.responseStatusCode){held={requestId:event.requestId,networkId:event.networkId,url:event.request.url,status:event.responseStatusCode};}else if(held&&!bHeld&&u.pathname==='/'&&!u.searchParams.has('platform')&&event.responseStatusCode){bHeld={requestId:event.requestId,status:event.responseStatusCode};}else await cdp.send('Fetch.continueResponse',{requestId:event.requestId});})();tasks.push(task);task.catch(error=>{probeError=error instanceof Error?error.message:String(error);});};
  const response=(actual:Awaited<ReturnType<Page['waitForResponse']>>)=>{const task=(async()=>{const u=new URL(actual.url());if(!u.searchParams.has('_rsc'))return;const err=await actual.finished();if(err&&held&&actual.url()===held.url){aResult={kind:'failed',status:actual.status(),at:Date.now(),failure:actual.request().failure()?.errorText??(errorMessage(err)),scopes:[]};network.push({case:name,...aResult});save();return;}if(err)throw err;const bytes=await actual.body(),scopes=flightScopes(bytes);const row={kind:'finished',url:u.pathname+u.search,status:actual.status(),finishedError:null,at:Date.now(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),scopes};network.push({case:name,...row});if(held&&actual.url()===held.url)aResult=row;if(!bResult&&scopes.some(s=>s.kind==='workspace'&&s.groupId===b.groupId))bResult=row;save();})();tasks.push(task);task.catch(error=>{probeError=error instanceof Error?error.message:String(error);});};
  const failed=(request:BrowserRequest)=>{if(held&&request.url()===held.url){aResult={kind:'failed',status:held.status,at:Date.now(),failure:request.failure()?.errorText??'UNKNOWN',scopes:[]};network.push({case:name,...aResult});save();}};
  cdp.on('Fetch.requestPaused',paused);page.on('response',response);page.on('requestfailed',failed);await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*_rsc=*',requestStage:'Response'}]});
  try{
   await snap(name+'-a-before',['single_navigation_owner'],[],{initialUrl});await filters(page).getByRole('button',{name:'小红书',exact:true}).click(wait);await expect.poll(()=>held!==undefined||!!probeError,wait).toBe(true);expect(probeError).toBeUndefined();expect(held!.status).toBe(200);
   await choose(page,b.groupId,b.groupName,true);await expect.poll(()=>bHeld!==undefined||!!probeError,wait).toBe(true);expect(probeError).toBeUndefined();expect(bHeld!.status).toBe(200);await expect(page.getByTestId('workspace-initialization-loading')).toBeVisible(wait);await expect(filters(page).getByText(a.groupName,{exact:true})).toHaveCount(0);await snap(name+'-b-pending',['old_scope_hidden_and_exclusive','single_navigation_owner'],['loading','keyboard']);await releaseB();
   await expect.poll(()=>bResult!==undefined||!!probeError,wait).toBe(true);expect(probeError).toBeUndefined();expect(bResult!.status).toBe(200);expect(bResult!.finishedError).toBeNull();await snap(name+'-b-http-before-a',['single_navigation_owner'],[],{bResponse:bResult});await release();
   await expect.poll(()=>aResult!==undefined||!!probeError,wait).toBe(true);expect(probeError).toBeUndefined();if(aResult!.kind==='finished'){expect(aResult!.status).toBe(200);expect(aResult!.finishedError).toBeNull();expect((aResult!.scopes as ReturnType<typeof flightScopes>).some(s=>s.kind==='workspace'&&s.groupId===a.groupId)).toBe(true);expect(Number(aResult!.at)).toBeGreaterThanOrEqual(Number(bResult!.at));}else expect(String(aResult!.failure)).toMatch(/ERR_ABORTED|NS_BINDING_ABORTED/);
   const dto=await current(page,b.groupId,b.groupName);expect(dto.workspace.videoViews).toBe(200);expect(dto.workspace.browseViews).toBeNull();await expect(filters(page).getByText(a.groupName,{exact:true})).toHaveCount(0);for(const key of ['platform','accountId','startDate','endDate'])expect(new URL(page.url()).searchParams.has(key)).toBe(false);
   await snap(name+'-b-final-after-old-a',['latest_group_after_old_terminal','old_scope_hidden_and_exclusive','single_navigation_owner'],['repeat'],{aResponse:aResult,bResponse:bResult,terminationOrder:aResult!.kind==='finished'?'old-A-payload-after-first-B':Number(aResult!.at)<Number(bResult!.at)?'old-A-cancelled-before-first-B':'old-A-cancelled-after-first-B'});
  }finally{await releaseB();await release();await cdp.send('Fetch.disable');await Promise.allSettled(tasks);cdp.off('Fetch.requestPaused',paused);page.off('response',response);page.off('requestfailed',failed);save();}
 }
 try{
  const identity=await page.request.get('/api/v1/auth/me',wait);expect(identity.status()).toBe(200);expect((await identity.json()).data.id).toBe(seed.userId);baselineCounts=await counts();expect(baselineCounts.collectionSubmissions).toBe(14);expect(baselineCounts.aiTaskCount).toBe(0);save();await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(a.groupId),url:origin}]);await page.addInitScript(({id,o})=>{if(location.origin===o&&!localStorage.getItem('creatoros:current-group'))localStorage.setItem('creatoros:current-group',id);},{id:a.groupId,o:origin});
  await page.goto('/?'+new URLSearchParams({startDate:a.query.startDate,endDate:a.query.endDate}),wait);await current(page,a.groupId,a.groupName);
  await delayedA('date-url','/?'+new URLSearchParams({startDate:a.query.startDate,endDate:a.query.endDate}));await delayedA('same-clean-url','/');
  await choose(page,a.groupId,a.groupName);await page.goto('/?'+new URLSearchParams(a.query),wait);await current(page,a.groupId,a.groupName);await choose(page,b.groupId,b.groupName);await current(page,b.groupId,b.groupName);await snap('already-committed-filter-switch',['single_navigation_owner','latest_group_after_old_terminal'],['repeat']);
  await choose(page,a.groupId,a.groupName);await choose(page,b.groupId,b.groupName);await current(page,b.groupId,b.groupName);await snap('rapid-a-b-final',['latest_group_after_old_terminal','public_reentry_and_same_scope'],['repeat']);
  await page.goto('/accounts',wait);await page.goBack(wait);await current(page,b.groupId,b.groupName);await page.reload(wait);await current(page,b.groupId,b.groupName);await snap('actual-back-and-refresh',['public_reentry_and_same_scope'],['back','refresh']);
  await choose(page,b.groupId,b.groupName,true);await current(page,b.groupId,b.groupName);await snap('same-group-selection',['public_reentry_and_same_scope'],['keyboard','repeat']);
  await choose(page,ready.currentGroupId,ready.currentGroupName);await current(page,ready.currentGroupId,ready.currentGroupName);await snap('empty-group-real-entry',['public_reentry_and_same_scope'],['empty']);
  const finalCounts=await counts();expect(finalCounts).toEqual(baselineCounts);expect(pageErrors).toEqual([]);points.push({point:'readonly-counts-unchanged',check_ids:['public_reentry_and_same_scope'],conditions:[],baselineCounts,finalCounts});completed=true;save();
 }finally{save();}
});
