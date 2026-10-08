import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { createWorkerPipelineProvider, type WhisperWorkerLike } from './multimodal-whisper-local';

it('关闭常驻 provider 等待真实终止屏障，关闭后排队调用不创建替代线程', async () => {
  const events=new EventEmitter();
  const terminate=vi.fn(async()=>{throw Error('terminate 尚未确认');});
  const worker={on:events.on.bind(events),postMessage:vi.fn(),terminate} as unknown as WhisperWorkerLike;
  const spawn=vi.fn(()=>worker),provider=createWorkerPipelineProvider(spawn),pipeline=await provider('synthetic');
  const first=pipeline(new Float32Array(1));
  const rejected=expect(first).rejects.toMatchObject({name:'AbortError'});
  await vi.waitFor(()=>expect(worker.postMessage).toHaveBeenCalledOnce(),{timeout:120000});
  const second=pipeline(new Float32Array(1));
  const secondRejected=expect(second).rejects.toMatchObject({name:'AbortError'});
  let closed=false;const closing=provider.close().then(()=>{closed=true;});
  await vi.waitFor(()=>expect(terminate).toHaveBeenCalledOnce(),{timeout:120000});
  expect(closed).toBe(false);expect(spawn).toHaveBeenCalledOnce();
  events.emit('exit',0);
  await Promise.all([rejected,secondRejected,closing]);
  expect(closed).toBe(true);expect(spawn).toHaveBeenCalledOnce();
  await expect(provider('synthetic')).rejects.toMatchObject({name:'AbortError'});
  await provider.close();expect(terminate).toHaveBeenCalledOnce();
});

it('任务取消与 finally 关闭共用终止屏障，不重复 terminate', async () => {
  const events=new EventEmitter();let stopped!:(code:number)=>void;
  const terminate=vi.fn(()=>new Promise<number>(resolve=>{stopped=resolve;}));
  const worker={on:events.on.bind(events),postMessage:vi.fn(),terminate} as unknown as WhisperWorkerLike;
  const provider=createWorkerPipelineProvider(()=>worker),pipeline=await provider('synthetic'),controller=new AbortController();
  const running=pipeline(new Float32Array(1),{},controller.signal),rejected=expect(running).rejects.toMatchObject({name:'AbortError'});
  await vi.waitFor(()=>expect(worker.postMessage).toHaveBeenCalledOnce(),{timeout:120000});
  controller.abort();const closing=provider.close();
  await vi.waitFor(()=>expect(terminate).toHaveBeenCalledOnce(),{timeout:120000});
  events.emit('exit',0);stopped(0);
  await Promise.all([rejected,closing]);expect(terminate).toHaveBeenCalledOnce();
});
it('error 先于 exit 时排队推理保持停止屏障，退出确认后才能创建替代线程',async()=>{
  const oldEvents=new EventEmitter(),nextEvents=new EventEmitter();
  const old={on:oldEvents.on.bind(oldEvents),postMessage:vi.fn(),terminate:vi.fn(async()=>{throw Error('等待 exit');})} as unknown as WhisperWorkerLike;
  const next={on:nextEvents.on.bind(nextEvents),postMessage:vi.fn(),terminate:vi.fn(async()=>{nextEvents.emit('exit',0);return 0;})} as unknown as WhisperWorkerLike;
  const spawn=vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(next),provider=createWorkerPipelineProvider(spawn),pipeline=await provider('synthetic');
  const first=pipeline(new Float32Array(1)),rejected=expect(first).rejects.toMatchObject({reference:'LOCAL_WHISPER_WORKER_EXIT'});
  await vi.waitFor(()=>expect(old.postMessage).toHaveBeenCalledOnce(),{timeout:120000});
  oldEvents.emit('error',Error('fixture crash'));
  const second=pipeline(new Float32Array(1));
  await vi.waitFor(()=>expect(old.terminate).toHaveBeenCalledOnce(),{timeout:120000});
  expect(spawn).toHaveBeenCalledOnce();
  oldEvents.emit('exit',1);await rejected;
  await vi.waitFor(()=>expect(next.postMessage).toHaveBeenCalledOnce(),{timeout:120000});
  const message=vi.mocked(next.postMessage).mock.calls[0]![0] as {id:number};
  nextEvents.emit('message',{id:message.id,ok:true,text:'新线程结果'});
  expect(await second).toEqual({text:'新线程结果'});
  await provider.close();expect(spawn).toHaveBeenCalledTimes(2);
});
