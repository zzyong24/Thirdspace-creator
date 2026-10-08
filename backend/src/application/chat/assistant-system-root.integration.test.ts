import {z} from "zod";
import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createDb,assets,entityTags,intelligenceCollections,aiTasks,aiTaskResults,canvasGenerationLinks,executionTasks,executionCalls,and,eq,sql,type Db} from "@creatoros/backend";
import {creativeCanvases} from "../../schema/creative-canvas";
import {accountGroups} from "../../schema/account-groups";
import {canvasCreateProposalInputSchema,canvasCreateCandidateSchema,emptyCanvasDocument,assistantActionInputSchema,type AssistantActionInput,type AssistantReadInput,assistantReadInputSchema,assistantReadEndpoints,type RequestContext} from "@creatoros/contract";
import {chatToolProviderName} from "@creatoros/contract/execution-worker";
import {createAiRepository} from "../../modules/ai/ai.repository";
import {createChatTurnSubmissionService} from "../../modules/ai/chat-turn-submission.service";
import {createChatHostContextReader} from "../../modules/ai/chat-host-context.service";
import {createAssistantSystemRoot,createAssistantActionOwners} from "./assistant-system-root";
import {createProjectRepository,createProjectsService,createProjectsTransport} from "../../modules/projects";
import {createKnowledgeRepository,createKnowledgeService,createKnowledgeTransport} from "../../modules/knowledge";
import {createCandidateService,createCandidateTransport} from '../../modules/candidate';
import {createArtifactsService,createArtifactsTransport} from '../../modules/artifacts';
import {createArticlesService} from '../../modules/articles';
import {createGraphicPostsService} from '../../modules/graphic-posts';
import {createLegacyScriptRange} from '../../modules/artifacts/legacy-script-patch';
import {createPositioningService} from '../../modules/positioning';
import {createSettingsService,createSettingsRepository} from '../../modules/settings';
import {createSchedulingService} from '../../modules/scheduling';
import {createAccountGroupService,createPlatformAccountService,createMembershipLockService,createAccountBindingService} from "../../modules/platform-account";
import {createPublishingService,createPublishingTransport} from '../../modules/publishing';
import {createContentCalendarService} from '../../modules/content-calendar';
import {createIntelligenceService} from '../../modules/intelligence';
import {createAssetTagProposalService} from '../../modules/taxonomy';
import {createAssetsTransport,createMockObjectStorage} from '../../modules/assets';
import {createFixtureAssetsService} from '../../test-fixtures/owner-services';
import {createChatSystemToolHost} from "../../modules/ai-runtime/chat-system-tool-host";
import {buildChatTools} from "../../modules/ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../../modules/ai-runtime/chat-tool-definitions";
import {ENDPOINTS,createClient} from "@creatoros/contract";
import {createAiService} from '../../modules/ai/ai.service';
import {createCreativeCanvasRoot} from '../generation/creative-canvas-root';
import {createAssetBusinessExecutionService} from '../../modules/ai-runtime/asset-business-execution.service';
import {createCreativeCanvasService} from "../../modules/creative-canvas/creative-canvas.service";
import {createPersistentTaskService} from "../../modules/execution/persistent-task.service";
import {createExecutionCallLedgerService} from "../../modules/execution/execution-call-ledger.service";
import {createExecutionGenerationPorts} from "../../modules/execution/execution-generation-ports.service";
import {createExecutionChatToolPorts} from "../../modules/execution/execution-chat-tool-ports.service";
import {prepareChatToolParameters} from "../../modules/ai-runtime/chat-tool-parameters";
import type {ChatHostContext} from "../../modules/ai/chat-host-context";
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import {drizzle as drizzlePg} from 'drizzle-orm/node-postgres';
import {createRuntimeDb} from '../../db';

