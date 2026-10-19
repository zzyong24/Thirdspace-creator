import {EventEmitter} from 'node:events';
import {afterEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({child:null as unknown}));
vi.mock('node:child_process',async original=>({...await original<typeof import('node:child_process')>(),fork:()=>mock.child}));
import {createEmbeddingIoService} from './embedding-io.service';
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
const spec=(token:string)=>({apiFormat:'openai_chat' as const,baseUrl:'https://fixture.invalid/v1',model:'frozen-model',token});
const pending:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{await Promise.all(pending.splice(0).map(stop=>stop()));vi.useRealTimers();});
const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const observed=<T>(promise:Promise<T>)=>promise.then(value=>({value,error:null}),error=>({value:null,error}));
function fixture(){
 const sent:Array<Record<string,any>>=[];
 const child=Object.assign(new EventEmitter(),{connected:true,send(input:Record<string,any>,cb?:(error?:Error)=>void){sent.push(input);cb?.();},kill:vi.fn(()=>{queueMicrotask(()=>child.emit('close'));return true;})});mock.child=child;
 const io=createEmbeddingIoService({entryPath:()=>'/fixture/embedding-worker'});pending.push(()=>io.stop());
 const result=(index:number)=>child.emit('message',{type:'result',requestId:sent[index]!.requestId,embeddings:[[1,0]]});
 return {io,child,sent,result};
}
it('两槽满期间Key旋转，第三请求派发才取新Key且不换冻结model',async()=>{
 const {io,child,sent,result}=fixture();
 const one=observed(io.embed(ctx,spec('one'),['one'])),two=observed(io.embed(ctx,spec('two'),['two']));
 child.emit('message',{type:'ready'});expect(sent).toHaveLength(2);
 let token='old';const resolve=vi.fn(async()=>spec(token));
 const third=observed(io.embed(ctx,resolve,['three']));await tick();expect(resolve).not.toHaveBeenCalled();
 token='rotated';result(0);await tick();expect(resolve).toHaveBeenCalledOnce();expect(sent).toHaveLength(3);
 expect(sent[2]!.spec).toMatchObject({token:'rotated',model:'frozen-model'});expect(sent[2]).not.toHaveProperty('route');
 result(1);result(2);expect((await Promise.all([one,two,third])).every(value=>!value.error)).toBe(true);
},180_000);
it.each(['MODEL_ROUTE_IDENTITY_CHANGED','MODEL_CREDENTIAL_UNAVAILABLE'])('排队期间%s，第三请求不发送且不重试／回退',async code=>{
 const {io,child,sent,result}=fixture();const one=observed(io.embed(ctx,spec('one'),['one'])),two=observed(io.embed(ctx,spec('two'),['two']));child.emit('message',{type:'ready'});
 const resolve=vi.fn(async()=>{throw new Error(code);});const third=observed(io.embed(ctx,resolve,['three']));await tick();expect(resolve).not.toHaveBeenCalled();
 result(0);await tick();expect(resolve).toHaveBeenCalledOnce();expect(sent).toHaveLength(2);expect((await third).error?.message).toBe(code);
 result(1);await Promise.all([one,two]);
},180_000);
it.each(['cancel','stop'])('准备期间%s，迟到凭据返回仍零发送并闭合',async action=>{
 const {io,child,sent}=fixture();const controller=new AbortController();let release!:(value:ReturnType<typeof spec>)=>void;
 const resolver=vi.fn(()=>new Promise<ReturnType<typeof spec>>(resolve=>release=resolve));
 const request=observed(io.embed(ctx,resolver,['query'],controller.signal));child.emit('message',{type:'ready'});await tick();expect(resolver).toHaveBeenCalledOnce();
 let stopping:Promise<void>|undefined;if(action==='cancel')controller.abort();else stopping=io.stop();
 release(spec('late'));await tick();expect(sent).toHaveLength(0);expect((await request).error).toBeDefined();await stopping;
},180_000);

it('冷启动等待期间不取Key，ready以后只派发一次当前凭据',async()=>{
 const {io,child,sent,result}=fixture();let token='old';const resolve=vi.fn(async()=>spec(token));
 const request=observed(io.embed(ctx,resolve,['query']));await tick();expect(resolve).not.toHaveBeenCalled();expect(sent).toHaveLength(0);
 token='ready-key';child.emit('message',{type:'ready'});await tick();expect(resolve).toHaveBeenCalledOnce();expect(sent[0]!.spec.token).toBe('ready-key');
 result(0);expect((await request).error).toBeNull();
},180_000);
it('lazy解析失败后仍最多两在途，不因pump重入多发第三条',async()=>{
 const {io,child,sent,result}=fixture();
 const invalid=observed(io.embed(ctx,async()=>({apiFormat:'not-a-protocol',model:'m',token:'invalid'} as never),['bad']));
 const a=observed(io.embed(ctx,spec('a'),['a'])),b=observed(io.embed(ctx,spec('b'),['b'])),c=observed(io.embed(ctx,spec('c'),['c']));
 child.emit('message',{type:'ready'});await tick();expect(sent).toHaveLength(2);expect((await invalid).error?.message).toBe('REQUEST_IO_INPUT_INVALID');
 result(0);await tick();expect(sent).toHaveLength(3);result(1);result(2);expect((await Promise.all([a,b,c])).every(r=>!r.error)).toBe(true);
},180_000);
