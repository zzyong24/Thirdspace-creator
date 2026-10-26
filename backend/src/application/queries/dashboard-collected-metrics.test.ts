import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {accountGroupMemberships} from '../../schema/account-groups';
import {platformWorks,platformWorkMetricSnapshots,platformCatalogs,platformVisibilityTombstones} from '../../schema/platform-collection';
import {publications} from '../../schema/publishing';
import {metricSnapshots} from '../../schema/analytics';
import {latestCollectedCandidate,projectCollectedDashboard,type CollectedDashboardFacts} from './dashboard-collected-metrics';
import type {RequestContext} from '@creatoros/contract';
import {ENDPOINTS} from '@creatoros/contract';
import {createDb} from '../../db';
import {createAccountGroupService,createPlatformAccountService} from '../../modules/platform-account';
import {createPlatformCollectionService} from '../../modules/platform-collection';
import {createProjectsService,createProjectRepository} from '../../modules/projects';
import {createPublishingService} from '../../modules/publishing';
import {createAnalyticsService,createAnalyticsRepository} from '../../modules/analytics';
import {createQueryServicesTransport} from '../../modules/query-services/query-services.transport';
import {platformCollectionBindings} from '../../schema/platform-collection';
import {createGroupWorkspaceApplication} from './group-workspace';