let db:Db,close:()=>Promise<void>,seq=0;
let pgPool:Pool|undefined,pgUrl:string|undefined;
const now=()=>"2026-10-08T02:00:00.000Z",budget={maxCalls:12,maxTokens:10000,deadlineMs:120000};
beforeAll(async()=>{
 const url=process.env.CREATOROS_T1074_ISOLATED_PG_URL;
 if(!url){const f=await createDb();db=f.db;close=()=>f.client.close();return;}
 const parsed=new URL(url);
 if(parsed.hostname!=='127.0.0.1'||parsed.username!=='creatoros_t1074'||parsed.pathname!=='/postgres')throw Error('只允许本轮明确的隔离PG服务');
 const name=`t1074_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});
 await admin.query(`CREATE DATABASE ${name}`);parsed.pathname=`/${name}`;pgUrl=parsed.toString();
 try{const runtime=await createRuntimeDb({connectionString:pgUrl});db=runtime.db;pgPool=runtime.pool;
  close=async()=>{await runtime.pool.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();};
 }catch(error){await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();throw error;}
},120000);
afterAll(async()=>close());
it('生产动作组合公开全部19个原owner适配器，而非只在工具目录声明',async()=>{
 const module=await import('./assistant-system-root');
 expect(module).toHaveProperty('createAssistantActionOwners',expect.any(Function));
});
it('功能发现按真实域或完整读取/动作ID精确定位，不把操作ID误报成空目录',async()=>{
 const f=await fixture(true,false,{discoverReads:true,action:assistantActionInputSchema.parse({kind:'project.create',title:'中性目录验收'})}),before=await f.state();
 for(const [id,domain] of [['project','project'],['project.create','project'],['topic.create','project'],['projects.list','project'],['knowledge.create','material'],['assets.search','material'],['calendar.plan','calendar'],['automation.createDraft','calendar'],['scheduledJobs.get','calendar'],['canvas.capabilities','canvas']] as const){
  const result=await f.root.host.features(f.ctx,{feature:id,offset:0,limit:1},f.frozen) as {rows:Array<{feature:string;reads:string[];actions:string[]}>;total:number;nextOffset:number|null};
  expect(result.rows.map(row=>row.feature),id).toEqual([domain]);
  expect(result.total).toBe(1);expect(result.nextOffset).toBeNull();
 }
 for(const id of ['project.cre','topic','automation','ASSETS.SEARCH','任意操作','settings.models.put']){
  const result=await f.root.host.features(f.ctx,{feature:id,offset:0,limit:20},f.frozen) as {rows:unknown[];total:number};
  expect(result.rows,id).toEqual([]);expect(result.total).toBe(0);
 }
 const all=await f.root.host.features(f.ctx,{offset:0,limit:20},f.frozen) as {rows:unknown[];total:number};
 expect(all.total).toBe(14);expect(all.rows).toHaveLength(14);
 expect(await f.state()).toEqual(before);
 const unbound=await fixture(true);
 const unavailable=await unbound.root.host.features(unbound.ctx,{feature:'project.create',offset:0,limit:20},unbound.frozen) as {rows:unknown[];total:number};
 expect(unavailable.rows).toEqual([]);expect(unavailable.total).toBe(0);
});
async function fixture(group=false,generate=false,options:{discoverReads?:boolean;parentDeadlineMs?:number;runtimeDelayMs?:number;wakeFailure?:boolean;attachDelayMs?:number;receiptDelayMs?:number;action?:AssistantActionInput;derivedFailure?:boolean;tagAssets?:boolean;observeTags?:boolean;tagObservationRace?:boolean;workAction?:'script.patch'|'article.save'|'graphic.save';workflowAction?:'publication.prepare'|'calendar.plan'|'account.bind.start';assignedCalendar?:boolean;ownerAction?:'topic.promote'|'radar.collection.create';radarParent?:boolean;beforePromotionCreate?:()=>Promise<void>;currentEditor?:boolean;readKind?:'knowledge.list'|'projects.list'|'artifacts.list'|'artifacts.versions.list'|'candidates.list'|'outputs.publications.list'|'publications.revisions.list'}={}){
 let clock=Date.parse(now());const clockNow=()=>new Date(clock).toISOString();
 const wake=vi.fn(async()=>{if(options.wakeFailure)throw Error('提交后唤醒失败');});

 const ctx:RequestContext={userId:"adoption-user",accountId:group?null:`adoption-account-${++seq}`,...(group?{groupId:`adoption-group-${++seq}`,groupVersion:1}:{}),requestId:"adopt-test",source:"user"};
 if(ctx.groupId)await db.insert(accountGroups).values({id:ctx.groupId,userId:ctx.userId,name:"中性验收组",status:"active",version:1,createdAt:now(),updatedAt:now()});
 const failPort=async()=>{throw Error("本验收夹具没有项目或媒体引用");};
 let root!:Awaited<ReturnType<typeof createAssistantSystemRoot>>;
 const aiFor=(store:Db)=>createAiService({db:store,now:clockNow,nextId:prefix=>`${prefix}-asset-${++seq}`,artifacts:{createVersion:failPort},knowledge:{createKnowledge:failPort},candidate:{createFromAIResult:failPort,enrichCard:failPort},learnings:{createLearning:failPort},publishing:{createPublicationFromDraft:failPort},materialLinks:{link:failPort},positioning:{upsertProfile:failPort,createStatementVersion:failPort},calibration:{createDraftPrediction:failPort},resolveTaskRuntimeData:async()=>{clock+=options.runtimeDelayMs??0;return {};}});
 const creativeRoot=createCreativeCanvasRoot(db,{now:clockNow},{ai:aiFor,assets:()=>({getAsset:failPort,readMediaFile:failPort,readImageReference:failPort,getAssetFileDownloadUrl:failPort}),projects:()=>({getProject:failPort}),resolveCapability:async()=>({provider:'openai',model:'fixture-image'}),assetLimit:{maxCalls:6,maxTokens:1_000_000,deadlineMs:1_800_000},wake,projectCandidate:()=>{throw Error("本夹具不调用素材产物采纳");},assertProposalAdmission:(c,input,tx)=>root.service.assertGenerationAdmission(c,input,tx)});
 const canvas=creativeRoot.service;
 const assetTags=createAssetTagProposalService(db,{now:clockNow,nextId:prefix=>`${prefix}-tag-${++seq}`});
 const observeTagTargets={prepare:vi.fn(async(c:RequestContext,ids:string[])=>{const targets=await assetTags.prepare(c,ids);if(options.tagObservationRace)await db.update(assets).set({name:'并发改名'}).where(eq(assets.id,ids[0]!));return targets;})};
 const assetsTransport=createAssetsTransport(()=>createFixtureAssetsService(db,{now:clockNow,nextId:p=>`${p}-asset-read-${++seq}`},async()=>createMockObjectStorage({nextKey:()=> 'unused-read'}),{now:clockNow,nextId:p=>`${p}-asset-read-${++seq}`}));
 let action=options.action;
 if(options.tagAssets){
  const ids=[`asset-B-${++seq}`,`asset_a-${++seq}`];
  await db.insert(assets).values(ids.map(id=>({id,userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId??null,name:id,assetType:'image',createdAt:clockNow(),updatedAt:clockNow()})));
  action={kind:'asset.tag',targets:await assetTags.prepare(ctx,ids),tag:'中性验收标签'};
 }
 const derivedEffect=vi.fn(async()=>{}),afterCommit=vi.fn(async()=>{});
 const bindingCapabilities:Awaited<ReturnType<ReturnType<typeof createPlatformAccountService>['getBindingCapabilities']>>=options.workflowAction==='account.bind.start'?[{platform:'douyin',bind:{available:true,method:'qr',reason:'隔离扫码端口'},collect:{available:false,reason:'不调用采集'},publish:{available:false,reason:'不调用发布'},draft:{available:false,reason:'不调用草稿'},manual:{available:true,reason:'原手工登记'}}]:[];
 const actionServices=(store:Db)=>{
  const deps={now:clockNow,nextId:(prefix:string)=>`${prefix}-action-${++seq}`},projects=createProjectsService(createProjectRepository(store),deps),knowledge=createKnowledgeService(createKnowledgeRepository(store,deps));
  const settings=createSettingsService(()=>createSettingsRepository(store,deps),failPort,failPort,undefined,async()=>({migrated:0,skipped:true}),async(c,write)=>store.transaction(async tx=>{
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('creatoros:preferences'),hashtext(${c.userId}))`);return write(createSettingsRepository(tx as unknown as Db,deps));
  }));
  const candidates=createCandidateService({db:store,...deps,projects:{createProject:async(c,input)=>{await options.beforePromotionCreate?.();return {id:(await projects.createProject(c,input)).id};}},ingestion:{assertRunExists:failPort}});
  const projectsFor=(tx:Db)=>createProjectsService(createProjectRepository(tx),deps);
  const artifactsFor=(tx:Db)=>createArtifactsService({db:tx,...deps,assertProjectOwned:(c,id)=>projectsFor(tx).getProject(c,id),resolveOutputProjectId:(c,id)=>projectsFor(tx).getProjectIdByOutput(c,id)});
  const articles=createArticlesService(store,{...deps,projects:projectsFor,artifacts:artifactsFor,assertAssetFile:failPort,resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,submitGeneration:failPort,readGeneration:failPort});
  const graphicPosts=createGraphicPostsService(store,{...deps,projects:projectsFor,artifacts:artifactsFor,assertAssetFile:failPort});
  const artifacts=artifactsFor(store);
  const accounts=createPlatformAccountService({db:store,...deps,bindingCapabilities:async()=>bindingCapabilities});
  const publishing=createPublishingService({db:store,...deps,membership:createMembershipLockService(store),assertTargetAccount:(c,target)=>accounts.assertOwnedAccount(c,target.accountId,target.platform),resolveOutputOwner:(c,id)=>projects.getOutputOwnerSummary(c,id),listOutputIdsByProject:(c,id)=>projects.listOutputIdsByProject(c,id)});
  const calendar=createContentCalendarService({db:store,...deps,clock:{now:clockNow},platformAccounts:accounts,publishing:{isOutputPublished:async(c,id)=>(await publishing.listPublications(c,id,{limit:100,offset:0})).some(row=>row.status==='published')},candidates:{exists:async(c,id)=>{try{await candidates.getCandidate(c,id);return true;}catch{return false;}}},notifications:{notify:async()=>{}},identity:{getEffectiveTimezone:async()=> 'UTC'},projects,schedulePublishing:publishing});
  return {projects,knowledge,candidates,articles,graphicPosts,artifacts,accounts,publishing,calendar,intelligence:createIntelligenceService(store,{...deps,tasks:createPersistentTaskService(store,{now:clockNow})}),settings,scheduling:createSchedulingService({db:store,...deps}),positioning:createPositioningService({db:store,...deps,projects:{getProjectSubject:failPort}}),groups:createAccountGroupService({db:store,...deps}),writes:{candidates:createCandidateTransport(()=>candidates),projects:createProjectsTransport(()=>({service:projects,repo:createProjectRepository(store)})),artifacts:createArtifactsTransport(()=>artifacts),knowledge:createKnowledgeTransport(()=>knowledge),publishing:createPublishingTransport(()=>publishing)}};
 };
 if(options.ownerAction==='topic.promote'){
  const candidate=await actionServices(db).candidates.createCandidate(ctx,{title:'中性选题立项',angle:'验证候选到项目的原服务映射',source:'trend'});action={kind:'topic.promote',candidateId:candidate.id};
 }else if(options.ownerAction==='radar.collection.create'){
  const parent=options.radarParent?await actionServices(db).intelligence.createCollection(ctx,{name:`中性父分类-${++seq}`,idempotencyKey:`parent-${seq}`}):null;
  action={kind:'radar.collection.create',name:`中性雷达分类-${++seq}`,parentId:parent?.id??null};
 }
 if(options.workAction){
  const services=actionServices(db),project=await services.projects.createProject(ctx,{title:'中性创作采用验收',brief:'仅验证原作品保存，不调用生成供应商'});
  if(options.workAction==='script.patch'){
   const artifact=await services.artifacts.createArtifact(ctx,{projectId:project.id,title:'中性脚本',artifactType:'output_script',stage:'script'}),text='开头😀\r\n原句需要调整。\r\n结尾保留。';
   const version=await services.artifacts.createVersion(ctx,artifact.id,{contentText:text,changeSummary:'原稿'});
   action={kind:'script.patch',artifactId:artifact.id,expectedVersionId:version.id,sectionId:createLegacyScriptRange(text,'原句需要调整。'),expectedOriginalText:'原句需要调整。',replacementText:'调整后的准确表达。',changeSummary:'仅调整指定原句'};
  }else if(options.workAction==='article.save'){
   const output=await services.articles.createOutput(ctx,project.id,{title:'中性文章',clientRequestId:`article-original-${++seq}`}),initial=await services.articles.getArticle(ctx,output.id);
   action={kind:'article.save',outputId:output.id,expectedCurrentVersionId:initial.currentVersionId,document:{...initial.current,title:'采用后的文章标题',summary:'保留真实来源，不自动发布。'}};
  }else{
   const output=await services.graphicPosts.createOutput(ctx,project.id,{title:'中性图文',targetPlatform:'xiaohongshu',clientRequestId:`graphic-original-${++seq}`}),initial=await services.graphicPosts.getGraphicPost(ctx,output.id);
   action={kind:'graphic.save',outputId:output.id,expectedCurrentVersionId:initial.currentVersionId,document:{...initial.current,title:'采用后的图文标题',body:'正文包含中文和😀，保存后可继续微调。'}};
  }
 }
 let workflowProjectId:string|undefined;
 if(options.workflowAction==='account.bind.start')action={kind:'account.bind.start',platform:'douyin',expectedGroupVersion:1};
 else if(options.workflowAction){
  const services=actionServices(db),project=await services.projects.createProject(ctx,{title:'中性排期与发布准备',brief:'不执行外部发布'});workflowProjectId=project.id;
  const account=options.workflowAction==='publication.prepare'||options.assignedCalendar?await services.accounts.createAccount(ctx,{platform:'xiaohongshu',accountHandle:'中性验收账号'}):null;
  if(options.workflowAction==='calendar.plan')action={kind:'calendar.plan',projectId:project.id,plannedDate:'2026-10-09',note:'仅保存计划',targetAccountId:account?.id??null};
  else{
   const output=await services.projects.createOutput(ctx,project.id,{contentType:'image',title:'中性发布物料'});
   action={kind:'publication.prepare',outputId:output.id,platform:'xiaohongshu',accountId:account!.id,accountReference:'中性验收账号'};
  }
 }
 const bindingWake=vi.fn(),bindingStage=vi.fn(failPort);
 const binding=options.workflowAction==='account.bind.start'?createAccountBindingService({db,now:clockNow,nextId:prefix=>`${prefix}-bind-${++seq}`,wake:bindingWake,capabilities:async()=>bindingCapabilities,stage:{createStaging:bindingStage,login:failPort,identity:failPort,discard:async()=>{},commit:failPort}}):undefined;
 if(action?.kind==='automation.enable'){
  const job=await actionServices(db).scheduling.createJob(ctx,{name:'中性原自动化',sourceKind:'topic.daily',prompt:'读取中性选题',schedule:'0 9 * * *',enabled:false});
  action={...action,jobId:job.id};
 }
 const actualOwners=action?createAssistantActionOwners(db,{afterCommit,forStore:(store,deferred)=>{
  if(options.derivedFailure&&deferred){deferred.push(async()=>{throw Error('搜索索引派生失败');},derivedEffect);}
  return actionServices(store) as never;
 },binding:binding??{reserveInTransaction:failPort,wakeReserved:()=>{throw Error('该中性例不发起扫码');}},assetTags}):{};
 // 透明等待注入：INSERT仍由真实PGlite事务完成，随后只推进验收时钟。
 const rootDb=options.receiptDelayMs?new Proxy(db,{get(target,property){
  if(property==='transaction')return (body:Parameters<Db['transaction']>[0])=>target.transaction(tx=>body(new Proxy(tx,{get(t,key){
   if(key==='insert')return (table:unknown)=>{
    const insert=t.insert(table as never);if(table!==aiTaskResults)return insert;
    return new Proxy(insert,{get(builder,name){if(name==='values')return (...args:unknown[])=>{const query=builder.values(...args as [never]);return new Proxy(query,{get(q,n){if(n==='then')return (resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown)=>q.then(value=>{clock+=options.receiptDelayMs!;return resolve(value);},reject);const value=Reflect.get(q,n);return typeof value==='function'?value.bind(q):value;}});};const value=Reflect.get(builder,name);return typeof value==='function'?value.bind(builder):value;}});
   };const value=Reflect.get(t,key);return typeof value==='function'?value.bind(t):value;}})));
  const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
 }}):db;
 root=await createAssistantSystemRoot(rootDb,{canvas,assetTags:observeTagTargets,...(generate?{generation:{...creativeRoot.generation!,attach:async(...args:Parameters<NonNullable<typeof creativeRoot.generation>['attach']>)=>{const result=await creativeRoot.generation!.attach(...args);clock+=options.attachDelayMs??0;return result;}}}:{}),actions:actualOwners,read:async(c,endpoint,input)=>{
  if(endpoint.id==='assets.get')return z.object({data:z.unknown(),meta:z.unknown().optional()}).parse(await assetsTransport.request(endpoint,{params:input.params,query:input.query,body:undefined} as never,c));
  if(endpoint.id==='canvas.list')return {data:await canvas.list(c)};
  if(endpoint.id==='canvas.get')return {data:await canvas.get(c,(input.params as {canvasId:string}).canvasId)};
  if(endpoint.id==='knowledge.list')return z.object({data:z.unknown(),meta:z.unknown().optional()}).parse(await actionServices(db).writes.knowledge.request(endpoint,{params:input.params,query:input.query,body:undefined} as never,c));
  if(endpoint.id==='projects.list')return z.object({data:z.unknown(),meta:z.unknown().optional()}).parse(await actionServices(db).writes.projects.request(endpoint,{params:input.params,query:input.query,body:undefined} as never,c));
   if(endpoint.id==='artifacts.list'||endpoint.id==='artifacts.versions.list')return z.object({data:z.unknown(),meta:z.unknown().optional()}).parse(await actionServices(db).writes.artifacts.request(endpoint,{params:input.params,query:input.query,body:undefined} as never,c));
   if(endpoint.id==='candidates.list')return z.object({data:z.unknown(),meta:z.unknown().optional()}).parse(await actionServices(db).writes.candidates.request(endpoint,{params:input.params,query:input.query,body:undefined} as never,c));
   if(endpoint.id==='outputs.publications.list'||endpoint.id==='publications.revisions.list')return z.object({data:z.unknown(),meta:z.unknown().optional()}).parse(await actionServices(db).writes.publishing.request(endpoint,{params:input.params,query:input.query,body:undefined} as never,c));
  throw Error('本例仅验证原画布读取');
 }},{now:clockNow});
 if(options.observeTags&&action?.kind==='asset.tag'){
  const before={assets:await db.select().from(assets),tags:await db.select().from(entityTags),results:await db.select().from(aiTaskResults)};
  const targets=[];
  for(const target of action.targets){const read=z.object({text:z.string()}).parse(await root.host.read(ctx,assistantReadInputSchema.parse({request:{kind:'assets.get',params:{assetId:target.assetId}}}),{} as never));const dto=JSON.parse(read.text);expect(dto.tagTarget).toEqual(target);targets.push(dto.tagTarget);}
  expect({assets:await db.select().from(assets),tags:await db.select().from(entityTags),results:await db.select().from(aiTaskResults)}).toEqual(before);
  action={...action,targets};
 }
 const existingCanvas=generate?await canvas.createWithDocumentInTransaction(ctx,{title:'生图中性画布',document:{...emptyCanvasDocument,nodes:[{id:'image-node',type:'image_generation',label:'测试画面',prompt:'一只白色纸船在平静水面',mode:'text_to_image',aspectRatio:'1:1',position:{x:10,y:20}}]}},db):null;
 let readInput:AssistantReadInput|undefined;
 if(options.readKind){
  const kind=options.readKind,services=actionServices(db);let params:Record<string,string>|undefined;
  if(kind==='artifacts.list'||kind==='artifacts.versions.list'){
   const project=await services.projects.createProject(ctx,{title:'中性分页工程'});params={projectId:project.id};
   if(kind==='artifacts.list')for(let index=0;index<3;index++)await services.artifacts.createArtifact(ctx,{projectId:project.id,title:`中性脚本-${index}`,artifactType:'output_script',stage:'script'});
   else{const artifact=await services.artifacts.createArtifact(ctx,{projectId:project.id,title:'中性版本',artifactType:'output_script',stage:'script'});params={artifactId:artifact.id};for(let index=0;index<2;index++)await services.artifacts.createVersion(ctx,artifact.id,{contentText:`中性版本正文-${index}`,changeSummary:'分页验收'});}
  }else if(kind==='outputs.publications.list'||kind==='publications.revisions.list'){
   const project=await services.projects.createProject(ctx,{title:'中性发布列表'}),output=await services.projects.createOutput(ctx,project.id,{contentType:'image',title:'中性物料'}),account=await services.accounts.createAccount(ctx,{platform:'xiaohongshu',accountHandle:'中性分页账号'});params={outputId:output.id};
   if(kind==='outputs.publications.list')for(let index=0;index<3;index++)await services.publishing.createPublication(ctx,output.id,{platform:'xiaohongshu',accountId:account.id,accountReference:'中性分页账号'});
   else{const publication=await services.publishing.createPublication(ctx,output.id,{platform:'xiaohongshu',accountId:account.id,accountReference:'中性分页账号'});params={publicationId:publication.id};for(let index=0;index<2;index++)await services.publishing.createRevision(ctx,publication.id,{title:`中性版本-${index}`,description:'不执行发布'});}
  }else for(let index=0;index<3;index++){
   if(kind==='knowledge.list')await services.knowledge.createKnowledge(ctx,{title:`中性知识-${index}`,content:`正文-${index}`,knowledgeType:'note'});
   else if(kind==='projects.list')await services.projects.createProject(ctx,{title:`中性项目-${index}`});
   else await services.candidates.createCandidate(ctx,{title:`中性选题-${index}`});
  }
  readInput={request:{kind,...(params?{params}:{}),query:{page:1,pageSize:1}},offset:0,limit:1};
 }
 const name=readInput?'system.read':action?'system.action.propose':generate?'canvas.generate.propose':'canvas.create.propose',definitions=(await prepareChatToolDefinitions(buildChatTools([name,...(options.discoverReads?['system.read']:[])],{} as never))).definitions;
 const definition=definitions[0]!,version=definition.version,parameterSchema=definition.parameters;
 const createRequest={title:"AI中性画布",document:{...emptyCanvasDocument,nodes:[{id:"note-1",type:"text" as const,label:"主旨",text:"中性验收说明",position:{x:0,y:0}}]}};
 const request=readInput??(action?{action:assistantActionInputSchema.parse(action)}:generate?{baseRevision:existingCanvas!.revision,nodeId:'image-node'}:createRequest);
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId,now:clockNow,nextId:prefix=>`${prefix}-adopt-${++seq}`});
 let editorTarget:ChatHostContext['chatContext']['editorTarget'];
 if(options.currentEditor&&action&&(action.kind==='article.save'||action.kind==='graphic.save')){
  const article=action.kind==='article.save',original=article?await actionServices(db).articles.getArticle(ctx,action.outputId):await actionServices(db).graphicPosts.getGraphicPost(ctx,action.outputId);
  // SEMANTIC_BOUNDARY_ALLOW:只计算固定文档字段身份，不选择正文或改动。
  const canonical=(v:any):string=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
  const documentDigest=`sha256:${createHash('sha256').update(canonical(original.current)).digest('hex')}`;
  editorTarget=article?{schemaVersion:1,projectId:original.projectId,outputId:original.outputId,owner:'wechat_article',contentType:'article',savedBase:{kind:'artifact',artifactId:original.artifactId,versionId:original.currentVersionId},documentDigest,selection:{kind:'article',sectionIds:[]}}:{schemaVersion:1,projectId:original.projectId,outputId:original.outputId,owner:'graphic_post',contentType:'image',savedBase:{kind:'artifact',artifactId:original.artifactId,versionId:original.currentVersionId},documentDigest,selection:{kind:'graphic_post',cardIds:[]}};
 }
 const conversation=await repo.createConversation({title:"中性助手操作",projectId:editorTarget?.projectId??null,scope:editorTarget?"project":"global"});
 const message=await repo.createMessage(conversation.id,{role:"user",content:"准备具体中性候选供我采用",attachments:[],modelMetadata:{}});
 const host:ChatHostContext={schemaVersion:1,chatContext:generate?{surface:'canvas',selection:{kind:'canvas',ids:[existingCanvas!.id]}}:editorTarget?{surface:'project',projectId:editorTarget.projectId,editorTarget}:{surface:'topics'},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId??null,...(ctx.groupId?{groupId:ctx.groupId}:{}),resolvedAt:now(),platformPolicyVersion:"1",platformPolicy:"用户采用",skills:[{skillId:generate?"chatbox.canvas":"chatbox.topic",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"产候选",template:"",tools:[name],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const submitted=await createChatTurnSubmissionService(db,{now:clockNow,assertProject:(c,id)=>actionServices(db).projects.getProject(c,id),assemble:async()=>({capability:"copilot.assist",system:"中性候选",messages:[{role:"user",content:message.content}],maxSteps:8,maxOutputTokens:128,hostContext:host,tools:definitions})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:message.id});
 if(options.parentDeadlineMs!==undefined)await db.update(executionTasks).set({executionBudget:{...budget,deadlineMs:options.parentDeadlineMs},deadlineAt:new Date(clock+options.parentDeadlineMs).toISOString()}).where(eq(executionTasks.id,submitted.executionTaskId));
 const claim=(await createPersistentTaskService(db,{now:clockNow}).claimTask({taskId:submitted.executionTaskId,workerId:"adoption-worker"}))!;
 const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const hostTools=createChatSystemToolHost(createChatHostContextReader(db,{now:clockNow}),root.host);
 const tools=await hostTools(ctx,{} as never,ref,new AbortController().signal);
 const frozen=await createChatHostContextReader(db,{now:clockNow}).read(ref);
 const source=root.source;
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
 const input=task!.payload as {modelInput:{operationKey:string}},ledger=createExecutionCallLedgerService(db,{now:clockNow,budget}),generation=createExecutionGenerationPorts(db,{now:clockNow,budget});
 const model=await generation.reserveGenerationCall(ref,{operationKey:`${input.modelInput.operationKey}/model/1`,request:{maxOutputTokens:128}});await ledger.start(ref,model.callId);
 await generation.settleGenerationCall(ref,{callId:model.callId,status:"settled",usage:{inputTokens:1,outputTokens:1},providerResult:{content:[{type:"tool-call",toolName:chatToolProviderName(name),toolCallId:"canvas-create",input:JSON.stringify(request)}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]}});
 const ports=createExecutionChatToolPorts(db,{now:clockNow,budget,tools}),call=await ports.reserve(ref,{modelCallId:model.callId,toolCallId:"canvas-create"});await ports.start(ref,{callId:call.callId});
 const output=await ports.execute(ref,{callId:call.callId}),reference=(output.data as {source:unknown}).source;
 const adoption=root.service,client=createClient(ENDPOINTS,root.transport,ctx);
 const state=async()=>({canvases:await canvas.list(ctx),results:await db.select().from(aiTaskResults).where(eq(aiTaskResults.executionCallId,call.callId)),call:(await db.select().from(executionCalls).where(eq(executionCalls.id,call.callId)))[0]!});
 const businessFor=(patch:Partial<Parameters<typeof createAssetBusinessExecutionService>[1]>={})=>createAssetBusinessExecutionService(db,{now:clockNow,budget:{maxCalls:6,maxTokens:1_000_000,deadlineMs:1_800_000},resolveSpec:async()=>({kind:'image',provider:'openai',model:'fixture-image',baseUrl:null,token:'test-only-secret'}),assertProject:failPort,assertCanvasInput:canvas.assertFrozenGenerationInput,...patch});
 return {ctx,canvas,adoption,source,reference,output,host,frozen,client,transport:root.transport,state,call,submitted,existingCanvas,wake,clockNow,advance:(ms:number)=>{clock+=ms;},businessFor,aiFor,root,derivedEffect,afterCommit,actionServices,action,readInput,workflowProjectId,binding,bindingWake,bindingStage,assetTags,observeTagTargets};
}
it.each([false,true])('真实宿主工具→执行账本→公共采用transport，组范围=%s保存完整画布并可读回',async group=>{
 const f=await fixture(group),source=f.reference as Parameters<typeof f.client.adoptCanvasCreate>[0]['body'];
 expect((await f.state()).canvases).toHaveLength(0);
 expect(await f.client.getAssistantActionReceipt({params:undefined,body:undefined,query:source})).toEqual({receipt:null});
 const originalCall=(await f.state()).call;
 const result=await f.client.adoptCanvasCreate({params:undefined,query:undefined,body:source});
 const canvasId=(result.result as {id:string}).id;
 expect(result).toMatchObject({status:'adopted',operationId:'canvas.create',result:{revision:1,document:{nodes:[{text:'中性验收说明'}]}}});
 expect(await f.canvas.get(f.ctx,canvasId)).toEqual(result.result);
 const replay=await f.client.adoptCanvasCreate({params:undefined,query:undefined,body:source});expect(replay).toEqual(result);
 expect(await f.client.getAssistantActionReceipt({params:undefined,body:undefined,query:source})).toEqual({receipt:result});
 expect((await f.state()).call).toEqual(originalCall);
 expect((await f.state()).canvases).toHaveLength(1);expect((await f.state()).results).toHaveLength(1);
 await expect(f.client.adoptCanvasCreate({params:undefined,query:undefined,body:{...source,title:'篡改业务正文'} as never})).rejects.toThrow();
 await expect(createClient(ENDPOINTS,f.transport,{...f.ctx,userId:'other'}).adoptCanvasCreate({params:undefined,query:undefined,body:source})).rejects.toThrow();
});

async function generatedState(f:Awaited<ReturnType<typeof fixture>>){
 const links=await db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.canvasId,f.existingCanvas!.id));
 const tasks=await db.select().from(aiTasks).where(and(eq(aiTasks.userId,f.ctx.userId),eq(aiTasks.taskType,'asset.generate')));
 return {links,tasks:tasks.filter(task=>task.attemptId===`canvas-proposal:${f.call.callId}`),receipts:(await f.state()).results};
}
function confirm(f:Awaited<ReturnType<typeof fixture>>,nodeId='image-node'){
 return f.client.confirmCanvasGeneration({params:{canvasId:f.existingCanvas!.id,nodeId},query:undefined,body:f.reference as never});
}
it.each([false,true])('连续聊天生成确认→原AI task→asset.prepare→authority，范围=%s保有限30分钟与原ID',async group=>{
 const f=await fixture(group,true);expect((await generatedState(f)).links).toHaveLength(0);expect(f.wake).not.toHaveBeenCalled();
 const [a,b]=await Promise.all([confirm(f),confirm(f)]);expect(a).toEqual(b);expect(a).toMatchObject({status:'accepted',operationId:'canvas.node.generate'});
 const result=a.result as {taskId:string;attemptId:string;id:string},state=await generatedState(f);
 expect(state.links).toHaveLength(1);expect(state.tasks).toHaveLength(1);expect(state.receipts).toHaveLength(1);expect(f.wake).toHaveBeenCalledTimes(1);
 const originalTask=await f.aiFor(db).getTask(f.ctx,result.taskId);
 expect(originalTask.inputData).toMatchObject({canvasOwner:{accountId:group?null:f.ctx.accountId,proposalAdmission:{confirmedAt:f.clockNow(),deadlineAt:'2026-10-08T02:30:00.000Z',assetLimit:{maxCalls:6,maxTokens:1_000_000,deadlineMs:1_800_000}}}});
 const business=f.businessFor(),mapping=await business.prepare(f.ctx,result.taskId),[execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,mapping.executionTaskId));
 expect(execution).toMatchObject({accountId:group?null:f.ctx.accountId,deadlineAt:'2026-10-08T02:30:00.000Z',executionBudget:{maxCalls:6,maxTokens:1_000_000,deadlineMs:1_800_000}});
 expect(JSON.stringify(execution)).not.toContain('test-only-secret');
 f.advance(60000);expect(await f.businessFor({resolveSpec:async()=>{throw Error('恢复不能重新解析模型');}}).prepare(f.ctx,result.taskId)).toEqual(mapping);
 expect(await confirm(f)).toEqual(a);expect((await generatedState(f)).tasks).toHaveLength(1);
});
it('有限父剩90秒，原AI准备耗时15秒后仍在原截止，不补两分钟、不重计时',async()=>{
 const f=await fixture(true,true,{parentDeadlineMs:120000,runtimeDelayMs:15000});f.advance(30000);
 const receipt=await confirm(f),taskId=(receipt.result as {taskId:string}).taskId;
 const task=await f.aiFor(db).getTask(f.ctx,taskId);expect(task.requestedAt).toBe('2026-10-08T02:00:45.000Z');
 const mapping=await f.businessFor().prepare(f.ctx,taskId),[execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,mapping.executionTaskId));
 expect(execution).toMatchObject({deadlineAt:'2026-10-08T02:02:00.000Z',executionBudget:{maxCalls:6,maxTokens:1_000_000,deadlineMs:75000}});
 f.advance(20000);expect(await f.businessFor().prepare(f.ctx,taskId)).toEqual(mapping);expect(await confirm(f)).toEqual(receipt);
});
it('确认runtime准备跨越父期限，原link/asset task/采用回执同行回滚且wake=0',async()=>{
 const f=await fixture(true,true,{parentDeadlineMs:120000,runtimeDelayMs:121000}),original=(await f.state()).call;
 await expect(confirm(f)).rejects.toThrow('期限已耗尽');
 expect(await generatedState(f)).toEqual({links:[],tasks:[],receipts:[]});expect(f.wake).not.toHaveBeenCalled();expect((await f.state()).call).toEqual(original);
});
it('确认receipt INSERT真实失败全部回滚，同source重试只写一份原任务',async()=>{
 const f=await fixture(true,true);
 await db.execute(sql.raw(`CREATE FUNCTION fail_generation_adoption() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.execution_call_id='${f.call.callId}' THEN RAISE EXCEPTION 'generation adoption failed'; END IF; RETURN NEW; END $$;`));
 await db.execute(sql.raw('CREATE TRIGGER fail_generation_adoption BEFORE INSERT ON ai_task_results FOR EACH ROW EXECUTE FUNCTION fail_generation_adoption();'));
 try{await expect(confirm(f)).rejects.toThrow();expect(await generatedState(f)).toEqual({links:[],tasks:[],receipts:[]});expect(f.wake).not.toHaveBeenCalled();}
 finally{await db.execute(sql.raw('DROP TRIGGER fail_generation_adoption ON ai_task_results;'));await db.execute(sql.raw('DROP FUNCTION fail_generation_adoption();'));}
 const receipt=await confirm(f);expect(f.wake).toHaveBeenCalledTimes(1);expect((await generatedState(f)).tasks).toHaveLength(1);
 expect(await f.client.getAssistantActionReceipt({params:undefined,body:undefined,query:f.reference as never})).toEqual({receipt});
});
it('提交后wake失败保留已接受原task；改节点再查询和重放仍同ID，不再唤醒或续期',async()=>{
 const f=await fixture(true,true,{wakeFailure:true});await expect(confirm(f)).rejects.toThrow('唤醒失败');
 const result=await f.client.getAssistantActionReceipt({params:undefined,body:undefined,query:f.reference as never});expect(result.receipt?.status).toBe('accepted');
 const before=await generatedState(f);expect(before.tasks).toHaveLength(1);expect(before.links).toHaveLength(1);expect(before.receipts).toHaveLength(1);
 const canvas=await f.canvas.get(f.ctx,f.existingCanvas!.id);await f.canvas.save(f.ctx,canvas.id,{expectedRevision:canvas.revision,document:{...canvas.document,nodes:[]}});f.advance(60000);
 expect(await confirm(f)).toEqual(result.receipt);expect(await generatedState(f)).toEqual(before);expect(f.wake).toHaveBeenCalledTimes(1);
});
it('采用前保存输入改变或确认错node被拒，原来源call与正式数据保持',async()=>{
 const f=await fixture(true,true),original=(await f.state()).call;
 await expect(confirm(f,'other-node')).rejects.toThrow('目标');
 const canvas=await f.canvas.get(f.ctx,f.existingCanvas!.id);await f.canvas.save(f.ctx,canvas.id,{expectedRevision:canvas.revision,document:{...canvas.document,nodes:[]}});
 await expect(confirm(f)).rejects.toThrow('已更新');expect(await generatedState(f)).toEqual({links:[],tasks:[],receipts:[]});expect((await f.state()).call).toEqual(original);
});
it('核验返回值不能丢弃、继承预算不等或mapping被改不能回落默认生成',async()=>{
 const f=await fixture(true,true),receipt=await confirm(f),taskId=(receipt.result as {taskId:string}).taskId;
 await expect(f.businessFor({assertCanvasInput:async(c,input,tx)=>{await f.canvas.assertFrozenGenerationInput(c,input,tx);return undefined;}}).prepare(f.ctx,taskId)).rejects.toThrow('已核验');
 await expect(f.businessFor().prepare(f.ctx,taskId,undefined,{maxCalls:6,maxTokens:1_000_000,deadlineMs:120000})).rejects.toThrow('继承预算');
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,taskId)))[0]!.executionTaskId).toBeNull();
 const business=f.businessFor(),mapping=await business.prepare(f.ctx,taskId),[execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,mapping.executionTaskId));
 await db.update(executionTasks).set({deadlineAt:'2026-10-08T02:31:00.000Z'}).where(eq(executionTasks.id,mapping.executionTaskId));await expect(business.prepare(f.ctx,taskId)).rejects.toThrow('截止时间');
 await db.update(executionTasks).set({deadlineAt:execution!.deadlineAt,executionBudget:{maxCalls:7,maxTokens:1_000_000,deadlineMs:1_800_000}}).where(eq(executionTasks.id,mapping.executionTaskId));await expect(business.prepare(f.ctx,taskId)).rejects.toThrow('预算');
 expect((await generatedState(f)).tasks).toHaveLength(1);
});
it('asset模型准备跨越冻结期限，原已采用task保持而execution不创建',async()=>{
 const f=await fixture(true,true,{parentDeadlineMs:120000}),receipt=await confirm(f),taskId=(receipt.result as {taskId:string}).taskId;
 await expect(f.businessFor({resolveSpec:async()=>{f.advance(121000);return {kind:'image',provider:'openai',model:'fixture-image',baseUrl:null,token:'test-only-secret'};}}).prepare(f.ctx,taskId)).rejects.toThrow('预算已耗尽');
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,taskId)))[0]!.executionTaskId).toBeNull();expect((await generatedState(f)).receipts).toHaveLength(1);
});

