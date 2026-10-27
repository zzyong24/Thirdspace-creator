import type {ModelTestResult} from '../settings-model-test-wrap';
// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';
import {canonicalDataset} from '@/fixtures/canonical';
const probe=vi.hoisted(()=>({media:'',specs:[] as Array<Record<string,unknown>>,authority:null as null|Record<string,unknown>}));
vi.mock('@/server/activation/client-config.server',async original=>({...await original<typeof import('@/server/activation/client-config.server')>(),readChannelModelAuthority:vi.fn(async()=>probe.authority??{authority:'local'})}));
vi.mock('@creatoros/backend/modules/assets',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/assets')>();return {...actual,migrateStorageRoot:async()=>{throw Error('测试禁止迁移用户媒体');},createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>actual.createLocalFsObjectStorage({...args[0],rootPath:probe.media},args[1])};});
vi.mock('@creatoros/backend/modules/ai-runtime',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/ai-runtime')>();return {...actual,createModelProbeIoService:()=>({probeText:async(_ctx:unknown,spec:Record<string,unknown>)=>{probe.specs.push(structuredClone(spec));return {text:'fixture stream reply',reasoningText:''};},probeImage:async()=>{throw Error('本测试禁止图片探针');},stop:async()=>{}})};});
import {compositeTransport,getChatRuntime,__resetPersistenceForTests} from '@/server/persistence-client';
async function call<T=unknown>(endpoint:Endpoint,ctx:RequestContext,params?:unknown,body?:unknown):Promise<T>{return (await compositeTransport.request(endpoint,{params,body,query:undefined} as never,ctx) as {data:T}).data;}

it('T1406 public模型测试复用业务所选self路由，不受未选坏渠道干扰，official不可用不偷换self',async()=>{
 const root=await mkdtemp(join(tmpdir(),'t1406-selected-probe-'));probe.media=join(root,'media');probe.specs=[];
 vi.stubEnv('CREATOROS_DISABLE_BACKGROUND_DRIVERS','1');vi.stubEnv('CREATOROS_DISABLE_SCHEDULER','1');vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR',join(root,'db'));vi.stubEnv('CREATOROS_STORAGE','local');vi.stubEnv('CREATOROS_CLIENT_CONFIG_PULL_ENABLED','0');vi.stubEnv('CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH','/nonexistent/t1406-fixture');__resetPersistenceForTests();
 const fetchSpy=vi.spyOn(globalThis,'fetch');
 try{
  const user:RequestContext={userId:canonicalDataset.user.id,source:'user',requestId:'t1406-probe-route'};
  const account=await call<{id:string}>(ENDPOINTS.createAccount,user,undefined,{platform:'bilibili',accountHandle:'@t1406-probe',followerBaseline:0});const ctx={...user,accountId:account.id};
  await call(ENDPOINTS.putModel,ctx,{capability:'default'},{provider:'openai',modelName:'fixture-selected-self',apiFormat:'openai_chat',baseUrl:'https://self-probe.invalid/v1',secret:'test-only-self-credential'});
  const choices={text:'self',vision:'self',image:'self',video:'self',audio:'local',embed:'self'};
  await call(ENDPOINTS.putModelRouting,ctx,undefined,{schemaVersion:1,choices,expectedRevision:0});
  probe.authority={authority:'channel',scopeId:'fixture-scope',bundleDigest:`sha256:${'a'.repeat(64)}`,payload:{models:{default:[{isDefault:true,provider:'unsupported-private-provider'}]}}};
  const runtime=await getChatRuntime(),routing=await runtime.prepareChatRouting!(ctx,{mode:'text'}),business=await routing.freeze('copilot.assist','text');
  const tested=await call<ModelTestResult>(ENDPOINTS.testModelConnection,ctx,{capability:'default'});
  expect(tested).toMatchObject({ok:true,provider:'openai_chat',model:'fixture-selected-self'});
  expect(probe.specs).toHaveLength(1);const route=business.schemaVersion===2?business.routes['text:copilot.assist']:undefined;if(route?.source!=='self'||route.readiness!=='configured')throw Error('隔离self业务路由未冻结');expect(probe.specs[0]).toMatchObject({model:route.identity.model,apiFormat:'openai_chat',baseUrl:'https://self-probe.invalid/v1'});
  expect(JSON.stringify(tested)).not.toMatch(/test-only-self-credential|unsupported-private-provider|self-probe\.invalid/);
  const reviewed=await call<ModelTestResult>(ENDPOINTS.testModelConnection,ctx,{capability:'script.review'});expect(reviewed).toMatchObject({ok:true,provider:'openai_chat',model:'fixture-selected-self'});expect(probe.specs).toHaveLength(2);
  const fallback=await call<ModelTestResult>(ENDPOINTS.testModelConnection,ctx,{capability:'chat.fallback'});expect(fallback.ok).toBe(false);expect(probe.specs).toHaveLength(2);
  probe.authority=null;await call(ENDPOINTS.putModelRouting,ctx,undefined,{schemaVersion:1,choices:{...choices,text:'official'},expectedRevision:1});
  const unavailable=await call<ModelTestResult>(ENDPOINTS.testModelConnection,ctx,{capability:'default'});expect(unavailable.ok).toBe(false);expect(probe.specs).toHaveLength(2);
  expect(fetchSpy).not.toHaveBeenCalled();
 }finally{
  await(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();probe.authority=null;fetchSpy.mockRestore();vi.unstubAllEnvs();
  expect(resolve(root).startsWith(resolve(tmpdir()))).toBe(true);await rm(root,{recursive:true,force:true});
 }
},180000);
