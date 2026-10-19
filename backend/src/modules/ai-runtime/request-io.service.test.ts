import {EventEmitter} from 'node:events';
import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({child:null as unknown}));
vi.mock('node:child_process',async original=>({...await original<typeof import('node:child_process')>(),fork:()=>mocks.child}));
import {createRequestIoService} from './request-io.service';
const ctx={userId:'owner',accountId:'account',requestId:'test',source:'user' as const};
afterEach(()=>vi.useRealTimers());
function fixture(){
 const sent:Array<Record<string,unknown>>=[];
 const child=Object.assign(new EventEmitter(),{connected:true,send(input:Record<string,unknown>,callback?:(error?:Error)=>void){sent.push(input);callback?.();},kill:vi.fn(()=>{queueMicrotask(()=>child.emit('close'));return true;})});mocks.child=child;
 const io=createRequestIoService({entryPath:()=>'/fake/private-worker',timeoutMs:30_000,parseInput:input=>input,parseResponse:raw=>raw as never});
 return {io,child,sent};
}
it('冷启动超过30秒且排队超过120秒，发到子进程时仍有两分钟执行预算',async()=>{
 vi.useFakeTimers();const {io,child,sent}=fixture();const start=Date.now();
 const first=io.request(ctx,{type:'probe'}),second=io.request(ctx,{type:'probe'}),third=io.request(ctx,{type:'probe'});
 await vi.advanceTimersByTimeAsync(31_000);expect(sent).toHaveLength(0);child.emit('message',{type:'ready'});expect(sent).toHaveLength(2);
 expect(sent[0]?.deadlineAt).toBe(start+31_000+120_000);
 await vi.advanceTimersByTimeAsync(95_000);child.emit('message',{type:'result',requestId:sent[0]!.requestId,value:'first'});
 expect(sent).toHaveLength(3);expect(sent[2]!.deadlineAt).toBe(Date.now()+120_000);
 child.emit('message',{type:'result',requestId:sent[1]!.requestId,value:'second'});child.emit('message',{type:'result',requestId:sent[2]!.requestId,value:'third'});
 await expect(Promise.all([first,second,third])).resolves.toEqual(['first','second','third']);await io.stop();
});
it('用户取消即时返回，取消回收宽限不延迟用户信号',async()=>{
 vi.useFakeTimers();const {io,child,sent}=fixture(),controller=new AbortController();
 const waiting=io.request(ctx,{type:'probe'},controller.signal),failure=expect(waiting).rejects.toThrow('REQUEST_IO_CANCELLED');child.emit('message',{type:'ready'});controller.abort();await failure;
 expect(sent[1]).toMatchObject({type:'cancel',requestId:sent[0]!.requestId});expect(child.kill).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(119_999);expect(child.kill).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(child.kill).toHaveBeenCalledOnce();await io.stop();
});
it('原来的非法零超时仍拒绝，不能转为无限',()=>{expect(()=>createRequestIoService({entryPath:()=>'',timeoutMs:0,parseInput:x=>x,parseResponse:x=>x as never})).toThrow('EXECUTION_TIMEOUT_INVALID');});