it.each(['project.create','knowledge.create','group.create'] as const)('真实来源→%s原owner与正式回执同行提交；重放只保存一次',async kind=>{
 const action=assistantActionInputSchema.parse(kind==='project.create'?{kind,title:'AI中性项目',brief:'只验证新建'}:kind==='knowledge.create'?{kind,title:'AI中性知识',note:'原候选完整内容'}:{kind,name:'AI中性账号组'});
 const f=await fixture(true,false,{action}),original=(await f.state()).call;
 expect(await f.client.getAssistantActionReceipt({params:undefined,query:f.reference as never,body:undefined})).toEqual({receipt:null});
 const adopted=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never});
 expect(adopted).toMatchObject({status:'adopted',result:{id:expect.any(String)}});
 const result=adopted.result as {id:string};
 if(kind==='project.create')expect((await createProjectsService(createProjectRepository(db),{now,nextId:p=>`${p}-${++seq}`}).getProject(f.ctx,result.id)).title).toBe('AI中性项目');
 if(kind==='knowledge.create'){const knowledge=createKnowledgeService(createKnowledgeRepository(db,{now,nextId:p=>`${p}-${++seq}`}));expect(await knowledge.getKnowledge(f.ctx,result.id)).toMatchObject({title:'AI中性知识',sourceType:'ai',knowledgeType:'note'});expect((await knowledge.listRevisions(f.ctx,result.id))[0]!.content).toBe('原候选完整内容');}
 if(kind==='group.create')expect(await createAccountGroupService({db,now,nextId:p=>`${p}-${++seq}`}).get(f.ctx,result.id)).toMatchObject({name:'AI中性账号组',members:[]});
 expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(adopted);expect((await f.state()).results).toHaveLength(1);expect((await f.state()).call).toEqual(original);
});
it.each(['attachDelayMs','receiptDelayMs'] as const)('确认%s等待跨原D，原link/task/receipt一起回滚',async delay=>{
 const f=await fixture(true,true,{parentDeadlineMs:120000,[delay]:121000});await expect(confirm(f)).rejects.toThrow('期限已耗尽');
 expect(await generatedState(f)).toEqual({links:[],tasks:[],receipts:[]});expect(f.wake).not.toHaveBeenCalled();
});
it('已确认生成在配置等待期间出现旧提交事实，不落回默认旧恢复预算',async()=>{
 const f=await fixture(true,true,{parentDeadlineMs:120000}),receipt=await confirm(f),taskId=(receipt.result as {taskId:string}).taskId;
 const spec={kind:'image',provider:'openai',model:'fixture-image',baseUrl:null,token:'test-only-secret'} as const;
 await expect(f.businessFor({resolveSpec:async()=>{await db.update(aiTasks).set({runtimeData:{multimodalProviderCheckpoint:{state:'submitting'}}}).where(eq(aiTasks.id,taskId));return spec;}}).prepare(f.ctx,taskId)).rejects.toThrow('旧恢复事实');
 const task=(await generatedState(f)).tasks[0]!;expect(task.executionTaskId).toBeNull();expect(task.runtimeData).toMatchObject({multimodalProviderCheckpoint:{state:'submitting'}});
 expect(await db.select().from(executionTasks).where(eq(executionTasks.ownerId,taskId))).toHaveLength(0);expect((await generatedState(f)).receipts).toHaveLength(1);
});
it('正式采用已提交后单个派生失败，不反杀保存且继续其余派生；原回执仍可恢复',async()=>{
 const f=await fixture(true,false,{action:assistantActionInputSchema.parse({kind:'project.create',title:'派生失败中性项目'}),derivedFailure:true});
 const adopted=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never});
 const project=await createProjectsService(createProjectRepository(db),{now,nextId:p=>`${p}-${++seq}`}).getProject(f.ctx,(adopted.result as {id:string}).id);
 expect(project.title).toBe('派生失败中性项目');expect(f.derivedEffect).toHaveBeenCalledTimes(1);expect(f.afterCommit).toHaveBeenCalledTimes(1);
 expect(await f.client.getAssistantActionReceipt({params:undefined,query:f.reference as never,body:undefined})).toEqual({receipt:adopted});
 expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(adopted);expect(f.derivedEffect).toHaveBeenCalledTimes(1);
});
it('素材ID大小写与下划线按原owner排序，真实来源采用不误报版本变化',async()=>{
 const f=await fixture(true,false,{tagAssets:true});
 const adopted=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never});
 expect(adopted).toMatchObject({status:'adopted',operationId:'taxonomy.assetTags.adopt',result:{addedCount:2,assetIds:[expect.stringContaining('asset-B-'),expect.stringContaining('asset_a-')]}});
 const links=await db.select().from(entityTags).where(and(eq(entityTags.userId,f.ctx.userId),eq(entityTags.tagId,(adopted.result as {tagId:string}).tagId)));expect(links).toHaveLength(2);
 expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(adopted);expect((await f.state()).results).toHaveLength(1);
});
it('标签观察完整链：原assets.get给模型真实target，原工具候选→公共采纳→读回，同source不重写',async()=>{
 const f=await fixture(true,false,{tagAssets:true,observeTags:true});
 const adopted=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never});
 expect(adopted).toMatchObject({status:'adopted',operationId:'taxonomy.assetTags.adopt',result:{addedCount:2}});
 const result=adopted.result as {tagId:string;assetIds:string[]};
 const links=await db.select().from(entityTags).where(and(eq(entityTags.userId,f.ctx.userId),eq(entityTags.tagId,result.tagId),eq(entityTags.entityType,'asset')));
 expect(links.filter(link=>result.assetIds.includes(link.entityId)).map(link=>link.entityId).sort()).toEqual([...result.assetIds].sort());
 expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(adopted);
 const action=f.action!;expect(action.kind).toBe('asset.tag');
 await expect(f.root.host.propose(f.ctx,{action},f.frozen)).rejects.toThrow('版本');
});
it('标签观察拒绝并发素材变化；pending与未装配标签owner仍可正常读且零标签观察',async()=>{
 const race=await fixture(true,false,{tagAssets:true,tagObservationRace:true});
 const action=race.action!;if(action.kind!=='asset.tag')throw Error('验收目标必须是原素材标签');
 await expect(race.root.host.read(race.ctx,assistantReadInputSchema.parse({request:{kind:'assets.get',params:{assetId:action.targets[0]!.assetId}}}),race.frozen)).rejects.toThrow('变化');
 const f=await fixture(true,false,{tagAssets:true}),tagAction=f.action!;if(tagAction.kind!=='asset.tag')throw Error('验收目标必须是原素材标签');
 const id=tagAction.targets[0]!.assetId;
 await db.update(assets).set({status:'pending'}).where(eq(assets.id,id));
 const pending=z.object({text:z.string()}).parse(await f.root.host.read(f.ctx,assistantReadInputSchema.parse({request:{kind:'assets.get',params:{assetId:id}}}),f.frozen));
 expect(JSON.parse(pending.text)).toMatchObject({id,status:'pending'});expect(JSON.parse(pending.text)).not.toHaveProperty('tagTarget');expect(f.observeTagTargets.prepare).not.toHaveBeenCalled();
 const unbound=await fixture(true);await db.insert(assets).values({id:'unbound-tag-'+(++seq),userId:unbound.ctx.userId,groupId:unbound.ctx.groupId,accountId:null,name:'未装配标签素材',assetType:'image',createdAt:now(),updatedAt:now()});
 const [row]=await db.select().from(assets).where(eq(assets.name,'未装配标签素材'));
 const ordinary=z.object({text:z.string()}).parse(await unbound.root.host.read(unbound.ctx,assistantReadInputSchema.parse({request:{kind:'assets.get',params:{assetId:row!.id}}}),unbound.frozen));
 expect(JSON.parse(ordinary.text)).not.toHaveProperty('tagTarget');expect(unbound.observeTagTargets.prepare).not.toHaveBeenCalled();
});
it.each([
 {kind:'topic.create',title:'中性选题',angle:'用真实实操说明'},
 {kind:'knowledge.folder.create',name:'中性知识分类',parentId:null},
 {kind:'group.rename',name:'中性组更名',expectedVersion:1},
 {kind:'positioning.save',persona:'中性创作者',field:'内容实践',audience:'创作者',differentiation:'说明真实操作',capabilities:[]},
 {kind:'preferences.update',autosaveEnabled:false},
 {kind:'automation.createDraft',name:'中性自动化草稿',prompt:'读取选题，不立即执行',schedule:'0 9 * * *',sourceKind:'topic.daily',targetAccountId:null},
 {kind:'automation.enable',jobId:'fixture-original-job',enabled:true},
] as const)('真实来源→$kind采用后由原owner读取，保留原回执并只写一次',async input=>{
 const action=assistantActionInputSchema.parse(input),f=await fixture(true,false,{action}),services=f.actionServices(db),original=(await f.state()).call;
 const result=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never});
 const saved=result.result as {id:string};expect(result.status).toBe('adopted');
 switch(action.kind){
  case 'topic.create':expect(await services.candidates.getCandidate(f.ctx,saved.id)).toMatchObject({title:action.title,angle:action.angle});break;
  case 'knowledge.folder.create':expect(await services.knowledge.listFolders(f.ctx)).toContainEqual(expect.objectContaining({id:saved.id,name:action.name}));break;
  case 'group.rename':expect(await services.groups.get(f.ctx,f.ctx.groupId!)).toMatchObject({name:action.name,version:2});break;
  case 'positioning.save':expect(await services.positioning.getProfile(f.ctx)).toMatchObject({persona:action.persona,field:action.field});break;
  case 'preferences.update':expect(await services.settings.getPreferences(f.ctx)).toMatchObject({autosaveEnabled:false});break;
  case 'automation.createDraft':expect(await services.scheduling.getJob(f.ctx,saved.id)).toMatchObject({name:action.name,enabled:false,prompt:action.prompt});break;
  case 'automation.enable':expect(await services.scheduling.getJob(f.ctx,saved.id)).toMatchObject({id:f.action?.kind==='automation.enable'?f.action.jobId:null,enabled:true});break;
 }
 expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(result);
 expect(await f.client.getAssistantActionReceipt({params:undefined,query:f.reference as never,body:undefined})).toEqual({receipt:result});
 const state=await f.state();expect(state.results).toHaveLength(1);expect(state.call).toEqual(original);
});
it('原定位和偏好普通保存改变采用字段时拒绝旧候选，保留用户保存结果',async()=>{
 for(const action of [{kind:'positioning.save',persona:'旧定位',field:'旧方向'},{kind:'preferences.update',defaultHome:'calendar'}] as const){
  const f=await fixture(true,false,{action:assistantActionInputSchema.parse(action)}),services=f.actionServices(db);
  if(action.kind==='positioning.save')await services.positioning.upsertProfile(f.ctx,{persona:'用户新定位',field:'用户新方向',audience:'创作者',differentiation:'真实操作',capabilities:[]});
  else await services.settings.updatePreferences(f.ctx,{defaultHome:'projects'});
  await expect(f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).rejects.toThrow();
  expect((await f.state()).results).toHaveLength(0);
  if(action.kind==='positioning.save')expect(await services.positioning.getProfile(f.ctx)).toMatchObject({persona:'用户新定位',field:'用户新方向'});
  else expect(await services.settings.getPreferences(f.ctx)).toMatchObject({defaultHome:'projects'});
 }
});

