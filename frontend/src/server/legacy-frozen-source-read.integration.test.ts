// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {ENDPOINTS,type RequestContext} from '@creatoros/contract';
import type {Db,ConfiguredDb} from '@creatoros/backend';
import type {ExecutionRef,WorkerPort} from '@creatoros/contract/execution-worker';
import type {ChatBackendTool} from '../../../backend/src/modules/execution/execution-chat-tool-ports.service';
import type {ChatWorkbenchCapabilityHost} from '../../../backend/src/modules/ai-runtime/chat-workbench-capability-host';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,readdir,realpath,rm,symlink,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
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

// 这是明确旧版本的合成 fixture producer，不是历史用户库实测。
const oldProducerCommit='6e4689b3180f91189110208267708ad72b03ae64';
// canonical固定完整111项journal与完整SQL receipt前缀；不是按新last动态接受库存。
const currentMigrationInventory={entries:111,journalSha256:'d72d1f1b459d5d35695ac6671d49bf8959551d09ebe647972163f82a4dea69eb',ledgerSha256:'78c9c4af5305a709cd9fdab6367cd9e3a0b0dd6dacd51b97470e20b6b2d585af'} as const;
let oldProducerRoot:string,oldProducerModule:string,oldPiCoreBinding:{version:string;agentPath:string;sha256:string};
beforeAll(async()=>{
 const projectRoot=fileURLToPath(new URL('../../../',import.meta.url));
 // 第一例也依赖真实 Worker；不再依赖其他测试先完成构建。
 execFileSync(process.execPath,[join(projectRoot,'ai-worker/scripts/build.mjs')],{stdio:'pipe',timeout:1200000});
 oldProducerRoot=await realpath(await mkdtemp(join(tmpdir(),'t1089-old-producer-')));
 const archive=execFileSync('git',['archive',oldProducerCommit,'backend','contract','ai-worker','frontend/src','frontend/tsconfig.json','frontend/package.json','frontend/product-identity.json','frontend/public/courses'],{cwd:projectRoot,maxBuffer:128*1024*1024,timeout:180000});
 execFileSync('tar',['-x','-C',oldProducerRoot],{input:archive,timeout:180000});
 // 外部依赖复用已安装版本；所有 CreatorOS workspace 链接指向旧源，禁止落回当前模块。
 for(const pkg of ['backend','contract','ai-worker','frontend']){
  const target=join(oldProducerRoot,pkg,'node_modules');await mkdir(target,{recursive:true});
  for(const entry of await readdir(join(projectRoot,pkg,'node_modules'))){
   if(entry==='@creatoros')continue;
   await symlink(join(projectRoot,pkg,'node_modules',entry),join(target,entry));
  }
  await mkdir(join(target,'@creatoros'));
  for(const workspace of ['backend','contract','ai-worker'])await symlink(join(oldProducerRoot,workspace),join(target,'@creatoros',workspace));
 }
 // 旧 Pi 真消费者按 cwd 的两级 node_modules 寻找 core；复用锁定同版本实物，不造 Agent。
 const store=join(projectRoot,'node_modules/.pnpm');
 const pinned=JSON.parse(await readFile(join(oldProducerRoot,'ai-worker/package.json'),'utf8')).dependencies['@earendil-works/pi-coding-agent'];
 const coreEntries=(await readdir(store)).filter(name=>name.startsWith('@earendil-works+pi-agent-core@'+pinned+'_') || name==='@earendil-works+pi-agent-core@'+pinned);
 expect(coreEntries).toHaveLength(1);
 const core=join(store,coreEntries[0]!,'node_modules/@earendil-works/pi-agent-core');
 const coreVersion=JSON.parse(await readFile(join(core,'package.json'),'utf8')).version;
 expect(coreVersion).toBe(pinned);
 await mkdir(join(oldProducerRoot,'node_modules/@earendil-works'),{recursive:true});
 await symlink(core,join(oldProducerRoot,'node_modules/@earendil-works/pi-agent-core'));
 oldPiCoreBinding={version:coreVersion,agentPath:await realpath(join(oldProducerRoot,'node_modules/@earendil-works/pi-agent-core/dist/agent.js')),sha256:createHash('sha256').update(await readFile(join(core,'dist/agent.js'))).digest('hex')};
 const original=execFileSync('git',['show',oldProducerCommit+':frontend/src/server/legacy-frozen-source-read.integration.test.ts'],{cwd:projectRoot,maxBuffer:4*1024*1024,timeout:180000}).toString();
 const firstStart=original.indexOf("it('已登记账号"),firstEnd=original.indexOf('const recoveryBudget=');
 const loopStart=original.indexOf('let recoveryWorkerBuilt=false;');
 const bodyStart=original.indexOf("  const {createDb,eq,executionTasks",loopStart);
 const split=original.indexOf('   const upgraded=await createDb({dataDir:old.dataDir});',bodyStart);
 const cleanupStart=original.indexOf('  }finally{',split),cleanupEnd=original.lastIndexOf('\n });');
 expect([firstStart,firstEnd,loopStart,bodyStart,split,cleanupStart,cleanupEnd].every(n=>n>=0)).toBe(true);
 const prelude=original.slice(0,firstStart)+original.slice(firstEnd,loopStart);
 const producer=original.slice(bodyStart,split)
  .replace("resolve('../ai-worker/dist/execution-worker.cjs')",JSON.stringify(join(oldProducerRoot,'ai-worker/dist/execution-worker.cjs')))
  .replace('void result.catch(()=>undefined);return {result};',"void result.then(value=>console.info('[T1089-old-worker-result]',value),error=>console.error('[T1089-old-worker-error]',error));return {result};")
  .replace('await phase;const current=ports!;',"await phase;const current=ports!;console.info('[T1089-old-port]',port);")
  .replace("default:throw Error('本只读回合不允许未绑定端口:'+port);","default:console.error('[T1089-old-unbound-port]',port,JSON.stringify(raw));throw Error('本只读回合不允许未绑定端口:'+port);");
 const cleanup=original.slice(cleanupStart,cleanupEnd).replace('  }finally{','  }catch(error){').replace(/\n  }\s*$/, '\n process.chdir(producerCwd);throw error;\n }');
 const producerWithSchemaProof=producer.replace('   await (globalThis as typeof globalThis&{__creatorosDisposePersistence?',`   const historicalEngineColumns=(await old.client.query("SELECT column_name FROM information_schema.columns WHERE table_name='user_preferences' AND column_name='assistant_execution_engine'")).rows;expect(historicalEngineColumns).toEqual([]);\n   await (globalThis as typeof globalThis&{__creatorosDisposePersistence?`);
 expect(producerWithSchemaProof).not.toBe(producer);
 const result=`\n   const producerBindings={frontendModule:import.meta.url,backendResolved:createRequire(new URL('../../../backend/package.json',import.meta.url)).resolve('@creatoros/backend'),backendPreferenceColumns:Object.keys((await import('@creatoros/backend')).schema.userPreferences)};expect(producerBindings.backendPreferenceColumns).not.toContain('assistantExecutionEngine');\n   process.chdir(producerCwd);\n   return {old,historicalEngineColumns,producerBindings,supervisors,commits,requests,modelErrors,state,server,ctx,canonical,originalArticle,originalGraphic,articleId,graphicId,projectId,readKind,outputIds,sourceCtx,conversation,source,submitted,submittedTask,frozen,ref,before,beforeRequests,beforeHandlers,workerRuns,resume:(next:typeof ports)=>{ports=next;releasePhase?.();releasePhase=undefined;}};\n`;
 oldProducerModule=join(oldProducerRoot,'frontend/src/server/t1089-owned-old-producer.ts');
 await writeFile(oldProducerModule,prelude+'\nexport async function produce(family:RecoveryFamily){\nconst producerCwd=process.cwd();process.chdir('+JSON.stringify(join(oldProducerRoot,'frontend'))+');\ntry{\n'+producerWithSchemaProof+result+cleanup+'\n}finally{process.chdir(producerCwd);}}\n');
 // 源码原字节来自指定 Git 对象；只机械拆出旧测试的迁移前阶段，不改旧生产消费者。
 const oldJournal=JSON.parse(await readFile(join(oldProducerRoot,'backend/drizzle/meta/_journal.json'),'utf8'));
 expect(oldJournal.entries).toHaveLength(105);expect(oldJournal.entries.at(-1).tag).toBe('0130_legacy_source_ownership');
 expect(await readFile(join(oldProducerRoot,'backend/src/schema/settings.ts'),'utf8')).not.toContain('assistantExecutionEngine');
 execFileSync(process.execPath,[join(oldProducerRoot,'ai-worker/scripts/build.mjs')],{cwd:join(oldProducerRoot,'frontend'),stdio:'pipe',timeout:1200000});
},3300000);
afterAll(async()=>{if(oldProducerRoot)await rm(oldProducerRoot,{recursive:true,force:true});},180000);

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

