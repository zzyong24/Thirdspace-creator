import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {RequestContext} from '@creatoros/contract';
import {createLocalCodexStatusService} from './local-codex-status.service';

type Pending={context:RequestContext;payload:Record<string,unknown>;signal?:AbortSignal;resolve:(value:unknown)=>void;reject:(reason:unknown)=>void};
type Instance={options:{entryPath:()=>string;extraEnv?:Record<string,string>;timeoutMs?:number};pending:Pending[];stop:ReturnType<typeof vi.fn>};
const fixture=vi.hoisted(()=>({mtime:1,env:{CODEX_HOME:'/fixture/codex-a'} as Record<string,string>,instances:[] as Instance[]}));
vi.mock('node:fs',()=>({statSync:vi.fn(()=>({mtimeMs:fixture.mtime,ctimeMs:fixture.mtime,size:42}))}));
vi.mock('../execution/local-codex-worker-env',()=>({localCodexWorkerEnv:()=>({...fixture.env})}));
vi.mock('./request-io.service',()=>({createRequestIoService:(options:Instance['options'])=>{
 const instance:Instance={options,pending:[],stop:vi.fn(async()=>{})};fixture.instances.push(instance);
 return {request:(context:RequestContext,payload:Record<string,unknown>,signal?:AbortSignal)=>new Promise((resolve,reject)=>instance.pending.push({context,payload,signal,resolve,reject})),stop:instance.stop};
}}));
const services:Array<ReturnType<typeof createLocalCodexStatusService>>=[];
beforeEach(()=>{fixture.mtime=1;fixture.env={CODEX_HOME:'/fixture/codex-a'};fixture.instances=[];});
afterEach(async()=>{await Promise.all(services.splice(0).map(service=>service.stop()));});
const ctx=(userId='user-a',groupId='group-a'):RequestContext=>({userId,requestId:'fixture-request',source:'user',groupId,accountId:null});
const status=(id='real-list-model-a')=>({engine:'codex' as const,installed:true,available:true,version:'0.159.3',defaultModelId:id,availableModels:[{id,inputModalities:['text','image']}],loginStatus:'authenticated' as const,capabilities:{text:true,imageUnderstanding:true,imageGeneration:false,imageEditing:'unavailable' as const}});
function create(entryPath:()=>string=()=>'/fixture/status-worker.cjs'){const service=createLocalCodexStatusService({entryPath});services.push(service);return service;}
const pending=(instance=0,n=0)=>fixture.instances[instance]!.pending[n]!;
const count=()=>fixture.instances.reduce((sum,instance)=>sum+instance.pending.length,0);
function rejectObserved<T>(promise:Promise<T>){void promise.catch(()=>undefined);return promise;}