const workActions=['script.patch','article.save','graphic.save'] as const;
async function workState(f:Awaited<ReturnType<typeof fixture>>){
 const services=f.actionServices(db),action=f.action!;
 if(action.kind==='script.patch'){
  const current=await services.artifacts.getArtifact(f.ctx,action.artifactId),versions=await services.artifacts.listVersions(f.ctx,action.artifactId);
  return {versionId:current.currentVersionId,versions,document:versions.find(row=>row.id===current.currentVersionId)!};
 }
 if(action.kind==='article.save'){
  const current=await services.articles.getArticle(f.ctx,action.outputId);return {versionId:current.currentVersionId,versions:current.versions,document:current.current};
 }
 if(action.kind==='graphic.save'){
  const current=await services.graphicPosts.getGraphicPost(f.ctx,action.outputId);return {versionId:current.currentVersionId,versions:current.versions,document:current.current};
 }
 throw Error('该夹具不是作品保存动作');
}
async function manuallyEditWork(f:Awaited<ReturnType<typeof fixture>>){
 const services=f.actionServices(db),action=f.action!;
 if(action.kind==='script.patch')return services.artifacts.createVersion(f.ctx,action.artifactId,{contentText:'用户已经保存的新脚本',changeSummary:'手工保存'});
 if(action.kind==='article.save')return services.articles.createVersion(f.ctx,action.outputId,{expectedCurrentVersionId:action.expectedCurrentVersionId,clientRequestId:`manual-article-${++seq}`,document:{...action.document,title:'用户已经保存的新文章'}});
 if(action.kind==='graphic.save')return services.graphicPosts.createVersion(f.ctx,action.outputId,{expectedCurrentVersionId:action.expectedCurrentVersionId,clientRequestId:`manual-graphic-${++seq}`,document:{...action.document,title:'用户已经保存的新图文'}});
 throw Error('该夹具不是作品保存动作');
}
for(const kind of workActions){
 it.each([false,true])(`${kind} 原宿主→正式采用→原owner读回，组范围=%s，来源及旧版本不改写`,async group=>{
  const f=await fixture(group,false,{workAction:kind}),before=await workState(f),original=(await f.state()).call;
  expect((await f.state()).results).toHaveLength(0);
  await expect(createClient(ENDPOINTS,f.transport,{...f.ctx,userId:'other'}).adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).rejects.toThrow();
  expect(await workState(f)).toEqual(before);
  const receipt=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never}),saved=await workState(f);
  expect(receipt.status).toBe('adopted');expect(saved.versionId).not.toBe(before.versionId);expect(saved.versions).toHaveLength(before.versions.length+1);
  expect(saved.versions.find(row=>row.id===before.versionId)).toEqual(before.versions.find(row=>row.id===before.versionId));
  if(kind==='script.patch')expect(saved.document).toMatchObject({contentText:'开头😀\r\n调整后的准确表达。\r\n结尾保留。'});
  else expect(saved.document).toMatchObject({title:kind==='article.save'?'采用后的文章标题':'采用后的图文标题'});
  const replay=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never});expect(replay).toEqual(receipt);expect(await workState(f)).toEqual(saved);
  expect(await f.client.getAssistantActionReceipt({params:undefined,query:f.reference as never,body:undefined})).toEqual({receipt});
  expect((await f.state()).results).toHaveLength(1);expect((await f.state()).call).toEqual(original);
 });
 it(`${kind} 用户先手工保存后旧候选拒绝，保留新稿与原来源且没有采用回执`,async()=>{
  const f=await fixture(true,false,{workAction:kind}),original=(await f.state()).call;
  await manuallyEditWork(f);const manual=await workState(f);
  await expect(f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).rejects.toThrow();
  expect(await workState(f)).toEqual(manual);expect((await f.state()).results).toHaveLength(0);expect((await f.state()).call).toEqual(original);
 });
 it(`${kind} 回执INSERT失败时正式版本一起回滚；恢复后同来源只保存一次`,async()=>{
  const f=await fixture(true,false,{workAction:kind}),before=await workState(f);
  await db.execute(sql.raw(`CREATE FUNCTION fail_work_adoption() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.execution_call_id='${f.call.callId}' THEN RAISE EXCEPTION 'work adoption failed'; END IF; RETURN NEW; END $$;`));
  await db.execute(sql.raw('CREATE TRIGGER fail_work_adoption BEFORE INSERT ON ai_task_results FOR EACH ROW EXECUTE FUNCTION fail_work_adoption();'));
  try{
   await expect(f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).rejects.toThrow();
   expect(await workState(f)).toEqual(before);expect((await f.state()).results).toHaveLength(0);
  }finally{await db.execute(sql.raw('DROP TRIGGER fail_work_adoption ON ai_task_results;'));await db.execute(sql.raw('DROP FUNCTION fail_work_adoption();'));}
  const receipt=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never});expect(receipt.status).toBe('adopted');
  expect((await workState(f)).versions).toHaveLength(before.versions.length+1);
  expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(receipt);expect((await f.state()).results).toHaveLength(1);
 });
}

