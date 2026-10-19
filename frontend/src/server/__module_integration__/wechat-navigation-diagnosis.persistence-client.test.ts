// @vitest-environment node
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {createServer, type Server} from 'node:http';
import {mkdtempSync, rmSync, mkdirSync, realpathSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NodeNextRequest} from 'next/dist/server/base-http/node';
import {NextRequestAdapter, signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';
import {DispatchClient} from '../../../../mcp-server/src/dispatch';
import {POST} from '@/app/api/v1/dispatch/route';
import {__resetPersistenceForTests, compositeTransport, getIdentityService, getPlatformAccountService, getAccountGroupService} from '@/server/persistence-client';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {PNG} from 'pngjs';
import {chromium} from '@playwright/test';
import {guardedLaunch} from '@creatoros/ai-worker/browser/chromium-guard';
import type {Db} from '@creatoros/backend';
import {platformCollectionRuns} from '../../../../backend/src/schema/platform-collection';
import {executionBrowserProfileLeases} from '../../../../backend/src/schema/execution-browser-profile-leases';
import {ENDPOINTS, type RequestContext} from '@creatoros/contract';

const browser=vi.hoisted(()=>({launches:0,screenshots:0,closed:0,foreignRequests:0,db:null as Db|null,firstScreenshot:undefined as (()=>void)|undefined}));
vi.mock('@creatoros/backend',async(load)=>{const actual=await load<typeof import('@creatoros/backend')>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const opened=await actual.createConfiguredDb(...args);browser.db=opened.db;return opened;}};});
// 唯一替身为宿主浏览器启动端口：仍使用真实guard/Chromium和生产DOM witness，所有页面请求本地fulfill。
vi.mock('@creatoros/ai-worker/platform/wechat-browser-source',async(load)=>{
 const actual=await load<typeof import('@creatoros/ai-worker/platform/wechat-browser-source')>();
 return {...actual,createWechatBrowserSource:(deps:Parameters<typeof actual.createWechatBrowserSource>[0])=>actual.createWechatBrowserSource({...deps,openProfile:(directory,headless,controls)=>guardedLaunch(directory,async()=>{
   await controls.assertScopeFresh?.();controls.signal?.throwIfAborted();browser.launches++;
   const context=await chromium.launchPersistentContext(directory,{headless,timeout:120000,args:['--disable-background-networking','--no-first-run'],viewport:{width:1024,height:768}});
   controls.onBrowserOpened?.(new Date().toISOString());
   context.on('close',()=>{browser.closed++;});
   await context.route('**/*',async route=>{
    if(new URL(route.request().url()).origin!=='https://channels.weixin.qq.com'){browser.foreignRequests++;return route.abort();}
    await route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><h2 class="finder-nickname">合成诊断账号</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-stable-id">synthetic-stable-id</span><nav><button>合成菜单名称</button><span style="display:none">数据中心</span></nav></body></html>'});
   });
   const page=context.pages()[0]??await context.newPage();const screenshot=page.screenshot.bind(page);
   page.screenshot=async(options)=>{const bytes=await screenshot(options);browser.screenshots++;browser.firstScreenshot?.();return bytes;};
   return context;
 },{signal:controls.signal,onStopped:controls.onStopped,timeoutMs:120000,queueTimeoutMs:120000})})};
});

// 全部数据/目录为本轮合成资源；这里复用Next生产Node适配器，真实socket关闭产生req.signal。
const TEST_BUDGET_MS=2_700_000;
const root=realpathSync(mkdtempSync('/tmp/creatoros-t1364-public-'));
const httpTrace:Array<{signal:AbortSignal;aborted:boolean;reason:string|null;closeUnfinished:boolean;finished:boolean;response?:unknown}>=[];
let server:Server;
let client:DispatchClient;
let accountId:string;
let groupId:string;
let owner:RequestContext;