const baseline={scenario:'default',kind:'dashboard',loading:false,error:null,scheduleReminderReadState:{state:'ready',error:null},metrics:[],continueCreating:null,todos:[],trendingTopics:[],recentPublications:[],dataOverview:{metrics:[],trend:[]},suggestions:[],assistantPrompt:''};
const owner:RequestContext={userId:'t1356-synthetic-owner',requestId:'t1356-public-read',source:'user'};
async function fixture(){
 const store=await createDb();let seq=0;const clock={value:'2026-09-01T00:00:00.000Z'};
 const deps={db:store.db,now:()=>clock.value,nextId:(p:string)=>`${p}-${++seq}`};
 const groups=createAccountGroupService(deps),accounts=createPlatformAccountService(deps);
 const a=await groups.create(owner,{name:'合成A',idempotencyKey:'synthetic-a'}),b=await groups.create(owner,{name:'合成B',idempotencyKey:'synthetic-b'});
 const ctx={...owner,groupId:a.id};
 const xhs=await accounts.createAccount(ctx,{platform:'xiaohongshu',accountHandle:'合成小红书',externalAccountId:'synthetic-xhs'});
 const ks=await accounts.createAccount(ctx,{platform:'kuaishou',accountHandle:'合成快手',externalAccountId:'synthetic-ks'});
 for(const account of [xhs,ks])await store.db.insert(platformCollectionBindings).values({userId:owner.userId,accountId:account.id,platform:account.platform,platformIdentity:account.externalAccountId!,scopes:['workCatalog','workMetrics','accountOverview'],proofSource:'synthetic-trusted-port',verifiedAt:clock.value});
 const collections=createPlatformCollectionService({...deps,
  readMembershipEvidence:(c:RequestContext,id:string)=>(groups as any).readMembershipEvidence(c,id),
  visibilitySourcePriority:{synthetic:100},
  sourceAdapters:Object.fromEntries(['xiaohongshu','kuaishou'].map(platform=>[platform,['workCatalog','workMetrics','accountOverview'].map(capability=>({platform,capability,supported:true,authState:'authorized',runtimeState:'ready',reasonCode:null,lastVerifiedAt:clock.value}))])),
  metricDictionary:{xiaohongshu:{views:{metricKey:'view_count',unit:'count'},likes:{metricKey:'like_count',unit:'count'}},kuaishou:{plays:{metricKey:'play_count',unit:'count'},followers:{metricKey:'follower_count',unit:'count'},playCount:{metricKey:'play_count',unit:'count'},likeCount:{metricKey:'like_count',unit:'count'},commentCount:{metricKey:'comment_count',unit:'count'},fansCnt:{metricKey:'follower_count',unit:'count'}}},
 } as any);
 clock.value='2026-10-19T00:00:00.000Z';
 async function commit(account:typeof xhs,capability:'workCatalog'|'workMetrics'|'accountOverview',works:unknown[],metrics:unknown[],context:RequestContext=ctx,sourceSnapshotKey?:string){
  const c={...context,accountId:account.id};const run=await collections.start(c,{accountId:account.id,capability,clientRequestId:`synthetic-${++seq}`});const lease=await collections.claim(run.attemptId,'synthetic-worker');
  const {leaseExpiresAt:_,...leasePage}=lease;
  const page={...leasePage,capability,sourceSnapshotKey:sourceSnapshotKey??`synthetic-source-${seq}`,scanPass:1,pageIndex:0,requestCursor:null,nextCursor:null,pageDigest:`synthetic-page-${seq}`,hasMore:false,observedAt:clock.value,platformReportedTotal:null,totalSource:null,totalObservedAt:null,terminalEvidence:{kind:'platformHasMoreFalse',source:'synthetic',observedAt:clock.value},works,accountMetrics:capability==='accountOverview'?metrics:[],workMetrics:capability==='workMetrics'?metrics:[]};
  await collections.commitPage(page as any);return page;
 }
 const work=(externalId:string,publishedAt:string|null)=>({externalId,kind:'video',publishedAt,visibility:{visibility:'public',source:'synthetic',observedAt:clock.value},source:'synthetic',observedAt:clock.value});
 const metric=(externalWorkId:string|null,sourceField:string,value:number)=>({externalWorkId,sourceField,sourceUnit:'count',value,availability:'available',window:{kind:'lifetime'},source:'synthetic',capturedAt:clock.value,observedAt:clock.value});
 await commit(xhs,'workCatalog',[work('xhs-work','2026-10-18T00:00:00.000Z')],[]);
 const initialXhsMetricPage=await commit(xhs,'workMetrics',[],[metric('xhs-work','views',123),metric('xhs-work','likes',0)]);
 await commit(ks,'workCatalog',[work('ks-work','2026-09-01T00:00:00.000Z')],[]);
 await commit(ks,'workMetrics',[],[metric('ks-work','plays',0)]);
 await commit(ks,'accountOverview',[],[metric(null,'followers',9)]);
 const publishing=createPublishingService(deps),projects=createProjectsService(createProjectRepository(store.db),deps);
 const analytics=createAnalyticsService({repo:createAnalyticsRepository(store.db,deps),publishing:{resolvePublication:(c,id)=>publishing.getPublication(c,id),listPublicationIdsByProject:publishing.listPublicationIdsByProject}});
 const services={groups,projects,publishing,analytics,nativeReports:collections,dashboard:{getDashboard:async()=>baseline},now:deps.now};
 const app=createGroupWorkspaceApplication({...services,collectedMetrics:collections} as any);
 const transport=createQueryServicesTransport({groupOverview:app} as any);
 async function read(query:Record<string,string>,c:RequestContext=ctx,groupId=c.groupId!){
  const input={params:{groupId},query,body:undefined};
  const results=await Promise.allSettled([transport.request(ENDPOINTS.getGroupOverview,input,c),transport.request(ENDPOINTS.getGroupWorkspace,input,c)]);
  const original=results[0]!,summary=results[1]!;
  if(original.status==='rejected'){expect(summary.status).toBe('rejected');if(summary.status==='rejected')expect(summary.reason.code).toBe(original.reason.code);throw original.reason;}
  if(summary.status==='rejected')throw summary.reason;
  expect((summary.value as any).data).toEqual({workspace:(original.value as any).data.workspace});
  return (original.value as any).data;
 }
 return {...store,clock,groups,accounts,collections,ctx,a,b,xhs,ks,commit,work,metric,app,read,publishing,analytics,projects,services,initialXhsMetricPage};
}
let f:Awaited<ReturnType<typeof fixture>>;
beforeAll(async()=>{f=await fixture();},180000);
afterAll(async()=>{await f?.client.close();},180000);
describe('T1356 真实合成目录/typed采集 → 公开组页面消费者',()=>{
 it('typed已有123浏览和真实0点赞，公开首页应读回且不冒视频播放',async()=>{
  const typed=await f.collections.readMetrics({...f.ctx,accountId:f.xhs.id},{accountId:f.xhs.id});
  expect(typed.workMetrics.map(x=>[x.metricKey,x.value])).toEqual(expect.arrayContaining([['view_count',123],['like_count',0]]));
  const page=await f.read({platform:'xiaohongshu'});
  expect(page.metrics.find((c:any)=>c.id==='g-views')).toMatchObject({label:'浏览（次）',value:'123'});
  expect(page.metrics.find((c:any)=>c.id==='g-likes')?.value).toBe('0');
  expect(page.workspace.videoViews).toBeNull();
 });
 it('快手窗外保持空，包含实际发布日期的合法窗读回真实0',async()=>{
  expect((await f.read({platform:'kuaishou'})).metrics.find((c:any)=>c.id==='g-views')?.value).toBe('—');
  const inside=await f.read({platform:'kuaishou',startDate:'2026-09-01',endDate:'2026-09-01'});
  expect(inside.metrics.find((c:any)=>c.id==='g-views')?.value).toBe('0');
 });
 it('不把平台目录变成项目或Publication，不补日报曲线，公开错账号仍拒绝',async()=>{
  const page=await f.read({});expect(page.workspace.publicationCount).toBe(0);expect(page.workspace.contentCount).toBe(0);expect(page.workspace.pendingCount).toBe(0);expect(page.recentPublications).toEqual([]);expect(page.dataOverview.trend).toEqual([]);
  await expect(f.read({accountId:'other-account'})).rejects.toMatchObject({code:'OwnershipError'});
 });
});

