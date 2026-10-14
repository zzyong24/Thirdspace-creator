import {createExecutionChatFallbackService} from '../../../../backend/src/modules/execution/execution-chat-fallback.service';
import {createPersistentTaskService,createExecutionCallLedgerService} from '@creatoros/backend/modules/execution';
import {eq,executionTasks,type Db} from '@creatoros/backend';
import {TaskModelAuthorityScope,pinModelAuthority} from '@/server/task-model-authority';
import {executionRouteV2Schema,modelRouteCatalog} from '@creatoros/contract/execution-worker';
// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';
import {canonicalDataset} from '@/fixtures/canonical';
const owned=vi.hoisted(()=>({media:'',db:null as Db|null,resolveFallback:null as null|((ctx:RequestContext,owner?:{ref:import('@creatoros/contract/execution-worker').ExecutionRef})=>Promise<unknown|null>),authority:null as null|{authority:'channel';scopeId:string;bundleDigest:string;payload:Record<string,unknown>},resolveModel:null as null|((ctx:RequestContext,capability:string,owner:{aiTaskId:string;executionTaskId:string})=>Promise<unknown>),resolveAsr:null as null|((ctx:RequestContext,owner:import('@creatoros/backend/modules/ai-runtime').TranscribeModelOwner)=>Promise<import('@creatoros/backend/modules/ai-runtime').MultimodalSpec>)} ));
vi.mock('@creatoros/backend/modules/assets',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/assets')>();return {...actual,migrateStorageRoot:async()=>{throw Error('测试禁止迁移用户媒体目录');},createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>actual.createLocalFsObjectStorage({...args[0],rootPath:owned.media},args[1])};});
vi.mock('@/server/activation/client-config.server',async original=>{const actual=await original<typeof import('@/server/activation/client-config.server')>();return {...actual,readChannelModelAuthority:vi.fn(async()=>owned.authority??{authority:'local'})};});
vi.mock('@creatoros/backend/modules/ai-runtime',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/ai-runtime')>();return {...actual,composeChatProduction:(...args:Parameters<typeof actual.composeChatProduction>)=>{owned.db=args[0];owned.resolveFallback=args[1].resolveFallbackModelCredential??null;return {...actual.composeChatProduction(...args),start:()=>{}};}};});
vi.mock('@creatoros/backend/modules/execution',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/execution')>();return {...actual,createModelWorkerDispatcher:(...args:Parameters<typeof actual.createModelWorkerDispatcher>)=>{owned.resolveModel=args[1].resolveModelCredential;owned.resolveAsr=args[1].transcribePreparation?.resolveSpec??null;return {...actual.createModelWorkerDispatcher(...args),start:()=>{}};}};});
import {compositeTransport,getChatRuntime,__resetPersistenceForTests} from '@/server/persistence-client';
async function call(endpoint:Endpoint,ctx:RequestContext,params?:unknown,body?:unknown,query?:unknown){return (await compositeTransport.request(endpoint,{params,body,query} as never,ctx) as {data:any}).data;}
it('公开保存选择→真实组合根创建task冻结完整map，切偏好和模型不改原task；元数据不调用模型',async()=>{
 const root=await mkdtemp(join(tmpdir(),'t1278-owned-public-routing-'));owned.media=join(root,'media');
 vi.stubEnv('CREATOROS_DISABLE_BACKGROUND_DRIVERS','1');vi.stubEnv('CREATOROS_DISABLE_SCHEDULER','1');vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR',join(root,'db'));vi.stubEnv('CREATOROS_STORAGE','local');vi.stubEnv('CREATOROS_CLIENT_CONFIG_PULL_ENABLED','0');vi.stubEnv('CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH','/nonexistent/t1278-fixture');__resetPersistenceForTests();
 const fetchSpy=vi.spyOn(globalThis,'fetch');
 try{
  const user:RequestContext={userId:canonicalDataset.user.id,requestId:'t1278-public-routing',source:'user'};
  const account=await call(ENDPOINTS.createAccount,user,undefined,{platform:'bilibili',accountHandle:'@t1278-routing-fixture',followerBaseline:0});
  const ctx={...user,accountId:account.id};
  const project=await call(ENDPOINTS.createProject,ctx,undefined,{title:'原路由冻结',brief:'测试元数据与真实根入口'});
  await call(ENDPOINTS.putModel,ctx,{capability:'default'},{provider:'openai',modelName:'fixture-frozen-text',apiFormat:'openai_chat',baseUrl:'https://fixture.invalid/v1',secret:'public-root-private-fixture',settings:{structuredOutputs:true}});
  const choices={text:'self',vision:'self',image:'self',video:'self',audio:'local',embed:'self'};
  expect(await call(ENDPOINTS.putModelRouting,ctx,undefined,{schemaVersion:1,choices,expectedRevision:0})).toMatchObject({revision:1,choices,capabilities:expect.arrayContaining([{capability:'script.draft',mode:'structured',source:'self',status:'ready',reasonCode:null}])});
  const runtime=await getChatRuntime();
  const first=await runtime.ai.createTask(ctx,{taskType:'script.draft',attemptId:'t1278-public-root-task-0001',inputData:{projectId:project.id,prompt:'原任务输入'}});
  const frozen=await runtime.ai.getTaskRuntimeData(ctx,first.id);
  expect(frozen.executionRoute).toMatchObject({schemaVersion:2,selectionRevision:1,routes:{'structured:script.draft':{source:'self',readiness:'configured',identity:{model:'fixture-frozen-text',settings:{structuredOutputs:true}}}}});
  expect(JSON.stringify(frozen)).not.toContain('public-root-private-fixture');
  await call(ENDPOINTS.putModelRouting,ctx,undefined,{schemaVersion:1,choices:{...choices,image:'official'},expectedRevision:1});
  await call(ENDPOINTS.putModel,ctx,{capability:'default'},{provider:'openai',modelName:'fixture-new-text',apiFormat:'openai_chat',baseUrl:'https://fixture.invalid/v1',secret:'rotated-fixture'});
  expect(await runtime.ai.getTaskRuntimeData(ctx,first.id)).toEqual(frozen);
  await expect(runtime.resolveModelSpec(ctx,'script.draft',{aiTaskId:first.id})).rejects.toThrow('MODEL_ROUTE_IDENTITY_CHANGED');
  owned.authority={authority:'channel',scopeId:'fixture-verified-scope',bundleDigest:`sha256:${'a'.repeat(64)}`,payload:{models:{default:[{isDefault:true,provider:'openai',model:'fixture-official-text',apiFormat:'openai_chat',apiKey:'fixture-private',baseUrl:'https://fixture.invalid/v1'}]}}};
  const second=await runtime.ai.createTask(ctx,{taskType:'script.draft',attemptId:'t1278-public-root-task-0002',inputData:{projectId:project.id,prompt:'后续新输入'}});
  expect(await runtime.ai.getTaskRuntimeData(ctx,second.id)).toMatchObject({executionRoute:{schemaVersion:2,selectionRevision:2,routes:{'structured:script.draft':{identity:{model:'fixture-new-text'}},'image:image.generate':{source:'official',readiness:'unavailable'}}}});
  const conversation=await runtime.ai.createConversation(ctx,{title:'真实公开聊天根',scope:'global'});
  const reply=await runtime.ai.createMessageWithReplyTask(ctx,conversation.id,{content:'请给一个选题建议'});
  const chatTaskId=(reply.modelMetadata as {chatTaskId:string}).chatTaskId;expect(chatTaskId).toBeTruthy();
  expect(await runtime.ai.getTaskRuntimeData(ctx,chatTaskId)).toMatchObject({executionRoute:{schemaVersion:2,selectionRevision:2},chatModelMode:'text'});
  const asr=await call(ENDPOINTS.createAITask,ctx,undefined,{taskType:'transcribe.douyin',attemptId:'public-asr-owner-freeze-0001',inputData:{awemeIds:['owned-fixture-aweme']}});
  await vi.waitFor(async()=>expect((await runtime.ai.getTask(ctx,asr.id)).executionTaskId).toBeTruthy(),{timeout:120000,interval:50});
  expect(owned.resolveAsr).toBeTypeOf('function');
  const oldSpec=await owned.resolveAsr!(ctx,{aiTaskId:asr.id});expect(oldSpec).toMatchObject({provider:'whisper-local',token:''});
  await call(ENDPOINTS.putModelRouting,ctx,undefined,{schemaVersion:1,choices:{...choices,image:'official',audio:'self'},expectedRevision:2});
  vi.stubEnv('CREATOROS_WHISPER_LEVEL','tiny');
  expect(await owned.resolveAsr!(ctx,{aiTaskId:asr.id})).toEqual(oldSpec);
  await expect(owned.resolveAsr!({...ctx,userId:'foreign-owner'},{aiTaskId:asr.id})).rejects.toThrow();
  owned.authority=null;
  const chat=(await runtime.ai.getTask(ctx,chatTaskId));expect(chat.executionTaskId).toBeTruthy();
  const claim=await createPersistentTaskService(owned.db!).claimTask({taskId:chat.executionTaskId!,workerId:'owned-fallback-host'});expect(claim).toBeTruthy();
  const ref={executionTaskId:chat.executionTaskId!,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
  const [execution]=await owned.db!.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId));
  const operationKey=`${(execution!.payload as any).modelInput.operationKey}/model/1`,ledger=createExecutionCallLedgerService(owned.db!,{budget:{maxCalls:8,maxTokens:100000,deadlineMs:600000}});
  const rejected=await ledger.reserve(ref,{kind:'model',operationKey,inputDigest:`sha256:${'9'.repeat(64)}`,reservedTokens:10});await ledger.start(ref,rejected.id);await ledger.settle(ref,rejected.id,{status:'rejected',rejectionCode:'CHAT_MODEL_RETRYABLE_REJECTION'});
  await call(ENDPOINTS.putModel,ctx,{capability:'chat.fallback'},{provider:'openai',modelName:'later-new-fallback',apiFormat:'openai_chat',baseUrl:'https://fixture.invalid/v1',secret:'owned-private-fallback'});
  const fallback=createExecutionChatFallbackService(owned.db!,{resolve:c=>owned.resolveFallback!(c,{ref})});
  expect(await fallback.resolve(ref,operationKey)).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
 }finally{
  await(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();owned.authority=null;owned.db=null;owned.resolveFallback=null;owned.resolveModel=null;owned.resolveAsr=null;fetchSpy.mockRestore();vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});
 }
},180_000);

it('v2 Pi确定性包装只核严格原map，未选官方目录变化不误取消，隔离上层authority',async()=>{
 const scope=new TaskModelAuthorityScope(),read=vi.fn(async()=>({authority:'local' as const,outcome:'not_configured' as const,payload:null})),execute=vi.fn(async()=>{expect(scope.currentPayload()).toBeUndefined();});
 const route=executionRouteV2Schema.parse({schemaVersion:2,orchestrator:{engine:'pi',source:'preference',protocolKind:'pi'},selectionRevision:1,catalogVersion:1,rootRouteDigest:`sha256:${'8'.repeat(64)}`,routes:Object.fromEntries(modelRouteCatalog.map(({family,...entry})=>[entry.routeKey,{...entry,source:family==='audio'?'local':'self',readiness:'unavailable',reasonCode:'UNUSED_MODEL'}]))});
 const inherited=pinModelAuthority({authority:'channel',outcome:'configured',scopeId:'unrelated-old',payload:{models:{}}});
 expect(await scope.run(inherited,()=>scope.runFrozen({executionRoute:route},read,execute))).toBe(true);
 expect(execute).toHaveBeenCalledOnce();expect(read).not.toHaveBeenCalled();expect(scope.currentPayload()).toBeUndefined();
});
it('包装拒绝损坏v2完整map，legacy Pi仍守原authority',async()=>{
 const scope=new TaskModelAuthorityScope(),execute=vi.fn(async()=>{}),read=vi.fn(async()=>({authority:'local' as const,outcome:'not_configured' as const,payload:null}));
 await expect(scope.runFrozen({executionRoute:{schemaVersion:2,routes:{}}},read,execute)).rejects.toThrow();
 expect(execute).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
 expect(await scope.runFrozen({},read,execute)).toBe(false);expect(read).toHaveBeenCalledOnce();expect(execute).not.toHaveBeenCalled();
});
