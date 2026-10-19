import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {it,expect} from 'vitest';
import {createDb,assets,assetFiles,type Db} from '@creatoros/backend';
import {ENDPOINTS,type RequestContext,type WorkMemberRef,type WorkReviewScope} from '@creatoros/contract';
import {createProjectsService,createProjectRepository} from '@creatoros/backend/modules/projects';
import {createArtifactsService} from '@creatoros/backend/modules/artifacts';
import {createAssetsService,createAssetRepository} from '@creatoros/backend/modules/assets';
import {createArticlesService} from '@creatoros/backend/modules/articles';
import {createGraphicPostsService} from '@creatoros/backend/modules/graphic-posts';
import {createPublishingService} from '@creatoros/backend/modules/publishing';
import {createMomentsService} from '@creatoros/backend/modules/moments';
import {createWorkCompositionsService} from '../../modules/work-compositions/work-compositions.service';
import {getOfficialSkillBase,listOfficialSkillBases} from '@creatoros/ai-worker';
import {createSettingsRepository} from '@creatoros/backend/modules/settings';
import {createTransactionalTaskRuntimeResolver} from './transactional-task-runtime';
import {createAiService} from '@creatoros/backend/modules/ai';
import {createWorkReviewRoot} from './work-review-root';
import {createWorkReviewReader,type ReviewOwners} from '@creatoros/backend/modules/review';
import {freezeReview} from '../../modules/review/work-review-fingerprint';
const rootFixtureContext:RequestContext={userId:'reader-user',accountId:'reader-account',source:'user',requestId:'reader-http'};
const ctx=rootFixtureContext;
const unavailable=async():Promise<never>=>{throw Error('本fixture不调用供应商模型或无关owner');};
async function fixture(kind:'article'|'image'|'moments',pg?:{db:Db;ctx:RequestContext;prefix:string}){
 const context=pg?.ctx??rootFixtureContext,opened=pg?null:await createDb(),db=pg?.db??opened!.db;const ctx=context;let seq=0;const deps={now:()=> '2026-10-02T10:00:00.000Z',nextId:(prefix:string)=>`${prefix}-${pg?.prefix??''}${++seq}`};
 const projects=(tx:Db=db)=>createProjectsService(createProjectRepository(tx),deps),artifacts=(tx:Db)=>createArtifactsService({db:tx,...deps,...(pg?{assertProjectOwned:async(c:RequestContext,id:string)=>{await projects(tx).getProject(c,id);}}:{})});
 const asset=(tx:Db=db)=>createAssetsService(createAssetRepository(tx,deps),unavailable,deps);
 const article=(tx:Db=db)=>createArticlesService(tx,{...deps,projects,artifacts,assertAssetFile:(c,id,file,active)=>asset(tx).assertAssetFileOwned(c,id,file,active),resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,submitGeneration:unavailable,readGeneration:unavailable});
 const image=(tx:Db=db)=>createGraphicPostsService(tx,{...deps,projects,artifacts,assertAssetFile:(c,id,file,active)=>asset(tx).assertAssetFileOwned(c,id,file,active),submitTextGeneration:unavailable,readTextGeneration:unavailable});
 const moments=(tx:Db=db)=>createMomentsService({db:tx,...deps,ports:{artifacts,assertProjectOwned:async(c,p,t,lock)=>{await projects(t).getProject(c,p,lock);},assertFile:unavailable,assertSource:unavailable}});
 const project=await projects().createProject(ctx,{title:'真实审核字段',brief:'DB回归'});let member:WorkMemberRef;
 if(kind==='moments'){const row=await moments().create(ctx,{projectId:project.id,clientRequestId:'reader-moments-create'+(pg?.prefix??''),document:{schemaVersion:1,text:'朋友圈真实正文',imageUses:[],sourceRefs:[]}});member={kind,momentsId:row.momentsId};}
 else{const row=kind==='article'?await article().createOutput(ctx,project.id,{title:'真实文章',clientRequestId:'reader-article-create'+(pg?.prefix??'')}):await image().createOutput(ctx,project.id,{title:'真实图文',clientRequestId:'reader-image-create'+(pg?.prefix??'')});member={kind,outputId:row.id};if(kind==='article'){const original=await article().getArticle(ctx,row.id);await article().createVersion(ctx,row.id,{clientRequestId:'reader-initial-title'+(pg?.prefix??''),expectedCurrentVersionId:original.currentVersionId,document:{...original.current,title:'真实文章'}});}if(kind==='image'){const original=await image().getGraphicPost(ctx,row.id);await image().createVersion(ctx,row.id,{clientRequestId:'reader-initial-cards'+(pg?.prefix??''),expectedCurrentVersionId:original.currentVersionId,document:{...original.current,cardBriefs:[{cardId:'a',title:'第一卡',body:'保留卡正文',sourceRefs:[]},{cardId:'b',title:'第二卡',body:'别卡正文',sourceRefs:[]}]}});}}
 const comp=(tx:Db=db)=>createWorkCompositionsService({db:tx,...deps,ports:{artifacts,assertProjectOwned:async(c,p,t,lock)=>{await projects(t).getProject(c,p,lock);},readMember:async(c,_p,m,t=tx)=>{const item=m.kind==='moments'?await moments(t).get(c,m.momentsId):m.kind==='article'?await article(t).getArticle(c,m.outputId):await image(t).getGraphicPost(c,m.outputId);return{kind:'artifact',artifactId:item.artifactId,versionId:item.currentVersionId};},createMember:unavailable,findCreatedMember:async()=>null,assertSource:unavailable,assertRule:unavailable}});
 const composition=await comp().create(ctx,{projectId:project.id,title:'组合',clientRequestId:'reader-comp-create'+(pg?.prefix??'')});await comp().bindMember(ctx,composition.compositionId,{expectedRevision:0,clientRequestId:'reader-comp-bind'+(pg?.prefix??''),member});
 const publicationReads:string[]=[],publicationLocks:string[]=[];
 const publishing=(tx:Db=db)=>createPublishingService({db:tx,...deps,resolveOutputOwner:(c,id)=>projects(tx).getOutputOwnerSummary(c,id),assertCoverOwned:(c,id)=>asset(tx).getAsset(c,id)});
 const owners=(t:Db)=>({projects:projects(t),articles:article(t),graphicPosts:image(t),moments:moments(t),compositions:comp(t),publishing:{listPublicationsByOutputIds:(c,ids)=>publishing(t).listPublicationsByOutputIds(c,ids),getPublication:(c,id)=>{publicationReads.push(id);return publishing(t).getPublication(c,id);},listRevisions:(c,id,page)=>{publicationReads.push(id);return publishing(t).listRevisions(c,id,page);}},assets:asset(t),production:{getEditor:unavailable},outputScripts:{getSavedScript:unavailable}} satisfies ReviewOwners);
 const read=createWorkReviewReader({owners,
  lockMember:async(c,_p,m,t)=>{const item=m.kind==='moments'?await moments(t).get(c,m.momentsId):m.kind==='article'?await article(t).getArticle(c,m.outputId):m.kind==='image'?await image(t).getGraphicPost(c,m.outputId):await unavailable();await artifacts(t).getArtifact(c,item.artifactId,true);},lockPublication:async(c,id,t)=>{publicationLocks.push(id);await publishing(t).getPublication(c,id,true);},dependencies:async()=>[],readSource:unavailable,readRule:unavailable,productionFiles:unavailable});
 const scope=(target:any):WorkReviewScope=>({kind:'field',compositionId:composition.compositionId,member,target});
 const frozen=async(s:WorkReviewScope,c=ctx)=>db.transaction(async t=>freezeReview(s,await read(c,s,t as unknown as Db,true),deps.now()));
 const runtimeDeps={...deps,officialSkills:{get:getOfficialSkillBase,list:listOfficialSkillBases,platformPolicy:()=>({version:'explicit-root-fixture-policy',text:'原官方Skill+真实账号overlay数据库探针，不调用供应商'})},readPinnedAuthority:async()=>({authority:'local' as const,digest:'local'})};
 const aiFor=(t:Db)=>createAiService({db:t,...deps,resolveTaskRuntimeData:createTransactionalTaskRuntimeResolver(t,runtimeDeps),artifacts:{} as never,knowledge:{} as never,candidate:{} as never,learnings:{} as never,publishing:{} as never,materialLinks:{} as never,positioning:{} as never,calibration:{} as never});
 const wakes:string[]=[];const root=createWorkReviewRoot(db,deps,{owners,artifacts,ai:aiFor,positioning:()=>({getStatement:unavailable}),materials:()=>({dependencies:async()=>[]}),sources:{read:unavailable},frozenProductionFiles:{readFrozenFileBinding:async()=>null},wake:async(_c,id)=>{wakes.push(id);}});
 return{opened:{db,client:{close:async()=>{if(opened)await opened.client.close();}}},db,member,composition,article,image,moments,comp,scope,frozen,deps,publishing,publicationReads,publicationLocks,root,wakes,aiFor};
}
// 此系列真实执行PGlite冷初始化/迁移、owner冻结和foreign拒绝；原article现场6706ms，局部期限保留完整断言。
it.each(['article','image','moments'] as const)('%s 从真实原owner读取精确值，隔离账号',async kind=>{const f=await fixture(kind);try{
 const target=kind==='moments'?{kind:'moments_field',momentsId:(f.member as any).momentsId,field:'text'}:kind==='article'?{kind:'article_field',outputId:(f.member as any).outputId,field:'title'}:{kind:'image_card',outputId:(f.member as any).outputId,cardId:'a',field:'body'};
 const result=await f.frozen(f.scope(target));expect(result.context.members[0]!.fields[0]!.value).toBe(kind==='moments'?'朋友圈真实正文':kind==='article'?'真实文章':'保留卡正文');
 await expect(f.frozen(f.scope(target),{...ctx,accountId:'another-account'})).rejects.toThrow();
 }finally{await f.opened.client.close();}},180000);
