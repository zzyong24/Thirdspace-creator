// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createDb,createCliInvocationService,type Db} from '@creatoros/backend';
import {createAnalyticsTransport,createPublicationSyncService,createTrafficService} from '@creatoros/backend/modules/analytics';
import {createPublishingService} from '@creatoros/backend/modules/publishing';
import {ENDPOINTS,type RequestContext,type Transport} from '@creatoros/contract';
import {publications} from '../../../../backend/src/schema/publishing';
import {POST} from '../../app/api/v1/dispatch/route';
import {fetchDouyinCommentsForWorks} from './douyin-cdp';
import {DouyinCooldownActiveError} from './douyin-request-gateway';

const shared=vi.hoisted(()=>({transport:null as Transport|null,gateway:null as ReturnType<typeof createCliInvocationService>|null}));
vi.mock('@/server/persistence-client',()=>({compositeTransport:{request:(...args:Parameters<Transport['request']>)=>shared.transport!.request(...args)},getCliInvocationService:async()=>shared.gateway}));
vi.mock('@/lib/request-context.server',()=>({resolveRequestContext:async(_token:unknown,accountId:string)=>({userId:'u',accountId,source:'user',requestId:'public-cli'}),isAuthError:()=>false,isOwnershipError:()=>false}));

const ctx:RequestContext={userId:'u',accountId:'a',requestId:'test',source:'user'};
let db:Db,close:()=>Promise<unknown>,service:ReturnType<typeof createPublicationSyncService>,stamp:string;
beforeEach(async()=>{
 vi.stubEnv('CREATOROS_CLI_ACCESS_FILE','');vi.stubEnv('CREATOROS_CLI_ACCESS_TOKEN','test-grant');
 const f=await createDb();db=f.db;close=()=>f.client.close();stamp='2026-09-22T04:00:00.000Z';
 await db.insert(publications).values({id:'p',userId:'u',accountId:'a',externalId:'v',platform:'douyin',status:'published',contentOutputId:'out',accountReference:'account',createdAt:stamp,updatedAt:stamp});
 const publishing=createPublishingService({db,now:()=>stamp,nextId:()=>''});
 const traffic=createTrafficService(db,{now:()=>stamp,publishing});
 service=createPublicationSyncService(db,{now:()=>stamp,assertPublication:traffic.assertPublication});
 await service.settle(ctx,'p','comments',{success:true});stamp='2026-09-22T04:01:00.000Z';
 await service.settle(ctx,'p','comments',{success:false,error:'SECRET_COOKIE=never-public'});stamp='2026-09-22T04:02:00.000Z';
 shared.transport=createAnalyticsTransport(()=>({}) as never,undefined,service);
 let sequence=0;shared.gateway=createCliInvocationService({db,masterKey:Buffer.alloc(32,7),now:()=>stamp,nextId:prefix=>`${prefix}-${++sequence}`});
});
afterEach(async()=>{await close();vi.unstubAllEnvs();});
async function call(id:string,input:unknown,{account='a',key='retry-key',apply=true}={}){
 const response=await POST(new Request('http://localhost/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json','x-account-id':account,'x-creatoros-cli-access':'test-grant','x-creatoros-cli-client-id':'test-client','x-idempotency-key':key,...(apply?{'x-creatoros-cli-apply':'1'}:{})},body:JSON.stringify({id,input})}));
 return {status:response.status,body:await response.json()};
}

it('真实CLI dispatch先命中旧receipt：baseline改变仍重放，同key换输入冲突，未apply不写',async()=>{
 const listed=await call('analytics.comments.failures.list',{query:{page:1,pageSize:20}},{apply:false});
 expect(listed.status).toBe(200);expect(JSON.stringify(listed.body)).not.toContain('SECRET');
 const {publicationId,failureVersion}=listed.body.data[0];const input={body:{items:[{publicationId,failureVersion}]}};
 const original=await service.read(ctx,'p','comments');
 expect((await call('analytics.comments.retry',input,{apply:false})).status).toBe(409);
 expect(await service.read(ctx,'p','comments')).toEqual(original);
 const first=await call('analytics.comments.retry',input);
 expect(first.status).toBe(200);expect(first.body.data.updated).toBe(1);
 expect(first.body.data.items[0].failureVersion).not.toBe(failureVersion);
 stamp='2026-09-22T04:03:00.000Z';await service.settle(ctx,'p','comments',{success:false,error:'new attempt'});
 const settled=await service.read(ctx,'p','comments');
 const repeated=await call('analytics.comments.retry',input);
 expect(repeated).toEqual(first);expect(await service.read(ctx,'p','comments')).toEqual(settled);
 expect((await call('analytics.comments.retry',{body:{items:[{publicationId,failureVersion:first.body.data.items[0].failureVersion}]}})).status).toBe(409);
 expect((await call('analytics.comments.retry',input,{key:'new-key'})).status).toBe(409);
 expect((await call('analytics.comments.retry',input,{account:'other',key:'foreign-key'})).status).toBe(404);
});

it('用户retry只解作品backoff，真实抓取仍受平台gateway冷却约束',async()=>{
 const listed=await call('analytics.comments.failures.list',{query:{page:1,pageSize:20}},{apply:false});
 const {publicationId,failureVersion}=listed.body.data[0];
 expect((await call('analytics.comments.retry',{body:{items:[{publicationId,failureVersion}]}})).status).toBe(200);
 expect(await service.due(ctx,'p','comments')).toBe(true);
 const goto=vi.fn(async()=>{}),closeBrowser=vi.fn(async()=>{});
 const page={on:()=>{},off:()=>{},goto,waitForTimeout:async()=>{},evaluate:async<R>()=>undefined as R,mouse:{wheel:async()=>{}}};
 const acquire=vi.fn(async()=>{throw new DouyinCooldownActiveError('creator-center',60000);});
 const result=await fetchDouyinCommentsForWorks(['v'],{authDir:'/fake',maxPages:1},{gateway:{acquire,report:()=>{}},openContext:async()=>({pages:()=>[page],newPage:async()=>page,cookies:async()=>[{name:'sessionid'}],close:closeBrowser})});
 expect(result).toMatchObject({works:[],truncated:true,cooldownRemainMs:60000});
 expect(goto).not.toHaveBeenCalled();expect(closeBrowser).toHaveBeenCalledOnce();expect(acquire).toHaveBeenCalledOnce();
 expect(ENDPOINTS.retryComments.response.safeParse({items:[],updated:0}).success).toBe(false);
});