type F=Awaited<ReturnType<typeof fixture>>;
async function isolated(body:(f:F)=>Promise<void>){const f=await fixture();try{await body(f);}finally{await f.client.close();}}
async function move(f:F,to:string){const preview=await f.groups.previewTransfer(owner,{accountId:f.xhs.id,toGroupId:to});return f.groups.transfer(owner,{...preview,idempotencyKey:`move-${f.clock.value}-${to}`});}
async function seedPublication(f:F,{id='real-pub',ctx=f.ctx,account=f.xhs,publishedAt='2026-10-18T00:00:00.000Z',raw={views:5,likes:null}}:{id?:string;ctx?:RequestContext;account?:F['xhs'];publishedAt?:string;raw?:Record<string,unknown>}={}){
 await f.db.insert(publications).values({id,userId:owner.userId,groupId:ctx.groupId,accountId:account.id,platform:account.platform,contentOutputId:`synthetic-output-${id}`,accountReference:'synthetic',status:'published',publishedAt,createdAt:f.clock.value,updatedAt:f.clock.value});
 await f.db.insert(metricSnapshots).values({id:`snapshot-${id}`,userId:owner.userId,groupId:ctx.groupId,accountId:account.id,publicationId:id,source:'synthetic-legacy',capturedAt:f.clock.value,rawMetrics:raw,createdAt:f.clock.value});
 await f.db.update(platformWorks).set({publicationId:id}).where(eq(platformWorks.accountId,f.xhs.id));
 return id;
}
const value=(page:any,id='g-views')=>page.metrics.find((c:any)=>c.id===id)?.value;