it('真实图文另卡编辑及重排不改变单卡正文指纹；明确字段改变失效',async()=>{const f=await fixture('image');try{
 const outputId=(f.member as any).outputId,s=f.scope({kind:'image_card',outputId,cardId:'a',field:'body'}),before=await f.frozen(s),item=await f.image().getGraphicPost(ctx,outputId);
 await f.image().createVersion(ctx,outputId,{clientRequestId:'reader-card-b-change',expectedCurrentVersionId:item.currentVersionId,document:{...item.current,cardBriefs:[{...item.current.cardBriefs![1]!,body:'修改别卡'},item.current.cardBriefs![0]!]}});
 const after=await f.frozen(s);expect(after.snapshot.fingerprint).toBe(before.snapshot.fingerprint);expect(after.snapshot.members[0]!.ownerVersion).not.toEqual(before.snapshot.members[0]!.ownerVersion);
 const next=await f.image().getGraphicPost(ctx,outputId);await f.image().createVersion(ctx,outputId,{clientRequestId:'reader-card-a-change',expectedCurrentVersionId:next.currentVersionId,document:{...next.current,cardBriefs:next.current.cardBriefs!.map(c=>c.cardId==='a'?{...c,body:'修改本卡'}:c)}});expect((await f.frozen(s)).snapshot.fingerprint).not.toBe(before.snapshot.fingerprint);
 await expect(f.frozen(f.scope({kind:'image_card',outputId,cardId:'missing',field:'body'}))).rejects.toThrow();
 }finally{await f.opened.client.close();}});

