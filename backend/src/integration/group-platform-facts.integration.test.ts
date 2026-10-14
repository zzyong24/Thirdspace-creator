import {readFileSync} from 'node:fs';
import {projects,contentOutputs} from '../schema/projects';
import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {createDb,type RequestContext} from '@creatoros/backend';
import {createPublishingService} from '../modules/publishing';
import {createAnalyticsRepository} from '../modules/analytics';
import {createIngestionService} from '../modules/ingestion';
import {createAnalyticsService} from '../modules/analytics';
import {createMembershipLockService} from '../modules/platform-account';
const NOW='2026-10-04T00:00:00.000Z';
const a:RequestContext={userId:'owner',groupId:'group-a',accountId:'account-a',requestId:'test',source:'user'};
let store:Awaited<ReturnType<typeof createDb>>,n=0;
const nextId=(p:string)=>`${p}-${++n}`;
function services(publisher?:any){
 const membership=createMembershipLockService(store.db);
 const publishing=createPublishingService({db:store.db,now:()=>NOW,nextId,membership,publisher,
  resolveOutputOwner:async(ctx:RequestContext,id:string)=>ctx.groupId==='group-a'&&id==='output'?{projectId:'project',source:'manual',status:'active',title:'同一期内容'}:null,
  assertTargetAccount:async(ctx:RequestContext,target:{accountId:string;platform:string})=>{const q=await store.client.query('SELECT id FROM platform_accounts WHERE id=$1 AND user_id=$2 AND platform=$3',[target.accountId,ctx.userId,target.platform]);if(!q.rows.length)throw Object.assign(new Error('账号不存在'),{name:'OwnershipError'});},
  retainUnassignedDraft:async()=>{},
 } as any);
 const repo=createAnalyticsRepository(store.db,{now:()=>NOW,nextId});
 const analytics=createAnalyticsService({repo,publishing:{resolvePublication:(ctx,id)=>publishing.getPublication(ctx,id),listPublicationIdsByProject:async()=>[]}});
 const ingestion=createIngestionService({db:store.db,deps:{now:()=>NOW,nextId,membership,assertCollectionAccount:async()=>{}},ports:{publishing:{resolvePublication:(ctx:RequestContext,ref:{platform:string;externalId:string})=>publishing.resolvePublication(ctx,ref),resolveCollectedPublication:(ctx:RequestContext,ref:{platform:string;externalId:string})=>publishing.resolveCollectedPublication(ctx,ref)},analytics,knowledge:{},assets:{},artifacts:{}} as any});
 return {publishing,analytics,repo,ingestion};
}
beforeEach(async()=>{
 store=await createDb();n=0;
 await store.client.exec(`INSERT INTO account_groups(id,user_id,name,created_at,updated_at) VALUES ('group-a','owner','甲','${NOW}','${NOW}'),('group-b','owner','乙','${NOW}','${NOW}');
 INSERT INTO platform_accounts(id,user_id,platform,account_handle,created_at,updated_at) VALUES ('account-a','owner','douyin','甲号','${NOW}','${NOW}'),('account-b','owner','douyin','乙号','${NOW}','${NOW}');
 INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,joined_at) VALUES('member-a','owner','group-a','account-a','${NOW}'),('member-b','owner','group-a','account-b','${NOW}');
 INSERT INTO publications(id,user_id,group_id,account_id,content_output_id,platform,account_reference,status,created_at,updated_at) VALUES('p1','owner','group-a','account-a','fixture-output','douyin','甲号','published','${NOW}','${NOW}'),('p2','owner','group-a','account-a','fixture-output','douyin','甲号','published','${NOW}','${NOW}');`);
 await store.db.insert(projects).values({id:'project',userId:a.userId,groupId:a.groupId,accountId:null,title:'真实父项目',creationMode:'free',status:'active',currentStage:'script',startedAt:NOW,createdAt:NOW,updatedAt:NOW});
 await store.db.insert(contentOutputs).values({id:'output',projectId:'project',title:'真实稿件',contentType:'video',status:'draft',createdAt:NOW,updatedAt:NOW});
});
afterEach(async()=>store.client.close());
describe('T-1022 真实平台事实',()=>{
 it('同内容同平台多个真实账号独立发布，组内可筛选账号',async()=>{
  const s=services(),p=await s.publishing.createPublication(a,'output',{platform:'douyin',accountReference:'甲号'});
  const q=await s.publishing.createPublication({...a,accountId:'account-b'},'output',{platform:'douyin',accountReference:'乙号'});
  expect(p.id).not.toBe(q.id);expect(p.accountId).toBe('account-a');expect(p.groupId).toBe('group-a');
  expect((await s.publishing.listPublicationsForUser({...a,accountId:null},{limit:20,offset:0})).filter(x=>x.contentOutputId==='output')).toHaveLength(2);
  expect((await s.publishing.listPublicationsForUser(a,{limit:20,offset:0})).filter(x=>x.contentOutputId==='output')).toHaveLength(1);
 });
 it('新发布必须验证当前成员和真实账号平台',async()=>{
  const s=services();await store.client.exec("UPDATE account_group_memberships SET group_id='group-b',version=2 WHERE id='member-a'");
  await expect(s.publishing.createPublication(a,'output',{platform:'douyin',accountReference:'旧目标'})).rejects.toThrow();
  await expect(s.publishing.createPublication({...a,accountId:'account-b'},'output',{platform:'wechatOfficial',accountReference:'平台不匹配'})).rejects.toThrow();
 });
 it('公开external ID与指标追加跨组拒绝，不能借真实账号读取旧组',async()=>{
  const s=services(),p=await s.publishing.createImportedPublication(a,'output',{platform:'douyin',externalId:'external-a'});
  const b={...a,groupId:'group-b'};await store.client.exec("UPDATE account_group_memberships SET group_id='group-b',version=2 WHERE id='member-a'");
  await expect(s.publishing.resolvePublication(b,{platform:'douyin',externalId:'external-a'})).resolves.toBeNull();
  const before=await store.client.query('SELECT id,raw_metrics FROM metric_snapshots ORDER BY id');
  await expect(s.analytics.appendSnapshot(b,{publicationId:p.id,capturedAt:NOW,source:'test',rawMetrics:{views:9}})).rejects.toMatchObject({name:'OwnershipError'});
  expect((await store.client.query('SELECT id,raw_metrics FROM metric_snapshots ORDER BY id')).rows).toEqual(before.rows);
 });
 it('首个累计样本不算增长，邻日增量只含可比作品',async()=>{
  const {repo}=services();
  for(const [id,publicationId,capturedAt,views] of [['m1','p1','2026-10-01T02:00:00Z',100],['m2','p1','2026-10-02T02:00:00Z',120],['new','p2','2026-10-02T02:00:00Z',1000]] as const)
   await repo.seedSnapshots([{id,userId:'owner',groupId:'group-a',accountId:'account-a',publicationId,ingestionRunId:null,capturedAt,source:'same',rawMetrics:{views},createdAt:NOW}]);
  const points=await repo.getDailyPlayTrend('owner',{groupId:'group-a'},undefined,7);
  expect(points).toEqual([{day:'2026-10-02',plays:null,complete:false,sampleCount:1,correction:null}]);
  const comparable=await repo.getDailyPlayTrend('owner',{groupId:'group-a'},['p1'],7);
  expect(comparable).toEqual([{day:'2026-10-02',plays:20}]);
 });
 it('北京时间归日，漏采与负修正保留真实含义',async()=>{
  const {repo}=services();
  for(const [id,capturedAt,views] of [['m1','2026-10-01T16:30:00Z',100],['m2','2026-10-02T16:30:00Z',90],['m3','2026-10-04T16:30:00Z',120]] as const)
   await repo.seedSnapshots([{id,userId:'owner',groupId:'group-a',accountId:'account-a',publicationId:'p1',ingestionRunId:null,capturedAt,source:'same',rawMetrics:{views},createdAt:NOW}]);
  const points=await repo.getDailyPlayTrend('owner',{groupId:'group-a'},undefined,7);
  expect(points.find(p=>p.day==='2026-10-03')).toMatchObject({plays:null,correction:-10});
  expect(points.find(p=>p.day==='2026-10-05')).toMatchObject({plays:null});
 });
 it('百分比按真实同口径分母加权，缺字段保持未知',async()=>{
  const {repo}=services();
  await repo.seedSnapshots([{id:'m1',userId:'owner',groupId:'group-a',accountId:'account-a',publicationId:'p1',ingestionRunId:null,capturedAt:NOW,source:'same',rawMetrics:{views:200,finish_rate:20,finish_rate_denominator:200,finish_rate_definition:'same'},createdAt:NOW},{id:'m2',userId:'owner',groupId:'group-a',accountId:'account-a',publicationId:'p2',ingestionRunId:null,capturedAt:NOW,source:'same',rawMetrics:{views:20,finish_rate:80,finish_rate_denominator:20,finish_rate_definition:'same'},createdAt:NOW}]);
  const rollup=await repo.getDashboardRollup('owner',{groupId:'group-a'});
  expect(rollup.finishAvg).toBeCloseTo((20*200+80*20)/220);expect(rollup.ctrAvg).toBeNull();expect(rollup.likes).toBeNull();
 });
 it('账号转组后采集按真实账号找到历史发布，增量仍冻结在原组且重复导入幂等',async()=>{
  const s=services(),p=await s.publishing.createImportedPublication(a,'output',{platform:'douyin',externalId:'old-work'});
  await store.client.exec(`INSERT INTO external_sources(id,user_id,account_id,source_type,name,created_at) VALUES('source','owner','account-a','douyin','真实采集','${NOW}'); UPDATE account_group_memberships SET group_id='group-b',version=2 WHERE id='member-a'; UPDATE account_groups SET status='archived' WHERE id='group-a'`);
  const collector={...a,groupId:'group-b',source:'ingestion' as const};
  const original=await s.publishing.resolveCollectedPublication(collector,{platform:'douyin',externalId:'old-work'});
  expect(original?.id).toBe(p.id);expect(original?.groupId).toBe('group-a');
  const run=await s.ingestion.createRun(collector,{externalSourceId:'source',runType:'metrics',idempotencyKey:'real-sample'});
  expect(run.groupId).toBe('group-b');expect(run.membershipVersion).toBe(2);
  const push={runId:run.id,records:[{recordKey:'row',platform:'douyin',externalId:'old-work',capturedAt:NOW,metrics:{views:120}}]};
  expect((await s.ingestion.ingestMetrics(collector,push)).recordsWritten).toBe(1);
  expect((await s.ingestion.ingestMetrics(collector,push)).recordsWritten).toBe(1);
  const facts=await store.client.query('SELECT account_id,group_id FROM metric_snapshots WHERE publication_id=$1',[p.id]);
  expect(facts.rows).toEqual([{account_id:'account-a',group_id:'group-a'}]);
  expect(await s.analytics.listLatestSnapshotsByPublicationIds({...a,accountId:null},[p.id])).toHaveLength(1);
  expect(await s.analytics.listLatestSnapshotsByPublicationIds({...collector,accountId:null},[p.id])).toHaveLength(0);
 });
 it('空组平台草稿保留物料待选目标，手动复盘来源无需伪平台账号',async()=>{
  const s=services(),group={...a,accountId:null};
  const result=await s.publishing.adoptDraft(group,{outputId:'output',platform:'wechatOfficial',adoptionKey:'candidate',title:'候选文章',description:'完整正文',platformTags:[]});
  expect(result).toEqual({kind:'unassigned',outputId:'output',platform:'wechatOfficial'});
  expect((await store.client.query("SELECT id FROM publications WHERE draft_adoption_key='candidate'")).rows).toHaveLength(0);
  const id=await s.ingestion.ensureManualRun(group,'manual-result');
  const row=await s.ingestion.getRun(group,id);expect(row.groupId).toBe('group-a');expect(row.accountId).toBeNull();expect(row.status).toBe('completed');
 });
 it('外部副作用前重验冻结成员，已转出目标不能发布；真实账号创建带版本',async()=>{
  let sent=0;const s=services({publish:async()=>{sent++;return {externalId:'real-id',externalUrl:'https://platform.example/real-id'};},remove:async()=>{}});
  const p=await s.publishing.createPublication(a,'output',{platform:'douyin',accountReference:'甲号'});
  expect(p.membershipVersion).toBe(1);
  await store.client.exec("UPDATE account_group_memberships SET group_id='group-b',version=2 WHERE id='member-a'");
  await expect(s.publishing.transition({...a,accountId:null},p.id,{status:'published'})).rejects.toThrow();expect(sent).toBe(0);
 });

 it('原生公众号阅读不混算视频播放，迁移重复应用保持原始指标与冻结归属',async()=>{
  await store.client.exec("UPDATE publications SET platform='wechatOfficial' WHERE id='p2'");
  const {repo}=services();
  await repo.seedSnapshots([{id:'video',userId:'owner',accountId:'account-a',publicationId:'p1',ingestionRunId:null,capturedAt:NOW,source:'same',rawMetrics:{views:0,plays:88},createdAt:NOW},{id:'article',userId:'owner',accountId:'account-a',publicationId:'p2',ingestionRunId:null,capturedAt:NOW,source:'same',rawMetrics:{views:120},createdAt:NOW}]);
  const sql=readFileSync(new URL('../../drizzle/0108_group_platform_facts.sql',import.meta.url),'utf8');
  await store.client.exec(sql);await store.client.exec(sql);
  const rollup=await repo.getDashboardRollup('owner',{groupId:'group-a'});
  expect(rollup).toMatchObject({plays:0,reads:120,snapshotCount:2});
  expect((await store.client.query("SELECT group_id,native_platform,raw_metrics FROM metric_snapshots WHERE id='article'")).rows).toEqual([{group_id:'group-a',native_platform:'wechatOfficial',raw_metrics:{views:120}}]);
 });

});