describe('T1356 实际归属/去重/错误隔离公共保护',()=>{
 it('真实A→B→A，半开边界的新样本只归当时组，重放不改immutable ingestedAt',()=>isolated(async f=>{
  const original=await f.db.select().from(platformWorkMetricSnapshots);
  f.clock.value='2026-10-19T00:00:01.000Z';await move(f,f.b.id);const bctx={...owner,groupId:f.b.id};
  await f.commit(f.xhs,'workMetrics',[],[f.metric('xhs-work','views',200)],bctx);
  await expect(f.collections.commitPage(f.initialXhsMetricPage as any)).rejects.toMatchObject({code:'GENERATION_STALE'});
  // 已终态的旧page不可重发；新run读取同一已存在证据时也不得改变原入库归属。
  await f.commit(f.xhs,'workMetrics',[],f.initialXhsMetricPage.workMetrics,bctx,f.initialXhsMetricPage.sourceSnapshotKey);
  const afterReplay=await f.db.select().from(platformWorkMetricSnapshots);for(const row of original)expect(afterReplay.find(x=>x.id===row.id)).toEqual(row);
  expect(value(await f.read({platform:'xiaohongshu'},f.ctx))).toBe('123');
  expect(value(await f.read({platform:'xiaohongshu'},bctx))).toBe('200');
  expect((await f.read({platform:'xiaohongshu'},f.ctx)).workspace.accounts.find((a:any)=>a.id===f.xhs.id).historical).toBe(true);
  f.clock.value='2026-10-19T00:00:02.000Z';await move(f,f.a.id);
  await f.commit(f.xhs,'workMetrics',[],[f.metric('xhs-work','views',300)],f.ctx);
  expect(value(await f.read({platform:'xiaohongshu'},f.ctx))).toBe('300');
  expect(value(await f.read({platform:'xiaohongshu'},bctx))).toBe('200');
  expect((await f.groups.readMembershipEvidence(f.ctx,f.a.id)).filter(m=>m.accountId===f.xhs.id)).toHaveLength(3);
 }),180000);
 it('旧Publication留A而新metric归B，不被其它组的真实引用过度去重',()=>isolated(async f=>{
  await seedPublication(f);expect(value(await f.read({platform:'xiaohongshu'}))).toBe('5');
  f.clock.value='2026-10-19T00:00:01.000Z';await move(f,f.b.id);const c={...owner,groupId:f.b.id};
  await f.commit(f.xhs,'workMetrics',[],[f.metric('xhs-work','views',200)],c);
  const b=await f.read({platform:'xiaohongshu'},c);expect(value(b)).toBe('200');expect(b.workspace.publicationCount).toBe(0);expect(b.workspace.collected.deduplicatedWorkCount).toBe(0);
  expect(value(await f.read({platform:'xiaohongshu'},f.ctx))).toBe('5');
 }),180000);
 it('仅同语义实际覆盖key排重：旧view保5，缺likes用typed0；旧0覆盖，缺view不吞typed123',()=>isolated(async f=>{
  const id=await seedPublication(f);const first=await f.read({platform:'xiaohongshu'});
  expect(value(first)).toBe('5');expect(value(first,'g-likes')).toBe('0');expect(first.workspace.publicationCount).toBe(1);
  await f.db.update(metricSnapshots).set({rawMetrics:{views:null,likes:0}}).where(eq(metricSnapshots.publicationId,id));
  const second=await f.read({platform:'xiaohongshu'});expect(value(second)).toBe('123');expect(value(second,'g-likes')).toBe('0');
  expect(second.workspace.collected.metrics.find((m:any)=>m.metricKey==='like_count')).toMatchObject({knownCount:0,eligibleCount:0,value:null});
  await f.db.update(publications).set({publishedAt:'2026-01-01T00:00:00.000Z'}).where(eq(publications.id,id));
  expect(value(await f.read({platform:'xiaohongshu'}))).toBe('123');
 }),180000);
 it('跨组重叠不可归属，原get仍仅当前成员；错用户/组/账号不能读摘要',()=>isolated(async f=>{
  await f.db.insert(accountGroupMemberships).values({id:'synthetic-overlap',userId:owner.userId,groupId:f.b.id,accountId:f.xhs.id,version:99,joinedAt:'2026-10-18T00:00:00.000Z',leftAt:'2026-10-20T00:00:00.000Z'});
  const p=await f.read({platform:'xiaohongshu'});expect(value(p)).toBe('—');expect(p.workspace.collected).toMatchObject({catalogWorkCount:0,unattributableWorkCount:1});
  expect((await f.groups.get(f.ctx,f.b.id)).members).toEqual([]);
  await expect(f.collections.readDashboardSummary({...f.ctx,userId:'other'},{groupId:f.a.id,startDate:'2026-09-20',endDate:'2026-10-19'})).rejects.toMatchObject({code:'OwnershipError'});
  await expect(f.collections.readDashboardSummary(f.ctx,{groupId:f.b.id,startDate:'2026-09-20',endDate:'2026-10-19'})).rejects.toMatchObject({code:'OwnershipError'});
  await expect(f.read({accountId:f.xhs.id,platform:'kuaishou'})).rejects.toMatchObject({code:'OwnershipError'});
 }),180000);
 it('最新不可用/同刻冲突不能退回旧成功；followers独立账号只计一次，finish无源为空',()=>isolated(async f=>{
  f.clock.value='2026-10-19T00:00:01.000Z';
  await f.commit(f.xhs,'workMetrics',[],[{...f.metric('xhs-work','views',0),availability:'sourceMissing',value:null}]);
  expect(value(await f.read({platform:'xiaohongshu'}))).toBe('—');
  f.clock.value='2026-10-19T00:00:02.000Z';await f.commit(f.xhs,'workMetrics',[],[f.metric('xhs-work','views',77)]);
  await f.commit(f.xhs,'workMetrics',[],[f.metric('xhs-work','views',78)]);
  const conflicted=await f.read({platform:'xiaohongshu'});expect(value(conflicted)).toBe('—');expect(conflicted.workspace.collected.metrics.find((m:any)=>m.metricKey==='view_count')).toMatchObject({knownCount:0,eligibleCount:1,value:null});
  const ks=await f.read({platform:'kuaishou',startDate:'2026-09-01',endDate:'2026-09-01'});expect(value(ks,'g-followers')).toBe('9');expect(value(ks,'g-finish')).toBe('—');
 }),180000);
 it('无metric目录只计不可归属；unknown日期/非公开/旧目录不混数，读前后0业务写',()=>isolated(async f=>{
  f.clock.value='2026-10-19T00:00:01.000Z';
  await f.commit(f.xhs,'workCatalog',[f.work('xhs-work','2026-10-18T00:00:00.000Z'),f.work('no-metric','2026-10-18T00:00:00.000Z'),f.work('unknown-date',null),{...f.work('private','2026-10-18T00:00:00.000Z'),visibility:{visibility:'private',source:'synthetic',observedAt:f.clock.value}}],[]);
  await f.commit(f.xhs,'workMetrics',[],[f.metric('unknown-date','views',999),f.metric('private','views',888)]);
  const before=JSON.stringify(await f.db.select().from(platformWorkMetricSnapshots)),history=JSON.stringify(await f.db.select().from(accountGroupMemberships));
  const execute=vi.spyOn(f.db,'execute');const facts=await f.collections.readDashboardSummary(f.ctx,{groupId:f.a.id,platform:'xiaohongshu',startDate:'2026-09-20',endDate:'2026-10-19'});expect(execute).toHaveBeenCalledTimes(3);execute.mockRestore();
  expect(facts.works).toHaveLength(1);expect(facts.unattributableWorkCount).toBe(1);
  const page=await f.read({platform:'xiaohongshu'});expect(value(page)).toBe('123');expect(page.workspace.collected).toMatchObject({catalogWorkCount:1,unattributableWorkCount:1});expect(page.workspace.coverage).toContain('已读取 1 条平台作品');
  expect(JSON.stringify(await f.db.select().from(platformWorkMetricSnapshots))).toBe(before);expect(JSON.stringify(await f.db.select().from(accountGroupMemberships))).toBe(history);
 }),180000);
 it('新摘要失败只降级来源覆盖，旧合法指标与其它工作台卡保留',()=>isolated(async f=>{
  await seedPublication(f);const app=createGroupWorkspaceApplication({...f.services,collectedMetrics:{async readDashboardSummary(){throw new Error('synthetic-summary-read-failure');}}} as any);
  const t=createQueryServicesTransport({groupOverview:app} as any),r:any=await t.request(ENDPOINTS.getGroupOverview,{params:{groupId:f.a.id},query:{platform:'xiaohongshu'},body:undefined},f.ctx);
  const summary:any=await t.request(ENDPOINTS.getGroupWorkspace,{params:{groupId:f.a.id},query:{platform:'xiaohongshu'},body:undefined},f.ctx);expect(summary.data).toEqual({workspace:r.data.workspace});
  expect(value(r.data)).toBe('5');expect(r.data.workspace.collected.state).toBe('unavailable');expect(r.data.workspace.coverage).toContain('摘要暂不可读');expect(r.data.scheduleReminderReadState).toEqual(baseline.scheduleReminderReadState);expect(r.data.dataOverview.trend).toEqual([]);
 }),180000);
});

