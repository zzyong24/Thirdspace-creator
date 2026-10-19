/** 仅限本轮T1355私有PG基础设施；合成采集事实用于真实Next→HTTP→UI验收。 */
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {createRuntimeDb} from '../../../../backend/src/db.ts';
import {createIdentityRepository,ensureLocalUser} from '../../../../backend/src/modules/identity/index.ts';
import {createAccountGroupService,createPlatformAccountService,createMembershipLockService} from '../../../../backend/src/modules/platform-account/index.ts';
import {createPlatformCollectionService} from '../../../../backend/src/modules/platform-collection/index.ts';
import {createProjectsService,createProjectRepository} from '../../../../backend/src/modules/projects/index.ts';
import {createPublishingService} from '../../../../backend/src/modules/publishing/index.ts';
import {createAnalyticsService,createAnalyticsRepository} from '../../../../backend/src/modules/analytics/index.ts';
import type {RequestContext,CollectionPageCommit,CollectionRunResource,PlatformCapabilityState} from '../../../../contract/src/index.ts';

const args=process.argv.slice(2);
function option(name:string){const i=args.indexOf(name);return i<0?undefined:args[i+1];}
if(args.some((x,i)=>i%2===0&&!['--ready','--manifest'].includes(x))||args.length%2)throw Error('SEED_ARGUMENTS_INVALID');
const rootInput=process.env.T1355_FIXTURE_ROOT,readyInput=option('--ready')??(rootInput?join(rootInput,'ready.json'):undefined);
if(!readyInput)throw Error('PRIVATE_READY_REQUIRED');
const readyPath=await realpath(resolve(readyInput)),root=dirname(readyPath),manifestPath=resolve(option('--manifest')??join(root,'dashboard-seed-safe.json'));
if(dirname(manifestPath)!==root)throw Error('MANIFEST_MUST_STAY_IN_PRIVATE_ROOT');
const uid=process.getuid?.();
for(const file of [readyPath,join(root,'owner.json')]){const s=await lstat(file);if(s.isSymbolicLink()||!s.isFile()||s.uid!==uid||(s.mode&0o077))throw Error('PRIVATE_METADATA_PERMISSION_MISMATCH');}
const rootStat=await lstat(root);if(rootStat.isSymbolicLink()||!rootStat.isDirectory()||rootStat.uid!==uid||(rootStat.mode&0o077))throw Error('PRIVATE_ROOT_PERMISSION_MISMATCH');
const ready=JSON.parse(await readFile(readyPath,'utf8')),owner=JSON.parse(await readFile(join(root,'owner.json'),'utf8'));
if(owner.task!=='T1355'||!owner.nonce||ready.nonce!==owner.nonce||ready.root!==root||owner.root!==root||ready.dataDir!==join(root,'pgdata')||ready.dataDir!==owner.dataDir||ready.pgPort!==owner.pgPort||ready.helperPid!==owner.helperPid)throw Error('PRIVATE_READY_NONCE_OR_ROOT_MISMATCH');
const url=new URL(ready.databaseURL);
if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||Number(url.port)!==owner.pgPort||url.username!=='t1355_fixture'||url.password||url.pathname!=='/creatoros_t1355'||url.search||url.hash)throw Error('PRIVATE_DATABASE_URL_MISMATCH');
const pgLines=(await readFile(join(ready.dataDir,'postmaster.pid'),'utf8')).split('\n');
if(Number(pgLines[0])!==ready.pgPid||pgLines[1]!==ready.dataDir||Number(pgLines[3])!==owner.pgPort||pgLines[5]!=='127.0.0.1')throw Error('PRIVATE_POSTMASTER_IDENTITY_MISMATCH');
const exec=promisify(execFile);
for(const [pid,needle] of [[ready.pgPid,ready.dataDir],[ready.helperPid,'binding-fixture-server.mts']] as const){const {stdout}=await exec('/bin/ps',['-p',String(pid),'-o','uid=,command='],{timeout:180000});if(!stdout.trim().startsWith(String(uid))||!stdout.includes(needle))throw Error('PRIVATE_PROCESS_IDENTITY_MISMATCH');}
// 不能在已seed/失败根上盲重放；新尝试必须新建独占root，由原helper正常收尾旧根。
await writeFile(join(root,'dashboard-seed-start.json'),JSON.stringify({task:'T1356',nonce:owner.nonce,root,pid:process.pid,startedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600,flag:'wx'});
const runtime=await createRuntimeDb({connectionString:url.toString()});
const clock={value:'2026-09-01T00:00:00.000Z'},nextId=(prefix:string)=>`${prefix}-t1356-${randomUUID()}`,now=()=>clock.value;
const deps={db:runtime.db,now,nextId},window={startDate:'2026-10-01',endDate:'2026-10-07'},observedAt='2026-10-08T02:00:00.000Z';
type Account=Awaited<ReturnType<ReturnType<typeof createPlatformAccountService>['createAccount']>>;
const operations:Array<Record<string,unknown>>=[];
try{
 const identity=await ensureLocalUser(createIdentityRepository(runtime.db,deps),deps);if(identity.id!==ready.userId)throw Error('PRIVATE_LOCAL_OWNER_CHANGED');
 const base:RequestContext={userId:identity.id,requestId:'t1356-private-seed',source:'user'};
 const groups=createAccountGroupService(deps),accounts=createPlatformAccountService(deps);
 const caps=['bind','workCatalog','workMetrics','accountOverview'] as const;
 const states=(platform:string):PlatformCapabilityState[]=>caps.map(capability=>({platform:platform as PlatformCapabilityState['platform'],capability,supported:true,authState:'authorized',runtimeState:'ready',reasonCode:null,lastVerifiedAt:now()}));
 const collections=createPlatformCollectionService({...deps,readMembershipEvidence:groups.readMembershipEvidence,visibilitySourcePriority:{t1356_synthetic:100},sourceAdapters:{xiaohongshu:states('xiaohongshu'),kuaishou:states('kuaishou'),douyin:states('douyin')},metricDictionary:{xiaohongshu:{views:{metricKey:'view_count',unit:'count'},likes:{metricKey:'like_count',unit:'count'},followers:{metricKey:'follower_count',unit:'count'}},kuaishou:{plays:{metricKey:'play_count',unit:'count'},likes:{metricKey:'like_count',unit:'count'}},douyin:{plays:{metricKey:'play_count',unit:'count'},likes:{metricKey:'like_count',unit:'count'}}}});
 const projects=createProjectsService(createProjectRepository(runtime.db),deps);
 const publishing=createPublishingService({...deps,membership:createMembershipLockService(runtime.db),assertTargetAccount:(ctx,target)=>accounts.assertOwnedAccount(ctx,target.accountId,target.platform),resolveOutputOwner:(ctx,id)=>projects.getOutputOwnerSummary(ctx,id),listOutputIdsByProject:projects.listOutputIdsByProject});
 const analytics=createAnalyticsService({repo:createAnalyticsRepository(runtime.db,deps),publishing:{resolvePublication:(ctx,id)=>publishing.getPublication(ctx,id),listPublicationIdsByProject:publishing.listPublicationIdsByProject}});
 async function group(name:string){return groups.create(base,{name,idempotencyKey:nextId('group-command')});}
 async function account(groupId:string,platform:string,label:string){clock.value='2026-09-01T00:00:00.000Z';const ctx={...base,groupId},a=await accounts.createAccount(ctx,{platform,accountHandle:label,externalAccountId:nextId('synthetic-identity')});await runtime.db.transaction(tx=>collections.commitVerifiedBinding(tx,ctx,{accountId:a.id,platform,platformIdentity:a.externalAccountId!,proofSource:'t1356_synthetic_trusted_adapter',scopes:['workCatalog','workMetrics','accountOverview'],verifiedAt:now(),expiresAt:null}));return a;}
 const work=(externalId:string,publishedAt:string|null,title='秋日内容')=>({externalId,kind:'video' as const,title,publishedAt,visibility:{visibility:'public' as const,source:'t1356_synthetic',observedAt:now()},source:'t1356_synthetic',observedAt:now()});
 const metric=(externalWorkId:string|null,sourceField:string,value:number|null,availability:'available'|'sourceMissing'='available')=>({externalWorkId,sourceField,sourceUnit:'count',value,availability,window:{kind:'lifetime' as const},source:'t1356_synthetic',capturedAt:now(),observedAt:now()});
 async function commit(groupId:string,a:Account,capability:'workCatalog'|'workMetrics'|'accountOverview',works:CollectionPageCommit['works'],metrics:CollectionPageCommit['workMetrics']){
  const ctx={...base,groupId,accountId:a.id},run=await collections.start(ctx,{accountId:a.id,capability,clientRequestId:nextId('source-request')}),lease=await collections.claim(run.attemptId,'t1356-private-source');
  const {leaseExpiresAt:_,...tuple}=lease;
  const page:CollectionPageCommit={...tuple,capability,sourceSnapshotKey:nextId('source-snapshot'),scanPass:1,pageIndex:0,requestCursor:null,nextCursor:null,pageDigest:nextId('source-page'),hasMore:false,observedAt:now(),platformReportedTotal:null,totalSource:null,totalObservedAt:null,terminalEvidence:{kind:'platformHasMoreFalse',source:'t1356_synthetic',observedAt:now()},works,accountMetrics:capability==='accountOverview'?metrics:[],workMetrics:capability==='workMetrics'?metrics:[]};
  await collections.commitPage(page);const final=await collections.status(ctx,a.id,run.attemptId);if(final.status!=='complete')throw Error('SYNTHETIC_SOURCE_NOT_COMPLETE');operations.push({kind:'collection-page-commit',groupId,accountId:a.id,attemptId:run.attemptId,capability,status:final.status,works:works.length,metrics:metrics.length,ingestedAt:now()});return final;
 }
 async function legacy(groupId:string,a:Account,externalId:string,title:string,rawMetrics:Record<string,unknown>){const ctx={...base,groupId,accountId:a.id,source:'ingestion' as const};const imported=await projects.ensureImportedProject(ctx,{platform:a.platform,externalId,title,publishedAt:'2026-10-03T04:00:00.000Z',shareUrl:null,brief:title});const publication=await publishing.createImportedPublication(ctx,imported.outputId,{platform:a.platform,externalId,accountId:a.id,publishedAt:'2026-10-03T04:00:00.000Z',title,accountReference:a.accountHandle});const snapshot=await analytics.appendSnapshot(ctx,{publicationId:publication.id,accountId:a.id,source:'t1356_synthetic_legacy',capturedAt:'2026-10-08T01:00:00.000Z',rawMetrics});operations.push({kind:'existing-publication-fixture',groupId,accountId:a.id,projectId:imported.projectId,outputId:imported.outputId,publicationId:publication.id,snapshotId:snapshot.snapshot.id});return {...imported,publicationId:publication.id,externalId,snapshotId:snapshot.snapshot.id};}
 const primary=await group('浏览与真实零值'),ksGroup=await group('快手发布时间筛选'),zeroGroup=await group('零浏览仍是已知值'),unknownGroup=await group('最新样本不可用'),noMetricGroup=await group('目录已有但指标未确认'),transferA=await group('原组保留发布事实'),transferB=await group('转组后的新采集');
 const xhs=await account(primary.id,'xiaohongshu','山间记录'),ks=await account(ksGroup.id,'kuaishou','旅行记录'),zero=await account(zeroGroup.id,'xiaohongshu','平静日常'),unknown=await account(unknownGroup.id,'xiaohongshu','晚到数据'),noMetric=await account(noMetricGroup.id,'xiaohongshu','等待数据'),moving=await account(transferA.id,'douyin','原组与新组');
 clock.value=observedAt;
 const mainWorks=Array.from({length:11},(_,i)=>work(`xhs-inside-${i+1}`,'2026-10-03T04:00:00.000Z',`秋日内容${i+1}`));
 await commit(primary.id,xhs,'workCatalog',[...mainWorks,work('xhs-outside','2026-09-01T04:00:00.000Z','旧日内容'),work('xhs-no-metric','2026-10-03T04:00:00.000Z','指标尚未确认')],[]);
 await commit(primary.id,xhs,'workMetrics',[],[...mainWorks.flatMap((w,i)=>[metric(w.externalId,'views',i===0?123:0),metric(w.externalId,'likes',0)]),metric('xhs-outside','views',999)]);
 await commit(primary.id,xhs,'accountOverview',[],[metric(null,'followers',0)]);
 const recentXhs=await legacy(primary.id,xhs,'xhs-real-publication-fixture','平台原有图文',{views:0,likes:0});
 await commit(ksGroup.id,ks,'workCatalog',[work('ks-outside','2026-09-01T04:00:00.000Z','旧期快手作品')],[]);await commit(ksGroup.id,ks,'workMetrics',[],[metric('ks-outside','plays',0)]);
 await commit(zeroGroup.id,zero,'workCatalog',[work('xhs-zero','2026-10-04T04:00:00.000Z')],[]);await commit(zeroGroup.id,zero,'workMetrics',[],[metric('xhs-zero','views',0),metric('xhs-zero','likes',0)]);
 await commit(unknownGroup.id,unknown,'workCatalog',[work('xhs-latest-unknown','2026-10-04T04:00:00.000Z')],[]);await commit(unknownGroup.id,unknown,'workMetrics',[],[metric('xhs-latest-unknown','views',99),metric('xhs-latest-unknown','likes',0)]);clock.value='2026-10-08T03:00:00.000Z';await commit(unknownGroup.id,unknown,'workMetrics',[],[metric('xhs-latest-unknown','views',null,'sourceMissing')]);
 await commit(noMetricGroup.id,noMetric,'workCatalog',[work('xhs-no-evidence','2026-10-04T04:00:00.000Z')],[]);
 await commit(transferA.id,moving,'workCatalog',[work('dy-shared-reference','2026-10-03T04:00:00.000Z')],[]);await commit(transferA.id,moving,'workMetrics',[],[metric('dy-shared-reference','plays',123),metric('dy-shared-reference','likes',17)]);
 const oldPub=await legacy(transferA.id,moving,'dy-shared-reference','保留原组的已发布视频',{views:5,likes:0});
 await collections.recordConfirmedLegacyImport({...base,groupId:transferA.id,accountId:moving.id,source:'ingestion'},{accountId:moving.id,platform:'douyin',externalId:oldPub.externalId,kind:'video',title:'保留原组的已发布视频',publishedAt:'2026-10-03T04:00:00.000Z',publicationId:oldPub.publicationId,legacyProjectId:oldPub.projectId,capturedAt:'2026-10-08T01:00:00.000Z',metrics:{views:5,likes:0}});
 clock.value='2026-10-09T02:00:00.000Z';const preview=await groups.previewTransfer(base,{accountId:moving.id,toGroupId:transferB.id});await groups.transfer(base,{...preview,idempotencyKey:nextId('transfer-command')});await commit(transferB.id,moving,'workMetrics',[],[metric('dy-shared-reference','plays',200),metric('dy-shared-reference','likes',25)]);
 const expected={primary:{groupId:primary.id,groupName:primary.name,accountId:xhs.id,query:{...window,platform:'xiaohongshu'},browseViews:123,likes:0,followers:0,videoViews:null,catalogWorkCount:11,unattributableWorkCount:1,publicationCount:1,contentCount:1,recentPublication:recentXhs,sourceCatalogWorkCount:13},ksOutside:{groupId:ksGroup.id,groupName:ksGroup.name,accountId:ks.id,query:{...window,platform:'kuaishou'},videoViews:null,publicationCount:0,contentCount:0,includedDateQuery:{startDate:'2026-09-01',endDate:'2026-09-01',platform:'kuaishou'},includedVideoViews:0},browseZero:{groupId:zeroGroup.id,groupName:zeroGroup.name,accountId:zero.id,query:{...window,platform:'xiaohongshu'},browseViews:0,likes:0,catalogWorkCount:1},latestUnavailable:{groupId:unknownGroup.id,groupName:unknownGroup.name,accountId:unknown.id,query:{...window,platform:'xiaohongshu'},browseViews:null,likes:0,catalogWorkCount:1,previousViewsMustNotAppear:99},noMetric:{groupId:noMetricGroup.id,groupName:noMetricGroup.name,accountId:noMetric.id,query:{...window,platform:'xiaohongshu'},browseViews:null,catalogWorkCount:0,unattributableWorkCount:1},transferA:{groupId:transferA.id,groupName:transferA.name,accountId:moving.id,query:{...window,platform:'douyin'},videoViews:5,likes:0,publicationCount:1,contentCount:1,deduplicatedWorkCount:1,legacyPublication:oldPub},transferB:{groupId:transferB.id,groupName:transferB.name,accountId:moving.id,query:{...window,platform:'douyin'},videoViews:200,likes:25,publicationCount:0,contentCount:0,deduplicatedWorkCount:0}};
 const manifest={schema:'t1356-collected-dashboard-private-seed/v1',root,nonce:owner.nonce,userId:identity.id,seededAt:new Date().toISOString(),frozenPublicationWindow:window,syntheticIngestedAtRange:{start:observedAt,end:now()},scenarios:expected,operations,safety:{onlySyntheticPrivateDatabase:true,externalAdaptersInstalled:false,modelsInvoked:false,actualPublishingInvoked:false,catalogPromotedToPublication:false,legitimateLegacyFixtures:2,overlapInjected:false,nextMustDisableBackgroundDrivers:true},verificationBoundary:'仅seed真实service提交并保输入/IDs/期望；尚未以真实Next persistence/HTTP/UI核验，不能用本manifest代签。'};
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.info(JSON.stringify({seeded:true,manifest:manifestPath,scenarioCount:Object.keys(expected).length,sourceCommits:operations.filter(o=>o.kind==='collection-page-commit').length,ownerMatchesReady:true}));
}catch(error){await writeFile(join(root,'dashboard-seed-failed.json'),JSON.stringify({at:new Date().toISOString(),errorName:error instanceof Error?error.name:'Error',code:(error as {code?:string}).code??null,message:error instanceof Error?error.message:'seed failed',completedOperations:operations},null,2)+'\n',{mode:0o600,flag:'wx'});throw error;}
finally{await runtime.pool.end();}