it('发布准备沿原账号与发布owner创建draft；来源回放只读原回执，不发生外部发布',async()=>{
 const f=await fixture(true,false,{workflowAction:'publication.prepare'}),action=f.action!;
 if(action.kind!=='publication.prepare')throw Error('夹具动作错误');
 const services=f.actionServices(db),original=(await f.state()).call,originalOutput=await services.projects.getOutput(f.ctx,action.outputId);
 expect(await services.publishing.listPublications(f.ctx,action.outputId,{limit:100,offset:0})).toEqual([]);
 const receipt=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never}),saved=receipt.result as {id:string};
 expect(receipt).toMatchObject({status:'adopted',operationId:'outputs.publications.create',result:{status:'draft',accountId:action.accountId,platform:'xiaohongshu',externalId:null,publishedAt:null}});
 expect(await services.publishing.getPublication(f.ctx,saved.id)).toMatchObject({id:saved.id,status:'draft',accountId:action.accountId});
 expect(await services.projects.getOutput(f.ctx,action.outputId)).toEqual(originalOutput);
 expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(receipt);
 expect(await services.publishing.listPublications(f.ctx,action.outputId,{limit:100,offset:0})).toHaveLength(1);expect((await f.state()).results).toHaveLength(1);expect((await f.state()).call).toEqual(original);
});
it.each([false,true])('排期采用沿原项目/日历owner保存，指定平台账号=%s，刷新与回放保留同entry',async assignedCalendar=>{
 const f=await fixture(true,false,{workflowAction:'calendar.plan',assignedCalendar}),action=f.action!;
 if(action.kind!=='calendar.plan')throw Error('夹具动作错误');
 const services=f.actionServices(db),original=(await f.state()).call;
 const receipt=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never}),saved=receipt.result as {id:string};
 const page=await services.calendar.listGroupCalendar(f.ctx,f.ctx.groupId!,{from:'2026-10-08T00:00:00.000Z',to:'2026-10-10T23:59:59.000Z'},{limit:100,offset:0});
 expect(receipt).toMatchObject({status:'adopted',operationId:'group.calendar.entries.create',result:{id:saved.id,groupId:f.ctx.groupId,projectId:action.projectId,plannedDate:'2026-10-09',accountId:action.targetAccountId??null,targetStatus:assignedCalendar?'ready':'unassigned'}});
 expect(page.rows).toHaveLength(1);expect(page.rows[0]).toMatchObject({id:saved.id,note:'仅保存计划'});
 expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(receipt);
 expect(await services.calendar.listActiveProjectSchedules(f.ctx,null)).toHaveLength(1);expect((await f.state()).results).toHaveLength(1);expect((await f.state()).call).toEqual(original);
});
it('扫码采用只预约原唯一绑定实例；正式结果是待扫码任务，不伪造已绑定账号',async()=>{
 const f=await fixture(true,false,{workflowAction:'account.bind.start'});
 try{
  const receipt=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never}),result=receipt.result as {runId:string};
  expect(receipt).toMatchObject({status:'accepted',operationId:'accounts.bind.start',result:{status:'queued',groupId:f.ctx.groupId,platform:'douyin'}});
  expect(await f.binding!.status(f.ctx,result.runId)).toMatchObject({runId:result.runId,status:'queued',accountId:null});
  expect((await f.actionServices(db).groups.get(f.ctx,f.ctx.groupId!)).members).toHaveLength(0);expect(f.bindingStage).not.toHaveBeenCalled();expect(f.bindingWake).toHaveBeenCalledTimes(1);
  expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(receipt);expect(f.bindingWake).toHaveBeenCalledTimes(1);expect((await f.state()).results).toHaveLength(1);
 }finally{await f.binding!.stop();}
});
it('发布目标归档、项目已有新排期或扫码组改名时拒绝旧候选，保留实际对象与空回执',async()=>{
 for(const kind of ['publication.prepare','calendar.plan','account.bind.start'] as const){
  const f=await fixture(true,false,{workflowAction:kind}),services=f.actionServices(db),action=f.action!,original=(await f.state()).call;
  try{
   if(action.kind==='publication.prepare')await services.accounts.archiveAccount(f.ctx,action.accountId!);
   else if(action.kind==='calendar.plan')await services.calendar.createGroupEntry(f.ctx,f.ctx.groupId!,{projectId:action.projectId,plannedDate:'2026-10-10',note:'用户的新计划'});
   else await services.groups.update(f.ctx,f.ctx.groupId!,{name:'用户更新的账号组',expectedVersion:1});
   await expect(f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).rejects.toThrow();
   expect((await f.state()).results).toHaveLength(0);expect((await f.state()).call).toEqual(original);
   if(action.kind==='publication.prepare')expect(await services.publishing.listPublications(f.ctx,action.outputId,{limit:100,offset:0})).toHaveLength(0);
   else if(action.kind==='calendar.plan')expect(await services.calendar.listActiveProjectSchedules(f.ctx,null)).toMatchObject([{plannedDate:'2026-10-10',note:'用户的新计划'}]);
   else{expect((await services.groups.get(f.ctx,f.ctx.groupId!)).name).toBe('用户更新的账号组');expect(f.bindingWake).not.toHaveBeenCalled();}
  }finally{await f.binding?.stop();}
 }
});
it.each(['publication.prepare','calendar.plan','account.bind.start'] as const)('%s 回执写入失败时原发布/日历/预约同行回滚且不唤醒',async workflowAction=>{
 const f=await fixture(true,false,{workflowAction}),action=f.action!,services=f.actionServices(db);
 await db.execute(sql.raw(`CREATE FUNCTION fail_workflow_adoption() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.execution_call_id='${f.call.callId}' THEN RAISE EXCEPTION 'workflow adoption failed'; END IF; RETURN NEW; END $$;`));
 await db.execute(sql.raw('CREATE TRIGGER fail_workflow_adoption BEFORE INSERT ON ai_task_results FOR EACH ROW EXECUTE FUNCTION fail_workflow_adoption();'));
 try{
  await expect(f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).rejects.toThrow();expect((await f.state()).results).toHaveLength(0);expect(f.bindingWake).not.toHaveBeenCalled();
  if(action.kind==='publication.prepare')expect(await services.publishing.listPublications(f.ctx,action.outputId,{limit:100,offset:0})).toHaveLength(0);
  else if(action.kind==='calendar.plan')expect(await services.calendar.listActiveProjectSchedules(f.ctx,null)).toHaveLength(0);
  else expect((await db.select().from(executionTasks).where(and(eq(executionTasks.userId,f.ctx.userId),eq(executionTasks.groupId,f.ctx.groupId!),eq(executionTasks.kind,'account_binding'))))).toHaveLength(0);
 }finally{
  await db.execute(sql.raw('DROP TRIGGER fail_workflow_adoption ON ai_task_results;'));await db.execute(sql.raw('DROP FUNCTION fail_workflow_adoption();'));await f.binding?.stop();
 }
});
it.each([false,true])('选题立项基本公共链读取原选题并创建原项目，组范围=%s，同来源仅采用一次',async group=>{
 const f=await fixture(group,false,{ownerAction:'topic.promote'}),action=f.action!;
 if(action.kind!=='topic.promote')throw Error('夹具动作错误');
 const services=f.actionServices(db),candidate=await services.candidates.getCandidate(f.ctx,action.candidateId),original=(await f.state()).call;
 expect(candidate.status).not.toBe('promoted');
 const receipt=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never}),result=receipt.result as {projectId:string};
 expect(receipt).toMatchObject({status:'adopted',operationId:'candidates.promote'});
 expect(await services.projects.getProject(f.ctx,result.projectId)).toMatchObject({title:candidate.title});expect(await services.candidates.getCandidate(f.ctx,action.candidateId)).toMatchObject({status:'promoted'});
 expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(receipt);expect((await f.state()).results).toHaveLength(1);expect((await f.state()).call).toEqual(original);
 // PGlite基本保存不证明普通候选编辑与采用的跨连接竞态安全；原owner行锁仍待补充复核。
});
it.each([false,true])('无父雷达分类公共链准备时无业务写入，采用后原分类可读回，组范围=%s',async group=>{
 const f=await fixture(group,false,{ownerAction:'radar.collection.create'}),action=f.action!;
 if(action.kind!=='radar.collection.create')throw Error('夹具动作错误');
 const rows=()=>db.select().from(intelligenceCollections).where(and(eq(intelligenceCollections.userId,f.ctx.userId),f.ctx.groupId?eq(intelligenceCollections.groupId,f.ctx.groupId):eq(intelligenceCollections.accountId,f.ctx.accountId!)));
 expect(await rows()).toHaveLength(0);const original=(await f.state()).call;
 const receipt=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never}),result=receipt.result as {id:string};
 expect(receipt).toMatchObject({status:'adopted',operationId:'intelligence.collections.create',result:{name:action.name,parentId:null}});
 expect(await rows()).toMatchObject([{id:result.id,name:action.name,parentId:null}]);
 expect((await f.actionServices(db).intelligence.getWorkspace(f.ctx)).collections.find(row=>row.id===result.id)).toMatchObject({name:action.name});
 expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(receipt);expect((await f.state()).results).toHaveLength(1);expect((await f.state()).call).toEqual(original);
 // 有父分类纯读与归档竞态不在这个基本样例内，继续保留为未验项。
});
it('有父雷达公共prepare只读原分类；父版本变化拒绝采用且没有新分类/回执',async()=>{
 const f=await fixture(true,false,{ownerAction:'radar.collection.create',radarParent:true}),action=f.action!;
 if(action.kind!=='radar.collection.create'||!action.parentId)throw Error('父分类夹具错误');
 const rows=()=>db.select().from(intelligenceCollections).where(eq(intelligenceCollections.groupId,f.ctx.groupId!));
 const before=await rows();expect(before).toHaveLength(1);
 expect((await rows())[0]).toMatchObject({id:action.parentId,kind:'custom'});
 await db.update(intelligenceCollections).set({version:2,name:'用户已修改父项',normalizedName:'用户已修改父项'}).where(eq(intelligenceCollections.id,action.parentId));
 await expect(f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).rejects.toThrow(/已改变/);
 expect(await rows()).toHaveLength(1);expect((await f.state()).results).toHaveLength(0);
});
function raceGate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};}
async function waitPgLock(applicationName:string|null,table:string,done:()=>boolean){
 if(!pgPool)throw Error('缺实际隔离PG连接');const until=Date.now()+120000;
 while(Date.now()<until){
  const result=await pgPool.query("SELECT query FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND ($1::text IS NULL OR application_name=$1)",[applicationName]);
  if(result.rows.some(row=>String(row.query).includes(table)))return true;
  if(done())return false;await new Promise(resolve=>setTimeout(resolve,20));
 }
 throw Error('原SQL没有完成或进入行锁等待');
}
it.runIf(Boolean(process.env.CREATOROS_T1074_ISOLATED_PG_URL))('PG T1074 普通选题编辑先持锁，公共采用等待真实候选行并拒绝已变选题',async()=>{
 const f=await fixture(true,false,{ownerAction:'topic.promote'}),action=f.action!;
 if(action.kind!=='topic.promote')throw Error('夹具错误');
 const writer=new Pool({connectionString:pgUrl,max:1,application_name:'t1074-candidate-writer'}),writerDb=drizzlePg(writer) as unknown as Db,hold=raceGate(),ready=raceGate();
 let adoptionDone=false;const original=(await f.state()).call;
 const editing=writerDb.transaction(async tx=>{await f.actionServices(tx as unknown as Db).candidates.patchCandidate(f.ctx,action.candidateId,{title:'用户最新选题'});ready.release();await hold.promise;});
 try{
  await ready.promise;
  const adoption=f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never}).then(value=>{adoptionDone=true;return {value,error:null};},error=>{adoptionDone=true;return {value:null,error};});
  expect(await waitPgLock(null,'candidates',()=>adoptionDone)).toBe(true);expect(adoptionDone).toBe(false);
  hold.release();await editing;const outcome=await adoption;expect(outcome.value).toBeNull();expect(String(outcome.error)).toMatch(/选题已改变/);
  expect(await f.actionServices(db).candidates.getCandidate(f.ctx,action.candidateId)).toMatchObject({title:'用户最新选题',status:'pool'});
  expect((await f.state()).results).toHaveLength(0);expect((await f.state()).call).toEqual(original);
 }finally{hold.release();await editing;await writer.end();}
});
it.runIf(Boolean(process.env.CREATOROS_T1074_ISOLATED_PG_URL))('PG T1074 公共采用先锁候选，普通编辑等待到项目和同行回执提交',async()=>{
 const hold=raceGate(),ready=raceGate(),f=await fixture(true,false,{ownerAction:'topic.promote',beforePromotionCreate:async()=>{ready.release();await hold.promise;}}),action=f.action!;
 if(action.kind!=='topic.promote')throw Error('夹具错误');
 const writer=new Pool({connectionString:pgUrl,max:1,application_name:'t1074-candidate-writer'}),writerDb=drizzlePg(writer) as unknown as Db;
 let editDone=false;const initial=await f.actionServices(db).candidates.getCandidate(f.ctx,action.candidateId);
 const adoption=f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never});
 try{
  await ready.promise;
  const editing=f.actionServices(writerDb).candidates.patchCandidate(f.ctx,action.candidateId,{title:'采用提交后的用户编辑'}).finally(()=>{editDone=true;});
  expect(await waitPgLock('t1074-candidate-writer','candidates',()=>editDone)).toBe(true);expect(editDone).toBe(false);
  hold.release();const receipt=await adoption;await editing;
  expect(await f.actionServices(db).projects.getProject(f.ctx,(receipt.result as {projectId:string}).projectId)).toMatchObject({title:initial.title});
  expect(await f.actionServices(db).candidates.getCandidate(f.ctx,action.candidateId)).toMatchObject({title:'采用提交后的用户编辑',status:'promoted'});
  expect((await f.state()).results).toHaveLength(1);
 }finally{hold.release();await adoption.catch(()=>{});await writer.end();}
});
it.runIf(Boolean(process.env.CREATOROS_T1074_ISOLATED_PG_URL))('PG T1074 原owner删除父分类先持锁，公共采用等待后拒绝，不遗留孤儿或回执',async()=>{
 const f=await fixture(true,false,{ownerAction:'radar.collection.create',radarParent:true}),action=f.action!;
 if(action.kind!=='radar.collection.create'||!action.parentId)throw Error('夹具错误');
 const writer=new Pool({connectionString:pgUrl,max:1,application_name:'t1074-radar-writer'}),writerDb=drizzlePg(writer) as unknown as Db,hold=raceGate(),ready=raceGate();let adoptionDone=false;
 const deleting=writerDb.transaction(async tx=>{await f.actionServices(tx as unknown as Db).intelligence.deleteCollection(f.ctx,action.parentId!,{mode:'unlink'});ready.release();await hold.promise;});
 try{
  await ready.promise;
  const adoption=f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never}).then(value=>{adoptionDone=true;return {value,error:null};},error=>{adoptionDone=true;return {value:null,error};});
  expect(await waitPgLock(null,'intelligence_collections',()=>adoptionDone)).toBe(true);expect(adoptionDone).toBe(false);
  hold.release();await deleting;const result=await adoption;expect(result.value).toBeNull();expect(result.error).toBeTruthy();
  expect(await db.select().from(intelligenceCollections).where(eq(intelligenceCollections.groupId,f.ctx.groupId!))).toHaveLength(0);
  expect((await f.state()).results).toHaveLength(0);
 }finally{hold.release();await deleting;await writer.end();}
});
it.each(['article.save','graphic.save'] as const)('实际冻结编辑器目标允许同作品/基版本的正式%s候选并原owner读回',async kind=>{
 const f=await fixture(true,false,{workAction:kind,currentEditor:true});
 const receipt=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never});
 expect(receipt.status).toBe('adopted');expect((await workState(f)).document).toMatchObject({title:expect.stringMatching(/采用后的/)});
 expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(receipt);
});
it('选题立项回执INSERT失败，候选状态和原项目同行回滚，同来源恢复只立项一次',async()=>{
 const f=await fixture(true,false,{ownerAction:'topic.promote'}),action=f.action!;
 if(action.kind!=='topic.promote')throw Error('夹具错误');
 const before=await f.actionServices(db).candidates.getCandidate(f.ctx,action.candidateId);
 await db.execute(sql.raw(`CREATE FUNCTION fail_promotion_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.execution_call_id='${f.call.callId}' THEN RAISE EXCEPTION 'promotion receipt failed'; END IF; RETURN NEW; END $$;`));
 await db.execute(sql.raw('CREATE TRIGGER fail_promotion_receipt BEFORE INSERT ON ai_task_results FOR EACH ROW EXECUTE FUNCTION fail_promotion_receipt();'));
 try{
  await expect(f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).rejects.toThrow();
  expect(await f.actionServices(db).candidates.getCandidate(f.ctx,action.candidateId)).toEqual(before);expect((await f.state()).results).toHaveLength(0);
  const projects=await db.execute(sql`SELECT id FROM projects WHERE user_id=${f.ctx.userId} AND group_id=${f.ctx.groupId}`);expect(projects.rows).toHaveLength(0);
 }finally{await db.execute(sql.raw('DROP TRIGGER fail_promotion_receipt ON ai_task_results;'));await db.execute(sql.raw('DROP FUNCTION fail_promotion_receipt();'));}
 const receipt=await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never});
 expect(await f.client.adoptAssistantAction({params:undefined,query:undefined,body:f.reference as never})).toEqual(receipt);expect((await f.state()).results).toHaveLength(1);
});

