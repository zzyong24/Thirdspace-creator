/** 仅复用T1355私有PG/T1356合成事实；通过真实service补充unknown目录，不触用户库。 */
import '../../t1356/harness/seed-collected-dashboard.mts';
import {readFile,writeFile,realpath,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRuntimeDb} from '../../../../backend/src/db.ts';
import {createAccountGroupService,createPlatformAccountService} from '../../../../backend/src/modules/platform-account/index.ts';
import {createPlatformCollectionService} from '../../../../backend/src/modules/platform-collection/index.ts';
import {platformWorks,platformCatalogs,platformVisibilityTombstones} from '../../../../backend/src/schema/platform-collection.ts';
import {platformWorksListResponse,type RequestContext,type CollectionPageCommit} from '../../../../contract/src/index.ts';
import {parseKuaishouCreatorIdentity,parseKuaishouWorkPage,compareKuaishouWorkPasses,kuaishouSourceWorks,KS_WORK_SOURCE,KS_IDENTITY_SOURCE} from '../../../../ai-worker/src/runtime/platform/kuaishou-creator-normalizer.ts';

const input=process.env.T1355_FIXTURE_ROOT;if(!input)throw Error('PRIVATE_ROOT_REQUIRED');
const root=await realpath(resolve(input)),uid=process.getuid?.(),stat=await lstat(root);
if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==uid||(stat.mode&0o077))throw Error('PRIVATE_ROOT_NOT_OWNED');
async function metadata(name:string){const path=join(root,name),s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.uid!==uid||(s.mode&0o077))throw Error('PRIVATE_METADATA_NOT_OWNED');return JSON.parse(await readFile(path,'utf8'));}
const owner=await metadata('owner.json'),ready=await metadata('ready.json'),seed=await metadata('dashboard-seed-safe.json');
if(owner.task!=='T1355'||owner.root!==root||ready.root!==root||seed.root!==root||!owner.nonce||owner.nonce!==ready.nonce||owner.nonce!==seed.nonce||ready.userId!==seed.userId||owner.pgPort!==ready.pgPort||owner.helperPid!==ready.helperPid||seed.schema!=='t1356-collected-dashboard-private-seed/v1')throw Error('PRIVATE_SEED_IDENTITY_MISMATCH');
const url=new URL(ready.databaseURL);
if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||Number(url.port)!==ready.pgPort||url.username!=='t1355_fixture'||url.password||url.pathname!=='/creatoros_t1355'||url.search||url.hash)throw Error('PRIVATE_DATABASE_URL_MISMATCH');
await writeFile(join(root,'t1371-seed-start.json'),JSON.stringify({task:'T1371',root,nonce:owner.nonce,at:new Date().toISOString()})+'\n',{mode:0o600,flag:'wx'});
const runtime=await createRuntimeDb({connectionString:url.toString()});
const clock={value:'2026-10-10T02:00:00.000Z'},deps={db:runtime.db,now:()=>clock.value,nextId:(prefix:string)=>`${prefix}-t1371-${randomUUID()}`};
const groups=createAccountGroupService(deps),collections=createPlatformCollectionService({...deps,readMembershipEvidence:groups.readMembershipEvidence,
 sourceAdapters:{xiaohongshu:[{platform:'xiaohongshu',capability:'workCatalog',supported:true,authState:'authorized',runtimeState:'ready',reasonCode:null,lastVerifiedAt:clock.value}],kuaishou:(['workCatalog','workMetrics','accountOverview'] as const).map(capability=>({platform:'kuaishou',capability,supported:true,authState:'authorized',runtimeState:'ready',reasonCode:null,lastVerifiedAt:clock.value}))},
 // T1374测试装配按已核生产字段协议映射；不提取/复用生产内联dict，不声称采集器全程受测。
 metricDictionary:{kuaishou:{playCount:{metricKey:'play_count',unit:'count'},likeCount:{metricKey:'like_count',unit:'count'},commentCount:{metricKey:'comment_count',unit:'count'},fansCnt:{metricKey:'follower_count',unit:'count'}}},
 // 原平台parser未能确认可见性时的同族：无可信优先级，保留unknown与外发冻结。
 visibilitySourcePriority:{},
});
const operations:unknown[]=[],names=['primary','browseZero','latestUnavailable','noMetric'] as const;
try{
 for(const name of names){
  const scenario=seed.scenarios[name],ctx:RequestContext={userId:ready.userId,groupId:scenario.groupId,accountId:scenario.accountId,requestId:'t1371-private-source',source:'user'};
  const catalog=platformWorksListResponse.parse(await collections.listWorks(ctx,{accountId:scenario.accountId,pageSize:100}));if(catalog.nextCursor)throw Error('SYNTHETIC_CATALOG_EXPECTED_BOUNDED');
  const run=await collections.start(ctx,{accountId:scenario.accountId,capability:'workCatalog',clientRequestId:deps.nextId('source-command')}),lease=await collections.claim(run.attemptId,'t1371-private-source');
  const {leaseExpiresAt:_,...tuple}=lease;
  const page:CollectionPageCommit={...tuple,capability:'workCatalog',sourceSnapshotKey:deps.nextId('snapshot'),scanPass:1,pageIndex:0,requestCursor:null,nextCursor:null,pageDigest:deps.nextId('page'),hasMore:false,observedAt:clock.value,platformReportedTotal:null,totalSource:null,totalObservedAt:null,terminalEvidence:{kind:'platformHasMoreFalse',source:'t1371_synthetic_unknown',observedAt:clock.value},
   works:catalog.items.map(work=>({externalId:work.externalId,kind:work.kind,title:work.title,publishedAt:work.publishedAt,visibility:{visibility:'unknown',source:'t1371_synthetic_unknown',observedAt:clock.value},source:'t1371_synthetic_unknown',observedAt:clock.value})),accountMetrics:[],workMetrics:[]};
  await collections.commitPage(page);const final=await collections.status(ctx,scenario.accountId,run.attemptId);if(final.status!=='complete'||final.committedPages!==1)throw Error('UNKNOWN_SOURCE_NOT_COMPLETE');
  operations.push({scenario:name,attemptId:run.attemptId,status:final.status,committedPages:final.committedPages,works:page.works.length});
 }
 // T1374只用明确合成平台响应；不读取真实profile或调用外部采集器。
 const ksScenario=seed.scenarios.ksOutside,accounts=createPlatformAccountService(deps);
 const ksCtx:RequestContext={userId:ready.userId,groupId:ksScenario.groupId,accountId:ksScenario.accountId,requestId:'t1374-private-ks-source',source:'user'};
 const ksAccount=await accounts.getAccount(ksCtx,ksScenario.accountId);
 const raw={result:1,data:{nextCursor:'no_more',total:1,list:[{workId:'ks-outside',title:'合成快手窗外作品',uploadTime:Date.parse('2026-09-01T04:00:00.000Z'),playCount:321,likeCount:0,commentCount:null}]}};
 const first=parseKuaishouWorkPage(raw,null,clock.value),second=parseKuaishouWorkPage(raw,null,clock.value),verified=compareKuaishouWorkPasses([first],[second]);
 if(verified.total!==1||verified.ids[0]!=='ks-outside')throw Error('KS_SYNTHETIC_TWO_PASS_MISMATCH');
 const run=await collections.start(ksCtx,{accountId:ksScenario.accountId,capability:'workCatalog',clientRequestId:deps.nextId('ks-catalog')}),lease=await collections.claim(run.attemptId,'t1374-private-source');
 const {leaseExpiresAt:_,...tuple}=lease;
 for(const [index,page] of [first,second].entries())await collections.commitPage({...tuple,capability:'workCatalog',sourceSnapshotKey:null,scanPass:(index+1) as 1|2,pageIndex:0,requestCursor:page.requestCursor,nextCursor:page.nextCursor,pageDigest:page.responseDigest,hasMore:false,observedAt:page.observedAt,platformReportedTotal:page.reportedTotal,totalSource:KS_WORK_SOURCE,totalObservedAt:page.observedAt,terminalEvidence:{kind:'platformHasMoreFalse',source:KS_WORK_SOURCE,observedAt:page.observedAt},works:kuaishouSourceWorks(page),accountMetrics:[],workMetrics:[]});
 const ksFinal=await collections.status(ksCtx,ksScenario.accountId,run.attemptId);if(ksFinal.status!=='complete'||ksFinal.committedPages!==2)throw Error('KS_UNKNOWN_TWO_PASS_NOT_COMPLETE');
 operations.push({scenario:'ksOutside',attemptId:run.attemptId,status:ksFinal.status,committedPages:2,works:verified.total,sourceSnapshotKey:null});
 async function commitKsMetrics(capability:'workMetrics'|'accountOverview',metrics:CollectionPageCommit['workMetrics'],source:string){
  const r=await collections.start(ksCtx,{accountId:ksScenario.accountId,capability,clientRequestId:deps.nextId('ks-metrics')}),l=await collections.claim(r.attemptId,'t1374-private-source'),{leaseExpiresAt:__,...t}=l;
  await collections.commitPage({...t,capability,sourceSnapshotKey:null,scanPass:1,pageIndex:0,requestCursor:null,nextCursor:null,pageDigest:deps.nextId('ks-page'),hasMore:false,observedAt:clock.value,platformReportedTotal:null,totalSource:null,totalObservedAt:null,terminalEvidence:{kind:'platformHasMoreFalse',source,observedAt:clock.value},works:[],accountMetrics:capability==='accountOverview'?metrics:[],workMetrics:capability==='workMetrics'?metrics:[]});
  const final=await collections.status(ksCtx,ksScenario.accountId,r.attemptId);if(final.status!=='complete')throw Error('KS_TYPED_SOURCE_NOT_COMPLETE');operations.push({scenario:'ksOutside',capability,status:final.status,metrics:metrics.length});
 }
 const fields=['playCount','likeCount','commentCount'] as const;
 await commitKsMetrics('workMetrics',first.works.flatMap(work=>fields.map(field=>({externalWorkId:work.externalId,sourceField:field,sourceUnit:'count',value:work[field],availability:work[field]===null?'sourceMissing' as const:'available' as const,window:{kind:'lifetime' as const},source:KS_WORK_SOURCE,capturedAt:first.observedAt,observedAt:first.observedAt}))),'kuaishou_verified_catalog_batch');
 const identity=parseKuaishouCreatorIdentity({result:1,data:{userId:ksAccount.externalAccountId,userName:'合成快手账号',fansCnt:9}},ksAccount.externalAccountId!);
 await commitKsMetrics('accountOverview',[{externalWorkId:null,sourceField:'fansCnt',sourceUnit:'count',value:identity.followerCount,availability:identity.followerCount===null?'sourceMissing':'available',window:{kind:'lifetime'},source:KS_IDENTITY_SOURCE,capturedAt:clock.value,observedAt:clock.value}],KS_IDENTITY_SOURCE);
 const scenarios={...seed.scenarios,ksOutside:{...ksScenario,includedVideoViews:321,likes:0,followers:9,includedCatalogWorkCount:1,sourceCatalogWorkCount:1}};
 const ids=new Set([...names.map(name=>seed.scenarios[name].accountId),ksScenario.accountId]);
 const facts=(await runtime.db.select().from(platformWorks)).filter(row=>ids.has(row.accountId)).map(({id,accountId,platform,externalId,visibility,visibilityPriority,visibilitySource,visibilityObservedAt,source,outboundFrozenAt,uncertainVisibilityAt,catalogGeneration})=>({id,accountId,platform,externalId,visibility,visibilityPriority,visibilitySource,visibilityObservedAt,source,outboundFrozenAt,uncertainVisibilityAt,catalogGeneration}));
 if(facts.some(row=>row.visibility!=='unknown'||row.visibilityPriority!==0||!row.outboundFrozenAt||!row.uncertainVisibilityAt))throw Error('UNKNOWN_FREEZE_FACTS_MISMATCH');
 const catalogs=(await runtime.db.select().from(platformCatalogs)).filter(row=>ids.has(row.accountId)),tombstones=(await runtime.db.select().from(platformVisibilityTombstones)).filter(row=>ids.has(row.accountId));
 if(catalogs.some(row=>row.generation<=0||!row.completedAt)||tombstones.length)throw Error('UNKNOWN_CATALOG_PRECONDITION_MISMATCH');
 await writeFile(join(root,'t1371-seed-safe.json'),JSON.stringify({schema:'t1371-unknown-dashboard-private-seed/v1',root,nonce:owner.nonce,userId:ready.userId,scenarios,operations,ksNormalizer:{twoPasses:true,total:verified.total,source:KS_WORK_SOURCE,explicitProtocolMapping:true,productionCollectorFieldAssemblyTested:false},facts,catalogs,tombstoneCount:tombstones.length,safety:{onlySyntheticPrivateDatabase:true,originalT1356SeedUnchanged:true,actualPublishingInvoked:false,modelsInvoked:false,visibilityPromotedToPublic:false},boundary:'真实service补充已完成current unknown，原typed样本未重写；尚未以Next/HTTP/UI验收。'},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.info(JSON.stringify({task:'T1371',seeded:true,unknownWorks:facts.length,sourceCommits:operations.length,visibilityPromotedToPublic:false}));
}finally{await runtime.pool.end();}