it('peek无缓存为null且不创建IO或探针；read不减少原120000执行预算',async()=>{
 const service=create();expect(service.peek(ctx())).toBeNull();expect(fixture.instances).toHaveLength(0);
 const work=service.read(ctx());expect(fixture.instances[0]!.options.timeoutMs).toBe(120000);expect(pending().payload).toEqual({type:'status'});pending().resolve(status());await work;
});
it('同user成功状态复用，组/账号不成为本机状态权威，真实ID与能力原样保留',async()=>{
 const service=create();const work=service.read(ctx());pending().resolve(status());expect(await work).toEqual(status());
 const next=service.read({...ctx('user-a','group-b'),requestId:'another',accountId:'account-b'});expect(count()).toBe(1);expect(await next).toEqual(status());
});
it('同user同时read只有一个flight且force可join；不同user不借快照',async()=>{
 const service=create();const a=service.read(ctx());const b=service.read({...ctx(),requestId:'b'},undefined,true);expect(count()).toBe(1);
 const c=service.read(ctx('user-b'));expect(count()).toBe(2);expect(fixture.instances).toHaveLength(1);
 pending().resolve(status('a'));pending(0,1).resolve(status('b'));expect((await a).defaultModelId).toBe('a');expect((await b).defaultModelId).toBe('a');expect((await c).defaultModelId).toBe('b');
});
it('force在成功cache后实际新检查，force期间普通读join最新检查',async()=>{
 const service=create();const first=service.read(ctx());pending().resolve(status('a'));await first;
 const second=service.read(ctx(),undefined,true);const third=service.read(ctx());expect(count()).toBe(2);pending(0,1).resolve(status('b'));expect((await second).defaultModelId).toBe('b');expect((await third).defaultModelId).toBe('b');
});
it('输出与peek均是独立无秘密快照，调用者变更不能污染缓存',async()=>{
 const service=create();const work=service.read(ctx());pending().resolve({...status(),token:'must-not-be-projected'});const value=await work;
 // strict协议拒未知字段，不能以缓存便利放出secret。
 expect(value.available).toBe(false);expect(JSON.stringify(service.peek(ctx()))).not.toContain('must-not-be-projected');
 const retry=service.read(ctx());pending(0,1).resolve(status());const success=await retry;success.defaultModelId='mutated';success.availableModels!.push({id:'fake',inputModalities:[]});
 const observed=service.peek(ctx())!;observed.defaultModelId='also-mutated';expect(service.peek(ctx())!.defaultModelId).toBe('real-list-model-a');expect(service.peek(ctx())!.availableModels).toHaveLength(1);
});
it('真实失败可peek，但下次read仍重新核验，不用失败永久禁用',async()=>{
 const service=create();const first=service.read(ctx());const failed={...status(),available:false,loginStatus:'unauthenticated',errorCode:'CODEX_LOGIN_REQUIRED'};pending().resolve(failed);expect(await first).toEqual(failed);expect(service.peek(ctx())).toEqual(failed);
 const retry=service.read(ctx());expect(count()).toBe(2);pending(0,1).resolve(status());expect((await retry).available).toBe(true);
});
it('无真实model ID的成功认证不充当可复用身份；图像未核实仍原样保留',async()=>{
 const service=create();const work=service.read(ctx());const {defaultModelId,availableModels,...withoutIdentity}=status();pending().resolve(withoutIdentity);expect(await work).toEqual(withoutIdentity);
 const retry=service.read(ctx());expect(count()).toBe(2);pending(0,1).resolve(status());const value=await retry;expect(value.capabilities?.imageGeneration).toBe(false);expect(value.capabilities?.imageEditing).toBe('unavailable');
});
it('IO异常只投安全状态码，不把原异常正文缓存到metadata',async()=>{
 const service=create();const work=service.read(ctx());pending().reject(Error('secret-provider-body'));const value=await work;expect(value.errorCode).toBe('CODEX_STATUS_UNAVAILABLE');expect(JSON.stringify(service.peek(ctx()))).not.toContain('secret-provider-body');
});
it('单observer取消只拒自己的AbortError，其它读者/原探针保持',async()=>{
 const service=create();const controller=new AbortController();const a=rejectObserved(service.read(ctx(),controller.signal));const b=service.read(ctx());const signal=pending().signal!;
 controller.abort();await expect(a).rejects.toMatchObject({name:'AbortError'});expect(signal.aborted).toBe(false);expect(service.peek(ctx())).toBeNull();pending().resolve(status());expect((await b).available).toBe(true);expect(service.peek(ctx())?.available).toBe(true);
});
it('全部observer离开取消原probe，晚成功不得写cache，新读开启新flight',async()=>{
 const service=create();const controller=new AbortController();const old=rejectObserved(service.read(ctx(),controller.signal));const original=pending();controller.abort();await expect(old).rejects.toMatchObject({name:'AbortError'});expect(original.signal?.aborted).toBe(true);
 const next=service.read(ctx());expect(count()).toBe(2);original.resolve(status('late-old'));await Promise.resolve();expect(service.peek(ctx())).toBeNull();pending(0,1).resolve(status('current'));expect((await next).defaultModelId).toBe('current');expect(service.peek(ctx())?.defaultModelId).toBe('current');
});
it('预取消read不动已有cache也不发探针',async()=>{
 const service=create();const first=service.read(ctx());pending().resolve(status());await first;const controller=new AbortController();controller.abort();await expect(service.read(ctx(),controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(count()).toBe(1);expect(service.peek(ctx())?.available).toBe(true);
});
it('实际entry mtime变化使旧cache失效并创建新IO',async()=>{
 const service=create();const first=service.read(ctx());pending().resolve(status('a'));await first;fixture.mtime=2;expect(service.peek(ctx())).toBeNull();const next=service.read(ctx());expect(fixture.instances).toHaveLength(2);pending(1).resolve(status('b'));expect((await next).defaultModelId).toBe('b');
});
it('entry路径变化使旧cache失效且新IO冻结正确路径',async()=>{
 let entry='/fixture/first.cjs';const service=create(()=>entry);const first=service.read(ctx());pending().resolve(status());await first;entry='/fixture/second.cjs';const next=service.read(ctx());expect(fixture.instances[1]!.options.entryPath()).toBe('/fixture/second.cjs');pending(1).resolve(status());await next;
});
it('宿主env代际使用新IO extraEnv；旧代际晚成功不覆盖新状态',async()=>{
 const service=create();const old=service.read(ctx());fixture.env={CODEX_HOME:'/fixture/codex-b',HTTPS_PROXY:'http://fixture-proxy'};const next=service.read(ctx());expect(fixture.instances).toHaveLength(2);expect(fixture.instances[1]!.options.extraEnv).toEqual(fixture.env);expect(fixture.instances[0]!.options.extraEnv).toEqual({CODEX_HOME:'/fixture/codex-a'});
 pending(1).resolve(status('new-generation'));await next;pending().resolve(status('late-generation'));expect((await old).errorCode).toBe('CODEX_CONFIG_CHANGED');expect(service.peek(ctx())?.defaultModelId).toBe('new-generation');
});
it('env仅键序变化不另开IO或重探，代际不取requestId',async()=>{
 fixture.env={CODEX_HOME:'/fixture/codex-a',NO_PROXY:'localhost'};const service=create();const work=service.read(ctx());pending().resolve(status());await work;fixture.env={NO_PROXY:'localhost',CODEX_HOME:'/fixture/codex-a'};expect((await service.read({...ctx(),requestId:'another-request'})).available).toBe(true);expect(fixture.instances).toHaveLength(1);expect(count()).toBe(1);
});
it('stop结束所有observer/IO，清cache且重复stop不再关闭',async()=>{
 const service=create();const work=rejectObserved(service.read(ctx()));const original=pending();await service.stop();await expect(work).rejects.toMatchObject({name:'AbortError'});expect(original.signal?.aborted).toBe(true);expect(service.peek(ctx())).toBeNull();await service.stop();expect(fixture.instances[0]!.stop).toHaveBeenCalledTimes(1);await expect(service.read(ctx())).rejects.toMatchObject({name:'AbortError'});
});