const readPageSchema=z.object({text:z.string(),total:z.number().nullable(),nextOffset:z.number().nullable(),nextInput:assistantReadInputSchema.nullable(),meta:z.unknown()});
async function readPage(f:Awaited<ReturnType<typeof fixture>>,input:AssistantReadInput){return readPageSchema.parse(await f.root.host.read(f.ctx,input,f.frozen));}
it.each(['knowledge.list','projects.list','artifacts.list','artifacts.versions.list'] as const)('真实model/tool账本→%s原全量reader按原page/pageSize分页，原手工API保持兼容',async kind=>{
 const f=await fixture(true,false,{readKind:kind});
 expect(f.output.status).toBe('ok');
 const first=f.output.data as {text:string;total:number;nextOffset:number;nextInput:AssistantReadInput};
 const rows=JSON.parse(first.text);expect(rows).toHaveLength(1);expect(first.total).toBe(3);expect(first.nextOffset).toBe(1);
 expect(first.nextInput).toMatchObject({request:{kind,query:{page:2,pageSize:1}}});
 const second=await readPage(f,first.nextInput);expect(JSON.parse(second.text)).toHaveLength(1);expect(JSON.parse(second.text)[0].id).not.toBe(rows[0].id);expect(second.meta).toMatchObject({page:2,pageSize:1,total:3});
 const final=await readPage(f,{...f.readInput!,request:{...f.readInput!.request,query:{page:4,pageSize:1}}});expect(JSON.parse(final.text)).toEqual([]);expect(final.nextOffset).toBeNull();expect(final.nextInput).toBeNull();
 const services=f.actionServices(db),transport=kind==='knowledge.list'?services.writes.knowledge:kind==='projects.list'?services.writes.projects:services.writes.artifacts;
 const legacy=z.object({data:z.array(z.unknown())}).parse(await transport.request(assistantReadEndpoints[kind]!,{params:f.readInput!.request.params,query:{page:2,pageSize:1},body:undefined} as never,f.ctx));expect(legacy.data).toHaveLength(3);
});
it.each(['candidates.list','outputs.publications.list','publications.revisions.list'] as const)('真实model/tool账本→%s原分页reader不二次裁切，本页total不冒充全库总数',async kind=>{
 const f=await fixture(true,false,{readKind:kind});expect(f.output.status).toBe('ok');
 let current=f.output.data as {text:string;total:number|null;nextOffset:number|null;nextInput:AssistantReadInput|null};
 expect(current.total).toBe(kind==='candidates.list'?3:null);expect((f.output.data as {meta:unknown}).meta).toMatchObject({page:1,pageSize:1,total:kind==='candidates.list'?3:null});const ids:string[]=[];
 for(let page=1;page<=3;page++){
  const rows=JSON.parse(current.text);expect(rows).toHaveLength(1);ids.push(rows[0].id);
  if(page===3&&kind==='candidates.list'){expect(current.nextInput).toBeNull();break;}
  expect(current.nextInput).toMatchObject({request:{kind,query:{page:page+1,pageSize:1}}});
  current=await readPage(f,current.nextInput!);
 }
 expect(new Set(ids).size).toBe(3);
 if(kind!=='candidates.list'){expect(JSON.parse(current.text)).toEqual([]);expect(current.nextInput).toBeNull();expect(current.total).toBeNull();}
});