type Historical104={root:string;dataDir:string;db:Db;client:Awaited<ReturnType<typeof import('@creatoros/backend')['createDb']>>['client'];configured:ConfiguredDb;ledger:Array<{hash:string;created_at:number}>};

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

it.each(['null-frozen','canonical-null-conversation','canonical-null-anchors'] as const)(
 '104→0130 %s 原冻结/完整子进程Worker/已结算回执/原completion与同source重放',{timeout:1200000,retry:0},async(family:RecoveryFamily)=>{
  const {createDb,eq,executionTasks,executionCalls,aiMessages,aiTasks,aiTaskResults,executionStreamEvents,sql}=await import('@creatoros/backend');
  const {createAiRepository}=await import('../../../backend/src/modules/ai/ai.repository');
  const {createChatTurnSubmissionService}=await import('../../../backend/src/modules/ai/chat-turn-submission.service');
  const {createChatHostContextReader}=await import('../../../backend/src/modules/ai/chat-host-context.service');
  const {createPersistentTaskService}=await import('../../../backend/src/modules/execution/persistent-task.service');
  const {createWorkerSupervisor}=await import('../../../backend/src/modules/execution/worker-supervisor');
  const {workerPortInputSchemas,workerToolResultReceiptSchema,agenticToolOutcomeSchema,chatWorkerInputSchema}=await import('@creatoros/contract/execution-worker');
  type Produced={
   old:Historical104;historicalEngineColumns:unknown[];producerBindings:{frontendModule:string;backendResolved:string;backendPreferenceColumns:string[]};supervisors:Array<ReturnType<typeof createWorkerSupervisor>>;
   commits:Array<{body:ReturnType<typeof workerPortInputSchemas.commitChatResult.parse>;reply:ReturnType<typeof deferred<unknown>>}>;
   requests:unknown[];modelErrors:string[];state:{handlers:number};server:ReturnType<typeof createServer>;
   ctx:RequestContext;canonical:string;originalArticle:unknown;originalGraphic:unknown;articleId:string|undefined;graphicId:string|undefined;
   projectId:string|undefined;readKind:string;outputIds:string[];sourceCtx:RequestContext;
   conversation:typeof ENDPOINTS.createConversation.response._output;
   source:Awaited<ReturnType<ReturnType<typeof createAiRepository>['createMessage']>>;
   submitted:Awaited<ReturnType<ReturnType<typeof createChatTurnSubmissionService>['submit']>>;
   submittedTask:typeof executionTasks.$inferSelect;frozen:ReturnType<typeof chatWorkerInputSchema.parse>;ref:ExecutionRef;
   before:Record<string,unknown[]>;beforeRequests:number;beforeHandlers:number;workerRuns:Array<{result:Promise<string>}>;
   resume:(next:Awaited<ReturnType<typeof recoveryPorts>>|undefined)=>void;
  };
  const module=await import(/* @vite-ignore */ pathToFileURL(oldProducerModule).href) as {produce:(family:RecoveryFamily)=>Promise<Produced>};
  const producer=await module.produce(family);
  const {old,supervisors,commits,requests,modelErrors,state,server,ctx,canonical,originalArticle,originalGraphic,articleId,graphicId,projectId,readKind,outputIds,sourceCtx,conversation,source,submitted,submittedTask,frozen,ref,before,beforeRequests,beforeHandlers,workerRuns}=producer;
  let ports:Awaited<ReturnType<typeof recoveryPorts>>|undefined;
  let runtime:Awaited<ReturnType<typeof getChatRuntime>>,db:Db;
  let phase=Promise.resolve(),releasePhase:(()=>void)|undefined;
  const now=()=>new Date().toISOString();
  const submitFor=(actualDb:Db,actualRuntime:typeof runtime)=>createChatTurnSubmissionService(actualDb,{now,assertProject:async(c,id)=>{await ownedData('projects.get',c,{projectId:id});},assemble:(c,snapshot,options)=>prepareChatReply(actualRuntime,c,snapshot,options)});
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
  try{
  expect(producer.historicalEngineColumns).toEqual([]);
  expect(producer.producerBindings.backendResolved).toBe(join(oldProducerRoot,'backend/src/index.ts'));
  expect(producer.producerBindings.frontendModule).toBe(pathToFileURL(oldProducerModule).href);
  expect(producer.producerBindings.backendPreferenceColumns).not.toContain('assistantExecutionEngine');
   const upgraded=await createDb({dataDir:old.dataDir});db=upgraded.db;
   const after=await frozenRows(db);
   for(const [table,rows] of Object.entries(before)){
    expect(['ai_conversations','article_anchors','graphic_post_anchors'].includes(table)?withoutGroup(after[table]!):after[table]).toEqual(['ai_conversations','article_anchors','graphic_post_anchors'].includes(table)?withoutGroup(rows):rows);
   }
   const migrationLedger=(await upgraded.client.query<{hash:string;created_at:number}>('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
   expect(migrationLedger.slice(0,104)).toEqual(old.ledger);
   const migrationFolder=fileURLToPath(new URL('../../../backend/drizzle',import.meta.url));
   const currentJournalRaw=await readFile(join(migrationFolder,'meta/_journal.json'),'utf8');
   expect(createHash('sha256').update(currentJournalRaw).digest('hex')).toBe(currentMigrationInventory.journalSha256);
   const currentJournal=JSON.parse(currentJournalRaw) as {entries:Array<{tag:string;when:number}>};
   const expectedLedger=await Promise.all(currentJournal.entries.map(async entry=>({hash:createHash('sha256').update(await readFile(join(migrationFolder,entry.tag+'.sql'),'utf8')).digest('hex'),created_at:entry.when})));
   expect(createHash('sha256').update(JSON.stringify(expectedLedger)).digest('hex')).toBe(currentMigrationInventory.ledgerSha256);
   expect(migrationLedger.map((row:{hash:string;created_at:number})=>({...row,created_at:Number(row.created_at)}))).toEqual(expectedLedger);
   expect(currentJournal.entries.at(104)!.tag).toBe('0130_legacy_source_ownership');
   expect(currentJournal.entries).toHaveLength(currentMigrationInventory.entries);
   expect(currentJournal.entries.at(107)!.tag).toBe('0133_assistant_execution_engine');
   expect(currentJournal.entries.at(109)!.tag).toBe('0136_embedding_identity');
   expect(currentJournal.entries.at(110)!).toEqual({idx:110,version:'7',when:1791043200010,tag:'0137_observability_routing_convergence',breakpoints:true});
   expect((await upgraded.client.query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_name='user_preferences' AND column_name='assistant_execution_engine'")).rows).toEqual([{column_name:'assistant_execution_engine'}]);
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
   producer.resume(ports);
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
     migration:{oldProducerCommit,producerBindings:producer.producerBindings,oldPiCoreBinding,oldProducerModuleSHA256:createHash('sha256').update(await readFile(oldProducerModule)).digest('hex'),oldWorkerSHA256:createHash('sha256').update(await readFile(join(oldProducerRoot,'ai-worker/dist/execution-worker.cjs'))).digest('hex'),historicalEngineColumns:producer.historicalEngineColumns,currentJournal,expectedLedger,receiptBefore:old.ledger,receiptAfter:migrationLedger,preservation:migrationPreservation,sqlSHA256:createHash('sha256').update(await readFile(join(folder,'0130_legacy_source_ownership.sql'))).digest('hex')},
     requests:{beforeUpgrade:beforeRequests,afterWorkerReplay:requests.length,handlersBeforeUpgrade:beforeHandlers,handlersAfterReplay:state.handlers,modelErrors},
     existingCalls:completed.execution_calls,commitBodies:commits.map(entry=>entry.body),completion:receipt,replay,
     counts:{messages:completed.ai_messages.length,aiTasks:completed.ai_tasks.length,executionTasks:completed.execution_tasks.length,results:completed.ai_task_results.length,calls:completed.execution_calls.length,finishes:events.filter(e=>e.chunk.type==='finish').length},
     assertionsCompleted:true,
    },null,2)+'\n');
   }
   console.info('[T1089-recovery]',JSON.stringify({family,originalTaskId:submitted.taskId,executionTaskId:submitted.executionTaskId,attempt:ref.attempt,frozenGroup:frozen.groupId??null,modelRequests:requests.length,handlerExecutions:state.handlers,settledCalls:3,completionResults:1,replayed:true}));
  }finally{
   producer.resume(ports);releasePhase?.();for(const entry of commits)entry.reply.resolve({resultId:'cleanup',aiTaskId:'cleanup',messageId:'cleanup',outcome:'failed'});
   await Promise.allSettled(supervisors.map(supervisor=>supervisor.stop()));
   server.closeAllConnections();if(server.listening)await new Promise<void>(done=>server.close(()=>done()));
   await (globalThis as typeof globalThis&{__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.().catch(()=>{});
   await old.configured.dispose().catch(()=>{});fixture.historical=undefined;__resetPersistenceForTests();vi.unstubAllEnvs();await rm(old.root,{recursive:true,force:true});
  }
 });