it('真实文件行摘要及cardId槽位：别卡顺序不失效，精确文件变化失效',async()=>{const f=await fixture('image');try{
 for(const id of ['file-a','file-b']){await f.db.insert(assets).values({id,userId:ctx.userId,accountId:ctx.accountId!,assetType:'image',name:id,status:'active',currentFileId:id+'-1',createdAt:f.deps.now(),updatedAt:f.deps.now()});await f.db.insert(assetFiles).values({id:id+'-1',assetId:id,versionNumber:1,storageKey:id+'.png',mimeType:'image/png',fileSize:68,checksum:id+'-checksum',createdAt:f.deps.now()});}
 const outputId=(f.member as any).outputId,item=await f.image().getGraphicPost(ctx,outputId);await f.image().createVersion(ctx,outputId,{clientRequestId:'reader-real-image',expectedCurrentVersionId:item.currentVersionId,document:{...item.current,imageUses:[{assetId:'file-a',assetFileId:'file-a-1',role:'card',cardId:'a',order:0}]}});
 const scope=f.scope({kind:'image_card',outputId,cardId:'a',field:'imageUse'}),before=await f.frozen(scope);expect(before.context.members[0]!.fields[0]!.files[0]!.contentHash).toBe('file-a-checksum');expect(before.context.members[0]!.fields[0]!.value).not.toHaveProperty('order');
 const current=await f.image().getGraphicPost(ctx,outputId);await f.image().createVersion(ctx,outputId,{clientRequestId:'reader-other-card-image',expectedCurrentVersionId:current.currentVersionId,document:{...current.current,imageUses:[{assetId:'file-b',assetFileId:'file-b-1',role:'card',cardId:'b',order:0},...current.current.imageUses.map(x=>({...x,order:1}))]}});expect((await f.frozen(scope)).snapshot.fingerprint).toBe(before.snapshot.fingerprint);
 const edited=await f.image().getGraphicPost(ctx,outputId);await f.image().createVersion(ctx,outputId,{clientRequestId:'reader-card-file-change',expectedCurrentVersionId:edited.currentVersionId,document:{...edited.current,imageUses:edited.current.imageUses.map(x=>x.cardId==='a'?{...x,assetId:'file-b',assetFileId:'file-b-1'}:x)}});expect((await f.frozen(scope)).snapshot.fingerprint).not.toBe(before.snapshot.fingerprint);
 }finally{await f.opened.client.close();}});
