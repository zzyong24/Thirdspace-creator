import {afterEach,expect,it,vi} from 'vitest';
import {ENDPOINTS} from '@creatoros/contract';
const network=vi.hoisted(()=>({ensure:vi.fn(async(..._args:unknown[]):Promise<unknown>=>{throw Error('合成断网，不应拖住自配聊天');}),authority:vi.fn(async()=>({authority:'local',outcome:'unreachable',payload:null}))}));
vi.mock('./activation/model-benefit.server',async original=>({...await original<object>(),ensureModelBenefitAuthority:network.ensure}));
vi.mock('./activation/client-config.server',async original=>({...await original<object>(),readChannelModelAuthority:network.authority}));
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
