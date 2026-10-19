import {test as base,expect,type Page,type Request,type Response} from '@playwright/test';
import {readFileSync,writeFileSync,lstatSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ENDPOINTS} from '@creatoros/contract';
import {recordExternalNetworkAttempt,formatExternalNetworkAttempts,type ExternalNetworkAttempt} from '../helpers/network-policy';

const wait={timeout:120_000};
const test=base.extend({context:async({context},use)=>{
 const external:ExternalNetworkAttempt[]=[];
 await context.route('**/*',async route=>{if(recordExternalNetworkAttempt(external,'http',route.request().url()))await route.abort('blockedbyclient');else await route.continue();});
 await context.routeWebSocket('**/*',async socket=>{if(recordExternalNetworkAttempt(external,'websocket',socket.url()))await socket.close({code:1008,reason:'External network disabled in isolated acceptance.'});else socket.connectToServer();});
 await use(context);expect(external,formatExternalNetworkAttempts(external)).toEqual([]);
}});
function fixture(){
 const input=process.env.T1356_FIXTURE_ROOT;if(!input)throw Error('PRIVATE_ROOT_REQUIRED');
 const root=realpathSync(input),s=lstatSync(root);
 if(root!==input||!s.isDirectory()||s.uid!==process.getuid?.()||(s.mode&0o077))throw Error('PRIVATE_ROOT_NOT_OWNED');
 const read=(name:string)=>{const p=join(root,name),stat=lstatSync(p);if(stat.isSymbolicLink()||!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o077))throw Error('PRIVATE_METADATA_NOT_OWNED');return JSON.parse(readFileSync(p,'utf8'));};
 const owner=read('owner.json'),ready=read('ready.json'),seed=read('dashboard-seed-safe.json');
 if(owner.task!=='T1355'||owner.root!==root||ready.root!==root||seed.root!==root||!owner.nonce||owner.nonce!==ready.nonce||owner.nonce!==seed.nonce||ready.userId!==seed.userId||owner.helperPid!==ready.helperPid||owner.pgPort!==ready.pgPort||ready.dataDir!==join(root,'pgdata')||seed.schema!=='t1356-collected-dashboard-private-seed/v1')throw Error('PRIVATE_FIXTURE_IDENTITY_MISMATCH');
 return {root,ready,seed};
}
function scopes(body:Buffer){
 const found:Array<{kind:string;groupId:string|null}>=[];
 function visit(v:unknown){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(visit);return;}const row=v as Record<string,unknown>;for(const kind of ['workspace','initialScope']){const child=row[kind];if(child&&typeof child==='object'&&'groupId'in child){const id=(child as {groupId:unknown}).groupId;if(id===null||typeof id==='string')found.push({kind,groupId:id});}}Object.values(row).forEach(visit);}
 for(const line of body.toString().split('\n')){const colon=line.indexOf(':');if(colon>=0)try{visit(JSON.parse(line.slice(colon+1)));}catch{/* 非JSON Flight记录不推测scope。 */}}
 return found;
}
const filters=(page:Page)=>page.getByRole('region',{name:'账号组数据筛选',exact:true});
const nav=(page:Page)=>page.getByRole('navigation',{name:'主要导航',exact:true});