it('真实组合selection改变只使组合指纹失效，不影响明确文章字段',async()=>{const f=await fixture('article');try{
 const outputId=(f.member as any).outputId,s=f.scope({kind:'article_field',outputId,field:'title'}),before=await f.frozen(s),compositionScope:WorkReviewScope={kind:'composition',compositionId:f.composition.compositionId};
 const empty=await f.frozen(compositionScope),current=await f.comp().get(ctx,f.composition.compositionId);await f.comp().saveSelection(ctx,current.compositionId,{clientRequestId:'reader-select-article',expectedRevision:current.currentRevision,selection:['article']});
 const selected=await f.frozen(compositionScope);expect(empty.context.members).toEqual([]);expect(selected.context.members).toHaveLength(1);expect(selected.snapshot.fingerprint).not.toBe(empty.snapshot.fingerprint);expect((await f.frozen(s)).snapshot.fingerprint).toBe(before.snapshot.fingerprint);
 }finally{await f.opened.client.close();}});

it.each(['title','description','platformTags'] as const)('真实发布稿%s不被历史封面缺file阻断，精确pub先筛后锁读',async field=>{const f=await fixture('image');try{
 const outputId=(f.member as any).outputId,pub=await f.publishing().createPublication(ctx,outputId,{platform:'xiaohongshu',accountReference:'reader-account'}),other=await f.publishing().createPublication(ctx,outputId,{platform:'douyin',accountReference:'reader-account'});
 for(const id of ['legacy-cover','other-legacy-cover'])await f.db.insert(assets).values({id,userId:ctx.userId,accountId:ctx.accountId!,assetType:'image',name:id,status:'active',createdAt:f.deps.now(),updatedAt:f.deps.now()});
 await f.publishing().createRevision(ctx,pub.id,{title:'真实发布标题',description:'真实发布简介',platformTags:['真实标签'],coverAssetId:'legacy-cover'});
 await f.publishing().createRevision(ctx,other.id,{title:'不应读取另稿',description:'另稿',coverAssetId:'other-legacy-cover'});
 f.publicationReads.length=0;f.publicationLocks.length=0;const scope=f.scope({kind:'publication_field',outputId,publicationId:pub.id,field}),result=await f.frozen(scope);
 expect(result.context.members[0]!.fields[0]!.value).toEqual(field==='title'?'真实发布标题':field==='description'?'真实发布简介':['真实标签']);expect(f.publicationReads.length).toBeGreaterThan(0);expect(f.publicationReads.every(id=>id===pub.id)).toBe(true);expect(f.publicationLocks).toEqual([pub.id]);
 await expect(f.frozen(f.scope({kind:'publication_field',outputId,publicationId:pub.id,field:'cover'}))).rejects.toThrow('REVIEW_PUBLICATION_COVER_FILE_UNAVAILABLE');
 if(field==='title'){await expect(f.frozen({kind:'member',compositionId:f.composition.compositionId,member:f.member})).rejects.toThrow('REVIEW_PUBLICATION_COVER_FILE_UNAVAILABLE');const current=await f.comp().get(ctx,f.composition.compositionId);await f.comp().saveSelection(ctx,current.compositionId,{clientRequestId:'reader-pub-select-image',expectedRevision:current.currentRevision,selection:['image']});await expect(f.frozen({kind:'composition',compositionId:current.compositionId})).rejects.toThrow('REVIEW_PUBLICATION_COVER_FILE_UNAVAILABLE');}
 }finally{await f.opened.client.close();}});
