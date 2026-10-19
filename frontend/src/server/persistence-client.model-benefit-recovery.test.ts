import {afterEach,expect,it,vi} from 'vitest';
import {ENDPOINTS} from '@creatoros/contract';
const network=vi.hoisted(()=>({ensure:vi.fn(async(..._args:unknown[]):Promise<unknown>=>{throw Error('合成断网，不应拖住自配聊天');}),authority:vi.fn(async()=>({authority:'local',outcome:'unreachable',payload:null}))}));
vi.mock('./activation/model-benefit.server',async original=>({...await original<object>(),ensureModelBenefitAuthority:network.ensure}));
vi.mock('./activation/client-config.server',async original=>({...await original<object>(),readChannelModelAuthority:network.authority}));

const rootPorts=vi.hoisted(()=>({capture:null as null|import('@creatoros/backend/modules/benchmark').BenchmarkTranscriptionDeps['captureConfiguration'],db:null as null|import('@creatoros/backend').Db,tasks:null as null|ReturnType<typeof import('@creatoros/backend/modules/execution').createPersistentTaskService>}));
vi.mock('@creatoros/backend/modules/benchmark',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/benchmark')>();return {...actual,createBenchmarkTranscriptionService:(...args:Parameters<typeof actual.createBenchmarkTranscriptionService>)=>{rootPorts.capture=args[1].captureConfiguration;return actual.createBenchmarkTranscriptionService(...args);}};});
vi.mock('@creatoros/backend/modules/execution',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/execution')>();return {...actual,createPersistentTaskService:(...args:Parameters<typeof actual.createPersistentTaskService>)=>{const service=actual.createPersistentTaskService(...args);if(args[1]?.prepareModelAuthority){rootPorts.tasks=service;rootPorts.db=args[0];}return service;}};});

import {compositeTransport,getChatRuntime,getSettingsService,__resetPersistenceForTests} from './persistence-client';
afterEach(()=>{vi.unstubAllEnvs();__resetPersistenceForTests();network.ensure.mockReset();network.authority.mockReset();network.authority.mockResolvedValue({authority:'local',outcome:'unreachable',payload:null});});
it('actual prepareChatRouting：text主动self而image默认official，官方断网不触发fresh也不改选择',async()=>{
 vi.stubEnv('CREATOROS_MODEL_BENEFITS_ENABLED','1');__resetPersistenceForTests();
 const ctx={userId:'continuous-self-user',accountId:'continuous-self-account',requestId:'continuous-self',source:'user' as const};
 const choices={text:'self',vision:'self',image:'official',video:'official',audio:'local',embed:'self'} as const;
 await compositeTransport.request(ENDPOINTS.putModelRouting,{params:undefined,query:undefined,body:{schemaVersion:1,expectedRevision:0,choices}},ctx);
 const runtime=await getChatRuntime();expect(runtime.prepareChatRouting).toBeTypeOf('function');
 const prepared=await runtime.prepareChatRouting!(ctx,{mode:'text'});expect(prepared.executionEngine).toBe('pi');expect(network.ensure).not.toHaveBeenCalled();
 const saved=await compositeTransport.request(ENDPOINTS.getModelRouting,{params:undefined,query:undefined,body:undefined},ctx) as {data:{choices:unknown}};
 expect(saved.data.choices).toEqual(choices);
},180000);

it('actual prepareChatRouting官方等待接收原abort，取消立即退出且不创建后续任务',async()=>{
 vi.stubEnv('CREATOROS_MODEL_BENEFITS_ENABLED','1');__resetPersistenceForTests();
 const ctx={userId:'continuous-abort-user',accountId:'continuous-abort-account',requestId:'continuous-abort',source:'user' as const};
 let started!:()=>void;const atNetwork=new Promise<void>(resolve=>{started=resolve});
 network.ensure.mockImplementation(async(raw)=>{const signal=(raw as {signal:AbortSignal}).signal;started();return new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('已取消','AbortError')),{once:true});});});
 const runtime=await getChatRuntime(),controller=new AbortController();const waiting=runtime.prepareChatRouting!(ctx,{mode:'text'},controller.signal);await atNetwork;controller.abort();
 await expect(waiting).rejects.toMatchObject({name:'AbortError'});expect(network.ensure).toHaveBeenCalledTimes(1);expect(network.ensure.mock.calls[0]?.[0]).toMatchObject({signal:controller.signal});
},180000);