test('真实首页筛选后立即侧栏导航，保完整响应和最终页面',async({page,context,baseURL},info)=>{
 const {root,ready,seed}=fixture(),g=seed.scenarios.primary,origin=new URL(baseURL!).origin;
 const mode=process.env.T1369_DIAGNOSTIC_MODE??'natural';if(!['natural','response'].includes(mode))throw Error('DIAGNOSTIC_MODE_INVALID');
 const network:Array<Record<string,unknown>>=[],points:Array<Record<string,unknown>>=[],errors:string[]=[],tasks:Promise<void>[]=[];
 const ids=new Map<Request,number>(),pending=new Map<number,Record<string,unknown>>();let sequence=0,completed=false,phase='setup';
 const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const sourceFiles=['src/features/group-workspace/group-workspace-filters.tsx','src/components/shell/use-primary-navigation.ts'];
 const sourceSha256=Object.fromEntries(sourceFiles.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
 const save=()=>writeFileSync(info.outputPath('witness.json'),JSON.stringify({commit,sourceSha256,mode,phase,completed,viewport:page.viewportSize(),seedRoot:root,seedNonce:seed.nonce,network,points,errors,unfinished:[...pending.values()],serverPageRead:'UNKNOWN：原page-read日志没有浏览器请求identity；原服务stdout另保，禁止以HTTP头补成服务完成。',boundary:'仅私有合成身份/数据库与真实Next；未fulfilled DTO/改Flight/改DOM或store；受控暂停仅response continue。'},null,2)+'\n',{mode:0o600});
 const tracked=(request:Request)=>{const u=new URL(request.url());return u.origin===origin&&(u.searchParams.has('_rsc')||u.pathname==='/api/v1/dispatch');};
 page.on('pageerror',error=>{errors.push(error.name+':'+error.message);save();});
 page.on('request',request=>{if(!tracked(request))return;const u=new URL(request.url()),id=++sequence;ids.set(request,id);let operation:string|undefined;try{operation=request.postDataJSON()?.id;}catch{}const row={id,phase,startedAt:Date.now(),path:u.pathname,rsc:u.searchParams.has('_rsc'),query:Object.fromEntries([...u.searchParams].filter(([key])=>['platform','accountId','startDate','endDate','date'].includes(key))),operation};network.push({...row,event:'started'});pending.set(id,row);save();});
 page.on('requestfailed',request=>{const id=ids.get(request);if(id===undefined)return;network.push({...pending.get(id),id,event:'failed',at:Date.now(),failure:request.failure()?.errorText??'UNKNOWN'});pending.delete(id);save();});
 page.on('requestfinished',request=>{const id=ids.get(request);if(id===undefined)return;network.push({...pending.get(id),id,event:'finished',at:Date.now()});pending.delete(id);save();});
 page.on('response',(response:Response)=>{if(!tracked(response.request()))return;const task=(async()=>{const request=response.request(),id=ids.get(request),u=new URL(response.url());network.push({id,phase,event:'headers',at:Date.now(),path:u.pathname,status:response.status()});save();const error=await response.finished();if(error){network.push({id,phase,event:'response-failed',at:Date.now(),path:u.pathname,status:response.status(),message:String(error)});save();return;}if(u.searchParams.has('_rsc')){const bytes=await response.body();network.push({id,phase,event:'complete-body',at:Date.now(),path:u.pathname,status:response.status(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),scopes:scopes(bytes)});save();}})();tasks.push(task);task.catch(error=>{errors.push('response-observer:'+String(error));save();});});
 async function snap(name:string){
  const state=await page.evaluate(()=>({url:location.pathname+location.search,storageGroup:localStorage.getItem('creatoros:current-group'),cookieGroup:decodeURIComponent(document.cookie.match(/(?:^|;\s*)creatoros_current_group=([^;]+)/)?.[1]??''),workspaceLoading:!!document.querySelector('[data-testid="workspace-initialization-loading"]'),workspaceError:document.querySelector('[data-testid="workspace-initialization-error"]')?.textContent??null,filterPending:Array.from(document.querySelectorAll('[role="status"]')).some(n=>n.textContent==='正在读取所选数据…'),filterDisabled:Array.from(document.querySelectorAll<HTMLElement>('section[aria-label="账号组数据筛选"] button')).filter(n=>n.hasAttribute('disabled')).length,navPending:document.querySelector('[data-slot="sidebar-primary-nav"] [role="status"]')?.textContent??null,visiblePages:Array.from(document.querySelectorAll<HTMLElement>('[data-page]')).filter(n=>n.getClientRects().length>0).map(n=>n.getAttribute('data-page'))}));
  points.push({point:name,phase,at:Date.now(),...state});save();await page.screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});
 }
 async function home(platform?:string){phase='home-ready';await page.goto('/?'+new URLSearchParams({startDate:g.query.startDate,endDate:g.query.endDate,...(platform?{platform}:{})}),wait);await expect(page.locator('[data-page="dashboard"]')).toBeVisible(wait);await expect(filters(page).getByText(g.groupName,{exact:true})).toBeVisible(wait);await expect(filters(page).getByRole('button',{name:'小红书',exact:true})).toBeEnabled(wait);}
 async function target(path:string){
  await expect.poll(()=>new URL(page.url()).pathname,wait).toBe(path);
  if(path==='/overview'){await expect(page.locator('[data-page="group-overview"]')).toBeVisible(wait);await expect(filters(page).getByText(g.groupName,{exact:true})).toBeVisible(wait);await expect(filters(page).getByRole('button',{name:'小红书',exact:true})).toBeEnabled(wait);}
  else if(path==='/settings')await expect(page.getByRole('dialog')).toBeVisible(wait);
  await expect(page.locator('[data-slot="sidebar-primary-nav"] [role="status"]')).toHaveCount(0,wait);
  await expect(page.getByTestId('workspace-initialization-loading')).toHaveCount(0,wait);
  await expect(page.getByTestId('workspace-initialization-error')).toHaveCount(0,wait);
  expect(await page.evaluate(()=>localStorage.getItem('creatoros:current-group'))).toBe(g.groupId);
 }
 async function natural(label:string,change:()=>Promise<unknown>,path='/overview'){
  phase=label;await snap(label+'-before');const first=sequence;
  const request=page.waitForRequest(r=>{const u=new URL(r.url());return u.origin===origin&&u.pathname==='/'&&u.searchParams.has('_rsc');},wait);
  await change();const a=await request;points.push({point:label+'-filter-request',at:Date.now(),id:ids.get(a),aFinishedBeforeSidebar:network.some(n=>n.id===ids.get(a)&&n.event==='finished'),first});save();
  await nav(page).locator(`a[href="${path}"]`).click(wait);await snap(label+'-after-sidebar-click');await target(path);await snap(label+'-target-ready');
 }
 const cdp=mode==='response'?await context.newCDPSession(page):null;
 let held:{requestId:string;url:string}|null=null,released=false;
 const release=async()=>{if(held&&!released){released=true;await cdp!.send('Fetch.continueResponse',{requestId:held.requestId});}};
 try{
  const identity=await page.request.get('/api/v1/auth/me',wait);expect(identity.status()).toBe(200);expect((await identity.json()).data.id).toBe(seed.userId);
  await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(g.groupId),url:origin}]);
  await page.addInitScript(({id,o})=>{if(location.origin===o&&!localStorage.getItem('creatoros:current-group'))localStorage.setItem('creatoros:current-group',id);},{id:g.groupId,o:origin});
  await home();await snap('baseline');
  if(cdp){
   const failures:string[]=[];
   for(const path of ['/overview','/settings']){
    await home();held=null;released=false;const label=path.slice(1);phase='controlled-platform-'+label;const startedAfter=sequence;
    const paused=(event:{requestId:string;request:{url:string};responseStatusCode?:number})=>{const task=(async()=>{const u=new URL(event.request.url);if(!held&&u.pathname==='/'&&u.searchParams.get('platform')==='xiaohongshu'&&event.responseStatusCode===200){held={requestId:event.requestId,url:event.request.url};points.push({point:label+'-original-filter-held-after-200-headers',at:Date.now()});save();}else await cdp.send('Fetch.continueResponse',{requestId:event.requestId});})();tasks.push(task);task.catch(error=>{errors.push('pause-observer:'+String(error));save();});};
    cdp.on('Fetch.requestPaused',paused);await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*_rsc=*',requestStage:'Response'}]});
    try{
     await filters(page).getByRole('button',{name:'小红书',exact:true}).click(wait);await expect.poll(()=>held!==null,wait).toBe(true);
     await nav(page).locator(`a[href="${path}"]`).click(wait);await snap(label+'-held-a-sidebar-clicked');
     await expect.poll(()=>network.some(n=>Number(n.id)>startedAfter&&n.path===path&&n.event==='complete-body'),wait).toBe(true);await snap(label+'-complete-before-old-a');
     // 新目标的真实响应完整结束后就应落地，不等待旧筛选响应释放。
     await target(path);await snap(label+'-ready-while-old-a-held');
    }catch(error){failures.push(label+':'+String(error));points.push({point:label+'-original-failure',at:Date.now(),error:String(error)});await snap(label+'-failed-with-old-a-held');}
    finally{
     await release();await cdp.send('Fetch.disable');cdp.off('Fetch.requestPaused',paused);
     await expect.poll(()=>network.some(n=>Number(n.id)>startedAfter&&n.path==='/'&&(n.event==='complete-body'||n.event==='failed')),wait).toBe(true);
     try{await target(path);await snap(label+'-after-old-a-terminal');}catch(error){failures.push(label+'-after-release:'+String(error));await snap(label+'-after-release-failed');}
    }
   }
   expect(failures,'保留两个真实目标的原失败，不能用释放旧响应掩盖未提交').toEqual([]);
  }else await natural('natural-platform-overview',()=>filters(page).getByRole('button',{name:'小红书',exact:true}).click(wait));
  await page.goBack(wait);await expect(page.locator('[data-page="dashboard"]')).toBeVisible(wait);await page.reload(wait);await expect(filters(page).getByRole('button',{name:'小红书',exact:true})).toBeEnabled(wait);await snap('actual-back-refresh');
  await home();await natural('natural-platform-settings',()=>filters(page).getByRole('button',{name:'小红书',exact:true}).click(wait),'/settings');
  await home('xiaohongshu');await filters(page).getByRole('combobox',{name:'平台账号',exact:true}).click(wait);await natural('natural-account-overview',()=>page.getByRole('option',{name:'小红书 · 山间记录',exact:true}).click(wait));
  await home('xiaohongshu');await natural('natural-date-overview',()=>filters(page).getByRole('button',{name:'昨天',exact:true}).click(wait));
  phase='rapid-overview-projects-overview';for(const path of ['/overview','/projects','/overview'])await nav(page).locator(`a[href="${path}"]`).click(wait);await target('/overview');await snap('rapid-final-overview');
  phase='same-target-cache';await nav(page).locator('a[href="/overview"]').click(wait);await target('/overview');await nav(page).locator('a[href="/overview"]').click(wait);await target('/overview');await snap('same-target-cache-ready');
  expect(errors).toEqual([]);completed=true;save();
 }finally{
  try{await snap('final-observed');}catch{/* 页面故障不能阻止原始网络及截图收尾。 */}
  await release();if(cdp)await cdp.send('Fetch.disable').catch(()=>{});await Promise.allSettled(tasks);save();
  // ready只引用合成身份；原宿主/PG由现Playwright webServer正常关闭。
  expect(ready.userId).toBe(seed.userId);
 }
});