import {readFileSync} from 'node:fs';
import {projects,contentOutputs,productions,productionEditVersions,productionRenderRequests} from '@creatoros/backend';
import {createProductionService,createProductionTransport} from '../../modules/production';
const nativeV1Definition=JSON.parse(readFileSync(new URL('../../../../docs/verification/t1086/system-read-v1.definition.json',import.meta.url),'utf8'));
async function nativeReadOwnerFixture(scope:'pure-group'|'group-account'|'legacy',catalog:1|2=2){
 const f=await fixture(scope!=='legacy'),services=f.actionServices(db),ctx={...f.ctx};
 if(scope==='group-account'){
  const account=await services.accounts.createAccount(ctx,{platform:'xiaohongshu',accountHandle:`真实读取账号-${++seq}`});
  ctx.accountId=account.id;ctx.groupVersion=(await services.groups.get(ctx,ctx.groupId!)).version;
 }
 const project=await services.projects.createProject(ctx,{title:'原生工程读取当前项目'}),otherProject=await services.projects.createProject(ctx,{title:'同范围其它项目'});
 const outputs=[];
 for(const title of ['空视频','旧视频','原生视频'])outputs.push(await services.projects.createOutput(ctx,project.id,{title,contentType:'video'}));
 const nonVideo=await services.projects.createOutput(ctx,project.id,{title:'非视频',contentType:'image'}),other=await services.projects.createOutput(ctx,otherProject.id,{title:'其它项目视频',contentType:'video'});
 const production=createProductionService({db,now:now,nextId:p=>`${p}-native-read-${++seq}`,assertOutputOwned:(c,id)=>services.projects.getOutput(c,id)}),transport=createProductionTransport(()=>production);
 async function request(endpoint:typeof ENDPOINTS[keyof typeof ENDPOINTS],outputId:string,body?:unknown,c=ctx){return z.object({data:z.unknown(),meta:z.unknown().optional()}).parse(await transport.request(endpoint,{params:{outputId},query:undefined,body} as never,c));}
 const native={editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'c'.repeat(40),mediaRefs:[],nativeDocument:{version:31,metadata:{id:outputs[2]!.id,name:'原工程中文😀\r\n'.repeat(2400)},currentSceneId:'scene',settings:{fps:{numerator:30,denominator:1}},scenes:[{id:'scene',tracks:{main:{id:'main',type:'video',elements:[]},overlay:[{id:'text-track',type:'text',elements:[{id:'caption',type:'text',startTime:0,duration:120000,trimStart:0,trimEnd:0,params:{text:'真实已保存字幕'}}]}],audio:[]}}]}}};
 await request(ENDPOINTS.getOutputProduction,outputs[1]!.id);
 await request(ENDPOINTS.confirmProductionEditingPlan,outputs[1]!.id,{expectedRevision:0,plan:{confirmedAt:now(),sourceArtifactVersionId:null,decisions:{},renderProps:{}}});
 await request(ENDPOINTS.saveProductionEditor,outputs[2]!.id,{expectedRevision:0,requestId:`native-read-save-${++seq}`,source:'manual',plan:native});
 const reads: string[]=[];
 const root=await createAssistantSystemRoot(db,{canvas:f.canvas,actions:{},read:async(c,endpoint,input)=>{
  reads.push(endpoint.id);
  const selected=endpoint.id==='outputs.production.editor.get'?transport:services.writes.projects;
  return z.object({data:z.unknown(),meta:z.unknown().optional()}).parse(await selected.request(endpoint,{params:input.params,query:input.query,body:undefined} as never,c));
 }},{now});
 const definitions=(await prepareChatToolDefinitions(buildChatTools(['system.features','system.read'],{assistantReadCatalogVersion:catalog} as never))).definitions;
 if(catalog===1)definitions[1]=structuredClone(nativeV1Definition);
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId,now,nextId:p=>`${p}-read-bound-${++seq}`});
 const conversation=await repo.createConversation({title:'只读原工程',projectId:project.id,scope:'project'}),message=await repo.createMessage(conversation.id,{role:'user',content:'只读当前工程，不创建候选',attachments:[],modelMetadata:{}});
 const host={...f.host,chatContext:{surface:'project' as const,projectId:project.id},skillSnapshot:{...f.host.skillSnapshot,accountId:ctx.accountId??null,skills:f.host.skillSnapshot.skills.map(skill=>({...skill,effective:{...skill.effective,tools:['system.features','system.read']}}))}};
 const submitted=await createChatTurnSubmissionService(db,{now,assertProject:(c,id)=>services.projects.getProject(c,id),assemble:async()=>({capability:'copilot.assist',system:'只读当前工程',messages:[{role:'user',content:message.content}],tools:definitions,maxSteps:8,maxOutputTokens:128,hostContext:host})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:message.id});
 const claimed=(await createPersistentTaskService(db,{now}).claimTask({taskId:submitted.executionTaskId,workerId:'native-read-owner'}))!;
 const ref={executionTaskId:submitted.executionTaskId,attempt:claimed.lease.attempt,fenceToken:claimed.lease.fenceToken},frozen=await createChatHostContextReader(db,{now}).read(ref);
 const read=(input:unknown,c:RequestContext=ctx)=>root.host.read(c,input as never,frozen);
 const state=async()=>({projects:await db.select().from(projects),outputs:await db.select().from(contentOutputs),productions:await db.select().from(productions),versions:await db.select().from(productionEditVersions),renders:await db.select().from(productionRenderRequests),tasks:await db.select().from(aiTasks),results:await db.select().from(aiTaskResults),canvasLinks:await db.select().from(canvasGenerationLinks)});
 return {ctx,project,otherProject,outputs,nonVideo,other,read,root,frozen,reads,request,native,state,production,ref,canvas:f.canvas};
}
const nativeReadResult=z.object({text:z.string(),complete:z.boolean(),nextWindowOffset:z.number().nullable(),observedRevision:z.number().int().nonnegative().optional(),nextInput:z.unknown().nullable(),nextOffset:z.number().nullable()});
it.each(['pure-group','group-account','legacy'] as const)('T1086 %s 原owner工程状态/归属/当前项目真实读取，零业务写',async scope=>{
 const f=await nativeReadOwnerFixture(scope),before=await f.state();
 const directory=await f.root.host.features(f.ctx,{feature:'video',offset:0,limit:20},f.frozen) as {rows:Array<{reads:string[];actions:string[]}>};
 expect(directory.rows[0]!.reads).toEqual(['projects.outputs.list','outputs.production.editor.get']);expect(directory.rows[0]!.actions).toEqual([]);
 for(const [index,state] of ['empty','legacy','editable'].entries()){
  const input={request:{kind:'outputs.production.editor.get',params:{outputId:f.outputs[index]!.id}}},read=nativeReadResult.parse(await f.read(input));
  const dto=ENDPOINTS.getProductionEditor.response.parse((await f.request(ENDPOINTS.getProductionEditor,f.outputs[index]!.id)).data);
  expect(read.observedRevision).toBe(dto.revision);
  if(read.complete)expect(JSON.parse(read.text)).toEqual(dto);
  expect(dto.state).toBe(state);expect(dto.projectId).toBe(f.project.id);expect(dto.outputId).toBe(f.outputs[index]!.id);
 }
 for(const ctx of [{...f.ctx,userId:'foreign-user'},...(f.ctx.groupId?[{...f.ctx,groupId:'foreign-group'}]:[{...f.ctx,accountId:'foreign-legacy-account'}])])await expect(f.read({request:{kind:'outputs.production.editor.get',params:{outputId:f.outputs[0]!.id}}},ctx)).rejects.toThrow();
 await expect(f.read({request:{kind:'outputs.production.editor.get',params:{outputId:f.other.id}}})).rejects.toThrow('工程与当前真实作品或项目不同');
 await expect(f.read({request:{kind:'outputs.production.editor.get',params:{outputId:f.nonVideo.id}}})).rejects.toThrow();
 expect(await f.state()).toEqual(before);
},1200000);
it('T1086 原作品分页读到全部真实ID，空项目显示0；旧V1和无read目录不广告新GET',async()=>{
 const f=await nativeReadOwnerFixture('pure-group'),before=await f.state();
 let input:unknown={request:{kind:'projects.outputs.list',params:{projectId:f.project.id}},limit:1},seen:string[]=[];
 for(let page=0;page<10;page++){
  const read=nativeReadResult.parse(await f.read(input));seen.push(...(JSON.parse(read.text) as Array<{id:string}>).map(row=>row.id));
  if(read.nextInput===null)break;input=read.nextInput;
 }
 expect(new Set(seen).size).toBe(4);expect(seen).toHaveLength(4);expect(seen).toContain(f.outputs[2]!.id);
 const empty=await f.production.getEditor(f.ctx,f.outputs[0]!.id);expect(empty.revision).toBe(0);expect(empty.productionId).toBeNull();
 expect(await f.state()).toEqual(before);
 const legacy=await nativeReadOwnerFixture('legacy',1),legacyBefore=await legacy.state();
 const directory=await legacy.root.host.features(legacy.ctx,{feature:'video',offset:0,limit:20},legacy.frozen) as {rows:Array<{reads:string[]}>};
 expect(directory.rows[0]!.reads).toEqual(['projects.outputs.list']);
 await expect(legacy.read({request:{kind:'outputs.production.editor.get',params:{outputId:legacy.outputs[0]!.id}}})).rejects.toThrow();expect(legacy.reads).toHaveLength(0);
 const noRead=(await prepareChatToolDefinitions(buildChatTools(['system.features'],{} as never))).definitions;
 const unavailable=await legacy.root.host.features(legacy.ctx,{feature:'video',offset:0,limit:20},{...legacy.frozen,modelInput:{...legacy.frozen.modelInput,tools:noRead}}) as {rows:Array<{reads:string[]}>};
 expect(unavailable.rows[0]!.reads).toEqual([]);expect(await legacy.state()).toEqual(legacyBefore);
 const services=createProjectsService(createProjectRepository(db),{now,nextId:p=>`${p}-empty-read-${++seq}`}),emptyProject=await services.createProject(f.ctx,{title:'没有作品的真实项目'});
 const emptyRead=nativeReadResult.parse(await f.read({request:{kind:'projects.outputs.list',params:{projectId:emptyProject.id}}}));expect(JSON.parse(emptyRead.text)).toEqual([]);expect(emptyRead.nextOffset).toBeNull();
},1200000);
it('T1086 原生长工程固定observedRevision续窗完整还原；原owner合法保存后旧续窗拒绝',async()=>{
 const f=await nativeReadOwnerFixture('pure-group'),before=await f.state(),request={kind:'outputs.production.editor.get',params:{outputId:f.outputs[2]!.id}};
 const original=ENDPOINTS.getProductionEditor.response.parse((await f.request(ENDPOINTS.getProductionEditor,f.outputs[2]!.id)).data);
 let part=nativeReadResult.parse(await f.read({request}));expect(part.complete).toBe(false);expect(part.observedRevision).toBe(1);let text=part.text;
 for(let page=0;!part.complete&&page<20;page++){
  part=nativeReadResult.parse(await f.read({request,window:{offsetUtf16:part.nextWindowOffset!,lengthUtf16:12000,expectedRevision:1}}));expect(part.observedRevision).toBe(1);text+=part.text;
 }
 expect(part.complete).toBe(true);expect(JSON.parse(text)).toEqual(original);expect(await f.state()).toEqual(before);
 const first=nativeReadResult.parse(await f.read({request}));
 const changed=structuredClone(f.native);changed.referenceEditor.nativeDocument.metadata.name='原owner合法保存的新工程版本';
 await f.request(ENDPOINTS.saveProductionEditor,f.outputs[2]!.id,{expectedRevision:1,requestId:`native-read-next-save-${++seq}`,source:'manual',plan:changed});
 const afterSave=await f.state();
 await expect(f.read({request,window:{offsetUtf16:first.nextWindowOffset!,expectedRevision:first.observedRevision!}})).rejects.toThrow('原生工程版本已变化');
 const reread=nativeReadResult.parse(await f.read({request}));expect(reread.observedRevision).toBe(2);expect(JSON.parse(reread.text)).toEqual(ENDPOINTS.getProductionEditor.response.parse((await f.request(ENDPOINTS.getProductionEditor,f.outputs[2]!.id)).data));
 expect(await f.state()).toEqual(afterSave);
},1200000);

