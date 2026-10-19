/** T1362：只向已验证的T1356合成私有PG追加同组第二平台，不创建项目/发布实体。 */
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {createRuntimeDb} from '../../../../backend/src/db.ts';
import {createIdentityRepository,ensureLocalUser} from '../../../../backend/src/modules/identity/index.ts';
import {createAccountGroupService,createPlatformAccountService} from '../../../../backend/src/modules/platform-account/index.ts';
import {createPlatformCollectionService} from '../../../../backend/src/modules/platform-collection/index.ts';
import type {RequestContext,CollectionPageCommit,PlatformCapabilityState} from '../../../../contract/src/index.ts';

const args=process.argv.slice(2);
function option(name:string){const at=args.indexOf(name);return at<0?undefined:args[at+1];}
if(args.length%2||args.some((value,index)=>index%2===0&&!['--ready','--manifest'].includes(value)))throw Error('SEED_ARGUMENTS_INVALID');
const readyInput=option('--ready')??(process.env.T1355_FIXTURE_ROOT?join(process.env.T1355_FIXTURE_ROOT,'ready.json'):undefined);
if(!readyInput)throw Error('PRIVATE_READY_REQUIRED');
const readyPath=await realpath(resolve(readyInput)),root=dirname(readyPath),manifestPath=resolve(option('--manifest')??join(root,'work-entry-seed-safe.json'));
if(dirname(manifestPath)!==root)throw Error('MANIFEST_MUST_STAY_IN_PRIVATE_ROOT');
const uid=process.getuid?.(),dashboardPath=join(root,'dashboard-seed-safe.json');
for(const file of [resolve(readyInput),readyPath,join(root,'owner.json'),dashboardPath]){
 const stat=await lstat(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.uid!==uid||(stat.mode&0o077))throw Error('PRIVATE_METADATA_PERMISSION_MISMATCH');
}
const rootStat=await lstat(root);if(rootStat.isSymbolicLink()||!rootStat.isDirectory()||rootStat.uid!==uid||(rootStat.mode&0o077))throw Error('PRIVATE_ROOT_PERMISSION_MISMATCH');
const ready=JSON.parse(await readFile(readyPath,'utf8')),owner=JSON.parse(await readFile(join(root,'owner.json'),'utf8'));
if(owner.task!=='T1355'||!owner.nonce||ready.nonce!==owner.nonce||ready.root!==root||owner.root!==root||ready.dataDir!==join(root,'pgdata')||owner.dataDir!==ready.dataDir||ready.pgPort!==owner.pgPort||ready.helperPid!==owner.helperPid)throw Error('PRIVATE_READY_NONCE_OR_ROOT_MISMATCH');
const url=new URL(ready.databaseURL);
if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||Number(url.port)!==owner.pgPort||url.username!=='t1355_fixture'||url.password||url.pathname!=='/creatoros_t1355'||url.search||url.hash)throw Error('PRIVATE_DATABASE_URL_MISMATCH');
const lines=(await readFile(join(ready.dataDir,'postmaster.pid'),'utf8')).split('\n');
if(Number(lines[0])!==ready.pgPid||lines[1]!==ready.dataDir||Number(lines[3])!==owner.pgPort||lines[5]!=='127.0.0.1')throw Error('PRIVATE_POSTMASTER_IDENTITY_MISMATCH');
const exec=promisify(execFile);
for(const [pid,needle] of [[ready.pgPid,ready.dataDir],[ready.helperPid,'binding-fixture-server.mts']] as const){
 const {stdout}=await exec('/bin/ps',['-p',String(pid),'-o','uid=,command='],{timeout:180000});
 if(!stdout.trim().startsWith(String(uid))||!stdout.includes(needle))throw Error('PRIVATE_PROCESS_IDENTITY_MISMATCH');
}
const dashboardBytes=await readFile(dashboardPath),dashboard=JSON.parse(dashboardBytes.toString('utf8'));
const dashboardSha=createHash('sha256').update(dashboardBytes).digest('hex');
if(dashboard.schema!=='t1356-collected-dashboard-private-seed/v1'||dashboard.nonce!==owner.nonce||dashboard.root!==root||dashboard.userId!==ready.userId||Object.keys(dashboard.scenarios??{}).length!==7||dashboard.operations?.filter((item:{kind:string})=>item.kind==='collection-page-commit').length!==14)throw Error('T1356_SEED_IDENTITY_MISMATCH');
const primary=dashboard.scenarios.primary,zero=dashboard.scenarios.browseZero;
if(!primary?.groupId||!primary.accountId||!zero?.groupId||!zero.accountId||primary.groupId===zero.groupId)throw Error('T1356_SCENARIOS_MISSING');
// 新尝试必须fresh根；不在已失败/已seed根上盲重发业务提交。
await writeFile(join(root,'work-entry-seed-start.json'),JSON.stringify({task:'T1362',root,nonce:owner.nonce,pid:process.pid,startedAt:new Date().toISOString(),dashboardSeedSha256:dashboardSha},null,2)+'\n',{mode:0o600,flag:'wx'});
const runtime=await createRuntimeDb({connectionString:url.toString()});
const now=()=>'2026-10-10T02:00:00.000Z',nextId=(prefix:string)=>`${prefix}-t1362-${randomUUID()}`,deps={db:runtime.db,now,nextId};
const operations:Array<Record<string,unknown>>=[];
async function counts(){
 const value=await runtime.pool.query('SELECT (SELECT count(*)::int FROM platform_collection_runs) AS collection_runs,(SELECT count(*)::int FROM ai_tasks) AS ai_tasks,(SELECT count(*)::int FROM projects) AS projects,(SELECT count(*)::int FROM publications) AS publications');
 return value.rows[0] as {collection_runs:number;ai_tasks:number;projects:number;publications:number};
}
try{
 const identity=await ensureLocalUser(createIdentityRepository(runtime.db,deps),deps);if(identity.id!==ready.userId)throw Error('PRIVATE_LOCAL_OWNER_CHANGED');
 const base:RequestContext={userId:identity.id,requestId:'t1362-private-work-entry-seed',source:'user'};
 const groups=createAccountGroupService(deps),accounts=createPlatformAccountService(deps);
 const original=await groups.get(base,primary.groupId),empty=await groups.get(base,ready.currentGroupId),pure=await groups.get(base,zero.groupId);
 const active=original.members.filter(member=>member.status==='active'&&member.leftAt===null);
 if(original.userId!==identity.id||original.status!=='active'||active.length!==1||active[0]!.accountId!==primary.accountId||active[0]!.platform!=='xiaohongshu'||empty.members.length||!pure.members.some(member=>member.accountId===zero.accountId&&member.status==='active'&&member.leftAt===null))throw Error('T1356_GROUP_BASELINE_MISMATCH');
 const before=await counts();if(before.collection_runs!==14||before.ai_tasks!==0)throw Error('T1356_COLLECTION_BASELINE_MISMATCH');
 const pureProjectCount=await runtime.pool.query('SELECT count(*)::int AS count FROM projects WHERE user_id=$1 AND group_id=$2',[identity.id,zero.groupId]);
 if(pureProjectCount.rows[0].count!==0)throw Error('PURE_TYPED_GROUP_HAS_PROJECTS');
 const caps=(platform:'kuaishou'|'xiaohongshu'):PlatformCapabilityState[] => (['bind','workCatalog','workMetrics'] as const).map(capability=>({platform,capability,supported:true,authState:'authorized',runtimeState:'ready',reasonCode:null,lastVerifiedAt:now()}));
 const collections=createPlatformCollectionService({...deps,readMembershipEvidence:groups.readMembershipEvidence,visibilitySourcePriority:{t1362_synthetic:100},sourceAdapters:{kuaishou:caps('kuaishou'),xiaohongshu:caps('xiaohongshu')},metricDictionary:{kuaishou:{plays:{metricKey:'play_count',unit:'count'},likes:{metricKey:'like_count',unit:'count'}},xiaohongshu:{views:{metricKey:'view_count',unit:'count'}}}});
 const account=await accounts.createAccount({...base,groupId:primary.groupId},{platform:'kuaishou',accountHandle:'同组快手记录',externalAccountId:nextId('synthetic-identity')});
 const ctx={...base,groupId:primary.groupId,accountId:account.id};
 await runtime.db.transaction(tx=>collections.commitVerifiedBinding(tx,ctx,{accountId:account.id,platform:'kuaishou',platformIdentity:account.externalAccountId!,proofSource:'t1362_synthetic_trusted_adapter',scopes:['workCatalog','workMetrics'],verifiedAt:now(),expiresAt:null}));
 const externalId='t1362-same-group-kuaishou-work';
 async function commit(capability:'workCatalog'|'workMetrics',target={ctx,externalId,title:'同组快手已采集作品',metrics:[{sourceField:'plays',value:7},{sourceField:'likes',value:0}]}){
  const run=await collections.start(target.ctx,{accountId:target.ctx.accountId,capability,clientRequestId:nextId('source-request')}),lease=await collections.claim(run.attemptId,'t1362-private-source');
  const {leaseExpiresAt:_,...tuple}=lease;
  const metrics=target.metrics.map(metric=>({...metric,externalWorkId:target.externalId,sourceUnit:'count',availability:'available' as const,window:{kind:'lifetime' as const},source:'t1362_synthetic',capturedAt:now(),observedAt:now()}));
  const page:CollectionPageCommit={...tuple,capability,sourceSnapshotKey:nextId('source-snapshot'),scanPass:1,pageIndex:0,requestCursor:null,nextCursor:null,pageDigest:nextId('source-page'),hasMore:false,observedAt:now(),platformReportedTotal:null,totalSource:null,totalObservedAt:null,terminalEvidence:{kind:'platformHasMoreFalse',source:'t1362_synthetic',observedAt:now()},works:capability==='workCatalog'?[{externalId:target.externalId,kind:'video',title:target.title,publishedAt:'2026-10-03T04:00:00.000Z',visibility:{visibility:'public',source:'t1362_synthetic',observedAt:now()},source:'t1362_synthetic',observedAt:now()}]:[],accountMetrics:[],workMetrics:capability==='workMetrics'?metrics:[]};
  await collections.commitPage(page);const final=await collections.status(target.ctx,target.ctx.accountId,run.attemptId);if(final.status!=='complete')throw Error('SYNTHETIC_SOURCE_NOT_COMPLETE');
  operations.push({kind:'collection-page-commit',accountId:target.ctx.accountId,groupId:target.ctx.groupId,attemptId:run.attemptId,capability,status:final.status});
 }
 await commit('workCatalog');await commit('workMetrics');
 const catalog=await collections.listWorks(ctx,{accountId:account.id,pageSize:20,cursor:null}),work=catalog.items[0];
 if(catalog.total!==1||catalog.currentTotal!==1||catalog.catalogCompleteness!=='verifiedComplete'||!work||work.externalId!==externalId||work.legacyProjectId!==null||work.publicationId!==null||work.legacyPublicationId!==null)throw Error('NEW_CATALOG_READBACK_MISMATCH');
 const metrics=await collections.readMetrics(ctx,{accountId:account.id,platformWorkId:work.id,pageSize:100,cursor:null});
 const play=metrics.workMetrics.find(metric=>metric.metricKey==='play_count'),like=metrics.workMetrics.find(metric=>metric.metricKey==='like_count');
 if(metrics.workMetrics.length!==2||metrics.accountMetrics.length||play?.value!==7||like?.value!==0||[play,like].some(metric=>metric?.availability!=='available'||metric.unit!=='count'||metric.window.kind!=='lifetime'||metric.platformWorkId!==work.id))throw Error('NEW_METRIC_READBACK_MISMATCH');
 // 每个视口使用独立实体；不重置已持久的人工确认或假装再次操作。
 const minimumGroup=await groups.create(base,{name:'窄窗独立已采集作品',idempotencyKey:nextId('minimum-group-command')});
 const minimumAccount=await accounts.createAccount({...base,groupId:minimumGroup.id},{platform:'xiaohongshu',accountHandle:'窄窗纯平台记录',externalAccountId:nextId('synthetic-identity')});
 const minimumCtx={...base,groupId:minimumGroup.id,accountId:minimumAccount.id};
 await runtime.db.transaction(tx=>collections.commitVerifiedBinding(tx,minimumCtx,{accountId:minimumAccount.id,platform:'xiaohongshu',platformIdentity:minimumAccount.externalAccountId!,proofSource:'t1362_synthetic_trusted_adapter',scopes:['workCatalog','workMetrics'],verifiedAt:now(),expiresAt:null}));
 const minimumTarget={ctx:minimumCtx,externalId:'t1362-minimum-pure-typed-work',title:'窄窗已采集作品',metrics:[{sourceField:'views',value:0}]};
 await commit('workCatalog',minimumTarget);await commit('workMetrics',minimumTarget);
 const minimumCatalog=await collections.listWorks(minimumCtx,{accountId:minimumAccount.id,pageSize:20,cursor:null}),minimumWork=minimumCatalog.items[0];
 if(minimumCatalog.total!==1||minimumCatalog.currentTotal!==1||minimumCatalog.catalogCompleteness!=='verifiedComplete'||!minimumWork||minimumWork.externalId!==minimumTarget.externalId||minimumWork.publicationId!==null||minimumWork.legacyPublicationId!==null||minimumWork.legacyProjectId!==null)throw Error('MINIMUM_CATALOG_READBACK_MISMATCH');
 const minimumMetrics=await collections.readMetrics(minimumCtx,{accountId:minimumAccount.id,platformWorkId:minimumWork.id,pageSize:100,cursor:null}),minimumMetric=minimumMetrics.workMetrics[0];
 if(minimumMetrics.workMetrics.length!==1||minimumMetrics.accountMetrics.length||!minimumMetric||minimumMetric.metricKey!=='view_count'||minimumMetric.value!==0||minimumMetric.availability!=='available'||minimumMetric.unit!=='count'||minimumMetric.window.kind!=='lifetime'||minimumMetric.platformWorkId!==minimumWork.id)throw Error('MINIMUM_METRIC_READBACK_MISMATCH');
 const minimumProjects=await runtime.pool.query('SELECT count(*)::int AS count FROM projects WHERE user_id=$1 AND group_id=$2',[identity.id,minimumGroup.id]);
 if(minimumProjects.rows[0].count!==0)throw Error('MINIMUM_PURE_TYPED_GROUP_HAS_PROJECTS');
 const pureTyped={groupId:pure.id,groupName:pure.name,accountId:zero.accountId,projectCount:0,query:zero.query,browseViews:0};
 const pureTypedByProject={'t1362-normal':pureTyped,'t1362-minimum':{groupId:minimumGroup.id,groupName:minimumGroup.name,accountId:minimumAccount.id,projectCount:0,query:zero.query,browseViews:0,catalogWorkId:minimumWork.id,metricId:minimumMetric.id}};
 const after=await counts();if(after.collection_runs!==18||after.ai_tasks!==0||after.projects!==before.projects||after.publications!==before.publications)throw Error('FIXTURE_ENTITY_COUNTS_CHANGED');
 const finalGroup=await groups.get(base,primary.groupId),finalActive=finalGroup.members.filter(member=>member.status==='active'&&member.leftAt===null);
 if(finalActive.length!==2||!finalActive.some(member=>member.accountId===primary.accountId)||!finalActive.some(member=>member.accountId===account.id))throw Error('GROUP_MEMBER_READBACK_MISMATCH');
 if(createHash('sha256').update(await readFile(dashboardPath)).digest('hex')!==dashboardSha)throw Error('ORIGINAL_SEED_MANIFEST_CHANGED');
 const manifest={schema:'t1362-collected-work-entry-private-seed/v1',root,nonce:owner.nonce,userId:identity.id,seededAt:new Date().toISOString(),dashboardSeedSha256:dashboardSha,primary:{groupId:original.id,groupName:original.name,xiaohongshuAccountId:primary.accountId,kuaishouAccountId:account.id,accountIds:finalActive.map(member=>member.accountId),catalog:{accountId:account.id,workId:work.id,total:catalog.total,currentTotal:catalog.currentTotal,publishedAt:work.publishedAt,legacyProjectId:work.legacyProjectId,publicationId:work.publicationId,legacyPublicationId:work.legacyPublicationId},metrics:metrics.workMetrics.map(metric=>({id:metric.id,platformWorkId:metric.platformWorkId,metricKey:metric.metricKey,value:metric.value,availability:metric.availability,unit:metric.unit,window:metric.window})),expected:{playCount:7,likeCount:0,sourceCatalogWorkCount:1,allPlatformVideoViews:7,originalXiaohongshuQueryUnchanged:true}},pureTyped,pureTypedByProject,emptyGroup:{groupId:empty.id,groupName:empty.name,memberCount:0},counts:{before,after,expectedCollectionSubmissions:18,expectedAiTasks:0},operations,safety:{onlySyntheticPrivateDatabase:true,originalSevenScenarioManifestUnchanged:true,externalAdaptersInstalled:false,modelsInvoked:false,actualPublishingInvoked:false,catalogPromotedToPublication:false,nextMustDisableBackgroundDrivers:true},verificationBoundary:'真实service四次commit与同ID读回；不代签Next HTTP或浏览器验收。两个视口人工确认使用不同纯typed组，不清理或重置引导状态。新同组KS使primary全平台播放合计为7，原primary XHS平台筛选事实不变。'};
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.info(JSON.stringify({seeded:true,manifest:manifestPath,sourceCommits:operations.length,collectionSubmissions:after.collection_runs,aiTaskCount:after.ai_tasks,ownerMatchesReady:true}));
}catch(error){
 await writeFile(join(root,'work-entry-seed-failed.json'),JSON.stringify({at:new Date().toISOString(),errorName:error instanceof Error?error.name:'Error',code:(error as {code?:string}).code??null,completedOperations:operations},null,2)+'\n',{mode:0o600,flag:'wx'});throw error;
}finally{await runtime.pool.end();}
