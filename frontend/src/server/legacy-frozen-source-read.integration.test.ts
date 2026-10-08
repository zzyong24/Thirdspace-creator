// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {ENDPOINTS,type RequestContext} from '@creatoros/contract';
import type {Db,ConfiguredDb} from '@creatoros/backend';
import type {ExecutionRef,WorkerPort} from '@creatoros/contract/execution-worker';
import type {ChatBackendTool} from '../../../backend/src/modules/execution/execution-chat-tool-ports.service';
import type {ChatWorkbenchCapabilityHost} from '../../../backend/src/modules/ai-runtime/chat-workbench-capability-host';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {cp,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const fixture=vi.hoisted(()=>({db:undefined as Db|undefined,historical:undefined as ConfiguredDb|undefined}));
vi.mock('@creatoros/backend',async original=>{
 const actual=await original<typeof import('@creatoros/backend')>();
 return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{
  const opened=fixture.historical??await actual.createConfiguredDb(...args);fixture.db=opened.db;return opened;
 }};
});

vi.mock('@creatoros/backend/modules/assets',async original=>{
 const actual=await original<typeof import('@creatoros/backend/modules/assets')>();
 return {...actual,migrateStorageRoot:async()=>{throw Error('本隔离测试禁止迁移媒体目录');}};
});
import {getChatRuntime,compositeTransport,__resetPersistenceForTests} from './persistence-client';
import {resolveRequestContext} from '../lib/request-context.server';
import {prepareChatReply} from './prepare-chat-reply';

/** 原公开resolver及合同transport，不在测试中给账号入口补group。 */
async function publicData(operation:string,accountId:string|null,params?:unknown,body?:unknown,query?:unknown){
 const ctx=await resolveRequestContext(null,accountId,{rejectInvalidToken:true});
 expect(ctx.groupId??null).toBeNull();
 const endpoint=Object.values(ENDPOINTS).find(e=>e.id===operation)!;
 const response=await compositeTransport.request(endpoint,{params:endpoint.params?.parse(params),body:endpoint.body?.parse(body),query:endpoint.query?.parse(query??{})} as never,ctx) as {data:unknown};
 return endpoint.isList?endpoint.response.array().parse(response.data):endpoint.response.parse(response.data);
}