it('指定发布稿不锁不读同作品其他发布稿',async()=>{const f=await fixture('image');try{
 const outputId=(f.member as any).outputId,pub=await f.publishing().createPublication(ctx,outputId,{platform:'xiaohongshu',accountReference:'reader-account'}),other=await f.publishing().createPublication(ctx,outputId,{platform:'douyin',accountReference:'reader-account'});
 f.publicationReads.length=0;f.publicationLocks.length=0;await f.frozen(f.scope({kind:'publication_field',outputId,publicationId:pub.id,field:'title'}));expect(f.publicationLocks).toEqual([pub.id]);expect(f.publicationReads).not.toContain(other.id);
 }finally{await f.opened.client.close();}});

it('根装配原AI预约失回复重放仍是同任务；真实审核transport读当前字段/请求',async()=>{const f=await fixture('moments');try{
 const momentsId=(f.member as any).momentsId,scope=f.scope({kind:'moments_field',momentsId,field:'text'}),input={clientRequestId:'root-original-review-create',scope};
 const base=getOfficialSkillBase('work.review')!;await createSettingsRepository(f.db,f.deps).putAccountSkillOverlay(ctx,{skillId:'work.review',expectedRevision:null,observedBaseVersion:base.baseVersion,overlay:{system:'真实账号审核覆盖层'}});
 const report=await f.root.service.create(ctx,input),again=await f.root.service.create(ctx,input);const runtime=await f.aiFor(f.db).getTaskRuntimeData(ctx,report.taskId!);expect(JSON.stringify(runtime.skillSnapshot)).toContain('真实账号审核覆盖层');expect(runtime.modelAuthority).toBe('local');expect(runtime.modelAuthorityDigest).toBe('local');expect(again.reportId).toBe(report.reportId);expect(again.taskId).toBe(report.taskId);expect(f.wakes.every(id=>id===report.taskId)).toBe(true);
 expect((await f.root.service.request(ctx,input.clientRequestId)).reportId).toBe(report.reportId);
 expect(await f.root.transport.request(ENDPOINTS.getWorkReview,{params:{reportId:report.reportId},query:undefined,body:undefined},ctx)).toMatchObject({data:{reportId:report.reportId,taskId:report.taskId}});
 const frozen=await f.root.readCurrent(ctx,scope,f.db,false);const task=await f.root.businessAdapters['work.review'].prepare(ctx,{id:report.taskId!,retryOfTaskId:null,projectId:frozen.projectId,inputData:{workReviewReportId:report.reportId,snapshotFingerprint:report.snapshot.fingerprint},skillSnapshot:{} as never});expect(task.reviewContext).toContain('朋友圈真实正文');
 const status=await f.root.service.status(ctx,scope);expect(await f.root.transport.request(ENDPOINTS.confirmWorkReview,{params:undefined,query:undefined,body:{mode:'manual',clientRequestId:'root-original-review-confirm',scope,expectedFingerprint:status.currentFingerprint,historicalBasis:[]}},ctx)).toMatchObject({data:{status:{state:'confirmed_current',modelVerification:'not_verified'},confirmation:{mode:'manual',reportId:null}}});
 }finally{await f.opened.client.close();}});