type Candidate=CollectedDashboardFacts['workMetrics'][number];
function candidate(overrides:Partial<Candidate>={}):Candidate{return {id:'sample',accountId:'account',platform:'xiaohongshu',platformWorkId:'work',metricKey:'view_count',value:12,availability:'available',unit:'count',window:{kind:'lifetime'},capturedAt:'2026-10-01T00:00:00.000Z',observedAt:'2026-10-01T00:00:00.000Z',ingestedAt:'2026-10-02T00:00:00.000Z',source:'synthetic',...overrides};}
describe('累计样本纯投影边界',()=>{
 it('最新值按真实时间而非ID，重复只计一次，同刻值或availability冲突未知',()=>{
  expect(latestCollectedCandidate([candidate({id:'z'}),candidate({id:'a',value:0,observedAt:'2026-10-02T00:00:00.000Z'})]).value).toBe(0);
  expect(latestCollectedCandidate([candidate(),candidate({id:'dup'})]).value).toBe(12);
  expect(latestCollectedCandidate([candidate(),candidate({value:13})]).value).toBeNull();
  expect(latestCollectedCandidate([candidate(),candidate({value:null,availability:'sourceMissing'})]).value).toBeNull();
  expect(latestCollectedCandidate([candidate(),candidate({value:null,availability:'sourceMissing',observedAt:'2026-10-02T00:00:00.000Z'})]).value).toBeNull();
 });
 it('非count/interval不混累计，0不等于未知；不同account/platform/ref不排错key',()=>{
  expect(latestCollectedCandidate([candidate({unit:'percent' as any})]).value).toBeNull();
  expect(latestCollectedCandidate([candidate({window:{kind:'interval',start:'2026-10-01T00:00:00.000Z',end:'2026-10-02T00:00:00.000Z',timeZone:'Asia/Shanghai'}})]).value).toBeNull();
  const facts={accounts:[{id:'account',platform:'xiaohongshu',name:'合成',historical:false,archived:false}],accountOptions:[],works:[{id:'work',accountId:'account',platform:'xiaohongshu',publicationId:'pub',legacyPublicationId:null,hasOwned:true,hasUnattributed:false}],workMetrics:[candidate()],accountMetrics:[],unattributableWorkCount:0} as CollectedDashboardFacts;
  for(const covered of [[{id:'pub',accountId:'other',platform:'xiaohongshu',metricKeys:new Set(['view_count'])}],[{id:'pub',accountId:'account',platform:'douyin',metricKeys:new Set(['view_count'])}],[{id:'pub',accountId:'account',platform:'xiaohongshu',metricKeys:new Set(['play_count'])}]]){
   expect(projectCollectedDashboard(facts,covered).metrics.find(m=>m.metricKey==='view_count')?.value).toBe(12);
  }
 });
});

it('T1356 归档自有历史仍可读，矛盾membership区间不借当前成员猜归属',()=>isolated(async f=>{
 await f.accounts.archiveAccount({...f.ctx,accountId:f.xhs.id},f.xhs.id);
 await f.groups.archive(owner,f.a.id,f.a.version);
 const archived=await f.read({platform:'xiaohongshu'});expect(value(archived)).toBe('123');expect(archived.workspace.status).toBe('archived');expect(archived.workspace.accounts.find((a:any)=>a.id===f.xhs.id).archived).toBe(true);
 await f.db.update(accountGroupMemberships).set({joinedAt:'invalid-time'}).where(eq(accountGroupMemberships.accountId,f.xhs.id));
 const invalid=await f.read({platform:'xiaohongshu'});expect(value(invalid)).toBe('—');expect(invalid.workspace.collected).toMatchObject({catalogWorkCount:0,unattributableWorkCount:1});
}),180000);