it('T1086 原output/production父归组损坏保持原拒绝，错误原owner响应身份不被当成当前工程',async()=>{
 const f=await nativeReadOwnerFixture('pure-group'),outputId=f.outputs[2]!.id,request={request:{kind:'outputs.production.editor.get',params:{outputId}}};
 await db.update(contentOutputs).set({groupId:'foreign-parent'}).where(eq(contentOutputs.id,outputId));
 const corruptedOutput=await f.state();await expect(f.read(request)).rejects.toThrow();expect(await f.state()).toEqual(corruptedOutput);
 await db.update(contentOutputs).set({groupId:f.ctx.groupId!}).where(eq(contentOutputs.id,outputId));
 await db.update(productions).set({groupId:'foreign-production'}).where(eq(productions.contentOutputId,outputId));
 const corruptedProduction=await f.state();await expect(f.read(request)).rejects.toThrow();expect(await f.state()).toEqual(corruptedProduction);
 await db.update(productions).set({groupId:f.ctx.groupId!}).where(eq(productions.contentOutputId,outputId));
 const before=await f.state();
 // 原transport实际返回另一真实作品DTO；只校验错误端口响应身份，没有手工DTO。
 const redirected=await createAssistantSystemRoot(db,{canvas:f.canvas,actions:{},read:async()=>f.request(ENDPOINTS.getProductionEditor,f.outputs[0]!.id)},{now});
 await expect(redirected.host.read(f.ctx,request as never,f.frozen)).rejects.toThrow('工程与当前真实作品或项目不同');
 expect(await f.state()).toEqual(before);
},1200000);