it('actual root checker：fresh后等待期间原短签失效，不借仍存在vault Key或切到self',async()=>{
 vi.stubEnv('CREATOROS_MODEL_BENEFITS_ENABLED','1');__resetPersistenceForTests();
 const ctx={userId:'continuous-expired-user',accountId:'continuous-expired-account',requestId:'continuous-expired',source:'user' as const},scopeId='a'.repeat(64);
 const settings=await getSettingsService();await settings.setChannelModelCredential(ctx,scopeId,'omnihi-main','synthetic-only-key');
 network.ensure.mockResolvedValue({authority:'channel',sourceKind:'model_benefit',scopeId,payload:{},bundleDigest:'sha256:'+'b'.repeat(64),outcome:'configured'});
 network.authority.mockResolvedValue({authority:'local',outcome:'unreachable',payload:null});
 const runtime=await getChatRuntime();await expect(runtime.prepareChatRouting!(ctx,{mode:'text'})).rejects.toMatchObject({details:{domainCode:'MODEL_ROUTE_IDENTITY_CHANGED'}});
 expect(network.ensure).toHaveBeenCalledTimes(1);expect(await settings.getChannelModelCredential(ctx,scopeId,'omnihi-main')).toBe('synthetic-only-key');
},180000);

// T1375：调用真实persistence根传给原benchmark/persistent owner的端口，非单独helper。
it('T1375 audio official暂不可用：真实captureConfiguration保原冻结local-ASR退路',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{join}=await import('node:path'),{tmpdir}=await import('node:os');
 const root=await mkdtemp(join(tmpdir(),'t1375-asr-root-capture-'));
 vi.stubEnv('CREATOROS_DISABLE_BACKGROUND_DRIVERS','1');vi.stubEnv('CREATOROS_DISABLE_SCHEDULER','1');vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR',join(root,'db'));vi.stubEnv('CREATOROS_STORAGE_ROOT',join(root,'media'));vi.stubEnv('CREATOROS_MODEL_BENEFITS_ENABLED','1');__resetPersistenceForTests();
 const noNetwork=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('本测试禁止真实网络'));
 network.ensure.mockResolvedValue({authority:'local',outcome:'unreachable',payload:null});network.authority.mockResolvedValue({authority:'local',outcome:'unreachable',payload:null});
 try{
  const user={userId:'t1375-asr-user',requestId:'t1375-asr-capture',source:'user' as const};
  const account=(await compositeTransport.request(ENDPOINTS.createAccount,{params:undefined,query:undefined,body:{platform:'bilibili',accountHandle:'@synthetic-t1375-asr',followerBaseline:0}},user) as {data:{id:string}}).data;
  const ctx={...user,accountId:account.id};
  const choices={text:'self',vision:'self',image:'self',video:'self',audio:'official',embed:'self'} as const;
  await compositeTransport.request(ENDPOINTS.putModelRouting,{params:undefined,query:undefined,body:{schemaVersion:1,expectedRevision:0,choices}},ctx);
  await getChatRuntime();expect(rootPorts.capture).toBeTypeOf('function');
  const frozen=await rootPorts.capture!(ctx);
  expect(frozen.configuration).toMatchObject({provider:'whisper-local'});
  expect(frozen.executionRoute).toMatchObject({schemaVersion:2,routes:{'asr:transcribe.audio':{source:'official',readiness:'unavailable',fallbackPolicy:'existing-local-asr',localFallbackIdentity:{provider:'whisper-local'}}}});
  expect(network.ensure).toHaveBeenCalledTimes(1);expect(noNetwork).not.toHaveBeenCalled();
  network.ensure.mockResolvedValueOnce({authority:'local',outcome:'security_error',payload:null});await expect(rootPorts.capture!(ctx)).rejects.toMatchObject({code:'CLIENT_CONFIG_INVALID'});
  // 同一真实capture入口：取消/归属/身份错误绝不借本地输出掩盖拒绝。
  for(const error of [new DOMException('合成取消','AbortError'),Object.assign(Error('合成归属拒绝'),{code:'OwnershipError'}),Object.assign(Error('合成身份变化'),{details:{domainCode:'MODEL_ROUTE_IDENTITY_CHANGED'}})]){
    network.ensure.mockRejectedValueOnce(error);await expect(rootPorts.capture!(ctx)).rejects.toBe(error);
  }
 }finally{await(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();noNetwork.mockRestore();await rm(root,{recursive:true,force:true});}
},180000);
it('T1375 audio official暂不可用：真实persistent transcribe根可持久冻结原安全回退',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{join}=await import('node:path'),{tmpdir}=await import('node:os');
 const root=await mkdtemp(join(tmpdir(),'t1375-asr-root-enqueue-'));
 vi.stubEnv('CREATOROS_DISABLE_BACKGROUND_DRIVERS','1');vi.stubEnv('CREATOROS_DISABLE_SCHEDULER','1');vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR',join(root,'db'));vi.stubEnv('CREATOROS_STORAGE_ROOT',join(root,'media'));vi.stubEnv('CREATOROS_MODEL_BENEFITS_ENABLED','1');__resetPersistenceForTests();
 const noNetwork=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('本测试禁止真实网络'));
 network.ensure.mockResolvedValue({authority:'local',outcome:'unreachable',payload:null});network.authority.mockResolvedValue({authority:'local',outcome:'unreachable',payload:null});
 try{
  const user={userId:'t1375-asr-user',requestId:'t1375-asr-enqueue',source:'user' as const};
  const account=(await compositeTransport.request(ENDPOINTS.createAccount,{params:undefined,query:undefined,body:{platform:'bilibili',accountHandle:'@synthetic-t1375-asr',followerBaseline:0}},user) as {data:{id:string}}).data;
  const ctx={...user,accountId:account.id};
  const choices={text:'self',vision:'self',image:'self',video:'self',audio:'official',embed:'self'} as const;
  await compositeTransport.request(ENDPOINTS.putModelRouting,{params:undefined,query:undefined,body:{schemaVersion:1,expectedRevision:0,choices}},ctx);
  await getChatRuntime();expect(rootPorts.tasks).toBeTruthy();
  const task=await rootPorts.tasks!.enqueue(ctx,{kind:'transcribe',ownerType:'item',ownerId:'synthetic-t1375-source',idempotencyKey:'t1375-asr-availability-root',payload:{awemeId:'synthetic-t1375'},maxAttempts:1});
  const {executionTasks,eq}=await import('@creatoros/backend');const [stored]=await rootPorts.db!.select().from(executionTasks).where(eq(executionTasks.id,task.id));
  expect(stored!.payload).toMatchObject({executionRoute:{schemaVersion:2,routes:{'asr:transcribe.audio':{source:'official',readiness:'unavailable',fallbackPolicy:'existing-local-asr',localFallbackIdentity:{provider:'whisper-local'}}}}});
  expect((await rootPorts.tasks!.get(ctx,task.id)).id).toBe(task.id);expect(network.ensure).toHaveBeenCalledTimes(1);expect(noNetwork).not.toHaveBeenCalled();
 }finally{await(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();noNetwork.mockRestore();await rm(root,{recursive:true,force:true});}
},180000);