const unknownWork=(f:F,id:string,publishedAt:string|null='2026-10-18T00:00:00.000Z',source='synthetic')=>({...f.work(id,publishedAt),visibility:{visibility:'unknown',source,observedAt:f.clock.value}});
async function sourceState(f:F){return {
 works:await f.db.select().from(platformWorks),catalogs:await f.db.select().from(platformCatalogs),
 metrics:await f.db.select().from(platformWorkMetricSnapshots),tombstones:await f.db.select().from(platformVisibilityTombstones),
 memberships:await f.db.select().from(accountGroupMemberships),
};}
describe('T1371 已完成未知可见性目录 → 真实内部总览消费者',()=>{
 it.each(['outboundFrozenAt','uncertainVisibilityAt'] as const)('原public的%s非空仍排除，不被unknown分支放宽',field=>isolated(async f=>{
  await f.db.update(platformWorks).set({[field]:f.clock.value}).where(eq(platformWorks.accountId,f.xhs.id));
  const before=await sourceState(f),page=await f.read({platform:'xiaohongshu'});
  expect(value(page)).toBe('—');expect(page.workspace.collected.catalogWorkCount).toBe(0);expect(await sourceState(f)).toEqual(before);
 }),180000);
 it('completed current unknown的已归属typed指标可见，public/真实0/缺失保持，摘要读不改同ID源事实',()=>isolated(async f=>{
  f.clock.value='2026-10-19T00:00:01.000Z';
  await f.commit(f.xhs,'workCatalog',[
   f.work('xhs-work','2026-10-18T00:00:00.000Z'),unknownWork(f,'unknown-known','2026-10-18T00:00:00.000Z','unverified-source'),unknownWork(f,'unknown-zero'),
   unknownWork(f,'unknown-missing'),unknownWork(f,'unknown-no-metric'),unknownWork(f,'unknown-outside','2026-09-01T00:00:00.000Z'),unknownWork(f,'unknown-no-date',null),
  ],[]);
  await f.commit(f.xhs,'workMetrics',[],[
   f.metric('unknown-known','views',456),f.metric('unknown-zero','views',0),f.metric('unknown-zero','likes',0),
   {...f.metric('unknown-missing','views',0),availability:'sourceMissing',value:null},
   f.metric('unknown-outside','views',999),f.metric('unknown-no-date','views',777),
  ]);
  const before=await sourceState(f),row=before.works.find(w=>w.externalId==='unknown-known')!;
  expect(row).toMatchObject({visibility:'unknown',visibilityPriority:0});expect(row.uncertainVisibilityAt).not.toBeNull();expect(row.outboundFrozenAt).not.toBeNull();
  const catalog=before.catalogs.find(c=>c.accountId===f.xhs.id)!;expect(catalog.generation).toBeGreaterThan(0);expect(catalog.completedAt).not.toBeNull();expect(row.catalogGeneration).toBe(catalog.generation);
  const typed=await f.collections.readMetrics({...f.ctx,accountId:f.xhs.id},{accountId:f.xhs.id,platformWorkId:row.id});
  expect(typed.workMetrics).toEqual(expect.arrayContaining([expect.objectContaining({platformWorkId:row.id,value:456,availability:'available'})]));
  const page=await f.read({platform:'xiaohongshu',accountId:f.xhs.id,startDate:'2026-09-20',endDate:'2026-10-19'});
  expect(page.workspace).toMatchObject({browseViews:579,videoViews:null,articleReads:null,contentCount:0,publicationCount:0,collected:{state:'ready',catalogWorkCount:4,unattributableWorkCount:1}});
  expect(value(page)).toBe('579');expect(value(page,'g-likes')).toBe('0');
  expect(page.workspace.collected.metrics.find((m:any)=>m.metricKey==='view_count')).toMatchObject({value:579,knownCount:3,eligibleCount:4});
  expect(page.recentPublications).toEqual([]);expect(page.dataOverview.trend).toEqual([]);
  expect(await sourceState(f)).toEqual(before);
 }),180000);
 it.each(['private','hidden','removed'] as const)('同priority100 %s→unknown仍有真实tombstone，不进入内部摘要且读前后冻结不变',visibility=>isolated(async f=>{
  f.clock.value='2026-10-19T00:00:01.000Z';
  await f.commit(f.xhs,'workCatalog',[f.work('xhs-work','2026-10-18T00:00:00.000Z'),{...f.work('blocked-history','2026-10-18T00:00:00.000Z'),visibility:{visibility,source:'synthetic',observedAt:f.clock.value}}],[]);
  await f.commit(f.xhs,'workMetrics',[],[f.metric('blocked-history','views',999)]);
  f.clock.value='2026-10-19T00:00:02.000Z';
  await f.commit(f.xhs,'workCatalog',[f.work('xhs-work','2026-10-18T00:00:00.000Z'),unknownWork(f,'blocked-history'),unknownWork(f,'allowed-unknown')],[]);
  await f.commit(f.xhs,'workMetrics',[],[f.metric('allowed-unknown','views',7)]);
  const before=await sourceState(f),blocked=before.works.find(w=>w.externalId==='blocked-history')!;
  expect(blocked).toMatchObject({visibility:'unknown',visibilityPriority:100});expect(blocked.uncertainVisibilityAt).not.toBeNull();
  expect(before.tombstones).toEqual(expect.arrayContaining([expect.objectContaining({externalId:'blocked-history',visibility,sourcePriority:100})]));
  const page=await f.read({platform:'xiaohongshu'});expect(value(page)).toBe('130');expect(page.workspace.collected.catalogWorkCount).toBe(2);
  expect(await sourceState(f)).toEqual(before);
 }),180000);
 it.each(['generation-zero','incomplete','old-generation'] as const)('%s未知目录不得纳入，原public分支保持',state=>isolated(async f=>{
  f.clock.value='2026-10-19T00:00:01.000Z';await f.commit(f.xhs,'workCatalog',[f.work('xhs-work','2026-10-18T00:00:00.000Z'),unknownWork(f,'not-verified')],[]);
  await f.commit(f.xhs,'workMetrics',[],[f.metric('not-verified','views',999)]);
  // 明确私有合成库的持久边界状态；正例与非公开历史族均经真实commitPage形成。
  if(state==='generation-zero'){
   await f.db.update(platformCatalogs).set({generation:0}).where(eq(platformCatalogs.accountId,f.xhs.id));
   await f.db.update(platformWorks).set({catalogGeneration:0,visibilitySource:'legacy_import'}).where(eq(platformWorks.accountId,f.xhs.id));
  }else if(state==='incomplete')await f.db.update(platformCatalogs).set({completedAt:null}).where(eq(platformCatalogs.accountId,f.xhs.id));
  else await f.db.update(platformWorks).set({catalogGeneration:0}).where(eq(platformWorks.externalId,'not-verified'));
  const before=await sourceState(f),page=await f.read({platform:'xiaohongshu'});
  expect(value(page)).toBe('123');expect(page.workspace.collected.catalogWorkCount).toBe(1);expect(await sourceState(f)).toEqual(before);
 }),180000);
 it('unknown分支沿真实入组区间与用户权限，跨组重叠不猜归属',()=>isolated(async f=>{
  f.clock.value='2026-10-19T00:00:01.000Z';await f.commit(f.xhs,'workCatalog',[unknownWork(f,'xhs-work')],[]);
  expect(value(await f.read({platform:'xiaohongshu'}))).toBe('123');
  await expect(f.read({platform:'xiaohongshu'},{...f.ctx,userId:'other'})).rejects.toMatchObject({code:'OwnershipError'});
  await f.db.insert(accountGroupMemberships).values({id:'t1371-overlap',userId:owner.userId,groupId:f.b.id,accountId:f.xhs.id,version:99,joinedAt:'2026-10-18T00:00:00.000Z',leftAt:'2026-10-20T00:00:00.000Z'});
  const overlap=await f.read({platform:'xiaohongshu'});expect(value(overlap)).toBe('—');expect(overlap.workspace.collected).toMatchObject({catalogWorkCount:0,unattributableWorkCount:1});
 }),180000);
 it('unknown新样本随A→B→A冻结归属；入组前样本不混入，最新不可用/同刻冲突不退回',()=>isolated(async f=>{
  f.clock.value='2026-10-19T00:00:01.000Z';await f.commit(f.xhs,'workCatalog',[unknownWork(f,'xhs-work')],[]);
  f.clock.value='2026-10-19T00:00:02.000Z';await move(f,f.b.id);const bctx={...owner,groupId:f.b.id};
  expect(value(await f.read({platform:'xiaohongshu'},bctx))).toBe('—');
  await f.commit(f.xhs,'workMetrics',[],[f.metric('xhs-work','views',200)],bctx);
  expect(value(await f.read({platform:'xiaohongshu'},bctx))).toBe('200');expect(value(await f.read({platform:'xiaohongshu'},f.ctx))).toBe('123');
  f.clock.value='2026-10-19T00:00:03.000Z';await move(f,f.a.id);
  await f.commit(f.xhs,'workMetrics',[],[{...f.metric('xhs-work','views',0),value:null,availability:'sourceMissing'}]);
  expect(value(await f.read({platform:'xiaohongshu'}))).toBe('—');expect(value(await f.read({platform:'xiaohongshu'},bctx))).toBe('200');
  f.clock.value='2026-10-19T00:00:04.000Z';await f.commit(f.xhs,'workMetrics',[],[f.metric('xhs-work','views',7)]);await f.commit(f.xhs,'workMetrics',[],[f.metric('xhs-work','views',8)]);
  expect(value(await f.read({platform:'xiaohongshu'}))).toBe('—');
 }),180000);
});