it('已登记账号只选account创建项目/全局会话和两种稿件，原RETURNING与严格group owner均可读取',{timeout:180000,retry:0},async()=>{
 vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR','');__resetPersistenceForTests();
 try{
  const runtime=await getChatRuntime();await runtime.durable.stop();
  const account=ENDPOINTS.createAccount.response.parse(await publicData('accounts.create',null,undefined,{platform:'xiaohongshu',accountHandle:'隔离三来源测试',idempotencyKey:'t1089-public-account'}));
  const groups=ENDPOINTS.listAccountGroups.response.array().parse(await publicData('accountGroups.list',account.id,undefined,undefined,{page:1,pageSize:100}));
  const owned=groups.filter(g=>g.members.some(m=>m.accountId===account.id));expect(owned).toHaveLength(1);const groupId=owned[0]!.id;
  const project=ENDPOINTS.createProject.response.parse(await publicData('projects.create',account.id,undefined,{title:'账号入口项目'}));
  const conversation=ENDPOINTS.createConversation.response.parse(await publicData('ai.conversations.create',account.id,undefined,{title:'项目会话',projectId:project.id,scope:'project:'+project.id}));
  const global=ENDPOINTS.createConversation.response.parse(await publicData('ai.conversations.create',account.id,undefined,{title:'全局会话',scope:'global'}));
  const article=ENDPOINTS.createOutput.response.parse(await publicData('projects.outputs.create',account.id,{projectId:project.id},{title:'真实隔离文章',contentType:'article',clientRequestId:'t1089-public-article'}));
  const graphic=ENDPOINTS.createOutput.response.parse(await publicData('projects.outputs.create',account.id,{projectId:project.id},{title:'真实隔离图文',contentType:'image',clientRequestId:'t1089-public-graphic'}));
  // 作品名称与正式稿标题是不同字段，经原owner保存真实版本再读，不能把空稿冒充有正文。
  const initialArticle=ENDPOINTS.getArticle.response.parse(await publicData('articles.get',account.id,{outputId:article.id}));
  await publicData('articles.versions.create',account.id,{outputId:article.id},{expectedCurrentVersionId:initialArticle.currentVersionId,document:{...initialArticle.current,title:'真实隔离文章',summary:'保存的文章正文'},clientRequestId:'t1089-article-save'});
  const initialGraphic=ENDPOINTS.getGraphicPost.response.parse(await publicData('graphicPosts.get',account.id,{outputId:graphic.id}));
  await publicData('graphicPosts.versions.create',account.id,{outputId:graphic.id},{expectedCurrentVersionId:initialGraphic.currentVersionId,document:{...initialGraphic.current,title:'真实隔离图文',body:'保存的图文正文'},clientRequestId:'t1089-graphic-save'});
  const {sql}=await import('@creatoros/backend');
  const stamps=await fixture.db!.execute(sql`SELECT 'conversation' AS family,group_id,account_id FROM ai_conversations WHERE id IN (${conversation.id},${global.id}) UNION ALL SELECT 'article',group_id,account_id FROM article_anchors WHERE output_id=${article.id} UNION ALL SELECT 'graphic',group_id,account_id FROM graphic_post_anchors WHERE output_id=${graphic.id}`);
  expect(stamps.rows).toHaveLength(4);for(const row of stamps.rows)expect(row).toMatchObject({group_id:groupId,account_id:account.id});
  expect(conversation.groupId).toBe(groupId);expect(global.groupId).toBe(groupId);
  const ctx:RequestContext={...await resolveRequestContext(null,account.id,{rejectInvalidToken:true}),groupId};
  const read=async(operation:string,params:unknown,query?:unknown)=>{const e=Object.values(ENDPOINTS).find(e=>e.id===operation)!;const r=await compositeTransport.request(e,{params:e.params?.parse(params),query:e.query?.parse(query??{})} as never,ctx) as {data:unknown};return e.isList?e.response.array().parse(r.data):e.response.parse(r.data);};
  const conversations=ENDPOINTS.listConversations.response.array().parse(await read('ai.conversations.list',undefined,{page:1,pageSize:100}));
  expect(conversations.map(c=>c.id)).toEqual(expect.arrayContaining([conversation.id,global.id]));
  await read('ai.conversations.messages.list',{conversationId:conversation.id});
  await read('ai.conversations.messages.list',{conversationId:global.id});
  expect(ENDPOINTS.getArticle.response.parse(await read('articles.get',{outputId:article.id})).current.title).toBe('真实隔离文章');
  expect(ENDPOINTS.getGraphicPost.response.parse(await read('graphicPosts.get',{outputId:graphic.id})).current.title).toBe('真实隔离图文');
 }finally{await (globalThis as typeof globalThis&{__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();}
});

const recoveryBudget={maxCalls:32,maxTokens:300000,deadlineMs:1200000};
type RecoveryFamily='null-frozen'|'canonical-null-conversation'|'canonical-null-anchors';
function deferred<T>(){
 let resolveValue!:(value:T)=>void;
 const promise=new Promise<T>(done=>{resolveValue=done;});
 return {promise,resolve:resolveValue};
}
async function ownedData(operation:string,ctx:RequestContext,params?:unknown,body?:unknown,query?:unknown):Promise<unknown>{
 const endpoint=Object.values(ENDPOINTS).find(e=>e.id===operation)!;
 if(!endpoint)throw Error('未知正式端点:'+operation);
 const response=await compositeTransport.request(endpoint,{params:endpoint.params?.parse(params),body:endpoint.body?.parse(body),query:endpoint.query?.parse(query??{})} as never,ctx) as {data:unknown};
 return endpoint.isList?endpoint.response.array().parse(response.data):endpoint.response.parse(response.data);
}

/** 真实旧104正常migrator，仅在本例临时目录裁掉尚未存在的0130；不改项目journal/receipt。 */
async function historical104(){
 const {schema}=await import('@creatoros/backend');
 const backendRequire=createRequire(new URL('../../../backend/package.json',import.meta.url));
 type Client=Awaited<ReturnType<typeof import('@creatoros/backend')['createDb']>>['client'];
 const {PGlite}=backendRequire('@electric-sql/pglite') as {PGlite:new(dataDir:string)=>Client};
 const {drizzle}=backendRequire('drizzle-orm/pglite') as {drizzle:(client:Client,options:{schema:typeof schema})=>Db};
 const {migrate}=backendRequire('drizzle-orm/pglite/migrator') as {migrate:(db:Db,options:{migrationsFolder:string})=>Promise<void>};
 const root=await mkdtemp(join(tmpdir(),'t1089-frozen-'));
 const staged=join(root,'104'),folder=fileURLToPath(new URL('../../../backend/drizzle',import.meta.url));
 await cp(folder,staged,{recursive:true});
 const journal=JSON.parse(await readFile(join(staged,'meta/_journal.json'),'utf8'));
 expect(journal.entries.length).toBeGreaterThanOrEqual(104);
 journal.entries=journal.entries.slice(0,104);
 await writeFile(join(staged,'meta/_journal.json'),JSON.stringify(journal));
 await rm(join(staged,'0130_legacy_source_ownership.sql'),{force:true});
 const dataDir=join(root,'db'),client=new PGlite(dataDir),db=drizzle(client,{schema});
 await migrate(db,{migrationsFolder:staged});
 const ledger=(await client.query<{hash:string;created_at:number}>('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
 expect(ledger).toHaveLength(104);expect(Number(ledger.at(-1)!.created_at)).toBe(1791043200002);
 let closed=false;
 const configured:ConfiguredDb={db,driver:{kind:'file-pglite',target:dataDir},dispose:async()=>{if(!closed){closed=true;await client.close();}}};
 return {root,dataDir,db,client,configured,ledger};
}

async function frozenRows(db:Db){
 const {sql}=await import('@creatoros/backend');
 const result:Record<string,unknown[]>={};
 for(const table of ['platform_accounts','account_groups','account_group_memberships','projects','content_outputs','artifacts','artifact_versions','article_anchors','graphic_post_anchors','ai_conversations','ai_messages','ai_tasks','ai_task_results','execution_tasks','execution_calls','execution_stream_events']){
  // SEMANTIC_BOUNDARY_ALLOW:固定测试表清单与主键顺序用于原数据深等，不选择创作内容。
  result[table]=(await db.execute(sql.raw('SELECT * FROM '+table+' ORDER BY 1,2'))).rows;
 }
 return result;
}
function withoutGroup(rows:unknown[]){
 return rows.map(raw=>{const {group_id,...other}=raw as Record<string,unknown>;return other;});
}
/** SEMANTIC_BOUNDARY_ALLOW:仅解包原Worker operationRef和JSON，业务DTO仍由正式endpoint schema解析。 */
function readResults(raw:unknown):Array<{requestKind:string;text:string;complete:boolean}>{
 if(typeof raw==='string'){
  const text=raw.replace(/^\[原工具调用 ID: [^\n]+；完成计划步骤时引用此 operationRef。\]\n/u,'');
  try{return readResults(JSON.parse(text));}catch{return [];}
 }
 if(Array.isArray(raw))return raw.flatMap(readResults);
 if(!raw||typeof raw!=='object')return [];
 const value=raw as Record<string,unknown>;
 if(value.kind==='system.read'&&typeof value.requestKind==='string'&&typeof value.text==='string'&&typeof value.complete==='boolean')return [{requestKind:value.requestKind,text:value.text,complete:value.complete}];
 return Object.values(value).flatMap(readResults);
}

/** 完整原host目录和真实命名端口；计数只包实际handler，不把回执读取算新执行。 */
async function recoveryPorts(runtime:Awaited<ReturnType<typeof getChatRuntime>>,db:Db,ref:ExecutionRef,mediaRoot:string,state:{handlers:number}){
 const {createChatHostContextReader}=await import('../../../backend/src/modules/ai/chat-host-context.service');
 const {createAssistantSystemRoot}=await import('../../../backend/src/application/chat/assistant-system-root');
 const {createCreativeCanvasService}=await import('../../../backend/src/modules/creative-canvas');
 const {createChatSystemToolHost}=await import('../../../backend/src/modules/ai-runtime/chat-system-tool-host');
 const {createChatTaskToolHost}=await import('../../../backend/src/modules/ai-runtime/chat-task-tool-host');
 const {createChatIngestionTaskToolHost}=await import('../../../backend/src/modules/ai-runtime/chat-ingestion-tool-host');
 const {createChatWorkbenchPlanToolHost}=await import('../../../backend/src/modules/ai-runtime/chat-workbench-plan-tool-host');
 const {createChatWorkbenchCapabilityHost}=await import('../../../backend/src/modules/ai-runtime/chat-workbench-capability-host');
 const {loadPositioningWorksBrief}=await import('../../../backend/src/modules/ai-runtime/creative-context');
 const {createExecutionLeaseService}=await import('../../../backend/src/modules/execution/execution-lease.service');
 const {createExecutionWorkerCallPorts}=await import('../../../backend/src/modules/execution/execution-worker-call-ports.service');
 const {createExecutionGenerationPorts}=await import('../../../backend/src/modules/execution/execution-generation-ports.service');
 const {createExecutionCheckpointService}=await import('../../../backend/src/modules/execution/execution-checkpoint.service');
 const {createExecutionStreamService}=await import('../../../backend/src/modules/execution/execution-stream.service');
 const {createExecutionChatToolPorts}=await import('../../../backend/src/modules/execution/execution-chat-tool-ports.service');
 const {createExecutionModelIdentityService}=await import('../../../backend/src/modules/execution/execution-model-identity.service');
 const {createPersistentTaskService}=await import('../../../backend/src/modules/execution/persistent-task.service');
 const {createWorkbenchPlanService,validateTerminalPlanFailures,validateTerminalToolFailures}=await import('../../../backend/src/modules/execution/workbench-plan.service');
 const {createChatTurnCompletionService}=await import('../../../backend/src/modules/ai/chat-turn-completion.service');
 const {createAgenticToolBinding}=await import('../../../backend/src/modules/execution/agentic-tool-binding');
 const {chatWorkerInputSchema}=await import('@creatoros/contract/execution-worker');
 const now=()=>new Date().toISOString();
 const leases=createExecutionLeaseService(db,{now}),reader=createChatHostContextReader(db,{now}),streams=createExecutionStreamService(db,{now});
 const calls=createExecutionWorkerCallPorts(db,{now,budget:recoveryBudget}),generation=createExecutionGenerationPorts(db,{now,budget:recoveryBudget});
 const input=chatWorkerInputSchema.parse(await calls.readTaskContext(ref));
 const host=await reader.read(ref),signal=new AbortController().signal;
 const denied=async()=>{throw Error('本夹具禁止生成、素材和画布写入');};
 const canvas=createCreativeCanvasService(db,{now,assertProject:async(c,id)=>{await ownedData('projects.get',c,{projectId:id});},assertMediaAsset:denied,assertReferenceAsset:denied,getMediaFileDownloadUrl:denied,getReference:denied,readTask:denied,readTaskResults:denied,submitTask:denied});
 const root=await createAssistantSystemRoot(db,{canvas,actions:{},read:async(c,e,data)=>await compositeTransport.request(e,{params:data.params,query:data.query,body:undefined} as never,c) as {data:unknown;meta?:unknown}},{now});
 const system=createChatSystemToolHost(reader,root.host);
 const task=createChatTaskToolHost(reader,runtime.contextReaders,{
  webRead:true,research:true,
  cover:{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatCoverTask},
  agenticResearch:{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatResearchTask},
  material:{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatMaterialTask},
  publish:{preparePublish:runtime.prepareChatPublishTask,wakeTask:runtime.wakeChatPublishTask},
  review:{prepareReview:runtime.prepareChatScriptReviewTask,wakeTask:runtime.wakeChatScriptReviewTask},
  scriptDraft:{readCurrentScript:runtime.readCurrentScript,prepareDraft:runtime.prepareChatScriptDraftTask,wakeTask:runtime.wakeChatScriptDraftTask},
  scriptPatch:{resolveSelection:(c,data)=>runtime.resolveCurrentScriptSelection!(c,data)},videoEdit:{prepareVideoEdit:runtime.prepareVideoEdit},
  planning:{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatPlanningTask},
  local:{detectTools:runtime.detectTools,listAuthorizedDirs:runtime.listAuthorizedDirs},
  localRead:{readLocalFile:runtime.readLocalFile,decideLocalReadAccess:runtime.decideLocalReadAccess},
  structured:{readCurrentScript:runtime.readCurrentScript,readWorks:(c,limit)=>loadPositioningWorksBrief(c,runtime.context.positioningWorks,limit),getPositioningDiscovery:runtime.getPositioningDiscovery},
 });
 const ingestion=createChatIngestionTaskToolHost(reader,runtime),plan=createChatWorkbenchPlanToolHost(db);
 const workbenchHost=(runtime.durable as typeof runtime.durable&{workbenchHost?:ChatWorkbenchCapabilityHost}).workbenchHost;
 const workbench=workbenchHost?createChatWorkbenchCapabilityHost(workbenchHost,r=>leases.withLease(r,'admission',async({task:row,context})=>({userId:context.userId,accountId:context.accountId!,taskId:row.id,attempt:row.attempt,fenceToken:row.fenceToken!,leaseId:row.leaseOwner!})),(r,id,progress)=>streams.appendWorkbenchProgress(r,id,progress)):null;
 const prototypes:Record<string,ChatBackendTool>=Object.assign({},await task(host.context,input,ref,signal),await ingestion(host.context,input,ref,signal),await plan(host.context,input,ref,signal),await system(host.context,input,ref,signal),workbench?await workbench(host.context,input,ref,signal):{});
 expect(input.tools.filter(d=>!Object.hasOwn(prototypes,d.name)).map(d=>d.name)).toEqual([]);
 const tools:Record<string,ChatBackendTool>=Object.fromEntries(Object.entries(prototypes).map(([name,tool])=>[name,tool.execute?{...tool,execute:async(...args:Parameters<NonNullable<ChatBackendTool['execute']>>)=>{state.handlers++;return tool.execute!(...args);}}:tool]));
 const {createAssetsService,createAssetRepository,createLocalFsObjectStorage}=await import('@creatoros/backend/modules/assets');
 const {createBrowserSessionsService}=await import('@creatoros/backend/modules/browser-sessions');
 const {createSettingsRepository,createSettingsService}=await import('@creatoros/backend/modules/settings');
 const {resolveSearchSpec}=await import('@creatoros/backend/modules/ai-runtime');
 let id=0;const ids={now,nextId:(prefix:string)=>prefix+'-t1089-web-'+(++id)};
 const storage=createLocalFsObjectStorage({rootPath:mediaRoot,publicBaseUrl:'/blob'},{nextKey:()=> 't1089-web-'+(++id)}),settings=createSettingsService(()=>createSettingsRepository(db,ids),denied,denied);
 const webRead={assets:createAssetsService(createAssetRepository(db,ids),async()=>storage,ids),objectStorageForCtx:async()=>storage,sessions:createBrowserSessionsService({db,...ids,masterKey:Buffer.alloc(32,27)}),resolveSearch:(c:RequestContext)=>resolveSearchSpec(c,{env:{},getModelConfig:(owner,capability)=>settings.getModelConfig(owner,capability)})};
 const chat=createExecutionChatToolPorts(db,{now,budget:recoveryBudget,tools,webRead});expect(await chat.validateTask(ref)).toEqual(input);
 const completion=createChatTurnCompletionService(db,{now,validateTerminalPlanFailures,validateTerminalToolFailures}),binding=createAgenticToolBinding(tools);
 return {db,reader,leases,input,tools,chat,calls,generation,streams,checkpoint:createExecutionCheckpointService(db,{now}),
  identity:createExecutionModelIdentityService(db,{now}),tasks:createPersistentTaskService(db,{now}),plans:createWorkbenchPlanService(db,{now}),
  complete:(raw:unknown)=>completion.commitResult(ref,raw,(row,all,call)=>binding.forCall(row,all,call))};
}

let recoveryWorkerBuilt=false;
it.each(['null-frozen','canonical-null-conversation','canonical-null-anchors'] as const)(
 '104→0130 %s 原冻结/完整子进程Worker/已结算回执/原completion与同source重放',{timeout:1200000,retry:0},async(family:RecoveryFamily)=>{
  if(!recoveryWorkerBuilt){execFileSync(process.execPath,[resolve('../ai-worker/scripts/build.mjs')],{stdio:'pipe',timeout:1200000});recoveryWorkerBuilt=true;}
  const {createDb,eq,executionTasks,executionCalls,aiMessages,aiTasks,aiTaskResults,executionStreamEvents,sql}=await import('@creatoros/backend');
  const {createAiRepository}=await import('../../../backend/src/modules/ai/ai.repository');
  const {createChatTurnSubmissionService}=await import('../../../backend/src/modules/ai/chat-turn-submission.service');
  const {createChatHostContextReader}=await import('../../../backend/src/modules/ai/chat-host-context.service');
  const {createPersistentTaskService}=await import('../../../backend/src/modules/execution/persistent-task.service');
  const {createWorkerSupervisor}=await import('../../../backend/src/modules/execution/worker-supervisor');
  const {workerPortInputSchemas,workerToolResultReceiptSchema,agenticToolOutcomeSchema,chatWorkerInputSchema}=await import('@creatoros/contract/execution-worker');
  const old=await historical104(),supervisors:Array<ReturnType<typeof createWorkerSupervisor>>=[];
  fixture.historical=old.configured;vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR','');__resetPersistenceForTests();
  let ports:Awaited<ReturnType<typeof recoveryPorts>>|undefined;
  let phase=Promise.resolve(),releasePhase:(()=>void)|undefined;
  const commits:Array<{body:ReturnType<typeof workerPortInputSchemas.commitChatResult.parse>;reply:ReturnType<typeof deferred<unknown>>}>=[];
  const requests:unknown[]=[],modelErrors:string[]=[],state={handlers:0};
  let projectId:string|undefined,readKind='projects.list',outputIds:string[]=[];
  const server=createServer(async(req,res)=>{
   try{
    let raw='';for await(const chunk of req)raw+=chunk.toString();
    const body=JSON.parse(raw);requests.push(body);
    if(!body.tools?.some((t:{function?:{name?:string}})=>t.function?.name==='system_read'))throw Error('完整冻结system.read声明缺失');
    let delta:unknown,finish:string;
    if(requests.length===1){
     delta={tool_calls:[{index:0,id:'legacy-original-read',type:'function',function:{name:'system_read',arguments:JSON.stringify({request:projectId?{kind:readKind,params:{projectId}}:{kind:readKind,query:{page:1,pageSize:5}}})}}]};finish='tool_calls';
    }else if(requests.length===2){
     const observed=readResults(body.messages).find(r=>r.requestKind===readKind&&r.complete);
     if(!observed)throw Error('前一轮原owner读取回执未完整');
     const endpoint=projectId?ENDPOINTS.listOutputs:ENDPOINTS.listProjects;
     const values=endpoint.response.array().parse(JSON.parse(observed.text));
     if(projectId)expect(values.map(row=>row.id).sort()).toEqual([...outputIds].sort());else expect(values).toEqual([]);
     delta={content:'已按原owner读取原项目；未写入、生成或创建候选。'};finish='stop';
    }else throw Error('已结算回放禁止新增模型请求');
    res.writeHead(200,{'content-type':'text/event-stream'});
    const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:finish}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
    res.end(chunks.map(chunk=>'data: '+JSON.stringify({id:'t1089-fixture',object:'chat.completion.chunk',created:1,model:'fixture',...chunk})+'\n\n').join('')+'data: [DONE]\n\n');
   }catch(error){modelErrors.push(error instanceof Error?error.message:String(error));res.writeHead(500);res.end('FIXTURE_PROTOCOL_ERROR');}
  });
  try{
   await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
   let runtime=await getChatRuntime();await runtime.durable.stop();let db=old.db;
   let ctx=await resolveRequestContext(null,null,{rejectInvalidToken:true});
   if(family==='null-frozen'){
    const {createPlatformAccountRepository}=await import('@creatoros/backend/modules/platform-account');
    const now=()=>new Date().toISOString();
    const account=await createPlatformAccountRepository(db,{userId:ctx.userId,now,nextId:p=>p+'-t1089-null'}).createAccount({platform:'xiaohongshu',accountHandle:'原无成员账号'});
    ctx=await resolveRequestContext(null,account.id,{rejectInvalidToken:true});
    expect((await db.execute(sql.raw('SELECT * FROM account_group_memberships'))).rows).toHaveLength(0);
   }else{
    const account=ENDPOINTS.createAccount.response.parse(await ownedData('accounts.create',ctx,undefined,{platform:'xiaohongshu',accountHandle:'原登记账号',idempotencyKey:'original-'+family}));
    ctx=await resolveRequestContext(null,account.id,{rejectInvalidToken:true});
   }
   expect(ctx.groupId??null).toBeNull();
   const canonical='grp_legacy_'+ctx.accountId;
   let originalArticle:unknown,originalGraphic:unknown,articleId:string|undefined,graphicId:string|undefined;
   if(family!=='null-frozen'){
    const project=ENDPOINTS.createProject.response.parse(await ownedData('projects.create',ctx,undefined,{title:'原104项目'}));projectId=project.id;readKind='projects.outputs.list';
    const article=ENDPOINTS.createOutput.response.parse(await ownedData('projects.outputs.create',ctx,{projectId},{title:'原文章作品',contentType:'article',clientRequestId:'original-article-'+family}));
    const graphic=ENDPOINTS.createOutput.response.parse(await ownedData('projects.outputs.create',ctx,{projectId},{title:'原图文作品',contentType:'image',clientRequestId:'original-graphic-'+family}));
    articleId=article.id;graphicId=graphic.id;outputIds=[article.id,graphic.id];
    const a=ENDPOINTS.getArticle.response.parse(await ownedData('articles.get',ctx,{outputId:article.id}));
    await ownedData('articles.versions.create',ctx,{outputId:article.id},{expectedCurrentVersionId:a.currentVersionId,document:{...a.current,title:'原正式文章',summary:'原正文不变'},clientRequestId:'original-article-version-'+family});
    const g=ENDPOINTS.getGraphicPost.response.parse(await ownedData('graphicPosts.get',ctx,{outputId:graphic.id}));
    await ownedData('graphicPosts.versions.create',ctx,{outputId:graphic.id},{expectedCurrentVersionId:g.currentVersionId,document:{...g.current,title:'原正式图文',body:'原图文正文不变'},clientRequestId:'original-graphic-version-'+family});
    originalArticle=await ownedData('articles.get',ctx,{outputId:article.id});originalGraphic=await ownedData('graphicPosts.get',ctx,{outputId:graphic.id});
    expect((await db.execute(sql.raw('SELECT group_id FROM article_anchors UNION ALL SELECT group_id FROM graphic_post_anchors'))).rows).toEqual([{group_id:null},{group_id:null}]);
   }
   const sourceCtx=family==='canonical-null-anchors'?{...ctx,groupId:canonical}:ctx;
   const conversation=ENDPOINTS.createConversation.response.parse(await ownedData('ai.conversations.create',sourceCtx,undefined,{title:'原冻结会话',...(projectId?{projectId}:{}),scope:projectId?'project:'+projectId:'global'}));
   expect(conversation.groupId??null).toBe(family==='canonical-null-anchors'?canonical:null);
   const now=()=>new Date().toISOString(),repo=createAiRepository(db,{userId:sourceCtx.userId,accountId:sourceCtx.accountId??null,groupId:sourceCtx.groupId,now,nextId:p=>p+'-original-source-'+family});
   const source=await repo.createMessage(conversation.id,{role:'user',content:'只读取原项目，不写入、不生成、不提出候选。',attachments:[],modelMetadata:{}});
   const submitFor=(actualDb:Db,actualRuntime:typeof runtime)=>createChatTurnSubmissionService(actualDb,{now,assertProject:async(c,id)=>{await ownedData('projects.get',c,{projectId:id});},assemble:(c,snapshot,options)=>prepareChatReply(actualRuntime,c,snapshot,options)});
   const submitted=await submitFor(db,runtime).submit(sourceCtx,{conversationId:conversation.id,sourceMessageId:source.id});
   const [submittedTask]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
   const frozen=chatWorkerInputSchema.parse((submittedTask!.payload as {modelInput:unknown}).modelInput);
   expect(frozen.groupId??null).toBe(family==='null-frozen'?null:canonical);
   expect(submittedTask!.groupId).toBe(frozen.groupId??null);expect(frozen.tools.length).toBeGreaterThan(20);
   const claim=await createPersistentTaskService(db,{now}).claimTask({taskId:submitted.executionTaskId,workerId:'t1089-owned-worker',leaseSeconds:1800});
   expect(claim).not.toBeNull();
   const ref={executionTaskId:submitted.executionTaskId,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
   if(family==='canonical-null-conversation'){
    await expect(createChatHostContextReader(db,{now}).read(ref)).rejects.toThrow('会话不存在或不可访问');
    expect(await db.select().from(executionCalls)).toHaveLength(0);expect(requests).toHaveLength(0);expect(state.handlers).toBe(0);
   }else{
    ports=await recoveryPorts(runtime,db,ref,join(old.root,'media'),state);
    expect((await ports.reader.read(ref)).modelInput).toEqual(frozen);
   }
   async function startWorker(){
    const supervisor=createWorkerSupervisor({entryPath:resolve('../ai-worker/dist/execution-worker.cjs'),startupTimeoutMs:120000,ports:{
     async validate(execution,mode){await phase;await ports!.leases.withLease(execution,mode,async()=>{});},
     async invoke(execution,port:WorkerPort,raw){
      await phase;const current=ports!;
      switch(port){
       case 'readTaskContext':return current.calls.readTaskContext(execution);
       case 'resolveModelCredential':{const args=workerPortInputSchemas.resolveModelCredential.parse(raw);return current.identity.pin(execution,args.capability,{apiFormat:'openai_chat',baseUrl:'http://127.0.0.1:'+(server.address() as {port:number}).port+'/v1',model:'fixture',token:'fixture'});}
       case 'resolveChatFallbackCredential':return null;
       case 'readCheckpoint':return current.checkpoint.read(execution);
       case 'saveCheckpoint':return current.checkpoint.save(execution,raw);
       case 'reserveGenerationCall':return current.generation.reserveGenerationCall(execution,raw);
       case 'startCall':return current.calls.startCall(execution,raw);
       case 'settleGenerationCall':return current.generation.settleGenerationCall(execution,raw);
       case 'appendStreamEvents':return current.streams.append(execution,raw);
       case 'checkChatToolApproval':return current.chat.check(execution,raw);
       case 'reserveAgenticTool':return current.chat.reserve(execution,raw);
       case 'startAgenticTool':return current.chat.start(execution,raw);
       case 'executeAgenticTool':return current.chat.execute(execution,raw);
       case 'settleAgenticTool':return current.chat.settle(execution,raw);
       case 'readWorkbenchPlan':return current.plans.status(execution,raw);
       case 'heartbeat':await current.tasks.heartbeat({taskId:execution.executionTaskId,workerId:'t1089-owned-worker',attempt:execution.attempt,leaseSeconds:1800});return {};
       case 'commitChatResult':{const entry={body:workerPortInputSchemas.commitChatResult.parse(raw),reply:deferred<unknown>()};commits.push(entry);return entry.reply.promise;}
       default:throw Error('本只读回合不允许未绑定端口:'+port);
      }
     },
    }});
    supervisors.push(supervisor);expect(await supervisor.start()).toEqual(expect.arrayContaining(['chat.run','chat.web-read','chat.research','chat.structured','chat.script-draft','chat.hooks']));
    const result=supervisor.run(ref,submittedTask!.deadlineAt===null?null:Date.parse(submittedTask!.deadlineAt!));
    void result.catch(()=>undefined);return {result};
   }
   const workerRuns:Array<{result:Promise<string>}>=[];
   if(family!=='canonical-null-conversation'){
    workerRuns.push(await startWorker());await vi.waitFor(()=>{expect(commits.length,JSON.stringify({requests:requests.length,modelErrors})).toBe(1);},{timeout:120000});
    expect(requests).toHaveLength(2);expect(state.handlers).toBe(1);expect(modelErrors).toEqual([]);
    expect((await ports!.checkpoint.read(ref)).recovery).toBe('ready');
    const calls=await db.select().from(executionCalls);expect(calls).toHaveLength(3);expect(calls.every(c=>c.status==='settled')).toBe(true);
    const tool=calls.find(c=>c.kind==='tool')!,receipt=workerToolResultReceiptSchema.parse(JSON.parse(tool.resultText!));
    expect(agenticToolOutcomeSchema.parse(receipt.output)).toMatchObject({status:'ok',sideEffect:'none'});
    expect((await db.select().from(executionStreamEvents)).some(e=>e.chunk.type==='tool-output-available')).toBe(true);
   }
   if(family==='null-frozen'){
    const [beforeRegistration]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
    const [beforeBusinessRegistration]=await db.select().from(aiTasks).where(eq(aiTasks.id,submitted.taskId));
    const groups=ENDPOINTS.listAccountGroups.response.array().parse(await ownedData('accountGroups.list',ctx,undefined,undefined,{page:1,pageSize:100}));
    expect(groups.filter(g=>g.id===canonical&&g.members.some(m=>m.accountId===ctx.accountId&&m.version===1))).toHaveLength(1);
    const [afterRegistration]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
    const [afterBusinessRegistration]=await db.select().from(aiTasks).where(eq(aiTasks.id,submitted.taskId));
    expect(afterRegistration!.payload).toEqual(beforeRegistration!.payload);
    expect(afterBusinessRegistration!.inputData).toEqual(beforeBusinessRegistration!.inputData);
    expect(afterRegistration).toMatchObject({id:beforeRegistration!.id,attempt:beforeRegistration!.attempt,fenceToken:beforeRegistration!.fenceToken,groupId:null,groupVersion:null,membershipVersion:null});
   }
   const hold=deferred<void>();phase=hold.promise;releasePhase=()=>hold.resolve();
   const before=await frozenRows(db),beforeRequests=requests.length,beforeHandlers=state.handlers;
   await (globalThis as typeof globalThis&{__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();fixture.historical=undefined;
   const upgraded=await createDb({dataDir:old.dataDir});db=upgraded.db;
   const after=await frozenRows(db);
   for(const [table,rows] of Object.entries(before)){
    expect(['ai_conversations','article_anchors','graphic_post_anchors'].includes(table)?withoutGroup(after[table]!):after[table]).toEqual(['ai_conversations','article_anchors','graphic_post_anchors'].includes(table)?withoutGroup(rows):rows);
   }
   const migrationLedger=(await upgraded.client.query<{hash:string;created_at:number}>('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
   expect(migrationLedger.slice(0,104)).toEqual(old.ledger);expect(migrationLedger).toHaveLength(105);expect(Number(migrationLedger.at(-1)!.created_at)).toBe(1791043200003);
   expect((await db.execute(sql.raw('SELECT group_id FROM ai_conversations'))).rows).toEqual([{group_id:canonical}]);
   if(family!=='null-frozen')expect((await db.execute(sql.raw('SELECT group_id FROM article_anchors UNION ALL SELECT group_id FROM graphic_post_anchors'))).rows).toEqual([{group_id:canonical},{group_id:canonical}]);
   fixture.historical={db,driver:{kind:'file-pglite',target:old.dataDir},dispose:()=>upgraded.client.close()};
   runtime=await getChatRuntime();await runtime.durable.stop();
   ports=await recoveryPorts(runtime,db,ref,join(old.root,'media'),state);
   expect((await ports.reader.read(ref)).modelInput).toEqual(frozen);
   expect((await ports.reader.read(ref,'settlement')).modelInput).toEqual(frozen);
   await expect(ports.reader.read({...ref,fenceToken:'foreign-fence'})).rejects.toThrow();
   if(family!=='null-frozen'){
    const grouped={...ctx,groupId:canonical};
    expect(await ownedData('articles.get',grouped,{outputId:articleId})).toEqual(originalArticle);
    expect(await ownedData('graphicPosts.get',grouped,{outputId:graphicId})).toEqual(originalGraphic);
    await expect(ownedData('articles.get',{...grouped,groupId:'foreign-group'},{outputId:articleId})).rejects.toThrow();
   }
   expect(requests).toHaveLength(beforeRequests);expect(state.handlers).toBe(beforeHandlers);
   releasePhase();releasePhase=undefined;
   const settledBeforeReplay=await db.select().from(executionCalls);
   workerRuns.push(await startWorker());
   const expectedCommits=family==='canonical-null-conversation'?1:2;
   await vi.waitFor(()=>{expect(commits.length,JSON.stringify({requests:requests.length,modelErrors})).toBe(expectedCommits);},{timeout:120000});
   if(family==='canonical-null-conversation'){expect(requests).toHaveLength(2);expect(state.handlers).toBe(1);}
   else{expect(requests).toHaveLength(beforeRequests);expect(state.handlers).toBe(beforeHandlers);expect(await db.select().from(executionCalls)).toEqual(settledBeforeReplay);expect(commits[1]!.body).toEqual(commits[0]!.body);}
   expect(modelErrors).toEqual([]);
   const originalCommit=commits[0]!.body,receipt=await ports.complete(originalCommit);
   for(const entry of commits){const replayed=await ports.complete(entry.body);expect(replayed).toEqual(receipt);entry.reply.resolve(replayed);}
   expect(await Promise.all(workerRuns.map(run=>run.result))).toEqual(workerRuns.map(()=> 'completed'));
   const completed=await frozenRows(db);
   expect(completed.ai_messages).toHaveLength(2);expect(completed.ai_task_results).toHaveLength(1);expect(completed.ai_tasks).toHaveLength(1);expect(completed.execution_tasks).toHaveLength(1);expect(completed.execution_calls).toHaveLength(3);
   const [done]=await db.select().from(executionTasks),[ai]=await db.select().from(aiTasks),results=await db.select().from(aiTaskResults);
   expect(done).toMatchObject({id:submitted.executionTaskId,status:'succeeded',attempt:ref.attempt,fenceToken:ref.fenceToken,groupId:frozen.groupId??null});
   expect(ai).toMatchObject({id:submitted.taskId,status:'succeeded',groupId:frozen.groupId??null});expect(results[0]!.executionCallId).toBe(originalCommit.lastModelCallId);
   const messages=await db.select().from(aiMessages);expect(messages.find(m=>m.id===source.id)!.modelMetadata).toEqual((before.ai_messages[0] as {model_metadata:unknown}).model_metadata);
   expect(messages.find(m=>m.role==='assistant')!.modelMetadata).toMatchObject({actualEngine:'pi',chatTaskId:submitted.taskId,sourceMessageId:source.id});
   const events=await db.select().from(executionStreamEvents);expect(events.filter(e=>e.chunk.type==='finish')).toHaveLength(1);
   expect(await ports.complete(originalCommit)).toEqual(receipt);
   const replay=await submitFor(db,runtime).submit(sourceCtx,{conversationId:conversation.id,sourceMessageId:source.id});
   expect(replay).toEqual({...submitted,replayed:true});
   await expect(submitFor(db,runtime).submit({...sourceCtx,accountId:'foreign-account'},{conversationId:conversation.id,sourceMessageId:source.id})).rejects.toThrow();
   expect(await frozenRows(db)).toEqual(completed);expect(requests).toHaveLength(2);expect(state.handlers).toBe(1);
   expect((await ports.reader.read(ref,'settlement')).modelInput).toEqual(frozen);await expect(ports.reader.read(ref)).rejects.toThrow();
   // 只保存本次合成库事实；这些观察须与外层实际exit绑定，不能单独代签完整Gate。
   if(process.env.T1089_EVIDENCE_DIR){
    const {chatInputDigest}=await import('../../../backend/src/modules/ai/chat-turn-submission.service');
    const fields=(rows:Record<string,unknown[]>,table:string)=>rows[table]!;
    const migrationPreservation=Object.fromEntries(Object.keys(before).map(table=>{
     const sources=['ai_conversations','article_anchors','graphic_post_anchors'].includes(table);
     return [table,{before:chatInputDigest(sources?withoutGroup(fields(before,table)):fields(before,table)),after:chatInputDigest(sources?withoutGroup(fields(after,table)):fields(after,table)),groupOnlyException:sources}];
    }));
    const folder=fileURLToPath(new URL('../../../backend/drizzle',import.meta.url));
    await writeFile(join(process.env.T1089_EVIDENCE_DIR,family+'.json'),JSON.stringify({
     family,layer:'原子进程WorkerSupervisor/真实服务/PGlite/local SSE；不是实际模型或用户库',
     source:{conversationId:conversation.id,sourceMessageId:source.id,aiTaskId:submitted.taskId,executionTaskId:submitted.executionTaskId,groupBefore:conversation.groupId??null,groupAfter:canonical},
     frozen:{inputDigest:chatInputDigest(frozen),payloadBefore:chatInputDigest((before.execution_tasks[0] as {payload:unknown}).payload),payloadAfter:chatInputDigest((after.execution_tasks[0] as {payload:unknown}).payload),groupId:frozen.groupId??null,groupVersion:frozen.groupVersion??null,membershipVersion:frozen.membershipVersion??null,attempt:ref.attempt,fenceToken:ref.fenceToken},
     migration:{receiptBefore:old.ledger,receiptAfter:migrationLedger,preservation:migrationPreservation,sqlSHA256:createHash('sha256').update(await readFile(join(folder,'0130_legacy_source_ownership.sql'))).digest('hex')},
     requests:{beforeUpgrade:beforeRequests,afterWorkerReplay:requests.length,handlersBeforeUpgrade:beforeHandlers,handlersAfterReplay:state.handlers,modelErrors},
     existingCalls:completed.execution_calls,commitBodies:commits.map(entry=>entry.body),completion:receipt,replay,
     counts:{messages:completed.ai_messages.length,aiTasks:completed.ai_tasks.length,executionTasks:completed.execution_tasks.length,results:completed.ai_task_results.length,calls:completed.execution_calls.length,finishes:events.filter(e=>e.chunk.type==='finish').length},
     assertionsCompleted:true,
    },null,2)+'\n');
   }
   console.info('[T1089-recovery]',JSON.stringify({family,originalTaskId:submitted.taskId,executionTaskId:submitted.executionTaskId,attempt:ref.attempt,frozenGroup:frozen.groupId??null,modelRequests:requests.length,handlerExecutions:state.handlers,settledCalls:3,completionResults:1,replayed:true}));
  }finally{
   releasePhase?.();for(const entry of commits)entry.reply.resolve({resultId:'cleanup',aiTaskId:'cleanup',messageId:'cleanup',outcome:'failed'});
   await Promise.allSettled(supervisors.map(supervisor=>supervisor.stop()));
   server.closeAllConnections();if(server.listening)await new Promise<void>(done=>server.close(()=>done()));
   await (globalThis as typeof globalThis&{__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.().catch(()=>{});
   await old.configured.dispose().catch(()=>{});fixture.historical=undefined;__resetPersistenceForTests();vi.unstubAllEnvs();await rm(old.root,{recursive:true,force:true});
  }
 });