import {OwnedPostgresPool as Pool ,assertOwnedPostgresUrl} from '../../test-fixtures/owned-postgres';
import {randomUUID} from 'node:crypto';
import {createRuntimeDb} from '../../db';
import {createAccountGroupService} from '../../modules/platform-account/account-group.service';
import {aiTasks,executionTasks,executionCalls} from '@creatoros/backend';
import {workReviewReports,workReviewRequests} from '../../schema/work-reviews';
import {createStructuredBusinessExecutionService} from '../../modules/ai-runtime/structured-business-execution.service';
const reviewLockPg=process.env.CREATOROS_TEST_POSTGRES_URL;
it.skipIf(!reviewLockPg)('T1062真实PG原审核root→actualAi(tx)同组双父Lock观察及两个阶段原回执恢复',async()=>{
 const url=new URL(reviewLockPg!);assertOwnedPostgresUrl(url.toString());
 const name=`t1062_review_lock_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:reviewLockPg});await admin.query(`CREATE DATABASE ${name}`);url.pathname=`/${name}`;
 const runtimes:Array<Awaited<ReturnType<typeof createRuntimeDb>>>=[];let held=false,blocker:import('pg').PoolClient|undefined,pending:Promise<unknown>[]=[];
 async function open(role:string){const scoped=new URL(url);scoped.searchParams.set('application_name',`${name}_${role}`);const runtime=await createRuntimeDb({connectionString:scoped.toString()});runtime.pool.options.max=1;runtimes.push(runtime);return runtime;}
 try{
  const setup=await open('setup'),left=await open('left'),right=await open('right');let n=0;const deps={now:()=>new Date().toISOString(),nextId:(p:string)=>`${p}-${++n}`},user:RequestContext={userId:name,requestId:'review-lock-public',source:'user'};
  const group=await createAccountGroupService({db:setup.db,...deps}).create(user,{name:'审核真实空组',idempotencyKey:'review-lock-group'}),scope={...user,groupId:group.id,groupVersion:group.version,accountId:null};
  const fixtures=[await fixture('moments',{db:left.db,ctx:scope,prefix:'left-'}),await fixture('moments',{db:right.db,ctx:scope,prefix:'right-'})];
  const inputs=fixtures.map((f,i)=>{if(f.member.kind!=='moments')throw Error('fixture真实member应为moments');return{clientRequestId:`review-pg-public-create-${i}`,scope:f.scope({kind:'moments_field',momentsId:f.member.momentsId,field:'text'})};});
  blocker=await setup.pool.connect();await blocker.query('BEGIN');held=true;await blocker.query('SELECT id FROM account_groups WHERE id=$1 FOR SHARE',[group.id]);
  const results=Promise.allSettled(fixtures.map((f,i)=>f.root.service.create(scope,inputs[i]!)));pending=[results];
  let observed=false;const deadline=Date.now()+6000;
  try{while(Date.now()<deadline){const rows=await admin.query('SELECT application_name,wait_event_type,wait_event,query FROM pg_stat_activity WHERE datname=$1 AND application_name=ANY($2::text[]) AND wait_event_type=\'Lock\'',[name,[`${name}_left`,`${name}_right`]]);if(rows.rows.length===2){observed=true;console.info('T1062审核真实锁观察',rows.rows);break;}await new Promise(resolve=>setTimeout(resolve,10));}}
  finally{held=false;await blocker.query('ROLLBACK');blocker.release();blocker=undefined;}
  expect(observed).toBe(true);const settled=await results;console.info('T1062审核公共锁结果',settled);for(const result of settled)expect(result.status).toBe('fulfilled');
  const reports=await setup.db.select().from(workReviewReports),tasks=await setup.db.select().from(aiTasks);expect(reports).toHaveLength(2);expect(tasks).toHaveLength(2);expect(new Set(tasks.map(t=>t.projectId)).size).toBe(2);for(const task of tasks)expect(task).toMatchObject({userId:name,groupId:group.id,accountId:null,groupVersion:group.version,membershipVersion:null});
  for(let i=0;i<2;i++){const f=fixtures[i]!,report=await f.root.service.create(scope,inputs[i]!);if(!report.taskId)throw Error('原report无task');await createStructuredBusinessExecutionService(f.db,{adapters:f.root.businessAdapters,budget:{maxCalls:4,maxTokens:100000,deadlineMs:600000},maxOutputTokens:2048}).prepare(scope,report.taskId);}
  expect(await setup.db.select().from(executionTasks)).toHaveLength(2);const before={tasks:await setup.db.select().from(aiTasks),reports:await setup.db.select().from(workReviewReports),requests:await setup.db.select().from(workReviewRequests),executions:await setup.db.select().from(executionTasks)};
  await Promise.all(fixtures.map((f,i)=>f.root.service.create({...scope,accountId:'仅平台筛选'},inputs[i]!)));
  expect(await setup.db.select().from(aiTasks)).toEqual(before.tasks);expect(await setup.db.select().from(workReviewReports)).toEqual(before.reports);expect(await setup.db.select().from(workReviewRequests)).toEqual(before.requests);expect(await setup.db.select().from(executionTasks)).toEqual(before.executions);expect(await setup.db.select().from(executionCalls)).toHaveLength(0);
 }finally{if(held&&blocker)await blocker.query('ROLLBACK');await Promise.allSettled(pending);blocker?.release();const closed=await Promise.allSettled(runtimes.map(runtime=>runtime.pool.end()));try{await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);}finally{await admin.end();}for(const result of closed)if(result.status==='rejected')throw result.reason;}
},180000);