beforeAll(async()=>{
  vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR','');
  vi.stubEnv('CREATOROS_CLI_ACCESS_TOKEN','t1364-synthetic-grant');
  vi.stubEnv('CREATOROS_CLI_ACCESS_FILE','');
  vi.stubEnv('CREATOROS_DOUYIN_AUTH_DIR',join(root,'profiles','douyin'));
  vi.stubEnv('CREATOROS_WEB_AUTH_DIR',join(root,'profiles','web'));
  __resetPersistenceForTests();
  owner=await (await getIdentityService()).resolveLocalContext();
  const created=await compositeTransport.request(ENDPOINTS.createAccount,{params:undefined,query:undefined,body:{platform:'wechatVideo',accountHandle:'t1364-synthetic-account'}} as never,owner) as {data:{id:string}};
  accountId=created.data.id;
  groupId=`grp_legacy_${accountId}`;
  server=createServer(async(req,res)=>{
    try{
      req.url=`http://127.0.0.1:${(server.address() as {port:number}).port}${req.url}`;
      const nextReq=NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(req),signalFromNodeResponse(res));
      const trace={signal:nextReq.signal,aborted:false,reason:null as string|null,closeUnfinished:false,finished:false,response:undefined as unknown};httpTrace.push(trace);
      nextReq.signal.addEventListener('abort',()=>{trace.aborted=true;trace.reason=(nextReq.signal.reason as Error)?.name??null;});
      res.once('close',()=>{trace.closeUnfinished=!res.writableFinished;trace.finished=res.writableFinished;});
      const response=await POST(nextReq);trace.response=await response.clone().json();
      if(!res.destroyed){res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
    }catch(error){if(!res.destroyed){res.writeHead(500);res.end(String(error));}}
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  client=new DispatchClient({baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`,cliAccessToken:'t1364-synthetic-grant',clientId:'t1364-public-cli'});
},TEST_BUDGET_MS);

afterAll(async()=>{
  if(server)await new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());});
  await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();
  rmSync(root,{recursive:true,force:true});
},TEST_BUDGET_MS);

beforeEach(()=>{vi.stubEnv('CREATOROS_CLI_ACCESS_TOKEN','t1364-synthetic-grant');vi.stubEnv('CREATOROS_CLI_ACCESS_FILE','');vi.stubEnv('CREATOROS_WECHAT_NAVIGATION_DIAGNOSIS_CONFIG','');});

function enable(authorizationId:string){const privateRoot=join(root,authorizationId);mkdirSync(privateRoot,{mode:0o700});vi.stubEnv('CREATOROS_WECHAT_NAVIGATION_DIAGNOSIS_CONFIG',JSON.stringify({authorizationId,groupId,accountId,privateRoot,sourceSha:'e6769b474fde3db583bf08b04104e4f3a57bd6c9'}));return privateRoot;}
const call=(key:string,signal?:AbortSignal)=>client.dispatch('accounts.wechatNavigation.diagnose',{params:{accountId},body:{}},{groupId,accountId,apply:true,idempotencyKey:key},{signal});

describe('T1364 canonical CLI → 真实HTTP → Next适配器 → dispatch → persistence',()=>{
  it('合成导航容器经真实Chromium机械投影保留候选文字',async()=>{
    const context=await chromium.launch({headless:true,timeout:120000});
    try{const page=await context.newPage();await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<nav><button>合成菜单名称</button></nav>'}));await page.goto('https://channels.weixin.qq.com/platform',{timeout:120000});
      const {readWechatNavigationObservation}=await import('@creatoros/ai-worker/platform/wechat-navigation-observation');
      const result=await readWechatNavigationObservation(page,{signal:new AbortController().signal,timeoutMs:()=>120000,assertScopeFresh:async()=>{}});
      expect(result.menuCandidates.map(item=>item.text)).toContain('合成菜单名称');
    }finally{await context.close();}
  },TEST_BUDGET_MS);
  it('新诊断已登记，默认关闭并以服务端明确拒绝结束，不能冒未知operation或启动浏览器',async()=>{
    const result=await client.dispatch('accounts.wechatNavigation.diagnose',{params:{accountId},body:{}},{groupId,accountId,apply:true,idempotencyKey:'t1364-public-disabled'}).then(value=>({value}),error=>({error}));
    expect(String((result as {error?:unknown}).error)).toContain('WECHAT_NAVIGATION_DISABLED');
    expect(result).toHaveProperty('error.status',409);
  },TEST_BUDGET_MS);

  it('非法可选配置只拒新诊断，原accounts读保持可用',async()=>{
    vi.stubEnv('CREATOROS_WECHAT_NAVIGATION_DIAGNOSIS_CONFIG','{invalid');
    const listed=await client.dispatch('accounts.list',{query:{page:1,pageSize:100}}) as {data:Array<{id:string}>};
    expect(listed.data.some(row=>row.id===accountId)).toBe(true);
    await expect(call('invalid-config')).rejects.toThrow('WECHAT_NAVIGATION_CONFIG_INVALID');
    expect(browser.launches).toBe(0);
  },TEST_BUDGET_MS);

  it('私有存储错误：缺失根目录经真实HTTP只给固定错误，不泄漏路径或日志',async()=>{
    const privateRoot=enable('missing-private-root');rmSync(privateRoot,{recursive:true});const logged=vi.spyOn(console,'error').mockImplementation(()=>{});
    const error=await call('missing-private-root-key').catch(value=>value);
    expect(String(error)).not.toContain(privateRoot);expect(String(error)).toContain('WECHAT_NAVIGATION_STORAGE_UNAVAILABLE');
    expect(JSON.stringify(logged.mock.calls)).not.toContain(privateRoot);expect(browser.launches).toBe(0);
  },TEST_BUDGET_MS);

  it('私有存储错误：损坏marker原件保留且同key不二启，PRIVATE_SENTINEL不进HTTP或日志',async()=>{
    await (await getPlatformAccountService()).updateAccount(owner,accountId,{externalAccountId:'synthetic-stable-id'});
    const authorizationId='corrupt-private-marker',privateRoot=enable(authorizationId),marker=join(privateRoot,`authorization-${createHash('sha256').update(JSON.stringify(authorizationId)).digest('hex')}.json`);
    const damaged='T1364_PRIVATE_SENTINEL invalid-json';writeFileSync(marker,damaged,{mode:0o600});const logged=vi.spyOn(console,'error').mockImplementation(()=>{});
    const error=await call('corrupt-private-marker-key').catch(value=>value);
    expect(String(error)).not.toContain('T1364_PRIV');expect(String(error)).not.toContain(privateRoot);expect(String(error)).toContain('WECHAT_NAVIGATION_STORAGE_UNAVAILABLE');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('T1364_PRIV');expect(readFileSync(marker,'utf8')).toBe(damaged);expect(browser.launches).toBe(0);
    const replay=await call('corrupt-private-marker-key').catch(value=>value);expect(replay).toHaveProperty('receipt.duplicate',true);expect(readFileSync(marker,'utf8')).toBe(damaged);expect(browser.launches).toBe(0);
  },TEST_BUDGET_MS);

  it('enabled经完整公共链观察原120秒、两PNG/私有manifest、实close与真实lease分证，成功重放不二启',async()=>{
    await (await getPlatformAccountService()).updateAccount(owner,accountId,{externalAccountId:'synthetic-stable-id'});
    const privateRoot=enable('normal');const before=await browser.db!.select().from(platformCollectionRuns);
    const start=Date.now();const envelope=await call('normal-key') as {data:import('@creatoros/contract').WechatNavigationDiagnosisResource};
    expect(Date.now()-start).toBeGreaterThanOrEqual(120000);
    const result=envelope.data;expect(result).toMatchObject({status:'completed',identityMatched:true,screenshots:[{phase:'identity_verified',status:'captured'},{phase:'observation_end',status:'captured'}],stop:{browserOpened:true,contextCloseStarted:true,physicalStopConfirmed:true,hostLeaseReleaseConfirmed:true,stopPending:false}});
    expect(result.sampleCount).toBeLessThanOrEqual(32);expect(browser.launches).toBe(1);expect(browser.closed).toBe(1);
    const run=readdirSync(privateRoot).find(name=>name.startsWith('run-'))!;
    const manifest=JSON.parse(readFileSync(join(privateRoot,run,'manifest.json'),'utf8'));
    expect(manifest.auditReceipt.leaseId).toBeTruthy();expect(manifest.auditReceipt.hostOperationId).toBeTruthy();
    expect(manifest.observation.snapshots[0].menuCandidates.some((item:{text:string})=>item.text==='合成菜单名称')).toBe(true);
    for(const image of result.screenshots){const bytes=readFileSync(join(privateRoot,run,`${image.artifactId}.png`));expect(PNG.sync.read(bytes).width).toBe(1024);expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256);}
    const leases=await browser.db!.select().from(executionBrowserProfileLeases);const lease=leases.find(row=>row.leaseId===manifest.auditReceipt.leaseId)!;
    expect(lease.hostOperationId).toBe(manifest.auditReceipt.hostOperationId);expect(lease.releasedAt).not.toBeNull();expect(Date.parse(result.stop.hostLeaseReleasedAt!)).toBeGreaterThanOrEqual(Date.parse(result.stop.physicalStoppedAt!));
    expect(await browser.db!.select().from(platformCollectionRuns)).toEqual(before);
    const cached=await call('normal-key');expect(cached).toEqual(envelope);expect(browser.launches).toBe(1);
    const trace=httpTrace.find(item=>(item.response as {data?:{diagnosticRunId?:string}})?.data?.diagnosticRunId===result.diagnosticRunId)!;
    await delay(10);expect(trace.aborted).toBe(false);expect(trace.finished).toBe(true);expect(trace.closeUnfinished).toBe(false);
    await expect(call('second-invocation')).rejects.toThrow('WECHAT_NAVIGATION_AUTHORIZATION_CONSUMED');expect(browser.launches).toBe(1);
    const groups=await getAccountGroupService(),current=await groups.get(owner,groupId);
    await groups.update(owner,groupId,{name:'synthetic-updated',expectedVersion:current.version});
    await expect(call('normal-key')).rejects.toThrow('WECHAT_NAVIGATION_SCOPE_CHANGED');expect(browser.launches).toBe(1);
  },TEST_BUDGET_MS);

  it('真实HTTP已读body且observer活跃后断连，Next ResponseAborted贯穿到source实停和原租约释放，无晚截图',async()=>{
    const privateRoot=enable('disconnect');const controller=new AbortController();
    let ready!:()=>void;const active=new Promise<void>(resolve=>{ready=resolve;});browser.firstScreenshot=ready;
    const pending=call('disconnect-key',controller.signal).catch(error=>error);
    await active;const shots=browser.screenshots,trace=httpTrace.at(-1)!;expect(trace.signal.aborted).toBe(false);
    const running=await call('disconnect-key') as {receipt:{status:string}};expect(running.receipt.status).toBe('running');expect(browser.launches).toBe(2);
    await expect(client.dispatch('accounts.wechatNavigation.diagnose',{params:{accountId},body:{url:'untrusted'}},{groupId,accountId,apply:true,idempotencyKey:'disconnect-key'})).rejects.toThrow('不同输入');
    controller.abort(Error('synthetic-client-disconnect'));await pending;
    const end=Date.now()+120000;while(!trace.response&&Date.now()<end)await delay(50);
    expect(trace.closeUnfinished).toBe(true);expect(trace.finished).toBe(false);expect(trace.aborted).toBe(true);expect(trace.reason).toBe('ResponseAborted');
    const result=(trace.response as {data:import('@creatoros/contract').WechatNavigationDiagnosisResource}).data;
    expect(result).toMatchObject({status:'cancelled',reasonCode:'WECHAT_NAVIGATION_CANCELLED',stop:{browserOpened:true,physicalStopConfirmed:true,hostLeaseReleaseConfirmed:true,stopPending:false}});
    expect(browser.screenshots).toBe(shots);expect(browser.closed).toBe(2);expect(browser.launches).toBe(2);
    const run=readdirSync(privateRoot).find(name=>name.startsWith('run-'))!;const manifest=JSON.parse(readFileSync(join(privateRoot,run,'manifest.json'),'utf8'));
    const lease=(await browser.db!.select().from(executionBrowserProfileLeases)).find(row=>row.leaseId===manifest.auditReceipt.leaseId)!;
    expect(lease.releasedAt).not.toBeNull();expect(browser.foreignRequests).toBe(0);
    const replay=await call('disconnect-key');expect(replay).toEqual(trace.response);expect(browser.launches).toBe(2);
    browser.firstScreenshot=undefined;
  },TEST_BUDGET_MS);

  it('真实成员转组发生在截图期间，停止后隔离原证据并保原CollectionRun',async()=>{
    const target=await client.dispatch('accountGroups.create',{body:{name:'合成转组目标',idempotencyKey:'transfer-target'}},{apply:true,idempotencyKey:'transfer-target'}) as {data:{id:string}};
    const preview=await client.dispatch('accountGroups.members.previewTransfer',{body:{accountId,toGroupId:target.data.id}},{apply:true,idempotencyKey:'transfer-preview'}) as {data:Record<string,unknown>};
    const privateRoot=enable('membership-change');let ready!:()=>void;const active=new Promise<void>(resolve=>{ready=resolve;});browser.firstScreenshot=ready;
    const before=await browser.db!.select().from(platformCollectionRuns),pending=call('membership-change-key') as Promise<{data:import('@creatoros/contract').WechatNavigationDiagnosisResource}>;
    await active;
    await client.dispatch('accountGroups.members.transfer',{body:{...preview.data,idempotencyKey:'transfer-apply'}},{apply:true,idempotencyKey:'transfer-apply',confirmImpact:accountId});
    const result=(await pending).data;
    expect(result).toMatchObject({status:'failed',reasonCode:'WECHAT_NAVIGATION_SCOPE_CHANGED',screenshots:[],stop:{physicalStopConfirmed:true,hostLeaseReleaseConfirmed:true,stopPending:false}});
    const run=readdirSync(privateRoot).find(name=>name.startsWith('run-'))!,manifest=JSON.parse(readFileSync(join(privateRoot,run,'manifest.json'),'utf8'));
    expect(manifest.quarantined).toBe(true);expect(await browser.db!.select().from(platformCollectionRuns)).toEqual(before);expect(browser.launches).toBe(3);expect(browser.closed).toBe(3);browser.firstScreenshot=undefined;
  },TEST_BUDGET_MS);
});