// T1374仅测试真实协议→service/公开transport；生产normalizer双扫描在docs seed串联。
describe('T1374 快手unknown已归属指标的跨平台公共保护',()=>{
 it('快手unknown的日期/播放/真零/缺失/粉丝独立，读回不改同ID源字段且小红书原结果保留',()=>isolated(async f=>{
  f.clock.value='2026-10-19T00:00:01.000Z';
  await f.commit(f.ks,'workCatalog',[unknownWork(f,'ks-work','2026-09-01T00:00:00.000Z','ks-unverified'),unknownWork(f,'ks-known','2026-10-18T00:00:00.000Z','ks-unverified'),unknownWork(f,'ks-zero','2026-10-18T00:00:00.000Z','ks-unverified'),unknownWork(f,'ks-missing','2026-10-18T00:00:00.000Z','ks-unverified'),unknownWork(f,'ks-no-metric','2026-10-18T00:00:00.000Z','ks-unverified')],[]);
  await f.commit(f.ks,'workMetrics',[],[f.metric('ks-known','playCount',321),f.metric('ks-known','likeCount',7),f.metric('ks-known','commentCount',0),f.metric('ks-zero','playCount',0),{...f.metric('ks-missing','playCount',0),availability:'sourceMissing',value:null}]);
  await f.commit(f.ks,'accountOverview',[],[f.metric(null,'fansCnt',0)]);
  const before=await sourceState(f),works=before.works.filter(w=>w.accountId===f.ks.id);
  expect(works).toHaveLength(5);for(const w of works){expect(w.visibility).toBe('unknown');expect(w.outboundFrozenAt).not.toBeNull();expect(w.uncertainVisibilityAt).not.toBeNull();}
  const cat=before.catalogs.find(c=>c.accountId===f.ks.id)!;expect(cat.generation).toBeGreaterThan(0);expect(cat.completedAt).not.toBeNull();expect(works.every(w=>w.catalogGeneration===cat.generation)).toBe(true);
  const q={platform:'kuaishou',accountId:f.ks.id,startDate:'2026-09-20',endDate:'2026-10-19'};
  const page=await f.read(q);expect(page.workspace).toMatchObject({videoViews:321,browseViews:null,articleReads:null,contentCount:0,publicationCount:0,collected:{state:'ready',catalogWorkCount:3,unattributableWorkCount:1}});
  expect(value(page,'g-views')).toBe('321');expect(value(page,'g-likes')).toBe('7');expect(value(page,'g-followers')).toBe('0');
  expect(page.workspace.collected.metrics.find((m:any)=>m.metricKey==='play_count')).toMatchObject({value:321,knownCount:2,eligibleCount:3});
  const old=await f.read({...q,startDate:'2026-09-01',endDate:'2026-09-01'});expect(old.workspace.videoViews).toBe(0);expect(old.workspace.collected.catalogWorkCount).toBe(1);expect(value(old,'g-followers')).toBe('0');
  const empty=await f.read({...q,startDate:'2026-09-02',endDate:'2026-09-02'});expect(empty.workspace.videoViews).toBeNull();expect(empty.workspace.collected.catalogWorkCount).toBe(0);
  expect(value(await f.read({platform:'xiaohongshu'}))).toBe('123');
  const typed=await f.collections.readMetrics({...f.ctx,accountId:f.ks.id},{accountId:f.ks.id});expect(typed.workMetrics).toEqual(expect.arrayContaining([expect.objectContaining({metricKey:'comment_count',value:0,availability:'available',unit:'count'})]));
  expect(await sourceState(f)).toEqual(before);
 }),180000);
 it.each(['private','hidden','removed'] as const)('快手同priority非公开%s→unknown保tombstone/冻结且不计入',visibility=>isolated(async f=>{
  f.clock.value='2026-10-19T00:00:01.000Z';
  await f.commit(f.ks,'workCatalog',[{...f.work('ks-blocked','2026-10-18T00:00:00.000Z'),visibility:{visibility,source:'synthetic',observedAt:f.clock.value}}],[]);
  await f.commit(f.ks,'workMetrics',[],[f.metric('ks-blocked','playCount',999)]);
  f.clock.value='2026-10-19T00:00:02.000Z';
  await f.commit(f.ks,'workCatalog',[unknownWork(f,'ks-blocked'),unknownWork(f,'ks-allowed','2026-10-18T00:00:00.000Z','ks-unverified')],[]);
  await f.commit(f.ks,'workMetrics',[],[f.metric('ks-allowed','playCount',7)]);
  const before=await sourceState(f),blocked=before.works.find(w=>w.accountId===f.ks.id&&w.externalId==='ks-blocked')!;expect(blocked.visibility).toBe('unknown');expect(blocked.outboundFrozenAt).not.toBeNull();expect(before.tombstones).toEqual(expect.arrayContaining([expect.objectContaining({accountId:f.ks.id,externalId:'ks-blocked',visibility})]));
  const page=await f.read({platform:'kuaishou',accountId:f.ks.id});expect(page.workspace.videoViews).toBe(7);expect(page.workspace.collected.catalogWorkCount).toBe(1);expect(await sourceState(f)).toEqual(before);
 }),180000);
 it('快手最新不可用不退回旧值，粉丝缺失不补零',()=>isolated(async f=>{
  f.clock.value='2026-10-19T00:00:01.000Z';await f.commit(f.ks,'workCatalog',[unknownWork(f,'ks-work','2026-09-01T00:00:00.000Z','ks-unverified')],[]);
  await f.commit(f.ks,'workMetrics',[],[f.metric('ks-work','playCount',17)]);
  f.clock.value='2026-10-19T00:00:02.000Z';await f.commit(f.ks,'workMetrics',[],[{...f.metric('ks-work','playCount',0),availability:'sourceMissing',value:null}]);await f.commit(f.ks,'accountOverview',[],[{...f.metric(null,'fansCnt',0),availability:'sourceMissing',value:null}]);
  const before=await sourceState(f),page=await f.read({platform:'kuaishou',accountId:f.ks.id,startDate:'2026-09-01',endDate:'2026-09-01'});expect(page.workspace.videoViews).toBeNull();expect(value(page,'g-followers')).toBe('—');expect(page.workspace.collected.catalogWorkCount).toBe(1);expect(await sourceState(f)).toEqual(before);
 }),180000);
});
